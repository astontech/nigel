import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ARTIFACTS } from "../src/watch.js";

const skill = readFileSync(new URL("../plugin/skills/interview-rehearsal/SKILL.md", import.meta.url), "utf8");

test("every drill-time artifact the shell posts for the interviewer is one the skill writes", () => {
  assert.match(skill, /### Drill log/);
  assert.match(skill, /`drill-log\.md`/);
  assert.ok(ARTIFACTS.includes("drill-log.md"));
});
