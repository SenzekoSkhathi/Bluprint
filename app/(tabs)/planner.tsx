import { useLoggedInUser } from "@/hooks/use-logged-in-user";
import Planner from "@/Pages/Planner";
import React from "react";

/**
 * Convert a calendar semester string (e.g. "S1 2025", "S2 2024") into the
 * "Year X - Sem Y" degree-year format by combining the calendar year with the
 * student's current enrollment year.
 *
 * Formula: degreeYear = calendarYear - 2025 + studentYear
 * "S2 XXXX" → Sem 2, everything else (S1, FY) → Sem 1.
 */
function toDegreeSemester(calSemester: string, studentYear: number): string {
  const calYearMatch = calSemester.match(/\d{4}/);
  const currentYear = new Date().getFullYear();
  const calYear = calYearMatch ? parseInt(calYearMatch[0], 10) : currentYear;
  const degreeYear = Math.min(Math.max(calYear - currentYear + studentYear, 1), 4);
  const sem = calSemester.startsWith("S2") ? 2 : 1;
  return `Year ${degreeYear} - Sem ${sem}`;
}

export default function PlannerScreen() {
  const { loggedInUser, mockUser, savedPlan } = useLoggedInUser();
  const currentYearNumber = mockUser?.year ?? loggedInUser?.year ?? 1;
  const registeredMajors = loggedInUser?.majors ?? [];

  const completedCourses = (mockUser?.completedCourses.passed ?? []).map(
    (course) => ({
      code: course.code,
      title: course.title,
      credits: course.credits,
      // Convert to "Year X - Sem Y" format so the validation engine can
      // correctly determine which term each course was completed in.
      semester: toDegreeSemester(course.semester, currentYearNumber),
      passed: true,
      grade: course.grade,
    }),
  );

  const inProgressCourses = (mockUser?.coursesInProgress ?? []).map(
    (course) => ({
      code: course.code,
      title: course.title,
      credits: course.credits,
      semester: toDegreeSemester(course.semester, currentYearNumber),
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
      year: course.year,
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
