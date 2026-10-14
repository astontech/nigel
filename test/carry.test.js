import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { carryForward, sendCarried } from "../src/carry.js";
import { Backend, QUEUE_FILE } from "../src/backend.js";

const setup = () => {
  const root = mkdtempSync(join(tmpdir(), "carry-"));
  const folder = (name, files = {}) => {
    const dir = join(root, name);
    mkdirSync(dir, { recursive: true });
    for (const [file, body] of Object.entries(files)) writeFileSync(join(dir, file), body);
    return dir;
  };
  return { root, folder };
};

test("two earlier sessions with different talk tracks: the newer one is carried", () => {
  const { root, folder } = setup();
  folder("2026-10-01T10-00-00-000Z", { "talk-track.md": "older" });
  folder("2026-10-02T10-00-00-000Z", { "talk-track.md": "newer" });
  const next = folder("2026-10-03T10-00-00-000Z");
  carryForward(root, next);
  assert.equal(readFileSync(join(next, "talk-track.md"), "utf8"), "newer");
});

test("resume.md comes from the most recent folder that has one, even if a newer folder has only a talk track", () => {
  const { root, folder } = setup();
  folder("2026-10-01T10-00-00-000Z", { "talk-track.md": "t1", "resume.md": "r1" });
  folder("2026-10-02T10-00-00-000Z", { "talk-track.md": "t2" });
  const next = folder("2026-10-03T10-00-00-000Z");
  carryForward(root, next);
  assert.equal(readFileSync(join(next, "talk-track.md"), "utf8"), "t2");
  assert.equal(readFileSync(join(next, "resume.md"), "utf8"), "r1");
});

test("no earlier sessions: the new folder stays empty", () => {
  const { root, folder } = setup();
  const next = folder("2026-10-03T10-00-00-000Z");
  assert.deepEqual(carryForward(root, next), []);
  assert.deepEqual(readdirSync(next), []);
});

test("earlier sessions holding neither file create nothing", () => {
  const { root, folder } = setup();
  folder("2026-10-01T10-00-00-000Z", { "drill-log.md": "x" });
  const next = folder("2026-10-03T10-00-00-000Z");
  carryForward(root, next);
  assert.deepEqual(readdirSync(next), []);
});

// --- sendCarried: carried files reach DORIS as the new session's artifacts (AST-309) ---

const quiet = () => {};
/** A stubbed DORIS recording method, path and body of every request. */
function stubDoris() {
  const seen = [];
  const server = createServer((req, res) => {
    let body = ""; req.on("data", c => body += c);
    req.on("end", () => {
      seen.push({ method: req.method, path: req.url, body });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(req.method === "POST" && req.url === "/sessions" ? { sessionId: "s-new" } : {}));
    });
  });
  return { seen, listen: () => new Promise(r => server.listen(0, "127.0.0.1", () => r(server.address().port))), close: () => new Promise(r => server.close(r)) };
}
const startSession = async (api, root, next) => {
  const backend = new Backend({ api, token: "t", log: quiet, queueFile: join(next, QUEUE_FILE) });
  await backend.start("drill");
  await sendCarried(next, carryForward(root, next), backend);
  return backend;
};

test("a carried talk-track.md is sent to the new session's artifact", async () => {
  const { root, folder } = setup();
  folder("2026-10-01T10-00-00-000Z", { "talk-track.md": "# Talk track" });
  const next = folder("2026-10-03T10-00-00-000Z");
  const doris = stubDoris(); const port = await doris.listen();
  await startSession(`http://127.0.0.1:${port}`, root, next);
  await doris.close();
  assert.deepEqual(doris.seen.map(r => `${r.method} ${r.path}`), ["POST /sessions", "PUT /sessions/s-new/artifacts/talk-track.md"]);
  assert.equal(doris.seen[1].body, "# Talk track");
});

test("a carried resume.md is sent the same way", async () => {
  const { root, folder } = setup();
  folder("2026-10-01T10-00-00-000Z", { "talk-track.md": "t", "resume.md": "# Resume" });
  const next = folder("2026-10-03T10-00-00-000Z");
  const doris = stubDoris(); const port = await doris.listen();
  await startSession(`http://127.0.0.1:${port}`, root, next);
  await doris.close();
  const put = doris.seen.find(r => r.path === "/sessions/s-new/artifacts/resume.md");
  assert.equal(put?.method, "PUT");
  assert.equal(put.body, "# Resume");
});

test("nothing carried forward: no artifact is sent at start", async () => {
  const { root, folder } = setup();
  folder("2026-10-01T10-00-00-000Z", { "drill-log.md": "x" });
  const next = folder("2026-10-03T10-00-00-000Z");
  const doris = stubDoris(); const port = await doris.listen();
  await startSession(`http://127.0.0.1:${port}`, root, next);
  await doris.close();
  assert.deepEqual(doris.seen.map(r => `${r.method} ${r.path}`), ["POST /sessions"]);
});

test("DORIS unreachable at start: the carried files are queued, in order, for later (DEC-200)", async () => {
  const { root, folder } = setup();
  folder("2026-10-01T10-00-00-000Z", { "talk-track.md": "# Talk track", "resume.md": "# Resume" });
  const next = folder("2026-10-03T10-00-00-000Z");
  const dead = stubDoris(); const port = await dead.listen(); await dead.close();
  const backend = await startSession(`http://127.0.0.1:${port}`, root, next);
  assert.equal(backend.offline, true);
  assert.ok(existsSync(join(next, QUEUE_FILE)));
  const entries = readFileSync(join(next, QUEUE_FILE), "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
  assert.deepEqual(entries.map(e => `${e.method} ${e.path}`), [
    "POST /sessions",
    "PUT /sessions/{sessionId}/artifacts/talk-track.md",
    "PUT /sessions/{sessionId}/artifacts/resume.md",
  ]);
  assert.equal(entries[1].body, "# Talk track");
});
