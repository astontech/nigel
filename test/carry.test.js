import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { carryForward } from "../src/carry.js";

const setup = () => {
  const root = mkdtempSync(join(tmpdir(), "carry-"));
  const folder = (name, files = {}) => {
    const dir = join(root, name);
    mkdirSync(dir, { recursive: true });
    for (const [file, body] of Object.entries(files)) writeFileSync(join(dir, file), body);
    return dir;
  };
  return { root, folder };
};

test("two earlier sessions with different talk tracks: the newer one is carried", () => {
  const { root, folder } = setup();
  folder("2026-10-01T10-00-00-000Z", { "talk-track.md": "older" });
  folder("2026-10-02T10-00-00-000Z", { "talk-track.md": "newer" });
  const next = folder("2026-10-03T10-00-00-000Z");
  carryForward(root, next);
  assert.equal(readFileSync(join(next, "talk-track.md"), "utf8"), "newer");
});

test("resume.md comes from the most recent folder that has one, even if a newer folder has only a talk track", () => {
  const { root, folder } = setup();
  folder("2026-10-01T10-00-00-000Z", { "talk-track.md": "t1", "resume.md": "r1" });
  folder("2026-10-02T10-00-00-000Z", { "talk-track.md": "t2" });
  const next = folder("2026-10-03T10-00-00-000Z");
  carryForward(root, next);
  assert.equal(readFileSync(join(next, "talk-track.md"), "utf8"), "t2");
  assert.equal(readFileSync(join(next, "resume.md"), "utf8"), "r1");
});

test("no earlier sessions: the new folder stays empty", () => {
  const { root, folder } = setup();
  const next = folder("2026-10-03T10-00-00-000Z");
  assert.deepEqual(carryForward(root, next), []);
  assert.deepEqual(readdirSync(next), []);
});

test("earlier sessions holding neither file create nothing", () => {
  const { root, folder } = setup();
  folder("2026-10-01T10-00-00-000Z", { "drill-log.md": "x" });
  const next = folder("2026-10-03T10-00-00-000Z");
  carryForward(root, next);
  assert.deepEqual(readdirSync(next), []);
});
