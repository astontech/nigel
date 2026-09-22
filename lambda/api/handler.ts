import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { engineerByToken, getSession, putSession, updateSession, sessionsFor, allEngineers, putArtifact, getArtifact, newId, now, type Engineer, type Session } from "../shared/db.js";
import { dashboardHtml } from "./dashboard.js";

const lambda = new LambdaClient({});
const ARTIFACT_NAMES = new Set(["talk-track.md", "drill-log.md", "transcript.jsonl"]);

const json = (status: number, body: unknown): APIGatewayProxyResultV2 => ({ statusCode: status, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const html = (body: string): APIGatewayProxyResultV2 => ({ statusCode: 200, headers: { "content-type": "text/html; charset=utf-8" }, body });

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const path = event.rawPath.replace(/\/+$/, "") || "/";
  if (path === "/health") return json(200, { ok: true });

  const auth = event.headers.authorization ?? event.headers.Authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : (event.queryStringParameters?.token ?? "");
  const who = token ? await engineerByToken(token) : undefined;
  if (!who) return json(401, { error: "unauthorized" });

  const body = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body) : "";
  const seg = path.split("/").filter(Boolean);

  try {
    if (method === "GET" && path === "/me") return json(200, { engineer: strip(who), sessions: await sessionsFor(who.engineerId) });

    if (method === "POST" && path === "/sessions") {
      const b = parse(body);
      const s: Session = { engineerId: who.engineerId, sessionId: newId(), mode: pick(b.mode), project: b.project, startedAt: now(), lastActivityAt: now(), status: "open", turns: 0 };
      await putSession(s);
      return json(201, { sessionId: s.sessionId });
    }

    if (seg[0] === "sessions" && seg[1]) {
      const s = await getSession(who.engineerId, seg[1]);
      if (!s) return json(404, { error: "no such session" });

      if (method === "PUT" && seg[2] === "artifacts" && seg[3] && ARTIFACT_NAMES.has(seg[3])) {
        await putArtifact(who.engineerId, s.sessionId, seg[3], body);
        const fields: Partial<Session> = { lastActivityAt: now() };
        if (seg[3] === "talk-track.md") { fields.openSlots = countSlots(body); fields.project = fields.project ?? projectName(body); }
        if (seg[3] === "transcript.jsonl") fields.turns = body.split("\n").filter(Boolean).length;
        if (s.mode === "unknown") { const m = modeFromTranscript(seg[3] === "transcript.jsonl" ? body : ""); if (m) fields.mode = m; }
        await updateSession(who.engineerId, s.sessionId, fields);
        return json(200, { ok: true });
      }
      if (method === "GET" && seg[2] === "artifacts" && seg[3] && ARTIFACT_NAMES.has(seg[3])) {
        const a = await getArtifact(who.engineerId, s.sessionId, seg[3]);
        return a === undefined ? json(404, { error: "no artifact" }) : { statusCode: 200, headers: { "content-type": "text/plain; charset=utf-8" }, body: a };
      }
      if (method === "POST" && seg[2] === "end") {
        if (s.status === "open") {
          const b = parse(body);
          await updateSession(who.engineerId, s.sessionId, { status: "ended", endedAt: now(), lastActivityAt: now(), ...(b.mode ? { mode: pick(b.mode) } : {}) });
          await lambda.send(new InvokeCommand({ FunctionName: process.env.EVALUATOR, InvocationType: "Event", Payload: Buffer.from(JSON.stringify({ engineerId: who.engineerId, sessionId: s.sessionId })) }));
        }
        return json(200, { ok: true });
      }
      if (method === "GET" && seg.length === 2) return json(200, s);
    }

    if (who.role === "manager") {
      if (method === "GET" && path === "/dashboard/data") return json(200, await dashboardData());
      if (method === "GET" && path === "/dashboard") return html(dashboardHtml(await dashboardData(), token));
      if (method === "GET" && seg[0] === "engineers" && seg[1] && seg[2] === "sessions") return json(200, await sessionsFor(seg[1]));
      if (method === "GET" && seg[0] === "engineers" && seg[1] && seg[2] === "evaluations" && seg[3]) {
        const a = await getArtifact(seg[1], seg[3], "evaluation.json");
        return a === undefined ? json(404, { error: "not evaluated" }) : { statusCode: 200, headers: { "content-type": "application/json" }, body: a };
      }
    }
    return json(404, { error: "not found" });
  } catch (e: any) {
    console.error(e);
    return json(500, { error: "internal", detail: String(e?.message ?? e) });
  }
}

export interface DashboardRow { engineer: Engineer; sessions: Session[]; }
async function dashboardData(): Promise<{ generatedAt: string; rows: DashboardRow[] }> {
  const engineers = (await allEngineers()).filter(e => e.role === "engineer");
  const rows = await Promise.all(engineers.map(async e => ({ engineer: strip(e), sessions: (await sessionsFor(e.engineerId)).sort((a, b) => a.startedAt.localeCompare(b.startedAt)) })));
  return { generatedAt: now(), rows };
}

const strip = (e: Engineer): Engineer => ({ engineerId: e.engineerId, name: e.name, role: e.role, createdAt: e.createdAt });
const parse = (b: string): any => { try { return b ? JSON.parse(b) : {}; } catch { return {}; } };
const pick = (m: unknown): Session["mode"] => (m === "build" || m === "drill") ? m : "unknown";
/** Open slots are the ⟪…⟫ placeholders the skill writes for facts the engineer couldn't give. */
export const countSlots = (md: string) => (md.match(/⟪[^⟫]*⟫/g) ?? []).length;
export const projectName = (md: string) => md.match(/^#\s*Talk track\s*[—-]\s*(.+)$/m)?.[1]?.trim();
export function modeFromTranscript(jsonl: string): Session["mode"] | undefined {
  if (/Drill rules: I ask, you answer out loud/.test(jsonl)) return "drill";
  if (/Paste whatever you have on your most recent project|Interviewers ask about context first/.test(jsonl)) return "build";
  return undefined;
}
