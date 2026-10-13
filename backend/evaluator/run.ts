// DORIS evaluator: grades ended drill sessions with a headless Claude Code session on an Aston seat.
// Runs as a Fargate task. Env: TABLE, BUCKET, TOKEN_SECRET; and either ENGINEER_ID+SESSION_ID (one
// session, launched by the API on /end) or SWEEP=1 (every ended-but-ungraded session, hourly).
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { getSession, updateSession, getArtifact, putArtifact, endedUnevaluated, openSessions, now, type EvaluationSummary } from "../lambda/shared/db.js";
import { gradeDrill, parseTranscript, categoryReads, countOpenSlots, MODEL } from "./grade.js";

const sm = new SecretsManagerClient({});
const IDLE_MINUTES = 30;

async function main() {
  const token = (await sm.send(new GetSecretValueCommand({ SecretId: process.env.TOKEN_SECRET }))).SecretString;
  if (!token || token === "UNSET") { console.error("Claude token secret is UNSET; nothing graded. Run `claude setup-token` on the Aston seat and store it."); process.exit(3); }
  process.env.CLAUDE_CODE_OAUTH_TOKEN = token;

  let targets: { engineerId: string; sessionId: string }[] = [];
  if (process.env.SWEEP) {
    const cutoff = Date.now() - IDLE_MINUTES * 60_000;
    for (const s of (await openSessions()).filter(s => Date.parse(s.lastActivityAt) < cutoff)) {
      await updateSession(s.engineerId, s.sessionId, { status: "ended", endedAt: now() });
    }
    targets = (await endedUnevaluated()).map(s => ({ engineerId: s.engineerId, sessionId: s.sessionId }));
  } else if (process.env.ENGINEER_ID && process.env.SESSION_ID) {
    targets = [{ engineerId: process.env.ENGINEER_ID, sessionId: process.env.SESSION_ID }];
  }
  console.log(`grading ${targets.length} session(s)`);
  let failed = 0;
  for (const t of targets) {
    try { console.log(t.sessionId, JSON.stringify(await evaluate(t.engineerId, t.sessionId))); }
    catch (e) { failed++; console.error(t.sessionId, e); }
  }
  process.exit(failed ? 1 : 0);
}

async function evaluate(engineerId: string, sessionId: string) {
  const s = await getSession(engineerId, sessionId);
  if (!s) throw new Error(`no session ${sessionId}`);
  const [transcript, talkTrack, drillLog] = await Promise.all([
    getArtifact(engineerId, sessionId, "transcript.jsonl"),
    getArtifact(engineerId, sessionId, "talk-track.md"),
    getArtifact(engineerId, sessionId, "drill-log.md"),
  ]);
  const openSlots = talkTrack ? countOpenSlots(talkTrack) : undefined;

  // Build sessions carry no drill to judge; the record is the talk track's slot count.
  if (s.mode !== "drill" || !transcript) {
    const evaluation: EvaluationSummary = { evaluatedAt: now(), model: "none", openSlots };
    await putArtifact(engineerId, sessionId, "evaluation.json", JSON.stringify({ mode: s.mode, openSlots, note: "build session: no drill to evaluate" }, null, 2));
    await updateSession(engineerId, sessionId, { status: "evaluated", evaluation, openSlots });
    return { evaluated: false, openSlots };
  }

  const turns = parseTranscript(transcript);
  const { parsed, result } = await gradeDrill({ talkTrack: talkTrack ?? undefined, drillLog: drillLog ?? undefined, turns, model: MODEL });
  const categories = categoryReads(parsed);
  const summary: EvaluationSummary = {
    evaluatedAt: now(), model: MODEL, openSlots: parsed.openSlots ?? openSlots,
    threadsHeld: (parsed.threads ?? []).filter((t: any) => !t.ranOutAt).length,
    threadsRanOut: (parsed.threads ?? []).filter((t: any) => t.ranOutAt).length,
    overall: parsed.readiness, categories: categories as Record<string, "strong" | "weak" | "mixed">,
  };
  await putArtifact(engineerId, sessionId, "evaluation.json", JSON.stringify({ ...parsed, model: MODEL, evaluatedAt: summary.evaluatedAt, usage: result.usage, cost_usd: result.total_cost_usd }, null, 2));
  await updateSession(engineerId, sessionId, { status: "evaluated", evaluation: summary, openSlots: summary.openSlots });
  return { evaluated: true, summary };
}

main().catch(e => { console.error(e); process.exit(1); });
