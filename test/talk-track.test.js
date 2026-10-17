import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = rel => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const skill = read("plugin/skills/interview-rehearsal/SKILL.md");
const template = read("plugin/skills/interview-rehearsal/references/talk-track-template.md");
const factSheet = read("plugin/skills/interview-rehearsal/references/fact-sheet.md");
const two = read("test/fixtures/talk-track-two-engagements.md");
const shipped = read("test/fixtures/talk-track-shipped-format.md");

const engagements = text => [...text.matchAll(/^## Engagement: (.+) \((full|light)\)$/gm)].map(m => ({ name: m[1], kind: m[2] }));

test("the template has engagement sections with a full/light flag and a Lead line", () => {
  assert.match(template, /^## Engagement: ⟨name⟩ \(full\)$/m);
  assert.match(template, /^## Engagement: ⟨name⟩ \(light\)$/m);
  assert.match(template, /^Lead: ⟨engagement name/m);
});

test("the light entry has the same four parts in the template and the fact sheet", () => {
  for (const part of ["The system", "What was mine", "A decision I can defend", "Technologies and how I used them"]) {
    assert.ok(template.includes(`**${part}:**`), `template: ${part}`);
    assert.ok(factSheet.includes(`| ${part} |`), `fact sheet: ${part}`);
  }
});

test("the skill collects earlier engagements as light, offers the lead choice and changes the lead for one engagement only", () => {
  assert.match(skill, /every earlier one is built \*\*light\*\*/);
  assert.match(skill, /Template B2/);
  assert.match(skill, /## Changing the lead/);
  assert.match(skill, /Every other engagement section stays byte for byte/);
});

test("the two-engagement fixture holds the latest as full and lead and the earlier as light", () => {
  const found = engagements(two);
  assert.deepEqual(found.map(e => e.kind), ["full", "light", "light"]);
  const [, lead] = two.match(/^Lead: (.+)$/m);
  assert.equal(lead, found[0].name);
  assert.equal(found.filter(e => e.name === lead && e.kind === "full").length, 1);
});

test("each light entry in the fixture has exactly the four parts", () => {
  const light = two.split(/^## /m).filter(s => /\(light\)/.test(s.split("\n")[0]));
  assert.equal(light.length, 2);
  for (const section of light) assert.equal([...section.matchAll(/^- \*\*[^*]+:\*\*/gm)].length, 4);
});

test("a shipped-format talk track has no engagement sections and no Lead line", () => {
  assert.deepEqual(engagements(shipped), []);
  assert.doesNotMatch(shipped, /^Lead:/m);
  assert.match(shipped, /^## The opening/m);
});
