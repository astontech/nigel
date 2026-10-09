import { beforeEach, describe, expect, it } from "vitest";
import { DeleteCommand, GetCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { DeleteObjectsCommand, ListObjectVersionsCommand } from "@aws-sdk/client-s3";
import { deleteEngineer, resolveEngineer, revokeTokens, type Stores } from "../scripts/engineer-data.js";

type Row = Record<string, any>;
const PAGE = 2; // small pages so pagination is exercised

/** In-memory stand-ins for the document client and the S3 client. */
function makeStores(rows: Row[], versions: { Key: string; VersionId: string; marker?: boolean }[]) {
  const table = new Map(rows.map(r => [`${r.pk}|${r.sk}`, r]));
  let objects = [...versions];
  const log: string[] = [];
  const ddb = {
    async send(command: any) {
      const input = command.input;
      if (command instanceof GetCommand) return { Item: table.get(`${input.Key.pk}|${input.Key.sk}`) };
      if (command instanceof DeleteCommand) { log.push(`ddb:${input.Key.pk}|${input.Key.sk}`); table.delete(`${input.Key.pk}|${input.Key.sk}`); return {}; }
      if (command instanceof QueryCommand) {
        const all = [...table.values()].filter(r => r.pk === input.ExpressionAttributeValues[":pk"] && r.sk.startsWith(input.ExpressionAttributeValues[":sk"]));
        const from = input.ExclusiveStartKey?.offset ?? 0;
        return { Items: all.slice(from, from + PAGE), LastEvaluatedKey: from + PAGE < all.length ? { offset: from + PAGE } : undefined };
      }
      if (command instanceof ScanCommand) {
        const all = [...table.values()];
        const from = input.ExclusiveStartKey?.offset ?? 0;
        return { Items: all.slice(from, from + PAGE), LastEvaluatedKey: from + PAGE < all.length ? { offset: from + PAGE } : undefined };
      }
      throw new Error(`unexpected ddb command ${command.constructor.name}`);
    },
  };
  const s3 = {
    failDeletes: false,
    async send(command: any) {
      const input = command.input;
      if (command instanceof ListObjectVersionsCommand) {
        const all = objects.filter(o => o.Key.startsWith(input.Prefix));
        const from = input.KeyMarker ? Number(input.KeyMarker) : 0;
        const slice = all.slice(from, from + PAGE);
        const more = from + PAGE < all.length;
        return { Versions: slice.filter(o => !o.marker), DeleteMarkers: slice.filter(o => o.marker), IsTruncated: more, NextKeyMarker: more ? String(from + PAGE) : undefined, NextVersionIdMarker: more ? "next" : undefined };
      }
      if (command instanceof DeleteObjectsCommand) {
        if (s3.failDeletes) return { Errors: [{ Message: "denied" }] };
        const drop = new Set<string>(input.Delete.Objects.map((o: any) => `${o.Key}@${o.VersionId}`));
        objects = objects.filter(o => !drop.has(`${o.Key}@${o.VersionId}`));
        return {};
      }
      throw new Error(`unexpected s3 command ${command.constructor.name}`);
    },
  };
  const stores: Stores = { ddb, s3, table: "t", bucket: "b" };
  return { stores, s3, log, keys: () => [...table.keys()].sort(), objects: () => objects.map(o => `${o.Key}@${o.VersionId}`).sort() };
}

const seed = () => {
  const rows: Row[] = [
    { pk: "ENGINEER#aaa", sk: "META", engineerId: "aaa", name: "Ada" },
    { pk: "ENGINEER#aaa", sk: "SESSION#s1" }, { pk: "ENGINEER#aaa", sk: "SESSION#s2" }, { pk: "ENGINEER#aaa", sk: "SESSION#s3" },
    { pk: "TOKEN#h1", sk: "META", engineerId: "aaa" },
    { pk: "ENGINEER#bbb", sk: "META", engineerId: "bbb", name: "Bo" },
    { pk: "ENGINEER#bbb", sk: "SESSION#s9" },
    { pk: "TOKEN#h2", sk: "META", engineerId: "bbb" },
  ];
  const versions = [
    { Key: "sessions/aaa/s1/transcript.jsonl", VersionId: "v1" }, { Key: "sessions/aaa/s1/transcript.jsonl", VersionId: "v2" },
    { Key: "sessions/aaa/s2/talk-track.md", VersionId: "v1" }, { Key: "sessions/aaa/s2/talk-track.md", VersionId: "m1", marker: true },
    { Key: "sessions/aaa/s3/evaluation.json", VersionId: "v1" },
    { Key: "sessions/bbb/s9/talk-track.md", VersionId: "v1" },
    { Key: "sessions/aaaa/s1/talk-track.md", VersionId: "v1" }, // a different engineer whose id starts with aaa
  ];
  return makeStores(rows, versions);
};

describe("resolveEngineer", () => {
  it("finds an engineer by id or by exact name, and refuses an unknown or ambiguous name", async () => {
    const { stores } = seed();
    expect((await resolveEngineer(stores, "aaa")).name).toBe("Ada");
    expect((await resolveEngineer(stores, "Bo")).engineerId).toBe("bbb");
    await expect(resolveEngineer(stores, "Nobody")).rejects.toThrow(/no engineer/);
    const twins = makeStores([{ pk: "ENGINEER#x", sk: "META", engineerId: "x", name: "Sam" }, { pk: "ENGINEER#y", sk: "META", engineerId: "y", name: "Sam" }], []);
    await expect(resolveEngineer(twins.stores, "Sam")).rejects.toThrow(/matches 2 engineers/);
  });
});

describe("revoke", () => {
  it("removes only the engineer's token", async () => {
    const world = seed();
    const before = world.keys();
    const count = await revokeTokens(world.stores, { engineerId: "aaa", name: "Ada" });
    expect(count).toBe(1);
    expect(world.keys()).toEqual(before.filter(k => k !== "TOKEN#h1|META"));
    expect(world.objects()).toHaveLength(7);
  });
});

describe("delete-engineer", () => {
  const ada = { engineerId: "aaa", name: "Ada" };

  it("removes the engineer, tokens, sessions, and every object version and delete marker under the prefix, and nothing else", async () => {
    const world = seed();
    await deleteEngineer(world.stores, ada, "aaa");
    expect(world.keys()).toEqual(["ENGINEER#bbb|META", "ENGINEER#bbb|SESSION#s9", "TOKEN#h2|META"]);
    expect(world.objects()).toEqual(["sessions/aaaa/s1/talk-track.md@v1", "sessions/bbb/s9/talk-track.md@v1"]);
  });

  it("holds the confirm gate: no confirm, or the wrong id, deletes nothing", async () => {
    const world = seed();
    const keysBefore = world.keys();
    const objectsBefore = world.objects();
    await expect(deleteEngineer(world.stores, ada, undefined)).rejects.toThrow(/--confirm aaa/);
    await expect(deleteEngineer(world.stores, ada, "bbb")).rejects.toThrow(/--confirm aaa/);
    await expect(deleteEngineer(world.stores, ada, "Ada")).rejects.toThrow(/--confirm aaa/);
    expect(world.log).toEqual([]);
    expect(world.keys()).toEqual(keysBefore);
    expect(world.objects()).toEqual(objectsBefore);
  });

  it("fails and keeps the engineer row when the bucket delete is refused", async () => {
    const world = seed();
    world.s3.failDeletes = true;
    await expect(deleteEngineer(world.stores, ada, "aaa")).rejects.toThrow(/bucket delete failed/);
    expect(world.keys()).toContain("ENGINEER#aaa|META");
  });
});
