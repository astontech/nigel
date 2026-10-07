import { describe, expect, it } from "vitest";
import { computeLevel } from "../lambda/shared/level.js";

describe("computeLevel", () => {
  it("starts every engineer at L1", () => expect(computeLevel([])).toBe("L1"));
  it("moves L1 to L2 after two consecutive ready grades", () => expect(computeLevel(["ready", "ready"])).toBe("L2"));
  it("stays at L1 after one ready grade", () => expect(computeLevel(["ready"])).toBe("L1"));
  it("moves L2 to L1 after two consecutive not-yet grades", () => expect(computeLevel(["ready", "ready", "not-yet", "not-yet"])).toBe("L1"));
  it("a close grade between two ready grades resets the count, so no move happens", () => expect(computeLevel(["ready", "close", "ready"])).toBe("L1"));
  it("a not-yet grade between two ready grades resets the count", () => expect(computeLevel(["ready", "not-yet", "ready"])).toBe("L1"));
  it("a move consumes its streak: four ready grades reach L3, three stop at L2", () => {
    expect(computeLevel(["ready", "ready", "ready"])).toBe("L2");
    expect(computeLevel(["ready", "ready", "ready", "ready"])).toBe("L3");
  });
  it("never goes above L3", () => expect(computeLevel(Array(12).fill("ready"))).toBe("L3"));
  it("never goes below L1", () => expect(computeLevel(Array(6).fill("not-yet"))).toBe("L1"));
});
