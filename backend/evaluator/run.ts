// DORIS evaluator: grades ended drill sessions with a headless Claude Code session on an Aston seat.
// Runs as a Fargate task. Env: TABLE, BUCKET, TOKEN_SECRET; and either ENGINEER_ID+SESSION_ID (one
// session, launched by the API on /end) or SWEEP=1 (every ended-but-ungraded session, hourly).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { getSession, updateSession, getArtifact, putArtifact, endedUnevaluated, openSessions, now, type EvaluationSummary } from "../lambda/shared/db.js";
import { RUBRIC, CATEGORIES, type Category } from "./rubric.js";

const exec = promisify(execFile);
const sm = new SecretsManagerClient({});
const MODEL = process.env.MODEL ?? "sonnet";
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
  const openSlots = talkTrack ? (talkTrack.match(/⟪[^⟫]*⟫/g) ?? []).length : undefined;

  // Build sessions carry no drill to judge; the record is the talk track's slot count.
  if (s.mode !== "drill" || !transcript) {
    const evaluation: EvaluationSummary = { evaluatedAt: now(), model: "none", openSlots };
    await putArtifact(engineerId, sessionId, "evaluation.json", JSON.stringify({ mode: s.mode, openSlots, note: "build session: no drill to evaluate" }, null, 2));
    await updateSession(engineerId, sessionId, { status: "evaluated", evaluation, openSlots });
    return { evaluated: false, openSlots };
  }

  const turns = transcript.split("\n").filter(Boolean).map(l => JSON.parse(l) as { role: string; text: string });
  const convo = turns.map(t => `${t.role === "user" ? "CANDIDATE" : "INTERVIEWER"}: ${t.text}`).join("\n\n");
  const prompt = `TALK TRACK:\n${talkTrack ?? "(none)"}\n\nDRILL LOG (the interviewer's own running notes, if any):\n${drillLog ?? "(none)"}\n\nTRANSCRIPT:\n${convo}\n\nReturn the JSON now.`;

  // A fresh headless session, no tools, the rubric as its whole system prompt.
  const { stdout } = await exec("claude", ["-p", prompt, "--output-format", "json", "--system-prompt", RUBRIC, "--tools", "", "--model", MODEL, "--no-session-persistence"],
    { maxBuffer: 16 * 1024 * 1024, env: { ...process.env, CLAUDECODE: undefined }, timeout: 4 * 60_000 });
  const result = JSON.parse(stdout);
  const text: string = result.result ?? "";
  const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));

  const categories: Partial<Record<Category, "strong" | "weak" | "mixed">> = {};
  for (const t of parsed.threads ?? []) for (const [c, v] of Object.entries<any>(t.categories ?? {})) {
    if (!CATEGORIES.includes(c as Category) || !["strong", "weak", "mixed"].includes(v.read)) continue;
    const prev = categories[c as Category];
    categories[c as Category] = !prev || prev === v.read ? v.read : "mixed";
  }
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
