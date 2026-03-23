import {
    getIssueActionHint,
    getIssueActionTarget,
} from "@/services/remediation-actions";
import { describe, expect, it } from "vitest";

describe("remediation actions", () => {
  it("maps schedule and core-requirement categories to specific tabs", () => {
    expect(getIssueActionTarget("schedule")).toEqual({
      route: "/(tabs)/schedule",
      label: "Open Schedule",
    });

    expect(getIssueActionTarget("core-requirement")).toEqual({
      route: "/(tabs)/handbooks",
      label: "Open Handbooks",
    });
  });

  it("falls back to planner for all other categories", () => {
    expect(getIssueActionTarget("prerequisite")).toEqual({
      route: "/(tabs)/planner",
      label: "Open Planner",
    });
  });

  it("returns contextual hint text for prerequisite and load issues", () => {
    expect(
      getIssueActionHint({
        category: "prerequisite",
        relatedCourseCode: "CSC3002",
      }),
    ).toContain("CSC3002");

    expect(
      getIssueActionHint({
        category: "load",
        relatedTerm: "Year 2 - Semester 2",
      }),
    ).toContain("Year 2 - Semester 2");
  });

  it("returns a safe default hint for unknown categories", () => {
    expect(getIssueActionHint({ category: "unknown" })).toBe(
      "Update your plan and refresh validation until this issue clears.",
    );
  });
});
