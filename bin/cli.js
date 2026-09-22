#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import open from "open";
import { loadConfig, saveToken, SESSIONS_DIR, CONFIG_FILE } from "../src/config.js";
import { Backend } from "../src/backend.js";
import { startServer } from "../src/server.js";

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

let backend = null;
if (config.record) {
  if (!config.token) { log("No token. Ask your manager for one, then run with --token <token> once. (Or --no-record to try the shell without recording.)"); process.exit(2); }
  backend = new Backend({ api: config.api, token: config.token, log });
  const id = await backend.start();
  if (!id) { log("Couldn't reach the backend or the token was rejected. Check the token, or run with --no-record."); process.exit(2); }
}

const sessionDir = join(SESSIONS_DIR, new Date().toISOString().replace(/[:.]/g, "-"));
mkdirSync(sessionDir, { recursive: true });
log(`session folder: ${sessionDir}`);

const { server, end } = startServer({ config, backend, sessionDir, log });
server.listen(config.port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  log(`open ${url}`);
  if (config.open) open(url).catch(() => {});
});

const shutdown = async () => { await end("shutdown"); setTimeout(() => process.exit(0), 500); };
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
