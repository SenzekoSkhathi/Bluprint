import BluBot from "@/Pages/BluBot";
import { courseCatalog, defaultDegreeRequirements } from "@/data/academic-data";
import { useLoggedInUser } from "@/hooks/use-logged-in-user";
import { validateAcademicPlan } from "@/services/academic-validation";
import React, { useMemo } from "react";

export default function BluBotScreen() {
  const { loggedInUser, mockUser, savedPlan } = useLoggedInUser();
  const firstName = loggedInUser?.name.split(" ")[0] ?? "Student";

  const userContext = loggedInUser
    ? {
        studentNumber: loggedInUser.studentNumber,
        fullName: loggedInUser.name,
        degree: loggedInUser.degree,
        year: loggedInUser.year,
        majors: loggedInUser.majors,
        creditsEarned: mockUser?.academicProgress.creditsEarned,
        creditsTotal: mockUser?.academicProgress.creditsTotal,
        milestoneRequired: mockUser?.academicProgress.creditsMilestoneRequired,
        milestoneLabel: mockUser?.academicProgress.creditsMilestoneLabel,
        nqf7Earned: mockUser?.academicProgress.nqf7CreditsEarned,
        nqf7Required: mockUser?.academicProgress.nqf7CreditsRequired,
        // Full course history — this is what makes BluBot intelligent.
        // BluBot can now answer "can I take X?" by checking whether the
        // student has actually passed the prerequisites, not just recite the rule.
        completedPassed: mockUser?.completedCourses.passed ?? [],
        completedFailed: mockUser?.completedCourses.failed ?? [],
        coursesInProgress: mockUser?.coursesInProgress ?? [],
        plannedCourses: savedPlan?.planned_courses,
        selectedMajors: savedPlan?.selected_majors,
      }
    : undefined;

  // Compute a live validation summary so BluBot is aware of any plan issues
  // across the whole app — student doesn't need to mention them explicitly.
  const validationSummary = useMemo(() => {
    if (!mockUser) return undefined;

    const completedCourses = mockUser.completedCourses.passed
      .filter((c) => c.passed === true)
      .map((c, index) => ({
        id: `completed-${index}-${c.code}`,
        code: c.code,
        title: c.title,
        credits: c.credits,
        grade: typeof c.grade === "number" ? `${c.grade}%` : "Pass",
        gpa: typeof c.grade === "number" ? c.grade : 0,
        semester: c.semester,
      }));

    const inProgressCourses = (mockUser.coursesInProgress ?? []).map(
      (c, index) => ({
        id: `inprogress-${index}-${c.code}`,
        code: c.code,
        title: c.title,
        credits: c.credits,
        currentGrade: "-",
        status: 50,
        semester: c.semester,
      }),
    );

    const plannedCourses = (savedPlan?.planned_courses ?? []).map((c) => ({
      id: `${c.code}-${c.year}-${c.semester}`,
      code: c.code,
      name: c.code,
      year: c.year,
      semester: c.semester,
      credits: c.credits,
      status: "Planned" as const,
    }));

    if (
      plannedCourses.length === 0 &&
      completedCourses.length === 0 &&
      inProgressCourses.length === 0
    ) {
      return undefined;
    }

    try {
      const report = validateAcademicPlan({
        catalog: courseCatalog,
        requirements: defaultDegreeRequirements,
        plannedCourses,
        completedCourses,
        inProgressCourses,
      });

      // Surface top issues (blockers first, then warnings) for BluBot awareness.
      const sorted = [...report.issues].sort((a, b) => {
        const order: Record<string, number> = { blocker: 0, warning: 1, info: 2 };
        return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
      });

      return {
        blockers: report.summary.blockers,
        warnings: report.summary.warnings,
        infos: report.summary.infos,
        projectedCredits: report.projectedCredits,
        creditShortfall: report.creditShortfall,
        topIssues: sorted.slice(0, 8).map((issue) => ({
          severity: issue.severity,
          category: issue.category,
          title: issue.title,
          message: issue.message,
        })),
      };
    } catch {
      return undefined;
    }
  }, [mockUser, savedPlan]);

  return (
    <BluBot
      firstName={firstName}
      userContext={userContext}
      validationSummary={validationSummary}
    />
  );
}
