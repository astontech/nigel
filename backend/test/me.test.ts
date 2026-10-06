import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "../lambda/shared/db.js";

const store = vi.hoisted(() => ({
  engineer: { engineerId: "e1", name: "Ada", role: "engineer", createdAt: "2026-10-01T00:00:00Z", tokenHash: "never-returned" } as any,
  sessions: [] as any[],
  evaluations: new Map<string, any>(),
}));

vi.mock("../lambda/shared/db.js", async () => {
  const level = await import("../lambda/shared/level.js");
  return {
    engineerByToken: async (t: string) => (t === "good" ? store.engineer : undefined),
    sessionsFor: async () => store.sessions,
    allEngineers: async () => [store.engineer, { engineerId: "m1", name: "Boss", role: "manager", createdAt: "" }],
    evaluationsFor: async (drills: Session[]) => drills.filter(d => store.evaluations.has(d.sessionId)).map(d => ({ session: d, evaluation: store.evaluations.get(d.sessionId) })),
    getSession: async () => undefined, putSession: async () => {}, updateSession: async () => {}, putArtifact: async () => {}, getArtifact: async () => undefined,
    newId: () => "id", now: () => "2026-10-06T00:00:00Z", level,
  };
});

const { handler } = await import("../lambda/api/handler.js");
const call = (path: string, token = "good") => handler({ rawPath: path, headers: { authorization: `Bearer ${token}` }, requestContext: { http: { method: "GET" } } } as any) as Promise<{ statusCode: number; body: string }>;

const drill = (n: number, readiness: string): Session => ({
  engineerId: "e1", sessionId: `s${n}`, mode: "drill", startedAt: `2026-10-0${n}T10:00:00Z`, lastActivityAt: `2026-10-0${n}T11:00:00Z`, status: "evaluated", turns: 20,
  evaluation: { evaluatedAt: "x", model: "m", overall: readiness },
});
const evaluation = (readiness: string, claim: string, ranOutAt: string | null) => ({
  readiness, goFindOut: [`${claim} sizing`], contradictions: ["RAW-CONTRADICTION"],
  threads: [{ claim, ranOutAt, categories: { decisions: { read: "strong", evidence: "RAW-QUOTE" }, scale: { read: "weak", evidence: "RAW-QUOTE" } } }],
});

beforeEach(() => { store.sessions = []; store.evaluations = new Map(); });

describe("GET /me", () => {
  it("returns the summary beside the unchanged engineer and sessions fields", async () => {
    store.sessions = [drill(1, "ready"), drill(2, "ready"), { ...drill(3, "x"), status: "open", evaluation: undefined }];
    store.evaluations.set("s1", evaluation("ready", "ingest pipeline", "What was the p99?"));
    store.evaluations.set("s2", evaluation("ready", "billing cutover", null));
    const res = await call("/me");
    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(200);
    expect(body.engineer).toEqual({ engineerId: "e1", name: "Ada", role: "engineer", createdAt: "2026-10-01T00:00:00Z" });
    expect(body.sessions).toEqual(store.sessions);
    expect(body.summary).toEqual({
      level: "L2", drillsGraded: 2, latestReadiness: "ready",
      claimsDrilled: ["ingest pipeline", "billing cutover"],
      categoryReads: { decisions: { latest: "strong", strong: 2, weak: 0, mixed: 0 }, scale: { latest: "weak", strong: 0, weak: 2, mixed: 0 } },
      threads: [
        { claim: "ingest pipeline", outcome: "ran-out", sessionId: "s1", drilledOn: "2026-10-01" },
        { claim: "billing cutover", outcome: "held", sessionId: "s2", drilledOn: "2026-10-02" },
      ],
      goFindOut: ["billing cutover sizing"],
    });
  });

  it("returns no raw transcript, quote or contradiction text (DEC-166)", async () => {
    store.sessions = [drill(1, "close")];
    store.evaluations.set("s1", evaluation("close", "ingest pipeline", "What was the p99?"));
    const { body } = await call("/me");
    expect(body).not.toMatch(/RAW-|p99/);
  });

  it("returns an empty L1 summary for an engineer with no graded drill", async () => {
    const body = JSON.parse((await call("/me")).body);
    expect(body.summary).toEqual({ level: "L1", drillsGraded: 0, latestReadiness: null, claimsDrilled: [], categoryReads: {}, threads: [], goFindOut: [] });
  });

  it("rejects a bad token", async () => expect((await call("/me", "bad")).statusCode).toBe(401));
});
