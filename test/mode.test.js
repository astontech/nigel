import { test } from "node:test";
import assert from "node:assert/strict";
import { inferMode } from "../src/claude.js";

// The AST-216 run: the interviewer paraphrased the drill opener.
const PARAPHRASED = `Drill rules: I ask, and you answer out loud the way you would in the room, I follow up. No feedback until the debrief.

Level L1. DORIS is unreachable, so this drill is kept on your machine and grading will be late.

Tell me about yourself.`;
const NO_LABEL = `Here is how this goes: I ask, and you answer out loud the way you would in the room.\n\nLevel L2.\n\nTell me about yourself.`;
const TEMPLATE = `Drill rules: I ask, you answer out loud as you would in the room, I follow up.\n\nLevel L1.\n\nTell me about yourself.`;

test("a drill opener that paraphrases the template is recorded as a drill", () => {
  assert.equal(inferMode(PARAPHRASED), "drill");
  assert.equal(inferMode(NO_LABEL), "drill");
});
test("the template opener is still a drill", () => assert.equal(inferMode(TEMPLATE), "drill"));
test("a build opener is still a build", () => {
  assert.equal(inferMode("Paste whatever you have on your most recent project: notes, a resume, a README."), "build");
  assert.equal(inferMode("Interviewers ask about context first. What was the project?"), "build");
});
test("text with no opener has no mode", () => assert.equal(inferMode("Thanks. What did you decide next?"), undefined));
