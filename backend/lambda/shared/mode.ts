import type { Session } from "./db.js";

/**
 * The drill opener is recognised by what it says, not by one sentence: the "Drill rules" label, the
 * "I ask, you answer" promise (any filler between the words), or the level line followed by the first question.
 * The shell's src/claude.js carries the same pattern; both have a test on the AST-216 paraphrase.
 */
export const DRILL_OPENER = /\bDrill rules\b|\bI ask\b[^.\n]{0,12}\byou answer\b|\bLevel L[123]\b[\s\S]{0,400}Tell me about yourself/i;
export const BUILD_OPENER = /Paste whatever you have on your most recent project|Interviewers ask about context first/;

export function modeFromTranscript(jsonl: string): Session["mode"] | undefined {
  if (DRILL_OPENER.test(jsonl)) return "drill";
  if (BUILD_OPENER.test(jsonl)) return "build";
  return undefined;
}

/**
 * The sweep grades ended sessions, and also sessions the evaluator closed without a grade because their mode
 * was unknown (the build path stamps them `evaluated` with model "none"). A session that has a grade, or is a build, is left alone.
 */
export function needsGrading(s: Pick<Session, "status" | "mode" | "evaluation">): boolean {
  if (s.status === "ended") return true;
  return s.status === "evaluated" && s.mode !== "build" && s.evaluation?.overall === undefined && s.evaluation?.model === "none";
}
