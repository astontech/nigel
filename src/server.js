import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ClaudeSession, inferMode } from "./claude.js";
import { watchArtifacts } from "./watch.js";

const UI = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "ui", "index.html"));

/** Local server: serves the UI, streams the session over SSE, forwards input, records to the backend. */
export function startServer({ config, backend, sessionDir, log }) {
  const claude = new ClaudeSession({ bin: config.claude, cwd: sessionDir });
  const clients = new Set();
  let mode; let ended = false; let pending = "";
  const state = () => ({ mode, ended, sessionId: backend?.sessionId ?? null, recording: !!backend, turns: claude.turns.length });
  const broadcast = (event, data) => { const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; for (const c of clients) c.write(msg); };

  let transcriptTimer;
  const syncTranscript = () => { clearTimeout(transcriptTimer); transcriptTimer = setTimeout(() => backend?.putTranscript(claude.turns), 300); };

  claude.on("delta", t => { pending += t; broadcast("delta", { text: t }); });
  claude.on("assistant", text => {
    pending = "";
    mode ??= inferMode(text);
    broadcast("assistant", { text, mode });
    syncTranscript();
  });
  claude.on("user", text => { broadcast("user", { text }); syncTranscript(); });
  claude.on("stderr", l => log(`claude: ${l}`));
  claude.on("error", e => { log(`claude failed to start: ${e.message}`); broadcast("fatal", { text: `Claude Code failed to start: ${e.message}. Is \`claude\` installed and signed in?` }); });
  claude.on("exit", code => { broadcast("exit", { code }); if (!ended) end("claude exited"); });

  const stopWatch = watchArtifacts(sessionDir, (name, body) => { backend?.putArtifact(name, body); broadcast("artifact", { name, slots: (body.match(/⟪[^⟫]*⟫/g) ?? []).length }); });

  async function end(reason) {
    if (ended) return; ended = true;
    log(`ending session (${reason})`);
    stopWatch();
    clearTimeout(transcriptTimer);
    await backend?.putTranscript(claude.turns);
    await backend?.end(mode);
    broadcast("ended", { reason });
    claude.close();
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(UI); }
    if (req.method === "GET" && url.pathname === "/state") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(state())); }
    if (req.method === "GET" && url.pathname === "/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      res.write(`event: state\ndata: ${JSON.stringify(state())}\n\n`);
      for (const t of claude.turns) res.write(`event: ${t.role}\ndata: ${JSON.stringify({ text: t.text, replay: true })}\n\n`);
      if (pending) res.write(`event: delta\ndata: ${JSON.stringify({ text: pending })}\n\n`);
      clients.add(res); req.on("close", () => clients.delete(res)); return;
    }
    if (req.method === "POST" && url.pathname === "/input") {
      const body = await readBody(req); const { text } = JSON.parse(body || "{}");
      if (text?.trim() && !ended) claude.send(text.trim());
      res.writeHead(204); return res.end();
    }
    if (req.method === "POST" && url.pathname === "/end") { await end("user"); res.writeHead(204); return res.end(); }
    res.writeHead(404); res.end();
  });

  return { server, end, claude };
}

const readBody = (req) => new Promise(r => { let b = ""; req.on("data", c => b += c); req.on("end", () => r(b)); });
