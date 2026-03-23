import { useLoggedInUser } from "@/hooks/use-logged-in-user";
import Planner from "@/Pages/Planner";
import React from "react";

/**
 * Convert a mock course's NQF level and calendar semester string into the
 * "Year X - Sem Y" format that the local validation engine uses for term
 * ordering (prerequisite sequence checking, credit load per term, etc.).
 *
 * NQF5 = Year 1 | NQF6 = Year 2 | NQF7 = Year 3
 * "S2 XXXX" → Sem 2, everything else (S1, FY) → Sem 1
 */
function toDegreeSemester(nqfLevel: 5 | 6 | 7, calSemester: string): string {
  const year = nqfLevel === 5 ? 1 : nqfLevel === 6 ? 2 : 3;
  const sem = calSemester.startsWith("S2") ? 2 : 1;
  return `Year ${year} - Sem ${sem}`;
}

export default function PlannerScreen() {
  const { loggedInUser, mockUser, savedPlan } = useLoggedInUser();
  const currentYearNumber = loggedInUser?.year ?? 1;
  const registeredMajors = loggedInUser?.majors ?? [];

  const completedCourses = (mockUser?.completedCourses.passed ?? []).map(
    (course) => ({
      code: course.code,
      title: course.title,
      credits: course.credits,
      // Convert to "Year X - Sem Y" format so the validation engine can
      // correctly determine which term each course was completed in.
      semester: toDegreeSemester(course.nqfLevel, course.semester),
      passed: true,
      grade: course.grade,
    }),
  );

  const inProgressCourses = (mockUser?.coursesInProgress ?? []).map(
    (course) => ({
      code: course.code,
      title: course.title,
      credits: course.credits,
      semester: toDegreeSemester(course.nqfLevel, course.semester),
    }),
  );

  const plannedCourses = (savedPlan?.planned_courses ?? []).map((course) => {
    const yearMatch = course.year.match(/(\d+)/);
    const yearNumber = Number(yearMatch?.[1] ?? 1);

    return {
      code: course.code,
      title: course.code,
      credits: course.credits,
      semester: course.semester,
      nqfLevel: Math.min(Math.max(yearNumber + 4, 5), 7) as 5 | 6 | 7,
    };
  });

  return (
    <Planner
      studentNumber={loggedInUser?.studentNumber}
      currentYearNumber={currentYearNumber}
      registeredMajors={registeredMajors}
      completedCourses={completedCourses}
      inProgressCourses={inProgressCourses}
      plannedCourses={plannedCourses}
    />
  );
}
