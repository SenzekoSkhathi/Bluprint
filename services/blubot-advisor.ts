import { academicRepository } from "@/services/academic-repository";

interface AdvisorReply {
  answer: string;
  citations: string[];
}

function extractCourseCode(query: string): string | null {
  const match = query
    .toUpperCase()
    .match(/[A-Z]{3,4}\d{4}(?:[A-Z](?:\/[A-Z]){0,3})?/);
  return match ? match[0] : null;
}

function withCitations(answer: string, citations: string[]): string {
  const uniqueCitations = Array.from(new Set(citations));
  if (uniqueCitations.length === 0) {
    return answer;
  }

  return `${answer}\n\nSources:\n${uniqueCitations.map((item) => `- ${item}`).join("\n")}`;
}

function buildFallbackReply(): AdvisorReply {
  const validation = academicRepository.getAcademicValidationReport();
  const plans = academicRepository.getAutoGraduationPlans();
  const topPlan = plans[0];
  const activeVersion =
    academicRepository.ensureDemoRequirementVersion("bsc-computing");

  const answerLines = [
    "Based on your current academic snapshot, here’s what I can confirm:",
    `- Validation summary: ${validation.summary.blockers} blockers and ${validation.summary.warnings} warnings.`,
    `- Projected credits: ${validation.projectedCredits}, with a shortfall of ${validation.creditShortfall}.`,
    topPlan
      ? `- Best current path: ${topPlan.title} (estimated completion ${topPlan.projectedCompletionTerm}).`
      : "- No auto-generated path is available yet.",
  ];

  return {
    answer: answerLines.join("\n"),
    citations: [
      "Validation report (live app state)",
      topPlan
        ? `Auto graduation plan ${topPlan.id}`
        : "Auto graduation planner",
      activeVersion
        ? `Requirement version v${activeVersion.versionNumber} (${activeVersion.handbookId})`
        : "No approved requirement version (using deterministic rules engine)",
    ],
  };
}

export function generateGroundedAdvisorReply(query: string): string {
  const normalizedQuery = query.toLowerCase();
  const courseCode = extractCourseCode(query);

  const validation = academicRepository.getAcademicValidationReport();
  const plans = academicRepository.getAutoGraduationPlans();
  const topPlan = plans[0];
  const catalog = academicRepository.getCourseCatalog();
  const activeVersion =
    academicRepository.ensureDemoRequirementVersion("bsc-computing");

  if (
    normalizedQuery.includes("prereq") ||
    normalizedQuery.includes("requirement") ||
    normalizedQuery.includes("rule")
  ) {
    if (courseCode) {
      const targetCourse = catalog.find((course) => course.code === courseCode);
      if (!targetCourse) {
        return withCitations(
          `I couldn’t find ${courseCode} in the current catalog snapshot.`,
          ["Course catalog snapshot"],
        );
      }

      const answer =
        targetCourse.prerequisites === "None"
          ? `${targetCourse.code} (${targetCourse.title}) has no formal prerequisite in the current handbook-derived rules.`
          : `${targetCourse.code} (${targetCourse.title}) requires: ${targetCourse.prerequisites}.`;

      return withCitations(answer, [
        `Course catalog entry ${targetCourse.code}`,
        activeVersion
          ? `Requirement version v${activeVersion.versionNumber} (${activeVersion.handbookId})`
          : "No approved requirement version (deterministic fallback rules)",
      ]);
    }

    return withCitations(
      `Current rule checks show ${validation.summary.blockers} blockers and ${validation.summary.warnings} warnings. Ask about a specific course code (for example, COMP3002) to get exact prerequisite details.`,
      [
        "Validation report (live app state)",
        activeVersion
          ? `Requirement version v${activeVersion.versionNumber} (${activeVersion.handbookId})`
          : "No approved requirement version (deterministic fallback rules)",
      ],
    );
  }

  if (
    normalizedQuery.includes("progress") ||
    normalizedQuery.includes("how far") ||
    normalizedQuery.includes("degree") ||
    normalizedQuery.includes("graduate")
  ) {
    const answer = [
      "Here is your degree progress snapshot:",
      `- Credits projected: ${validation.projectedCredits}`,
      `- Credit shortfall: ${validation.creditShortfall}`,
      `- Validation blockers: ${validation.summary.blockers}`,
      `- Validation warnings: ${validation.summary.warnings}`,
      validation.isProjectedGraduationEligible
        ? "- You are currently on a projected eligible path to graduation."
        : "- You are not yet on a projected eligible path to graduation.",
    ].join("\n");

    return withCitations(answer, [
      "Validation report (live app state)",
      "Degree requirement target (academic repository)",
    ]);
  }

  if (
    normalizedQuery.includes("plan") ||
    normalizedQuery.includes("next semester") ||
    normalizedQuery.includes("path")
  ) {
    if (!topPlan) {
      return withCitations(
        "I couldn’t generate a plan from the current snapshot yet. Try adding/updating planned courses first.",
        ["Auto graduation planner"],
      );
    }

    const firstTwoTerms = topPlan.terms.slice(0, 2);
    const termSummary = firstTwoTerms
      .map(
        (term) =>
          `${term.termLabel}: ${term.courses
            .map((course) => course.code)
            .join(", ")} (${term.totalCredits} credits)`,
      )
      .join("\n");

    const answer = [
      `Recommended path: ${topPlan.title}`,
      `- Estimated completion: ${topPlan.projectedCompletionTerm}`,
      `- Estimated terms remaining: ${topPlan.estimatedTerms}`,
      "- Next terms:",
      termSummary || "No terms currently generated.",
    ].join("\n");

    return withCitations(answer, [
      `Auto graduation plan ${topPlan.id}`,
      "Validation report (live app state)",
    ]);
  }

  if (
    normalizedQuery.includes("conflict") ||
    normalizedQuery.includes("schedule") ||
    normalizedQuery.includes("clash")
  ) {
    const scheduleIssues = validation.issues
      .filter((issue) => issue.category === "schedule")
      .slice(0, 4);

    if (scheduleIssues.length === 0) {
      return withCitations(
        "No schedule conflicts are currently flagged by the rules engine.",
        ["Validation report (schedule category)"],
      );
    }

    const answer = [
      "I found these schedule-related flags:",
      ...scheduleIssues.map(
        (issue) => `- [${issue.severity.toUpperCase()}] ${issue.title}`,
      ),
    ].join("\n");

    return withCitations(answer, ["Validation report (schedule category)"]);
  }

  const fallback = buildFallbackReply();
  return withCitations(fallback.answer, fallback.citations);
}
