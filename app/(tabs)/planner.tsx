import { useLoggedInUser } from "@/hooks/use-logged-in-user";
import Planner from "@/Pages/Planner";
import React from "react";

/**
 * Convert a calendar semester string (e.g. "S1 2025", "S2 2024") into the
 * "Year X - Sem Y" degree-year format by combining the calendar year with the
 * student's current enrollment year.
 *
 * Uses referenceYear (the calendar year that corresponds to studentYear) so the
 * mapping stays stable regardless of when the app is run.
 * Formula: degreeYear = calendarYear - referenceYear + studentYear
 * "S2 XXXX" → Sem 2, everything else (S1, FY) → Sem 1.
 */
function toDegreeSemester(
  calSemester: string,
  studentYear: number,
  referenceYear: number,
): string {
  const calYearMatch = calSemester.match(/\d{4}/);
  const calYear = calYearMatch ? parseInt(calYearMatch[0], 10) : referenceYear;
  const degreeYear = Math.min(
    Math.max(calYear - referenceYear + studentYear, 1),
    4,
  );
  const sem = calSemester.startsWith("S2") ? 2 : 1;
  return `Year ${degreeYear} - Sem ${sem}`;
}

export default function PlannerScreen() {
  const { loggedInUser, mockUser, savedPlan } = useLoggedInUser();
  const currentYearNumber = mockUser?.year ?? loggedInUser?.year ?? 1;
  const registeredMajors = loggedInUser?.majors ?? [];

  // Anchor the degree-year mapping to the calendar year of the in-progress
  // courses (i.e. the year that corresponds to studentYear).  This keeps
  // the mapping stable even when the app is run in a later calendar year.
  const inProgressSemesters = mockUser?.coursesInProgress ?? [];
  const referenceYear =
    inProgressSemesters.reduce((max, c) => {
      const m = c.semester.match(/\d{4}/);
      return m ? Math.max(max, parseInt(m[0], 10)) : max;
    }, 0) || new Date().getFullYear();

  const completedCourses = (mockUser?.completedCourses.passed ?? []).map(
    (course) => ({
      code: course.code,
      title: course.title,
      credits: course.credits,
      // Convert to "Year X - Sem Y" format so the validation engine can
      // correctly determine which term each course was completed in.
      semester: toDegreeSemester(course.semester, currentYearNumber, referenceYear),
      passed: true,
      grade: course.grade,
    }),
  );

  const inProgressCourses = inProgressSemesters.map((course) => ({
    code: course.code,
    title: course.title,
    credits: course.credits,
    semester: toDegreeSemester(course.semester, currentYearNumber, referenceYear),
  }));

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
