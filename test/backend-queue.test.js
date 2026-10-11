import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Backend, QUEUE_FILE, flushStaleQueues } from "../src/backend.js";
import { buildOpener } from "../src/claude.js";

const CLI = join(fileURLToPath(new URL("..", import.meta.url)), "bin", "cli.js");
const quiet = () => {};

/** A DORIS stand-in that records every request; `status` answers everything except POST /sessions success. */
function fakeApi(status = 200) {
  const seen = [];
  const server = createServer((req, res) => {
    let body = ""; req.on("data", c => body += c);
    req.on("end", () => {
      seen.push(`${req.method} ${req.url}`);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(status === 200 ? JSON.stringify(req.method === "POST" && req.url === "/sessions" ? { sessionId: "s-1" } : {}) : "no");
    });
  });
  return { seen, server, listen: (port = 0) => new Promise(r => server.listen(port, "127.0.0.1", () => r(server.address().port))), close: () => new Promise(r => server.close(r)) };
}
/** A port nothing listens on. */
async function closedPort() { const a = fakeApi(); const port = await a.listen(); await a.close(); return port; }
const queued = (file) => readFileSync(file, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
const tmp = () => mkdtempSync(join(tmpdir(), "queue-"));

test("with the API unreachable every write lands in the queue file in call order", async () => {
  const port = await closedPort();
  const queueFile = join(tmp(), QUEUE_FILE);
  const backend = new Backend({ api: `http://127.0.0.1:${port}`, token: "t", log: quiet, queueFile });
  assert.equal(await backend.start("drill"), null);
  await backend.putArtifact("talk-track.md", "# Talk track");
  await backend.putTranscript([{ role: "user", text: "hi" }]);
  await backend.end("drill");
  assert.equal(backend.offline, true);
  assert.deepEqual(queued(queueFile).map(e => `${e.method} ${e.path}`), [
    "POST /sessions",
    "PUT /sessions/{sessionId}/artifacts/talk-track.md",
    "PUT /sessions/{sessionId}/artifacts/transcript.jsonl",
    "POST /sessions/{sessionId}/end",
  ]);
});

test("against a host that accepts and never answers, every write is on disk before the hung request settles", async () => {
  let arrived = 0; let released = false;
  const hung = createServer((req) => { arrived++; if (released) req.socket.destroy(); });
  const port = await new Promise(r => hung.listen(0, "127.0.0.1", () => r(hung.address().port)));
  const queueFile = join(tmp(), QUEUE_FILE);
  const backend = new Backend({ api: `http://127.0.0.1:${port}`, token: "t", log: quiet, queueFile });
  const pending = [
    backend.start("drill"),
    backend.putArtifact("talk-track.md", "x"),
    backend.putTranscript([{ role: "user", text: "hi" }]),
    backend.end("drill"),
  ];
  try {
    assert.deepEqual(queued(queueFile).map(e => `${e.method} ${e.path}`), [
      "POST /sessions",
      "PUT /sessions/{sessionId}/artifacts/talk-track.md",
      "PUT /sessions/{sessionId}/artifacts/transcript.jsonl",
      "POST /sessions/{sessionId}/end",
    ]);
  } finally {
    while (!arrived) await new Promise(r => setTimeout(r, 5));
    released = true; hung.closeAllConnections(); await Promise.all(pending); await new Promise(r => hung.close(r)); }
  assert.equal(queued(queueFile).length, 4);
});

test("a write appended while a send is in flight survives the send", async () => {
  let release;
  const gate = new Promise(r => release = r);
  const seen = [];
  const server = createServer(async (req, res) => {
    req.resume(); seen.push(`${req.method} ${req.url}`);
    if (seen.length === 1) await gate;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(req.url === "/sessions" ? { sessionId: "s-1" } : {}));
  });
  const port = await new Promise(r => server.listen(0, "127.0.0.1", () => r(server.address().port)));
  const queueFile = join(tmp(), QUEUE_FILE);
  const backend = new Backend({ api: `http://127.0.0.1:${port}`, token: "t", log: quiet, queueFile });
  const first = backend.start("drill");
  while (!seen.length) await new Promise(r => setTimeout(r, 5));
  const second = backend.putArtifact("resume.md", "later");
  assert.equal(queued(queueFile).length, 2);
  release();
  await Promise.all([first, second]);
  await new Promise(r => server.close(r));
  assert.deepEqual(seen, ["POST /sessions", "PUT /sessions/s-1/artifacts/resume.md"]);
  assert.equal(existsSync(queueFile), false);
});

test("a 5xx queues the write too", async () => {
  const api = fakeApi(503); const port = await api.listen();
  const queueFile = join(tmp(), QUEUE_FILE);
  const backend = new Backend({ api: `http://127.0.0.1:${port}`, token: "t", log: quiet, queueFile });
  await backend.start();
  await api.close();
  assert.equal(backend.offline, true);
  assert.equal(queued(queueFile).length, 1);
});

