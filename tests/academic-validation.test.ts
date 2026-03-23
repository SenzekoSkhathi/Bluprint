import { courseCatalog, defaultDegreeRequirements } from "@/data/academic-data";
import { validateAcademicPlan } from "@/services/academic-validation";
import type { PlannedCourse, ScheduleItem } from "@/types/academic";
import { describe, expect, it } from "vitest";

describe("validateAcademicPlan", () => {
  it("flags missing prerequisite blockers", () => {
    const plannedCourses: PlannedCourse[] = [
      {
        id: "p1",
        code: "COMP3002",
        name: "Software Engineering",
        credits: 15,
        year: "Year 1",
        semester: "Semester 1",
        status: "Planned",
      },
    ];

    const report = validateAcademicPlan({
      catalog: courseCatalog,
      requirements: defaultDegreeRequirements,
      plannedCourses,
      completedCourses: [],
      inProgressCourses: [],
      scheduleItems: [],
    });

    expect(report.summary.blockers).toBeGreaterThan(0);
    expect(
      report.issues.some(
        (issue) =>
          issue.category === "prerequisite" &&
          issue.relatedCourseCode === "COMP3002",
      ),
    ).toBe(true);
  });

  it("detects schedule overlap conflicts as blockers", () => {
    const scheduleItems: ScheduleItem[] = [
      {
        id: "s1",
        courseCode: "COMP2004",
        courseName: "Databases",
        type: "Class",
        day: "Monday",
        startTime: "09:00",
        endTime: "10:30",
        location: "Room B201",
      },
      {
        id: "s2",
        courseCode: "COMP3002",
        courseName: "Software Engineering",
        type: "Class",
        day: "Monday",
        startTime: "10:00",
        endTime: "11:00",
        location: "Room C110",
      },
    ];

    const report = validateAcademicPlan({
      catalog: courseCatalog,
      requirements: defaultDegreeRequirements,
      plannedCourses: [],
      completedCourses: [],
      inProgressCourses: [],
      scheduleItems,
    });

    expect(
      report.issues.some(
        (issue) =>
          issue.category === "schedule" &&
          issue.title.includes("Time conflict"),
      ),
    ).toBe(true);
    expect(report.summary.blockers).toBeGreaterThan(0);
  });

  it("flags same-term prerequisite placement as a blocker", () => {
    const plannedCourses: PlannedCourse[] = [
      {
        id: "p-same-1",
        code: "COMP2001",
        name: "Data Structures and Algorithms",
        credits: 15,
        year: "Year 2",
        semester: "Semester 1",
        status: "Planned",
      },
      {
        id: "p-same-2",
        code: "COMP3002",
        name: "Software Engineering",
        credits: 15,
        year: "Year 2",
        semester: "Semester 1",
        status: "Planned",
      },
    ];

    const report = validateAcademicPlan({
      catalog: courseCatalog,
      requirements: defaultDegreeRequirements,
      plannedCourses,
      completedCourses: [],
      inProgressCourses: [],
      scheduleItems: [],
    });

    expect(
      report.issues.some(
        (issue) =>
          issue.category === "prerequisite" &&
          issue.title.includes("Same-term prerequisite violation") &&
          issue.relatedCourseCode === "COMP3002",
      ),
    ).toBe(true);
  });

  it("warns on repeated planned courses and respects in-progress prerequisite precedence", () => {
    const plannedCourses: PlannedCourse[] = [
      {
        id: "p-rep-1",
        code: "COMP2001",
        name: "Data Structures and Algorithms",
        credits: 15,
        year: "Year 3",
        semester: "Semester 1",
        status: "Planned",
      },
      {
        id: "p-rep-2",
        code: "COMP2001",
        name: "Data Structures and Algorithms",
        credits: 15,
        year: "Year 3",
        semester: "Semester 2",
        status: "Planned",
      },
      {
        id: "p-rep-3",
        code: "COMP3002",
        name: "Software Engineering",
        credits: 15,
        year: "Year 3",
        semester: "Semester 1",
        status: "Planned",
      },
    ];

    const report = validateAcademicPlan({
      catalog: courseCatalog,
      requirements: defaultDegreeRequirements,
      plannedCourses,
      completedCourses: [],
      inProgressCourses: [
        {
          id: "ip-1",
          code: "COMP2001",
          title: "Data Structures and Algorithms",
          credits: 15,
          currentGrade: "-",
          status: 60,
          semester: "Year 2 - Semester 2",
        },
      ],
      scheduleItems: [],
    });

    expect(
      report.issues.some(
        (issue) =>
          issue.category === "sequencing" &&
          issue.title.includes("Repeated planned course") &&
          issue.relatedCourseCode === "COMP2001",
      ),
    ).toBe(true);

    expect(
      report.issues.some(
        (issue) =>
          issue.category === "prerequisite" &&
          issue.relatedCourseCode === "COMP3002" &&
          issue.title.includes("Missing prerequisite"),
      ),
    ).toBe(false);
  });

  it("flags a prerequisite planned one term too late", () => {
    const plannedCourses: PlannedCourse[] = [
      {
        id: "late-prereq-1",
        code: "COMP3002",
        name: "Software Engineering",
        credits: 15,
        year: "Year 2",
        semester: "Semester 1",
        status: "Planned",
      },
      {
        id: "late-prereq-2",
        code: "COMP2001",
        name: "Data Structures and Algorithms",
        credits: 15,
        year: "Year 2",
        semester: "Semester 2",
        status: "Planned",
      },
    ];

    const report = validateAcademicPlan({
      catalog: courseCatalog,
      requirements: defaultDegreeRequirements,
      plannedCourses,
      completedCourses: [],
      inProgressCourses: [],
      scheduleItems: [],
    });

    expect(
      report.issues.some(
        (issue) =>
          issue.category === "prerequisite" &&
          issue.title.includes("Prerequisite planned too late") &&
          issue.relatedCourseCode === "COMP3002",
      ),
    ).toBe(true);
  });

  it("warns when core requirements are omitted", () => {
    const report = validateAcademicPlan({
      catalog: courseCatalog,
      requirements: defaultDegreeRequirements,
      plannedCourses: [],
      completedCourses: [],
      inProgressCourses: [],
      scheduleItems: [],
    });

    expect(
      report.issues.some(
        (issue) =>
          issue.category === "core-requirement" &&
          issue.title.includes("Core requirement missing"),
      ),
    ).toBe(true);
  });

  it("warns when projected credits are below graduation target", () => {
    const report = validateAcademicPlan({
      catalog: courseCatalog,
      requirements: defaultDegreeRequirements,
      plannedCourses: [],
      completedCourses: [],
      inProgressCourses: [],
      scheduleItems: [],
    });

    expect(report.creditShortfall).toBeGreaterThan(0);
    expect(
      report.issues.some(
        (issue) =>
          issue.category === "credits" &&
          issue.title.includes("Credit shortfall"),
      ),
    ).toBe(true);
  });

  it("warns on overloaded term credits", () => {
    const plannedCourses: PlannedCourse[] = [
      {
        id: "ol-1",
        code: "COMP1001",
        name: "Intro to Programming",
        credits: 15,
        year: "Year 1",
        semester: "Semester 1",
        status: "Planned",
      },
      {
        id: "ol-2",
        code: "COMP2001",
        name: "Data Structures",
        credits: 15,
        year: "Year 1",
        semester: "Semester 1",
        status: "Planned",
      },
      {
        id: "ol-3",
        code: "COMP2004",
        name: "Databases",
        credits: 15,
        year: "Year 1",
        semester: "Semester 1",
        status: "Planned",
      },
      {
        id: "ol-4",
        code: "COMP3002",
        name: "Software Engineering",
        credits: 15,
        year: "Year 1",
        semester: "Semester 1",
        status: "Planned",
      },
      {
        id: "ol-5",
        code: "COMP3010",
        name: "Networks",
        credits: 15,
        year: "Year 1",
        semester: "Semester 1",
        status: "Planned",
      },
    ];

    const report = validateAcademicPlan({
      catalog: courseCatalog,
      requirements: defaultDegreeRequirements,
      plannedCourses,
      completedCourses: [],
      inProgressCourses: [],
      scheduleItems: [],
    });

    expect(
      report.issues.some(
        (issue) =>
          issue.category === "load" &&
          issue.title.includes("Overload detected"),
      ),
    ).toBe(true);
  });

  it("reports mixed blockers and warnings in one validation pass", () => {
    const plannedCourses: PlannedCourse[] = [
      {
        id: "mixed-1",
        code: "COMP3002",
        name: "Software Engineering",
        credits: 15,
        year: "Year 2",
        semester: "Semester 1",
        status: "Planned",
      },
      {
        id: "mixed-2",
        code: "COMP2001",
        name: "Data Structures and Algorithms",
        credits: 15,
        year: "Year 2",
        semester: "Semester 1",
        status: "Planned",
      },
      {
        id: "mixed-3",
        code: "COMP1001",
        name: "Introduction to Programming",
        credits: 50,
        year: "Year 2",
        semester: "Semester 1",
        status: "Planned",
      },
    ];

    const report = validateAcademicPlan({
      catalog: courseCatalog,
      requirements: defaultDegreeRequirements,
      plannedCourses,
      completedCourses: [],
      inProgressCourses: [],
      scheduleItems: [],
    });

    expect(report.summary.blockers).toBeGreaterThan(0);
    expect(report.summary.warnings).toBeGreaterThan(0);
  });

  it("blocks schedule items with invalid end-before-start times", () => {
    const scheduleItems: ScheduleItem[] = [
      {
        id: "bad-time-1",
        courseCode: "COMP2004",
        courseName: "Databases",
        type: "Class",
        day: "Tuesday",
        startTime: "14:00",
        endTime: "13:00",
        location: "Room B201",
      },
    ];

    const report = validateAcademicPlan({
      catalog: courseCatalog,
      requirements: defaultDegreeRequirements,
      plannedCourses: [],
      completedCourses: [],
      inProgressCourses: [],
      scheduleItems,
    });

    expect(
      report.issues.some(
        (issue) =>
          issue.category === "schedule" &&
          issue.title.includes("Invalid session range"),
      ),
    ).toBe(true);
  });
});
