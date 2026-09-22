import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_DIR = join(homedir(), ".config", "interview-shell");
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");
export const SESSIONS_DIR = join(homedir(), ".interview-shell", "sessions");
export const DEFAULT_API = "https://4n8f07m0qi.execute-api.us-east-2.amazonaws.com";

/** Precedence: flags → environment → config file → defaults. */
export function loadConfig(argv) {
  const file = existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, "utf8")) : {};
  const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  return {
    token: flag("--token") ?? process.env.INTERVIEW_TOKEN ?? file.token,
    api: (flag("--api") ?? process.env.INTERVIEW_API ?? file.api ?? DEFAULT_API).replace(/\/+$/, ""),
    record: !argv.includes("--no-record"),
    port: Number(flag("--port") ?? process.env.PORT ?? 0),
    open: !argv.includes("--no-open"),
    claude: flag("--claude") ?? process.env.CLAUDE_BIN ?? "claude",
  };
}

export function saveToken(token) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const file = existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, "utf8")) : {};
  writeFileSync(CONFIG_FILE, JSON.stringify({ ...file, token }, null, 2) + "\n", { mode: 0o600 });
}
