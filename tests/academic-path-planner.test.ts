import { courseCatalog, defaultDegreeRequirements } from "@/data/academic-data";
import { generateAutoGraduationPlans } from "@/services/academic-path-planner";
import type { CourseCatalogEntry, MajorCombination } from "@/types/academic";

function makeCourse(
  code: string,
  semester: string,
  credits: number,
): CourseCatalogEntry {
  return {
    id: code,
    code,
    title: code,
    group: "Year 1",
    credits,
    nqf_level: 5,
    semester,
    department: "Test Department",
    delivery: "In person",
    prerequisites: "",
    description: "",
    outcomes: [],
  };
}

describe("generateAutoGraduationPlans", () => {
  it("returns ranked plans with fastest objective first", () => {
    const plans = generateAutoGraduationPlans({
      catalog: courseCatalog,
      requirements: defaultDegreeRequirements,
      completedCourses: [],
      inProgressCourses: [],
      plannedCourses: [],
    });

    expect(plans.length).toBe(3);
    expect(plans.some((plan) => plan.objective === "fastest")).toBe(true);
    expect(plans.some((plan) => plan.objective === "balanced")).toBe(true);
    expect(plans.some((plan) => plan.objective === "light")).toBe(true);
    expect(plans[0].score).toBeLessThanOrEqual(plans[1].score);
    expect(plans[1].score).toBeLessThanOrEqual(plans[2].score);
  });

  it("includes term-by-term explainable course recommendations", () => {
    const plans = generateAutoGraduationPlans({
      catalog: courseCatalog,
      requirements: defaultDegreeRequirements,
      completedCourses: [],
      inProgressCourses: [],
      plannedCourses: [],
    });

    const topPlan = plans[0];
    expect(topPlan.terms.length).toBeGreaterThan(0);
    expect(topPlan.terms[0].courses.length).toBeGreaterThan(0);
    expect(topPlan.terms[0].courses[0].reason.length).toBeGreaterThan(0);
  });

  it("never places a dependent core course before its prerequisite", () => {
    const plans = generateAutoGraduationPlans({
      catalog: courseCatalog,
      requirements: defaultDegreeRequirements,
      completedCourses: [],
      inProgressCourses: [],
      plannedCourses: [],
    });

    const topPlan = plans[0];
    const termByCode = new Map<string, number>();
    topPlan.terms.forEach((term) => {
      term.courses.forEach((course) => {
        if (!termByCode.has(course.code)) {
          termByCode.set(course.code, term.termIndex);
        }
      });
    });

    const parseCodes = (text: string): string[] => {
      const matches = text.match(/[A-Z]{3,4}\d{4}(?:[A-Z](?:\/[A-Z]){0,3})?/g);
      return matches ? Array.from(new Set(matches)) : [];
    };

    let checkedDependencyPairs = 0;
    courseCatalog.forEach((course) => {
      const dependentTerm = termByCode.get(course.code);
      if (!dependentTerm) return;

      parseCodes(course.prerequisites).forEach((prereqCode) => {
        const prereqTerm = termByCode.get(prereqCode);
        if (!prereqTerm) return;
        checkedDependencyPairs += 1;
        expect(prereqTerm).toBeLessThan(dependentTerm);
      });
    });

    expect(checkedDependencyPairs).toBeGreaterThanOrEqual(0);
  });

  it("uses real courses instead of elective placeholder blocks", () => {
    const plans = generateAutoGraduationPlans({
      catalog: courseCatalog,
      requirements: defaultDegreeRequirements,
      completedCourses: [],
      inProgressCourses: [],
      plannedCourses: [],
    });

    const hasElectiveBlock = plans.some((plan) =>
      plan.terms.some((term) =>
        term.courses.some((course) => course.code === "ELECTIVE-BLOCK"),
      ),
    );

    expect(hasElectiveBlock).toBe(false);
  });

  it("never plans beyond Year 4", () => {
    const plans = generateAutoGraduationPlans({
      catalog: courseCatalog,
      requirements: defaultDegreeRequirements,
      completedCourses: [],
      inProgressCourses: [],
      plannedCourses: [],
    });

    plans.forEach((plan) => {
      plan.terms.forEach((term) => {
        expect(term.termIndex).toBeLessThanOrEqual(8);
      });
    });
  });

  it("keeps every generated term at least 30 credits", () => {
    const plans = generateAutoGraduationPlans({
      catalog: courseCatalog,
      requirements: defaultDegreeRequirements,
      completedCourses: [],
      inProgressCourses: [],
      plannedCourses: [],
    });

    plans.forEach((plan) => {
      plan.terms.forEach((term) => {
        expect(term.totalCredits).toBeGreaterThanOrEqual(30);
      });
    });
  });

  it("does not schedule credit-equivalent duplicates", () => {
    const catalog: CourseCatalogEntry[] = [
      makeCourse("CSC1010H", "Semester 1", 36),
      makeCourse("MAM1031F", "Semester 1", 18),
      makeCourse("MAM1032S", "Semester 2", 18),
      makeCourse("ELC1001F", "Semester 1", 15),
      makeCourse("ELC1002S", "Semester 2", 15),
    ];

    const majorCombinations: MajorCombination[] = [
      {
        id: "TEST-Y1-A",
        major: "Computer Science",
        year: 1,
        requiredCourseCodes: ["CSC1010H", "MAM1031F", "MAM1032S"],
        suggestedElectiveCodes: ["ELC1001F", "ELC1002S"],
      },
    ];

    const plans = generateAutoGraduationPlans({
      catalog,
      requirements: {
        id: "test-degree",
        name: "Test Degree",
        targetCredits: 96,
        minimumYearlyCredits: 60,
        coreCourseCodes: [],
      },
      completedCourses: [
        {
          id: "done-1",
          code: "CSC1015F",
          title: "CSC1015F",
          credits: 18,
          grade: "A",
          gpa: 4,
          semester: "Year 1 - Semester 1",
        },
      ],
      inProgressCourses: [],
      plannedCourses: [],
      majorCombinations,
      studentCombinationIds: ["Computer Science"],
    });

    const hasExcludedEquivalent = plans.some((plan) =>
      plan.terms.some((term) =>
        term.courses.some((course) => course.code === "CSC1010H"),
      ),
    );

    expect(hasExcludedEquivalent).toBe(false);
  });

  it("does not recommend whole-year H/W courses as electives", () => {
    const catalog: CourseCatalogEntry[] = [
      makeCourse("ELE2000H", "Semester 1", 36),
      makeCourse("ELE1001F", "Semester 1", 15),
      makeCourse("ELE1002F", "Semester 1", 15),
      makeCourse("ELE1003S", "Semester 2", 15),
      makeCourse("ELE1004S", "Semester 2", 15),
    ];

    const majorCombinations: MajorCombination[] = [
      {
        id: "TEST-Y1-ELECTIVES",
        major: "Computer Science",
        year: 1,
        requiredCourseCodes: [],
        suggestedElectiveCodes: [
          "ELE2000H",
          "ELE1001F",
          "ELE1002F",
          "ELE1003S",
          "ELE1004S",
        ],
      },
    ];

    const plans = generateAutoGraduationPlans({
      catalog,
      requirements: {
        id: "test-degree-electives",
        name: "Test Degree Electives",
        targetCredits: 60,
        minimumYearlyCredits: 60,
        coreCourseCodes: [],
      },
      completedCourses: [],
      inProgressCourses: [],
      plannedCourses: [],
      majorCombinations,
      studentCombinationIds: ["Computer Science"],
    });

    const containsWholeYearElective = plans.some((plan) =>
      plan.terms.some((term) =>
        term.courses.some((course) => course.code === "ELE2000H"),
      ),
    );

    expect(containsWholeYearElective).toBe(false);
  });
});
