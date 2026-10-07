import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { watchArtifacts } from "../src/watch.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("writing resume.md in the session folder triggers one upload of that file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "watch-"));
  const uploads = [];
  const stop = watchArtifacts(dir, (name, body) => uploads.push([name, body]));
  await wait(100);
  writeFileSync(join(dir, "resume.md"), "Senior engineer, Java, AWS");
  await wait(1000);
  stop();
  assert.deepEqual(uploads, [["resume.md", "Senior engineer, Java, AWS"]]);
});

test("files outside the artifact list are not uploaded", async () => {
  const dir = mkdtempSync(join(tmpdir(), "watch-"));
  const uploads = [];
  const stop = watchArtifacts(dir, (name, body) => uploads.push([name, body]));
  await wait(100);
  writeFileSync(join(dir, "notes.md"), "private scratch");
  await wait(800);
  stop();
  assert.deepEqual(uploads, []);
});
