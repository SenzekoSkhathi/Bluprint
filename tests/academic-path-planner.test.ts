import { courseCatalog, defaultDegreeRequirements } from "@/data/academic-data";
import { generateAutoGraduationPlans } from "@/services/academic-path-planner";

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

    const comp2001Term = termByCode.get("COMP2001");
    const comp3002Term = termByCode.get("COMP3002");

    expect(comp2001Term).toBeDefined();
    expect(comp3002Term).toBeDefined();
    expect(comp2001Term!).toBeLessThan(comp3002Term!);
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
});
