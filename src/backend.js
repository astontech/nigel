import { appendFileSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

export const QUEUE_FILE = "queue.jsonl";
const SESSION_ID = "{sessionId}";

/**
 * Client for the interview-rehearsal backend. Never throws into the session. Every write goes to a queue file in
 * the session folder first and is sent in order; a network failure or 5xx leaves the rest queued (DEC-200), to be
 * sent when DORIS answers again or at the next launch. A rejected token (401/403) stops sending and is reported.
 */
export class Backend {
  constructor({ api, token, log = console.error, queueFile }) {
    this.api = api; this.token = token; this.log = log; this.queueFile = queueFile;
    this.sessionId = null; this.offline = false; this.rejected = false; this.chain = Promise.resolve();
  }

  /** Queues `POST /sessions` as the first write and tries to send it; the session id may come later. */
  async start(mode = "unknown") {
    await this.#write({ method: "POST", path: "/sessions", body: { mode }, type: "application/json" });
    return this.sessionId;
  }
  /** The engineer's own derived grade record (level, reads, threads), or undefined when DORIS cannot be reached. */
  async summary() {
    for (let attempt = 0; ; attempt++) {
      const r = await this.#send({ method: "GET", path: "/me", type: "application/json" });
      if (r.status === "ok") return r.data?.summary;
      if (r.status !== "retry" || attempt >= 2) return undefined;
      await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  putArtifact(name, body) { return this.#write({ method: "PUT", path: `/sessions/${this.sessionId ?? SESSION_ID}/artifacts/${name}`, body, type: "text/plain" }); }
  putTranscript(turns) { return this.putArtifact("transcript.jsonl", turns.map(t => JSON.stringify(t)).join("\n") + "\n"); }
  end(mode) { return this.#write({ method: "POST", path: `/sessions/${this.sessionId ?? SESSION_ID}/end`, body: { mode }, type: "application/json" }); }
  /** Sends whatever the queue file holds, in order. */
  flush() { return this.#write(); }

  /** Appends the entry to the queue file at once, in call order, then drains behind any drain already running. */
  #write(entry) {
    if (entry) this.#append(entry);
    this.chain = this.chain.then(() => this.#drain()).catch(e => this.log(`backend: ${e.message}`));
    return this.chain;
  }
  #read() {
    if (!this.queueFile || !existsSync(this.queueFile)) return [];
    return readFileSync(this.queueFile, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
  }
  #append(entry) { appendFileSync(this.queueFile, JSON.stringify(entry) + "\n"); }
  /** Removes the head entry from the file as it stands now, so appends made during a send survive. Synchronous: nothing interleaves.
   *  Given the id a sent `POST /sessions` returned, writes it into the remaining entries so a later launch's flush sends real paths. */
  #shift(sessionId) {
    const entries = this.#read();
    entries.shift();
    if (sessionId) for (const e of entries) e.path = e.path.replace(SESSION_ID, sessionId);
    if (!entries.length) rmSync(this.queueFile, { force: true });
    else writeFileSync(this.queueFile, entries.map(e => JSON.stringify(e)).join("\n") + "\n");
  }
  async #drain() {
    for (let entry = this.#read()[0]; entry; entry = this.#read()[0]) {
      const r = await this.#send({ ...entry, path: this.sessionId ? entry.path.replace(SESSION_ID, this.sessionId) : entry.path });
      if (r.status === "retry" || r.status === "rejected") return;
      if (r.status === "drop") this.log(`backend: dropped ${entry.method} ${entry.path} → ${r.detail}`);
      const started = r.status === "ok" && entry.method === "POST" && entry.path === "/sessions";
      if (started) this.sessionId = r.data?.sessionId ?? null;
      this.#shift(started ? this.sessionId : undefined);
    }
  }
  /** One attempt. ok | retry (network failure or 5xx) | rejected (401/403) | drop (any other refusal). */
  async #send({ method, path, body, type }) {
    let res;
    try {
      res = await fetch(this.api + path, { method, headers: { authorization: `Bearer ${this.token}`, "content-type": type }, body: body === undefined ? undefined : (type === "application/json" ? JSON.stringify(body) : body) });
    } catch (e) { this.offline = true; return { status: "retry", detail: e.message }; }
    if (res.ok) {
      this.offline = false;
      return { status: "ok", data: res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text() };
    }
    const detail = `${res.status} ${await res.text()}`;
    if (res.status === 401 || res.status === 403) { this.rejected = true; this.log(`backend: token rejected (${method} ${path} → ${detail})`); return { status: "rejected", detail }; }
    if (res.status >= 500) { this.offline = true; return { status: "retry", detail }; }
    return { status: "drop", detail };
  }
}

/** Sends and deletes the queue file of every session folder other than the current one, oldest first. Returns the folders that held one. */
export async function flushStaleQueues(sessionsDir, currentDir, { api, token, log }) {
  if (!existsSync(sessionsDir)) return [];
  const names = readdirSync(sessionsDir, { withFileTypes: true }).filter(e => e.isDirectory() && e.name !== basename(currentDir) && existsSync(join(sessionsDir, e.name, QUEUE_FILE))).map(e => e.name).sort();
  for (const name of names) await new Backend({ api, token, log, queueFile: join(sessionsDir, name, QUEUE_FILE) }).flush();
  return names;
}
