import { describe, expect, it } from "vitest";
import { modeFromTranscript, needsGrading } from "../lambda/shared/mode.js";

const line = (role: string, text: string) => JSON.stringify({ role, text });
// The AST-216 run: the interviewer paraphrased the drill opener.
const PARAPHRASED = "Drill rules: I ask, and you answer out loud the way you would in the room, I follow up.\n\nLevel L1.\n\nTell me about yourself.";

describe("modeFromTranscript", () => {
  it("records a drill whose opener paraphrases the template", () =>
    expect(modeFromTranscript([line("assistant", PARAPHRASED), line("user", "I own the ingest pipeline.")].join("\n"))).toBe("drill"));
  it("records a drill from the exact template", () =>
    expect(modeFromTranscript(line("assistant", "Drill rules: I ask, you answer out loud as you would in the room.\n\nLevel L2.\n\nTell me about yourself."))).toBe("drill"));
  it("still records a build session", () =>
    expect(modeFromTranscript(line("assistant", "Paste whatever you have on your most recent project."))).toBe("build"));
  it("has no mode when no opener is present", () => expect(modeFromTranscript(line("assistant", "Thanks."))).toBeUndefined());
});

describe("needsGrading", () => {
  const unknownDone = { status: "evaluated", mode: "unknown", evaluation: { evaluatedAt: "t", model: "none" } } as const;
  it("grades an ended session", () => expect(needsGrading({ status: "ended", mode: "drill" })).toBe(true));
  it("grades a session marked evaluated with unknown mode and no grade", () => expect(needsGrading(unknownDone)).toBe(true));
  it("does not grade again a session that already has a grade", () =>
    expect(needsGrading({ status: "evaluated", mode: "drill", evaluation: { evaluatedAt: "t", model: "sonnet", overall: "ready" } })).toBe(false));
  it("leaves a finished build session alone", () =>
    expect(needsGrading({ status: "evaluated", mode: "build", evaluation: { evaluatedAt: "t", model: "none" } })).toBe(false));
  it("leaves open and failed sessions alone", () => {
    expect(needsGrading({ status: "open", mode: "drill" })).toBe(false);
    expect(needsGrading({ status: "failed", mode: "drill" })).toBe(false);
  });
});
