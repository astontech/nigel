import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  session: undefined as any,
  artifacts: {} as Record<string, string>,
  updates: [] as any[],
  written: {} as Record<string, string>,
  claudeCalls: [] as string[][],
}));

vi.mock("../lambda/shared/db.js", () => ({
  getSession: async () => store.session,
  getArtifact: async (_e: string, _s: string, name: string) => store.artifacts[name],
  putArtifact: async (_e: string, _s: string, name: string, body: string) => { store.written[name] = body; },
  updateSession: async (_e: string, _s: string, patch: any) => { store.updates.push(patch); },
  now: () => "2026-10-14T00:00:00.000Z",
}));

vi.mock("node:child_process", () => {
  const execFile: any = (_cmd: string, args: string[], _opts: unknown, cb: Function) => {
    store.claudeCalls.push(args);
    const graded = { readiness: "ready", openSlots: 0, threads: [{ categories: { ownership: { read: "strong" } } }] };
    cb(null, { stdout: JSON.stringify({ result: JSON.stringify(graded), usage: {}, total_cost_usd: 0 }), stderr: "" });
  };
  execFile[Symbol.for("nodejs.util.promisify.custom")] = (cmd: string, args: string[], opts: unknown) =>
    new Promise((resolve, reject) => execFile(cmd, args, opts, (e: unknown, r: unknown) => (e ? reject(e) : resolve(r))));
  return { execFile };
});

import { evaluate } from "../evaluator/evaluate.js";

const line = (role: string, text: string) => JSON.stringify({ role, text });
// The AST-216 run: the interviewer paraphrased the drill opener.
const PARAPHRASED = "Drill rules: I ask, and you answer out loud the way you would in the room, I follow up.\n\nLevel L1.\n\nTell me about yourself.";

beforeEach(() => {
  store.session = { engineerId: "e1", sessionId: "s1", status: "evaluated", mode: "unknown", evaluation: { evaluatedAt: "t", model: "none" } };
  store.artifacts = { "transcript.jsonl": [line("assistant", PARAPHRASED), line("user", "I own the ingest pipeline.")].join("\n") };
  store.updates = [];
  store.written = {};
  store.claudeCalls = [];
});

describe("evaluate on a stored evaluated/unknown/model-none session", () => {
  it("re-reads the mode as drill and takes the grading path, not the build path", async () => {
    const result: any = await evaluate("e1", "s1");
    expect(store.updates[0]).toEqual({ mode: "drill" });
    expect(store.claudeCalls).toHaveLength(1);
    expect(result.evaluated).toBe(true);
    expect(result.summary.model).not.toBe("none");
    expect(result.summary.overall).toBe("ready");
    expect(JSON.parse(store.written["evaluation.json"]).note).toBeUndefined();
  });

  it("leaves a paraphrase-free build transcript on the build path with no grade", async () => {
    store.artifacts["transcript.jsonl"] = line("assistant", "Paste whatever you have on your most recent project.");
    const result: any = await evaluate("e1", "s1");
    expect(store.claudeCalls).toHaveLength(0);
    expect(result.evaluated).toBe(false);
    expect(store.updates.at(-1).evaluation.model).toBe("none");
  });
});
