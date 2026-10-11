#!/usr/bin/env node
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import open from "open";
import { loadConfig, saveToken, SESSIONS_DIR, CONFIG_FILE } from "../src/config.js";
import { Backend, QUEUE_FILE, flushStaleQueues } from "../src/backend.js";
import { startServer } from "../src/server.js";
import { carryForward } from "../src/carry.js";

const argv = process.argv.slice(2);
const log = (m) => console.error(`[interview-shell] ${m}`);

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`NIGEL — rehearse a client interview with Claude Code

  npx github:astontech/nigel                      start a session (build or drill, the skill decides)
  --token <t>      your Aston-issued token (saved to ${CONFIG_FILE})
  --no-record      run without sending anything to the backend
  --no-open        don't open the browser
  --port <n>       fixed local port (default: random)
  --api <url>      backend URL override`);
  process.exit(0);
}

const config = loadConfig(argv);
if (argv.includes("--token") && config.token) { saveToken(config.token); log(`token saved to ${CONFIG_FILE}`); }

// Preflight: Claude Code must exist and be signed in — it is the engine, and the login is the engineer's own.
try { execFileSync(config.claude, ["--version"], { stdio: "pipe" }); }
catch { log("Claude Code isn't installed or isn't on PATH. Install it, run `claude` once to sign in, then try again."); process.exit(2); }

const sessionDir = join(SESSIONS_DIR, new Date().toISOString().replace(/[:.]/g, "-"));
mkdirSync(sessionDir, { recursive: true });
log(`session folder: ${sessionDir}`);

let backend = null;
if (config.record) {
  if (!config.token) { log("No token. Ask your manager for one, then run with --token <token> once. (Or --no-record to try the shell without recording.)"); rmSync(sessionDir, { recursive: true, force: true }); process.exit(2); }
  // Writes a past session left unsent go first, so an outage never loses a drill (DEC-200).
  for (const name of await flushStaleQueues(SESSIONS_DIR, sessionDir, { api: config.api, token: config.token, log })) log(`sent queued writes from ${name}`);
  backend = new Backend({ api: config.api, token: config.token, log, queueFile: join(sessionDir, QUEUE_FILE) });
  await backend.start();
  if (backend.rejected) { log("The backend rejected the token. Check the token, or run with --no-record."); rmSync(sessionDir, { recursive: true, force: true }); process.exit(2); }
  if (backend.offline) log("DORIS is unreachable: the drill runs without history and its turns are kept here to send later.");
}
for (const { file, from } of carryForward(SESSIONS_DIR, sessionDir)) log(`carried ${file} forward from ${from}`);

// The drill opens from the engineer's own history; without a backend (--no-record) or a summary it runs at L1.
const summary = await backend?.summary();
const { server, end } = startServer({ config, backend, sessionDir, log, summary, unreachable: !!backend?.offline });
server.listen(config.port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  log(`open ${url}`);
  if (config.open) open(url).catch(() => {});
});

const shutdown = async () => { await end("shutdown"); setTimeout(() => process.exit(0), 500); };
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
