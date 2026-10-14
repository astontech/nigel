// The one grading invocation, shared by the Fargate task (run.ts) and the regression runner (eval.ts).
// Imports nothing from AWS so the runner can use it on a laptop.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { RUBRIC, CATEGORIES, type Category } from "./rubric.js";

const exec = promisify(execFile);

export type Read = "strong" | "weak" | "mixed";
export type Turn = { role: string; text: string };
export type Thread = { claim?: string; categories?: Record<string, { read?: string; evidence?: string }>; ranOutAt?: string | null };
export type Grade = {
  openSlots?: number | null; threads?: Thread[]; contradictions?: string[]; goFindOut?: string[];
  overall?: string; readiness?: string;
};

export const MODEL = process.env.MODEL ?? "sonnet";

export function parseTranscript(transcript: string): Turn[] {
  return transcript.split("\n").filter(Boolean).map(l => JSON.parse(l) as Turn);
}

export function countOpenSlots(talkTrack: string): number {
  return (talkTrack.match(/⟪[^⟫]*⟫/g) ?? []).length;
}

/** A fresh headless session, no tools, the rubric as its whole system prompt. */
export async function gradeDrill(input: { talkTrack?: string; drillLog?: string; turns: Turn[]; model?: string }) {
  const model = input.model ?? MODEL;
  const convo = input.turns.map(t => `${t.role === "user" ? "CANDIDATE" : "INTERVIEWER"}: ${t.text}`).join("\n\n");
  const prompt = `TALK TRACK:\n${input.talkTrack ?? "(none)"}\n\nDRILL LOG (the interviewer's own running notes, if any):\n${input.drillLog ?? "(none)"}\n\nTRANSCRIPT:\n${convo}\n\nReturn the JSON now.`;
  const { stdout } = await exec("claude", ["-p", prompt, "--output-format", "json", "--system-prompt", RUBRIC, "--tools", "", "--model", model, "--no-session-persistence"],
    { maxBuffer: 16 * 1024 * 1024, env: { ...process.env, CLAUDECODE: undefined }, timeout: 4 * 60_000 });
  const result = JSON.parse(stdout);
  const text: string = result.result ?? "";
  const parsed: Grade = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  return { parsed, result, model };
}

/** Per-category read across threads; a category read two different ways is "mixed". */
export function categoryReads(parsed: Grade): Partial<Record<Category, Read>> {
  const categories: Partial<Record<Category, Read>> = {};
  for (const t of parsed.threads ?? []) for (const [c, v] of Object.entries(t.categories ?? {})) {
    if (!CATEGORIES.includes(c as Category) || !["strong", "weak", "mixed"].includes(v.read ?? "")) continue;
    const prev = categories[c as Category];
    categories[c as Category] = !prev || prev === v.read ? (v.read as Read) : "mixed";
  }
  return categories;
}
