import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = rel => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const skill = read("plugin/skills/interview-rehearsal/SKILL.md");
const bank = read("plugin/skills/interview-rehearsal/references/probe-bank.md");
const covered = JSON.parse(read("test/fixtures/summary-lead-covered.json"));
const two = read("test/fixtures/talk-track-two-engagements.md");

const order = bank.slice(bank.indexOf("## Thread order for a drill"), bank.indexOf("## Levels"));

test("thread 1 is the engineer's request, then the newest undrilled resume claim, then the retest, in that order", () => {
  const request = order.indexOf("What the engineer asked for");
  const resume = order.indexOf("newest undrilled claim marked \"added from resume\"");
  const retest = order.indexOf("most recent thread that ran out, retested from the same claim");
  assert.ok(request > 0 && request < resume && resume < retest);
});

test("thread 2 starts from an undrilled lead claim, then alternates a held thread with an earlier engagement", () => {
  const lead = order.indexOf("An undrilled claim on the lead engagement");
  const alternate = order.indexOf("alternate between two kinds: a held thread repeated, and a claim from an earlier engagement");
  assert.ok(lead > 0 && lead < alternate);
});

test("a repeated thread keeps its claim and changes the follow-ups; old claims match new ones by meaning", () => {
  assert.match(order, /starts from the same claim but takes a different path through the follow-ups/);
  assert.match(order, /old claims are matched to new ones by meaning/);
});

test("drilled, ran out and held come only from the DORIS summary", () => {
  assert.match(order, /`claimsDrilled`/);
  assert.match(order, /by its `outcome` in `threads`/);
});

test("the drill section points at the thread order instead of restating a lead-only pick", () => {
  assert.match(skill, /pick both threads per \*\*Thread order for a drill\*\*/);
  assert.doesNotMatch(skill, /pick one claim from the lead engagement's \*what I owned\* block/);
});

test("the lead-covered summary drills every lead claim and holds a thread to repeat", () => {
  for (const claim of ["carrier B adapter", "dedupe stage", "status rules", "document-upload service"]) {
    assert.ok(covered.claimsDrilled.includes(claim), claim);
    assert.match(two, new RegExp(claim, "i"));
  }
  assert.ok(covered.threads.some(t => t.outcome === "held"));
  assert.ok(covered.threads.every(t => covered.claimsDrilled.includes(t.claim)));
  assert.equal(covered.threads.filter(t => t.outcome === "ran-out").at(-1).claim, "status rules");
});
