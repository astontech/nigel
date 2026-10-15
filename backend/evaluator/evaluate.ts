// Grades one stored session: reads its mode, then either records a build session or runs the drill rubric.
import { modeFromTranscript } from "../lambda/shared/mode.js";
import { getSession, updateSession, getArtifact, putArtifact, now, type EvaluationSummary } from "../lambda/shared/db.js";
import { gradeDrill, parseTranscript, categoryReads, countOpenSlots, MODEL } from "./grade.js";

export async function evaluate(engineerId: string, sessionId: string) {
  const s = await getSession(engineerId, sessionId);
  if (!s) throw new Error(`no session ${sessionId}`);
  const [transcript, talkTrack, drillLog] = await Promise.all([
    getArtifact(engineerId, sessionId, "transcript.jsonl"),
    getArtifact(engineerId, sessionId, "talk-track.md"),
    getArtifact(engineerId, sessionId, "drill-log.md"),
  ]);
  const openSlots = talkTrack ? countOpenSlots(talkTrack) : undefined;

  // A session stored with an unknown mode (the opener was paraphrased) is read from its transcript now.
  let mode = s.mode;
  if (mode === "unknown" && transcript) {
    mode = modeFromTranscript(transcript) ?? mode;
    if (mode !== s.mode) await updateSession(engineerId, sessionId, { mode });
  }

  // Build sessions carry no drill to judge; the record is the talk track's slot count.
  if (mode !== "drill" || !transcript) {
    const evaluation: EvaluationSummary = { evaluatedAt: now(), model: "none", openSlots };
    await putArtifact(engineerId, sessionId, "evaluation.json", JSON.stringify({ mode, openSlots, note: "build session: no drill to evaluate" }, null, 2));
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
