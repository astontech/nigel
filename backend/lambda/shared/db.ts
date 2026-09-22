import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createHash, randomBytes } from "node:crypto";

export const TABLE = process.env.TABLE!;
export const BUCKET = process.env.BUCKET!;
export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
export const s3 = new S3Client({});

export type Role = "engineer" | "manager";
export interface Engineer { engineerId: string; name: string; role: Role; createdAt: string; }
export interface Session {
  engineerId: string; sessionId: string; mode: "build" | "drill" | "unknown"; project?: string;
  startedAt: string; lastActivityAt: string; endedAt?: string; status: "open" | "ended" | "evaluated" | "failed";
  turns: number; openSlots?: number; evaluation?: EvaluationSummary;
}
export interface EvaluationSummary {
  evaluatedAt: string; model: string; openSlots?: number; threadsHeld?: number; threadsRanOut?: number;
  overall?: string; categories?: Record<string, "strong" | "weak" | "mixed">;
}

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export const newId = () => randomBytes(8).toString("hex");
export const now = () => new Date().toISOString();

export async function engineerByToken(token: string): Promise<Engineer | undefined> {
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk: `TOKEN#${hashToken(token)}`, sk: "META" } }));
  if (!r.Item) return undefined;
  const e = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk: `ENGINEER#${r.Item.engineerId}`, sk: "META" } }));
  return e.Item as Engineer | undefined;
}

export async function putSession(s: Session) {
  await ddb.send(new PutCommand({ TableName: TABLE, Item: { pk: `ENGINEER#${s.engineerId}`, sk: `SESSION#${s.sessionId}`, gsi: "SESSION", ...s } }));
}
export async function getSession(engineerId: string, sessionId: string): Promise<Session | undefined> {
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk: `ENGINEER#${engineerId}`, sk: `SESSION#${sessionId}` } }));
  return r.Item as Session | undefined;
}
export async function updateSession(engineerId: string, sessionId: string, fields: Partial<Session>) {
  const names: Record<string, string> = {}; const values: Record<string, unknown> = {}; const sets: string[] = [];
  for (const [k, v] of Object.entries(fields)) { if (v === undefined) continue; names[`#${k}`] = k; values[`:${k}`] = v; sets.push(`#${k} = :${k}`); }
  if (!sets.length) return;
  await ddb.send(new UpdateCommand({ TableName: TABLE, Key: { pk: `ENGINEER#${engineerId}`, sk: `SESSION#${sessionId}` },
    UpdateExpression: `SET ${sets.join(", ")}`, ExpressionAttributeNames: names, ExpressionAttributeValues: values }));
}
export async function sessionsFor(engineerId: string): Promise<Session[]> {
  const r = await ddb.send(new QueryCommand({ TableName: TABLE, KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
    ExpressionAttributeValues: { ":pk": `ENGINEER#${engineerId}`, ":sk": "SESSION#" } }));
  return (r.Items ?? []) as Session[];
}
export async function allEngineers(): Promise<Engineer[]> {
  const r = await ddb.send(new QueryCommand({ TableName: TABLE, IndexName: "byType", KeyConditionExpression: "gsi = :t", ExpressionAttributeValues: { ":t": "ENGINEER" } }));
  return (r.Items ?? []) as Engineer[];
}
export async function endedUnevaluated(): Promise<Session[]> {
  const r = await ddb.send(new QueryCommand({ TableName: TABLE, IndexName: "byType", KeyConditionExpression: "gsi = :t", FilterExpression: "#s = :ended",
    ExpressionAttributeNames: { "#s": "status" }, ExpressionAttributeValues: { ":t": "SESSION", ":ended": "ended" } }));
  return (r.Items ?? []) as Session[];
}
export async function openSessions(): Promise<Session[]> {
  const r = await ddb.send(new QueryCommand({ TableName: TABLE, IndexName: "byType", KeyConditionExpression: "gsi = :t", FilterExpression: "#s = :open",
    ExpressionAttributeNames: { "#s": "status" }, ExpressionAttributeValues: { ":t": "SESSION", ":open": "open" } }));
  return (r.Items ?? []) as Session[];
}

export const artifactKey = (engineerId: string, sessionId: string, name: string) => `sessions/${engineerId}/${sessionId}/${name}`;
export async function putArtifact(engineerId: string, sessionId: string, name: string, body: string) {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: artifactKey(engineerId, sessionId, name), Body: body, ContentType: name.endsWith(".json") || name.endsWith(".jsonl") ? "application/json" : "text/markdown" }));
}
export async function getArtifact(engineerId: string, sessionId: string, name: string): Promise<string | undefined> {
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: artifactKey(engineerId, sessionId, name) }));
    return await r.Body!.transformToString();
  } catch (e: any) { if (e?.name === "NoSuchKey") return undefined; throw e; }
}
