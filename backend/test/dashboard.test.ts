import { describe, expect, it } from "vitest";
import { dashboardHtml } from "../lambda/api/dashboard.js";

describe("dashboard level column", () => {
  it("shows each engineer's current level in the row's level cell", () => {
    const row = (name: string, level: "L1" | "L2" | "L3") => ({ engineer: { engineerId: name, name, role: "engineer" as const, createdAt: "" }, sessions: [], level });
    const html = dashboardHtml({ generatedAt: "2026-10-06T00:00:00Z", rows: [row("Ada", "L2"), row("Bo", "L3")] }, "t");
    expect(html).toContain("<th>Level</th>");
    expect(html).toMatch(/Ada<\/td>\s*<td class="level">L2<\/td>/);
    expect(html).toMatch(/Bo<\/td>\s*<td class="level">L3<\/td>/);
  });
});
