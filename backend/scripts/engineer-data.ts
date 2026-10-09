// Shared logic for the revoke and delete-engineer scripts. The clients are passed in so the tests can hand over a stub.
import { DeleteCommand, GetCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { DeleteObjectsCommand, ListObjectVersionsCommand } from "@aws-sdk/client-s3";

export interface Client { send(command: any): Promise<any>; }
export interface Stores { ddb: Client; s3: Client; table: string; bucket: string; }
export interface Engineer { engineerId: string; name: string; }
type Key = { pk: string; sk: string };
export interface ObjectVersion { Key: string; VersionId: string; }
export interface DeletionPlan { engineer: Engineer; tokens: Key[]; sessions: Key[]; objects: ObjectVersion[]; }

export class UsageError extends Error {}

/** The value after a flag, or undefined when the flag is absent. */
export const flagValue = (args: string[], flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
};

const scanAll = async (stores: Stores): Promise<Record<string, any>[]> => {
  const items: Record<string, any>[] = [];
  let startKey: Record<string, any> | undefined;
  do {
    const page = await stores.ddb.send(new ScanCommand({ TableName: stores.table, ExclusiveStartKey: startKey }));
    items.push(...(page.Items ?? []));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
};

/** An engineer by id, else by exact name. A name that matches more than one engineer is refused. */
export async function resolveEngineer(stores: Stores, nameOrId: string): Promise<Engineer> {
  const byId = await stores.ddb.send(new GetCommand({ TableName: stores.table, Key: { pk: `ENGINEER#${nameOrId}`, sk: "META" } }));
  if (byId.Item) return { engineerId: byId.Item.engineerId, name: byId.Item.name };
  const matches = (await scanAll(stores)).filter(item => item.sk === "META" && String(item.pk).startsWith("ENGINEER#") && item.name === nameOrId);
  if (matches.length === 0) throw new UsageError(`no engineer with id or name "${nameOrId}"`);
  if (matches.length > 1) throw new UsageError(`"${nameOrId}" matches ${matches.length} engineers (${matches.map(m => m.engineerId).join(", ")}); use the id`);
  return { engineerId: matches[0].engineerId, name: matches[0].name };
}

const tokenKeysFor = async (stores: Stores, engineerId: string): Promise<Key[]> =>
  (await scanAll(stores)).filter(item => String(item.pk).startsWith("TOKEN#") && item.engineerId === engineerId).map(item => ({ pk: item.pk, sk: item.sk }));

const sessionKeysFor = async (stores: Stores, engineerId: string): Promise<Key[]> => {
  const keys: Key[] = [];
  let startKey: Record<string, any> | undefined;
  do {
    const page = await stores.ddb.send(new QueryCommand({ TableName: stores.table, KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      ExpressionAttributeValues: { ":pk": `ENGINEER#${engineerId}`, ":sk": "SESSION#" }, ExclusiveStartKey: startKey }));
    keys.push(...(page.Items ?? []).map((item: Key) => ({ pk: item.pk, sk: item.sk })));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return keys;
};

/** Every version and delete marker under sessions/<engineerId>/. The trailing slash keeps the prefix to this engineer alone. */
export async function listObjectVersions(stores: Stores, engineerId: string): Promise<ObjectVersion[]> {
  const found: ObjectVersion[] = [];
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;
  do {
    const page = await stores.s3.send(new ListObjectVersionsCommand({ Bucket: stores.bucket, Prefix: `sessions/${engineerId}/`, KeyMarker: keyMarker, VersionIdMarker: versionIdMarker }));
    for (const entry of [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]) found.push({ Key: entry.Key, VersionId: entry.VersionId });
    keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
    versionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
  } while (keyMarker !== undefined || versionIdMarker !== undefined);
  return found;
}

/** Delete the engineer's token rows and nothing else. Returns how many were removed. */
export async function revokeTokens(stores: Stores, engineer: Engineer): Promise<number> {
  const tokens = await tokenKeysFor(stores, engineer.engineerId);
  for (const key of tokens) await stores.ddb.send(new DeleteCommand({ TableName: stores.table, Key: key }));
  return tokens.length;
}

export async function planDeletion(stores: Stores, engineer: Engineer): Promise<DeletionPlan> {
  return {
    engineer,
    tokens: await tokenKeysFor(stores, engineer.engineerId),
    sessions: await sessionKeysFor(stores, engineer.engineerId),
    objects: await listObjectVersions(stores, engineer.engineerId),
  };
}

export const describePlan = (plan: DeletionPlan): string => [
  `engineer ${plan.engineer.name} (${plan.engineer.engineerId}) will lose:`,
  `  1 ENGINEER# row`,
  `  ${plan.tokens.length} TOKEN# row(s)`,
  `  ${plan.sessions.length} SESSION# item(s)`,
  `  ${plan.objects.length} object version(s) and delete marker(s) under sessions/${plan.engineer.engineerId}/`,
].join("\n");

/**
 * Remove everything the plan lists. Without a matching confirm value nothing is touched.
 * The ENGINEER# row goes last, after the bucket prefix is verified empty, so a failed run can be repeated by name or id.
 */
export async function deleteEngineer(stores: Stores, engineer: Engineer, confirm: string | undefined): Promise<DeletionPlan> {
  if (confirm !== engineer.engineerId) throw new UsageError(`refusing to delete: pass --confirm ${engineer.engineerId} to proceed`);
  const plan = await planDeletion(stores, engineer);
  for (const key of [...plan.tokens, ...plan.sessions]) await stores.ddb.send(new DeleteCommand({ TableName: stores.table, Key: key }));
  for (let start = 0; start < plan.objects.length; start += 1000) {
    const batch = plan.objects.slice(start, start + 1000);
    const result = await stores.s3.send(new DeleteObjectsCommand({ Bucket: stores.bucket, Delete: { Objects: batch, Quiet: true } }));
    if (result.Errors?.length) throw new Error(`bucket delete failed for ${result.Errors.length} object version(s): ${result.Errors[0].Message}`);
  }
  const remaining = await listObjectVersions(stores, engineer.engineerId);
  if (remaining.length) throw new Error(`verification failed: ${remaining.length} object version(s) still under sessions/${engineer.engineerId}/; the ENGINEER# row was kept so this can be run again`);
  await stores.ddb.send(new DeleteCommand({ TableName: stores.table, Key: { pk: `ENGINEER#${engineer.engineerId}`, sk: "META" } }));
  return plan;
}
