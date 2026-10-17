import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = rel => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const skill = read("plugin/skills/interview-rehearsal/SKILL.md");
const template = read("plugin/skills/interview-rehearsal/references/talk-track-template.md");
const resume = read("test/fixtures/resume-reworked.md");
const two = read("test/fixtures/talk-track-two-engagements.md");

test("both openers for a found talk track offer Drill, Update and Rebuild", () => {
  assert.match(skill, /Drill, update, or rebuild\?/);
  assert.match(skill, /Drill, lead with another, update, or rebuild\?/);
  assert.equal([...skill.matchAll(/^- \*\*Update\*\* — your resume changed/gm)].length, 2);
});

test("Rebuild still continues to the build opener, Template A", () => {
  assert.match(skill, /Rebuild continues to Template A\./);
});

test("Update writes resume.md as pasted, marks each claim with the date and turns an unbacked claim into a slot", () => {
  assert.match(skill, /## Update/);
  assert.match(skill, /write it exactly as pasted to `resume\.md`/);
  assert.match(skill, /\(added from resume ⟨today's date, YYYY-MM-DD⟩\)/);
  assert.match(skill, /"Can't back that up"[^.]*becomes an \*\*open slot\*\*/);
});

test("a claim on a light engagement stays in the light entry (DEC-196)", () => {
  assert.match(skill, /The engagement stays light; Update never turns it full/);
  assert.match(template, /exactly four parts, and stays light|keeps exactly four parts and stays light/);
});

test("the reworked resume adds a technology to an earlier engagement and one the talk track cannot hold", () => {
  assert.match(resume, /Brightwell Insurance[\s\S]*Redis/);
  assert.match(resume, /Cobalt Retail[\s\S]*Kubernetes/);
  assert.doesNotMatch(two, /Redis|Kubernetes/);
});
