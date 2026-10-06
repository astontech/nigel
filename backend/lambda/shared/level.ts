import type { Session } from "./db.js";

export type Level = "L1" | "L2" | "L3";
export type Readiness = "ready" | "close" | "not-yet";
const LEVELS: Level[] = ["L1", "L2", "L3"];
const STREAK = 2;

/**
 * Walks graded drills oldest first. Every engineer starts at L1; two consecutive `ready` grades move up one level,
 * two consecutive `not-yet` grades move down one, and a `close` grade (or a switch of direction) resets the count.
 * A move consumes its streak, so the next move needs two fresh grades. L1 is the floor and L3 the ceiling.
 */
export function computeLevel(readiness: readonly string[]): Level {
  let index = 0, ready = 0, notYet = 0;
  for (const grade of readiness) {
    ready = grade === "ready" ? ready + 1 : 0;
    notYet = grade === "not-yet" ? notYet + 1 : 0;
    if (ready === STREAK) { index = Math.min(index + 1, LEVELS.length - 1); ready = 0; }
    if (notYet === STREAK) { index = Math.max(index - 1, 0); notYet = 0; }
  }
  return LEVELS[index];
}

/** Graded drills, oldest first: only drill sessions the evaluator has read carry a readiness verdict. */
export const gradedDrills = (sessions: Session[]): Session[] =>
  sessions.filter(s => s.mode === "drill" && s.status === "evaluated" && s.evaluation?.overall).sort((a, b) => a.startedAt.localeCompare(b.startedAt));

export const levelFor = (sessions: Session[]): Level => computeLevel(gradedDrills(sessions).map(s => s.evaluation!.overall!));

/** The slice of a session's evaluation.json the summary reads. Quotes, evidence and contradictions are never carried (DEC-166). */
export interface StoredEvaluation {
  threads?: { claim?: string; categories?: Record<string, { read?: string }>; ranOutAt?: string | null }[];
  goFindOut?: string[];
  readiness?: string;
}
type Read = "strong" | "weak" | "mixed";
export interface GradeSummary {
  level: Level;
  drillsGraded: number;
  latestReadiness: string | null;
  claimsDrilled: string[];
  categoryReads: Record<string, { latest: Read; strong: number; weak: number; mixed: number }>;
  threads: { claim: string; outcome: "held" | "ran-out"; sessionId: string; drilledOn: string }[];
  goFindOut: string[];
}

/** Builds the engineer's own derived record from their graded drills and each drill's evaluation.json (oldest first). */
export function buildSummary(drills: { session: Session; evaluation: StoredEvaluation }[]): GradeSummary {
  const claims: string[] = [];
  const threads: GradeSummary["threads"] = [];
  const categoryReads: GradeSummary["categoryReads"] = {};
  for (const { session, evaluation } of drills) {
    const perDrill: Record<string, Read> = {};
    for (const t of evaluation.threads ?? []) {
      const claim = String(t.claim ?? "").trim();
      if (claim) {
        if (!claims.includes(claim)) claims.push(claim);
        threads.push({ claim, outcome: t.ranOutAt ? "ran-out" : "held", sessionId: session.sessionId, drilledOn: session.startedAt.slice(0, 10) });
      }
      for (const [category, v] of Object.entries(t.categories ?? {})) {
        if (v?.read !== "strong" && v?.read !== "weak" && v?.read !== "mixed") continue;
        const prev = perDrill[category];
        perDrill[category] = !prev || prev === v.read ? v.read : "mixed";
      }
    }
    for (const [category, read] of Object.entries(perDrill)) {
      const entry = categoryReads[category] ?? { latest: read, strong: 0, weak: 0, mixed: 0 };
      entry[read]++; entry.latest = read;
      categoryReads[category] = entry;
    }
  }
  const latest = drills.at(-1)?.evaluation;
  return {
    level: computeLevel(drills.map(d => d.session.evaluation!.overall!)),
    drillsGraded: drills.length,
    latestReadiness: drills.at(-1)?.session.evaluation?.overall ?? null,
    claimsDrilled: claims,
    categoryReads,
    threads,
    goFindOut: [...new Set((latest?.goFindOut ?? []).map(s => String(s).trim()).filter(Boolean))],
  };
}
