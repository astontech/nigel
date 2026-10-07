import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeSession, buildOpener } from "../src/claude.js";
import { Backend } from "../src/backend.js";

const SUMMARY = {
  level: "L2", drillsGraded: 3, latestReadiness: "ready",
  claimsDrilled: ["ingest pipeline"], categoryReads: { decisions: { latest: "strong", strong: 2, weak: 0, mixed: 0 } },
  threads: [{ claim: "ingest pipeline", outcome: "ran-out", sessionId: "s1", drilledOn: "2026-10-01" }], goFindOut: ["ingest sizing"],
};

/** A stand-in for `claude` that records the first stream-json message it is sent. */
function fakeClaude() {
  const dir = mkdtempSync(join(tmpdir(), "opener-"));
  const out = join(dir, "first-message.json");
  const bin = join(dir, "claude");
  writeFileSync(bin, `#!/usr/bin/env node\nrequire("node:readline").createInterface({ input: process.stdin }).once("line", l => { require("node:fs").writeFileSync(${JSON.stringify(out)}, l); process.exit(0); });\n`);
  chmodSync(bin, 0o755);
  return { dir, out, bin };
}
const sentOpener = (session, out) => new Promise(resolve => session.on("exit", () => resolve(JSON.parse(readFileSync(out, "utf8")).message.content[0].text)));

test("with an L2 summary the opening prompt sent to claude carries the summary and the level", async () => {
  const { dir, out, bin } = fakeClaude();
  const backend = Object.assign(Object.create(Backend.prototype), { summary: async () => SUMMARY });
  const session = new ClaudeSession({ bin, cwd: dir, summary: await backend.summary() });
  const text = await sentOpener(session, out);
  assert.match(text, /^Use the interview-rehearsal skill\./);
  assert.match(text, /Level: L2\./);
  assert.ok(text.includes(JSON.stringify(SUMMARY, null, 2)));
  assert.doesNotMatch(text, /No drill history/);
});

test("with no summary the opening prompt carries no history and says L1", async () => {
  const { dir, out, bin } = fakeClaude();
  const session = new ClaudeSession({ bin, cwd: dir, summary: undefined });
  const text = await sentOpener(session, out);
  assert.match(text, /Level: L1\. No drill history\./);
  assert.doesNotMatch(text, /claimsDrilled|drillsGraded/);
});

test("a summary with an unknown level is read as L1", () => {
  assert.match(buildOpener({ ...SUMMARY, level: "L9" }), /Level: L1\./);
});

test("Backend.summary returns the summary from GET /me with the engineer's own token", async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ engineer: {}, sessions: [], summary: SUMMARY }), { headers: { "content-type": "application/json" } }); };
  try {
    const backend = new Backend({ api: "https://doris.test", token: "tok", log: () => {} });
    assert.deepEqual(await backend.summary(), SUMMARY);
    assert.equal(calls[0].url, "https://doris.test/me");
    assert.equal(calls[0].init.method, "GET");
    assert.equal(calls[0].init.headers.authorization, "Bearer tok");
  } finally { globalThis.fetch = realFetch; }
});

test("Backend.summary is undefined when DORIS cannot be reached, so the drill runs at L1", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("unreachable"); };
  try {
    const backend = new Backend({ api: "https://doris.test", token: "tok", log: () => {} });
    assert.equal(await backend.summary(), undefined);
  } finally { globalThis.fetch = realFetch; }
});
