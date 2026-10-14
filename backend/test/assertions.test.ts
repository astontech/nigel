import { describe, expect, it } from "vitest";
import { shapeProblems, readProblems, type Expectation } from "../evaluator/assertions.js";
import type { Grade } from "../evaluator/grade.js";

const good: Grade = {
  openSlots: 2,
  threads: [{ claim: "dedupe", categories: { decisions: { read: "strong", evidence: "x" }, "depth-chain": { read: "weak", evidence: "y" } }, ranOutAt: "What is the key?" }],
  contradictions: [], goFindOut: ["why prioritized"], overall: "A client would probe further.", readiness: "close",
};
const want: Expectation = { readiness: ["close"], anyRanOut: true, strong: ["decisions"], weak: ["depth-chain"], contradictions: "none", openSlots: 2 };

describe("shapeProblems", () => {
  it("accepts a well-formed grade", () => expect(shapeProblems(good)).toEqual([]));
  it("rejects an unknown readiness, category, and read", () => {
    const bad = { ...good, readiness: "great", threads: [{ categories: { vibes: { read: "strong" }, scale: { read: "ok" } }, ranOutAt: null }] };
    expect(shapeProblems(bad as Grade)).toHaveLength(3);
  });
  it("requires ranOutAt to be present as a string or null", () => {
    expect(shapeProblems({ ...good, threads: [{ categories: {} }] })).toHaveLength(1);
  });
});

describe("readProblems", () => {
  it("passes when every coarse read matches", () => expect(readProblems(good, want)).toEqual([]));
  it("flags a wrong readiness, slot count, and ran-out read", () => {
    expect(readProblems({ ...good, readiness: "ready", openSlots: 0, threads: [{ categories: good.threads![0].categories, ranOutAt: null }] }, want)).toHaveLength(3);
  });
  it("flags a category not read at the expected strength, including not-asked", () => {
    expect(readProblems(good, { ...want, strong: ["decisions", "validation"] })).toEqual(["validation read not-asked, expected strong"]);
  });
  it("treats a mixed read as neither strong nor weak", () => {
    const mixed = { ...good, threads: [{ categories: { decisions: { read: "strong" } }, ranOutAt: "q" }, { categories: { decisions: { read: "weak" } }, ranOutAt: null }] };
    expect(readProblems(mixed, want)).toContain("decisions read mixed, expected strong");
  });
  it("does not assert contradictions when the case says any", () => expect(readProblems({ ...good, contradictions: ["x"] }, { ...want, contradictions: "any" })).toEqual([]));
  it("checks contradictions both ways", () => {
    expect(readProblems({ ...good, contradictions: ["said Redis, track says Postgres"] }, want)).toEqual(["unexpected contradictions listed"]);
    expect(readProblems(good, { ...want, contradictions: "some" })).toEqual(["expected a contradiction against the talk track"]);
  });
  it("skips the ran-out check when not asserted and enforces the category ceiling", () => {
    expect(readProblems({ ...good, threads: [{ categories: {}, ranOutAt: null }] }, { ...want, anyRanOut: null, strong: [], weak: [], maxCategoriesRead: 0 })).toEqual([]);
    expect(readProblems(good, { ...want, maxCategoriesRead: 1 })).toEqual(["2 categories read, at most 1 expected"]);
  });
});
