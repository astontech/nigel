// Structure and coarse-read checks for one graded fixture. Never asserts on evidence wording.
import { CATEGORIES } from "./rubric.js";
import { categoryReads, type Grade } from "./grade.js";

export type Expectation = {
  readiness: string[];                 // allowed readiness values
  anyRanOut: boolean | null;           // some thread ran out / none did; null = not asserted
  strong: string[];                    // categories that must read strong
  weak: string[];                      // categories that must read weak
  contradictions: "none" | "some" | "any";   // "any" = not asserted (a vague drill may list its own gaps)
  openSlots: number;                   // count of ⟪…⟫ in the talk track
  maxCategoriesRead?: number;          // ceiling on categories the grade may read at all
};

const READS = ["strong", "weak", "mixed"];

export function shapeProblems(g: Grade): string[] {
  const p: string[] = [];
  if (!["ready", "close", "not-yet"].includes(g.readiness ?? "")) p.push(`readiness is ${JSON.stringify(g.readiness)}`);
  if (!Array.isArray(g.threads)) p.push("threads is not an array");
  for (const [i, t] of (g.threads ?? []).entries()) {
    if (!t.categories || typeof t.categories !== "object") p.push(`threads[${i}].categories missing`);
    for (const [c, v] of Object.entries(t.categories ?? {})) {
      if (!(CATEGORIES as readonly string[]).includes(c)) p.push(`threads[${i}] unknown category ${c}`);
      if (!READS.includes(v.read ?? "")) p.push(`threads[${i}].${c}.read is ${JSON.stringify(v.read)}`);
    }
    if (t.ranOutAt === undefined || (t.ranOutAt !== null && typeof t.ranOutAt !== "string")) p.push(`threads[${i}].ranOutAt must be a string or null`);
  }
  if (!Array.isArray(g.contradictions)) p.push("contradictions is not an array");
  if (!Array.isArray(g.goFindOut)) p.push("goFindOut is not an array");
  if (typeof g.overall !== "string" || !g.overall) p.push("overall is not a sentence");
  if (g.openSlots !== null && !Number.isInteger(g.openSlots)) p.push(`openSlots is ${JSON.stringify(g.openSlots)}`);
  return p;
}

export function readProblems(g: Grade, e: Expectation): string[] {
  const p: string[] = [];
  if (!e.readiness.includes(g.readiness ?? "")) p.push(`readiness ${g.readiness} not in [${e.readiness.join(", ")}]`);
  if (g.openSlots !== e.openSlots) p.push(`openSlots ${g.openSlots} != ${e.openSlots}`);
  const ranOut = (g.threads ?? []).some(t => t.ranOutAt);
  if (e.anyRanOut !== null && ranOut !== e.anyRanOut) p.push(`expected ${e.anyRanOut ? "a thread to run out" : "no thread to run out"}, ranOutAt ${ranOut ? "present" : "null on every thread"}`);
  const reads = categoryReads(g);
  for (const c of e.strong) if (reads[c as keyof typeof reads] !== "strong") p.push(`${c} read ${reads[c as keyof typeof reads] ?? "not-asked"}, expected strong`);
  for (const c of e.weak) if (reads[c as keyof typeof reads] !== "weak") p.push(`${c} read ${reads[c as keyof typeof reads] ?? "not-asked"}, expected weak`);
  const hasContradiction = (g.contradictions ?? []).length > 0;
  if (e.contradictions === "none" && hasContradiction) p.push("unexpected contradictions listed");
  if (e.contradictions === "some" && !hasContradiction) p.push("expected a contradiction against the talk track");
  if (e.maxCategoriesRead !== undefined && Object.keys(reads).length > e.maxCategoriesRead) p.push(`${Object.keys(reads).length} categories read, at most ${e.maxCategoriesRead} expected`);
  return p;
}
