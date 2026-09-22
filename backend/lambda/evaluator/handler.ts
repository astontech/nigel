import Anthropic from "@anthropic-ai/sdk";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { getSession, updateSession, getArtifact, putArtifact, openSessions, now, type EvaluationSummary } from "../shared/db.js";
import { RUBRIC, CATEGORIES, type Category } from "./rubric.js";

const sm = new SecretsManagerClient({});
const MODEL = process.env.MODEL ?? "claude-sonnet-5";
const IDLE_MINUTES = 30;
let cachedKey: string | undefined;

type Event = { engineerId: string; sessionId: string } | { sweep: true };

export async function handler(event: Event) {
  if ("sweep" in event) {
    // Sessions whose window closed without /end: end them once idle, then evaluate.
    const cutoff = Date.now() - IDLE_MINUTES * 60_000;
    const stale = (await openSessions()).filter(s => Date.parse(s.lastActivityAt) < cutoff);
    for (const s of stale) {
      await updateSession(s.engineerId, s.sessionId, { status: "ended", endedAt: now() });
      await evaluate(s.engineerId, s.sessionId).catch(e => console.error(`sweep ${s.sessionId}`, e));
    }
    return { swept: stale.length };
  }
  return evaluate(event.engineerId, event.sessionId);
}

async function evaluate(engineerId: string, sessionId: string) {
  const s = await getSession(engineerId, sessionId);
  if (!s) throw new Error(`no session ${sessionId}`);
  const [transcript, talkTrack, drillLog] = await Promise.all([
    getArtifact(engineerId, sessionId, "transcript.jsonl"),
    getArtifact(engineerId, sessionId, "talk-track.md"),
    getArtifact(engineerId, sessionId, "drill-log.md"),
  ]);
  const openSlots = talkTrack ? (talkTrack.match(/⟪[^⟫]*⟫/g) ?? []).length : undefined;

  // Build sessions carry no drill to judge; the record is the talk track's slot count.
  if (s.mode !== "drill" || !transcript) {
    const evaluation: EvaluationSummary = { evaluatedAt: now(), model: "none", openSlots };
    await putArtifact(engineerId, sessionId, "evaluation.json", JSON.stringify({ mode: s.mode, openSlots, note: "build session: no drill to evaluate" }, null, 2));
    await updateSession(engineerId, sessionId, { status: "evaluated", evaluation, openSlots });
    return { evaluated: false, openSlots };
  }

  const key = await apiKey();
  if (!key || key === "UNSET") {
    await updateSession(engineerId, sessionId, { status: "ended" });
    throw new Error("Anthropic API key is UNSET; session left ended for the next sweep");
  }
  const client = new Anthropic({ apiKey: key });
  const turns = transcript.split("\n").filter(Boolean).map(l => JSON.parse(l) as { role: string; text: string });
  const convo = turns.map(t => `${t.role === "user" ? "CANDIDATE" : "INTERVIEWER"}: ${t.text}`).join("\n\n");

  const res = await client.messages.create({
    model: MODEL, max_tokens: 4000, temperature: 0,
    system: RUBRIC,
    messages: [{ role: "user", content: `TALK TRACK:\n${talkTrack ?? "(none)"}\n\nDRILL LOG (the interviewer's own running notes, if any):\n${drillLog ?? "(none)"}\n\nTRANSCRIPT:\n${convo}` }],
  });
  const text = res.content.filter(c => c.type === "text").map(c => (c as { text: string }).text).join("");
  const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));

  const categories: Partial<Record<Category, "strong" | "weak" | "mixed">> = {};
  for (const t of parsed.threads ?? []) for (const [c, v] of Object.entries<any>(t.categories ?? {})) {
    if (!CATEGORIES.includes(c as Category) || !["strong", "weak", "mixed"].includes(v.read)) continue;
    const prev = categories[c as Category];
    categories[c as Category] = !prev || prev === v.read ? v.read : "mixed";
  }
  const summary: EvaluationSummary = {
    evaluatedAt: now(), model: MODEL, openSlots: parsed.openSlots ?? openSlots,
    threadsHeld: (parsed.threads ?? []).filter((t: any) => !t.ranOutAt).length,
    threadsRanOut: (parsed.threads ?? []).filter((t: any) => t.ranOutAt).length,
    overall: parsed.readiness, categories: categories as Record<string, "strong" | "weak" | "mixed">,
  };
  await putArtifact(engineerId, sessionId, "evaluation.json", JSON.stringify({ ...parsed, model: MODEL, evaluatedAt: summary.evaluatedAt, usage: res.usage }, null, 2));
  await updateSession(engineerId, sessionId, { status: "evaluated", evaluation: summary, openSlots: summary.openSlots });
  return { evaluated: true, summary };
}

async function apiKey(): Promise<string | undefined> {
  if (cachedKey) return cachedKey;
  const r = await sm.send(new GetSecretValueCommand({ SecretId: process.env.API_KEY_SECRET }));
  cachedKey = r.SecretString;
  return cachedKey;
}