test("when the API comes back during the session the queue is sent in order and the file is deleted", async () => {
  const port = await closedPort();
  const queueFile = join(tmp(), QUEUE_FILE);
  const backend = new Backend({ api: `http://127.0.0.1:${port}`, token: "t", log: quiet, queueFile });
  await backend.start("drill");
  await backend.putArtifact("talk-track.md", "x");
  await backend.end("drill");
  const api = fakeApi(); await api.listen(port);
  try {
    await backend.putArtifact("resume.md", "later");
    assert.deepEqual(api.seen, ["POST /sessions", "PUT /sessions/s-1/artifacts/talk-track.md", "POST /sessions/s-1/end", "PUT /sessions/s-1/artifacts/resume.md"]);
    assert.equal(existsSync(queueFile), false);
    assert.equal(backend.sessionId, "s-1");
    assert.equal(backend.offline, false);
  } finally { await api.close(); }
});

test("on launch a queue left in an older session folder is sent and deleted", async () => {
  const sessions = tmp();
  const older = join(sessions, "2026-10-01T00-00-00-000Z"); mkdirSync(older);
  const current = join(sessions, "2026-10-02T00-00-00-000Z"); mkdirSync(current);
  const port = await closedPort();
  const stale = new Backend({ api: `http://127.0.0.1:${port}`, token: "t", log: quiet, queueFile: join(older, QUEUE_FILE) });
  await stale.start("drill"); await stale.end("drill");
  const api = fakeApi(); await api.listen(port);
  try {
    assert.deepEqual(await flushStaleQueues(sessions, current, { api: `http://127.0.0.1:${port}`, token: "t", log: quiet }), ["2026-10-01T00-00-00-000Z"]);
    assert.deepEqual(api.seen, ["POST /sessions", "POST /sessions/s-1/end"]);
    assert.equal(existsSync(join(older, QUEUE_FILE)), false);
  } finally { await api.close(); }
});

test("writes queued behind an already-sent POST /sessions carry the returned id into the next launch's flush", async () => {
  const sessions = tmp();
  const older = join(sessions, "2026-10-01T00-00-00-000Z"); mkdirSync(older);
  const current = join(sessions, "2026-10-02T00-00-00-000Z"); mkdirSync(current);
  const seen = []; let mode = "down";
  const server = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      seen.push(`${req.method} ${req.url}`);
      const start = req.method === "POST" && req.url === "/sessions";
      if (mode === "down") return req.socket.destroy();
      if (mode === "partial" && !start) { res.writeHead(503); return res.end("down"); }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(start ? { sessionId: "s-1" } : {}));
    });
  });
  const port = await new Promise(r => server.listen(0, "127.0.0.1", () => r(server.address().port)));
  try {
    const first = new Backend({ api: `http://127.0.0.1:${port}`, token: "t", log: quiet, queueFile: join(older, QUEUE_FILE) });
    assert.equal(await first.start("drill"), null);
    await first.end("drill");
    mode = "partial";
    await first.flush();
    assert.equal(first.sessionId, "s-1");
    assert.deepEqual(queued(join(older, QUEUE_FILE)).map(e => `${e.method} ${e.path}`), ["POST /sessions/s-1/end"]);
    mode = "up"; seen.length = 0;
    await flushStaleQueues(sessions, current, { api: `http://127.0.0.1:${port}`, token: "t", log: quiet });
    assert.deepEqual(seen, ["POST /sessions/s-1/end"]);
    assert.equal(existsSync(join(older, QUEUE_FILE)), false);
  } finally { await new Promise(r => server.close(r)); }
});

test("a 401 at start still exits with the token message and queues nothing", async () => {
  const api = fakeApi(401); const port = await api.listen();
  const home = tmp();
  const claude = join(home, "claude"); writeFileSync(claude, "#!/bin/sh\nexit 0\n"); chmodSync(claude, 0o755);
  try {
    const child = spawn(process.execPath, [CLI, "--api", `http://127.0.0.1:${port}`, "--token", "bad", "--no-open", "--claude", claude], { env: { ...process.env, HOME: home } });
    let stderr = ""; child.stderr.on("data", c => stderr += c);
    const status = await new Promise(r => child.on("exit", r));
    assert.equal(status, 2);
    assert.match(stderr, /rejected the token/);
  } finally { await api.close(); }
});

test("the opener says grading will be late when DORIS is unreachable, and only then", () => {
  assert.match(buildOpener(undefined, true), /Level: L1\. No drill history\. DORIS is unreachable: grading will be late\./);
  assert.doesNotMatch(buildOpener(undefined), /unreachable/);
});
