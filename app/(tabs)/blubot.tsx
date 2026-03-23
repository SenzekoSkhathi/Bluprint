import BluBot from "@/Pages/BluBot";
import { useLoggedInUser } from "@/hooks/use-logged-in-user";
import React from "react";

export default function BluBotScreen() {
  const { loggedInUser, mockUser } = useLoggedInUser();
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
      }
    : undefined;

  return <BluBot firstName={firstName} userContext={userContext} />;
}
