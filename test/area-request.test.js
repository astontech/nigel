import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = rel => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const skill = read("plugin/skills/interview-rehearsal/SKILL.md");
const bank = read("plugin/skills/interview-rehearsal/references/probe-bank.md");
const template = read("plugin/skills/interview-rehearsal/references/talk-track-template.md");

const area = bank.slice(bank.indexOf("## Area requests"), bank.indexOf("## Levels"));

test("an area with a real use is drilled through that use, with no definition or trivia questions", () => {
  assert.match(area, /drilled through the engineer's own use of it, never as trivia/);
  assert.match(area, /Never ask what the area is, how it works in general, or what it is for/);
  for (const rung of ["where they used it", "why it over the alternative", "how it was configured", "the caveats and limits they hit", "what broke", "what they would change"]) {
    assert.ok(area.includes(rung), rung);
  }
});

test("an area with no real use draws one 'where have you used it' question and then an open slot", () => {
  assert.match(area, /"Where have you used ⟨area⟩\?"/);
  assert.match(area, /They say nowhere[^\n]*open slot/);
  assert.match(area, /drill another thread/);
});

test("the spent request falls through to the normal thread order, and thread 2 is unchanged", () => {
  const order = bank.slice(bank.indexOf("## Thread order for a drill"), bank.indexOf("## Area requests"));
  assert.match(order, /the request is spent: thread 1 is the first of items 2 to 4 that exists/);
  assert.match(area, /Thread 2 follows the normal order/);
});

test("the open slot is the only write a drill makes to the talk track, and it only adds", () => {
  assert.match(skill, /### Area gaps/);
  assert.match(skill, /the one change a drill makes to the talk track, and it only adds/);
  assert.match(skill, /⟪a real use of ⟨area⟩⟫ — find or build one/);
  assert.match(template, /\*\*Area gaps\.\*\*/);
});
