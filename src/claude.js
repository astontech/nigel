import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PLUGIN_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "plugin");
const OPENER = "Use the interview-rehearsal skill.";

/**
 * One Claude Code process in --print stream-json mode, kept alive by an open stdin.
 * Emits: "delta" (text chunk), "assistant" (full message text), "user" (echo), "exit" (code), "error".
 */
export class ClaudeSession extends EventEmitter {
  constructor({ bin = "claude", cwd }) {
    super();
    this.cwd = cwd;
    this.turns = [];
    this.child = spawn(bin, [
      "-p", "--verbose",
      "--input-format", "stream-json", "--output-format", "stream-json", "--include-partial-messages",
      "--plugin-dir", PLUGIN_DIR,
      "--allowedTools", "Read", "Write", "Edit",
      "--permission-mode", "acceptEdits",
    ], { cwd, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, CLAUDECODE: undefined } });

    this.child.on("error", e => this.emit("error", e));
    this.child.on("exit", code => this.emit("exit", code));
    createInterface({ input: this.child.stderr }).on("line", l => this.emit("stderr", l));
    createInterface({ input: this.child.stdout }).on("line", l => this.#line(l));
    this.send(OPENER, { echo: false });
  }

  send(text, { echo = true } = {}) {
    if (echo) { this.turns.push({ role: "user", text, at: new Date().toISOString() }); this.emit("user", text); }
    this.child.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text }] } }) + "\n");
  }

  close() { try { this.child.stdin.end(); } catch {} setTimeout(() => { try { this.child.kill(); } catch {} }, 3000); }

  #line(line) {
    let ev; try { ev = JSON.parse(line); } catch { return; }
    if (ev.type === "stream_event" && ev.event?.type === "content_block_delta" && ev.event.delta?.type === "text_delta") {
      this.emit("delta", ev.event.delta.text);
    } else if (ev.type === "assistant") {
      const text = (ev.message?.content ?? []).filter(c => c.type === "text").map(c => c.text).join("");
      if (text.trim()) { this.turns.push({ role: "assistant", text, at: new Date().toISOString() }); this.emit("assistant", text); }
    } else if (ev.type === "result") {
      this.emit("result", ev);
    }
  }
}

/** Mode is inferred from the skill's fixed templates so the record needs no extra signal from the skill. */
export function inferMode(assistantText) {
  if (/Drill rules: I ask, you answer out loud/.test(assistantText)) return "drill";
  if (/Paste whatever you have on your most recent project|Interviewers ask about context first/.test(assistantText)) return "build";
  return undefined;
}
