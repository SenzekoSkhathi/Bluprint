import { academicRepository } from "@/services/academic-repository";

describe("handbook ingestion workflow", () => {
  beforeEach(() => {
    academicRepository.clearTelemetryEvents();
  });

  it("submits, normalizes, and approves ingestion into an active version", () => {
    const programId = `test-program-${Date.now()}`;
    const submitted = academicRepository.submitHandbookIngestion({
      handbookId: "h6",
      programId,
      intakeYear: "2026",
      sourceType: "raw-text",
      source:
        "Core: COMP3002 and COMP3010 are compulsory.\nPrerequisite: COMP3002 requires COMP2001.\nDegree requires 360 credits.",
      submittedBy: "unit-test",
    });

    expect(submitted?.status).toBe("pending-review");
    expect((submitted?.extractedRules.length ?? 0) > 0).toBe(true);

    const approved = academicRepository.reviewHandbookIngestion({
      jobId: submitted!.id,
      decision: "approve",
      reviewerId: "qa-reviewer",
    });

    expect(approved?.status).toBe("approved");

    const versions = academicRepository.listRequirementVersions(programId);
    expect(versions.some((version) => version.status === "active")).toBe(true);
  });

  it("records telemetry for ingestion submission and review", () => {
    const programId = `telemetry-program-${Date.now()}`;
    const submitted = academicRepository.submitHandbookIngestion({
      handbookId: "h6",
      programId,
      intakeYear: "2026",
      sourceType: "raw-text",
      source: "Core COMP3002. Degree requires 360 credits.",
      submittedBy: "unit-test",
    });

    academicRepository.reviewHandbookIngestion({
      jobId: submitted!.id,
      decision: "reject",
      reviewerId: "qa-reviewer",
      note: "Needs manual verification",
    });

    const events = academicRepository.listTelemetryEvents();
    expect(
      events.some((event) => event.type === "handbook_ingestion_submitted"),
    ).toBe(true);
    expect(
      events.some((event) => event.type === "handbook_ingestion_reviewed"),
    ).toBe(true);
  });

  it("preserves source rule IDs for citation-style provenance", () => {
    const programId = `citation-program-${Date.now()}`;
    const submitted = academicRepository.submitHandbookIngestion({
      handbookId: "h6",
      programId,
      intakeYear: "2026",
      sourceType: "raw-text",
      source:
        "Core: COMP3002 and COMP3010 are compulsory.\nPrerequisite: COMP3002 requires COMP2001.",
      submittedBy: "unit-test",
    });

    expect(submitted?.normalizedSnapshot).toBeDefined();
    expect((submitted?.normalizedSnapshot?.sourceRuleIds.length ?? 0) > 0).toBe(
      true,
    );
  });

  it("keeps prerequisite provenance in approved requirement versions", () => {
    const programId = `citation-approved-${Date.now()}`;
    const submitted = academicRepository.submitHandbookIngestion({
      handbookId: "h6",
      programId,
      intakeYear: "2026",
      sourceType: "raw-text",
      source:
        "Core: COMP3002 and COMP3010 are compulsory.\nPrerequisite: COMP3002 requires COMP2001.",
      submittedBy: "unit-test",
    });

    academicRepository.reviewHandbookIngestion({
      jobId: submitted!.id,
      decision: "approve",
      reviewerId: "qa-reviewer",
    });

    const activeVersion = academicRepository
      .listRequirementVersions(programId)
      .find((version) => version.status === "active");

    expect(activeVersion).toBeDefined();
    expect(
      (activeVersion?.normalizedSnapshot.sourceRuleIds.length ?? 0) > 0,
    ).toBe(true);
    expect(
      activeVersion?.normalizedSnapshot.prerequisitePairs.some(
        (pair) =>
          pair.courseCode === "COMP3002" &&
          pair.prerequisiteCode === "COMP2001",
      ),
    ).toBe(true);
  });
});
