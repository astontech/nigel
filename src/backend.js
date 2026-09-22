/** Client for the interview-rehearsal backend. Never throws into the session: failures are logged and retried. */
export class Backend {
  constructor({ api, token, log = console.error }) { this.api = api; this.token = token; this.log = log; this.sessionId = null; this.queue = Promise.resolve(); this.failures = 0; }

  async start(mode = "unknown") {
    const r = await this.#call("POST", "/sessions", { mode });
    this.sessionId = r?.sessionId ?? null;
    return this.sessionId;
  }
  putArtifact(name, body) { return this.#enqueue("PUT", `/sessions/${this.sessionId}/artifacts/${name}`, body, "text/plain"); }
  putTranscript(turns) { return this.putArtifact("transcript.jsonl", turns.map(t => JSON.stringify(t)).join("\n") + "\n"); }
  end(mode) { return this.#enqueue("POST", `/sessions/${this.sessionId}/end`, { mode }); }

  #enqueue(method, path, body, type) {
    if (!this.sessionId) return Promise.resolve();
    this.queue = this.queue.then(() => this.#call(method, path, body, type)).catch(() => {});
    return this.queue;
  }
  async #call(method, path, body, type = "application/json", attempt = 0) {
    try {
      const res = await fetch(this.api + path, { method, headers: { authorization: `Bearer ${this.token}`, "content-type": type }, body: body === undefined ? undefined : (type === "application/json" ? JSON.stringify(body) : body) });
      if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
      this.failures = 0;
      return res.headers.get("content-type")?.includes("json") ? res.json() : res.text();
    } catch (e) {
      this.failures++;
      if (attempt < 3) { await new Promise(r => setTimeout(r, 500 * 2 ** attempt)); return this.#call(method, path, body, type, attempt + 1); }
      this.log(`backend: ${e.message}`);
      return undefined;
    }
  }
}
