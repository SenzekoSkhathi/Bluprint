import type {
    AutoGraduationPlan,
    AutoPlannedCourse,
    AutoPlannedTerm,
    CompletedCourseRecord,
    CourseCatalogEntry,
    DegreeRequirements,
    ElectiveSuggestion,
    InProgressCourseRecord,
    MajorCombination,
    PlannedCourse,
    PlanningObjective,
    YearPlan,
} from "@/types/academic";

interface AutoPlannerInput {
  catalog: CourseCatalogEntry[];
  requirements: DegreeRequirements;
  completedCourses: CompletedCourseRecord[];
  inProgressCourses: InProgressCourseRecord[];
  plannedCourses: PlannedCourse[];
  majorCombinations?: MajorCombination[];
  studentCombinationIds?: string[];
}

interface ObjectiveProfile {
  objective: PlanningObjective;
  title: string;
  termCreditTarget: number;
  preferredMinTermCredits: number;
}

const OBJECTIVE_PROFILES: ObjectiveProfile[] = [
  {
    objective: "fastest",
    title: "Fastest Graduation",
    termCreditTarget: 60,
    preferredMinTermCredits: 45,
  },
  {
    objective: "balanced",
    title: "Balanced Workload",
    termCreditTarget: 45,
    preferredMinTermCredits: 30,
  },
  {
    objective: "light",
    title: "Light Workload",
    termCreditTarget: 30,
    preferredMinTermCredits: 15,
  },
];

function parseCourseCodes(text: string): string[] {
  const matches = text.match(/[A-Z]{3,4}\d{4}(?:[A-Z](?:\/[A-Z]){0,3})?/g);
  return matches ? Array.from(new Set(matches)) : [];
}

function parseYearNumber(value: string): number {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : 1;
}

function parseSemesterNumber(value: string): number {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : 1;
}

function parseRecordTermIndex(semester: string): number {
  const yearMatch = semester.match(/Year\s*(\d+)/i);
  const semMatch = semester.match(/Sem(?:ester)?\s*(\d+)/i);
  const yearNumber = yearMatch ? Number(yearMatch[1]) : 1;
  const semesterNumber = semMatch ? Number(semMatch[1]) : 1;
  return (yearNumber - 1) * 2 + semesterNumber;
}

function toTermLabel(termIndex: number): string {
  const yearNumber = Math.ceil(termIndex / 2);
  const semesterNumber = termIndex % 2 === 1 ? 1 : 2;
  return `Year ${yearNumber} - Semester ${semesterNumber}`;
}

function semesterNameFromTermIndex(termIndex: number): string {
  return termIndex % 2 === 1 ? "Semester 1" : "Semester 2";
}

function getNextStartingTermIndex(input: AutoPlannerInput): number {
  const completedTermIndices = input.completedCourses.map((course) =>
    parseRecordTermIndex(course.semester),
  );
  const inProgressTermIndices = input.inProgressCourses.map((course) =>
    parseRecordTermIndex(course.semester),
  );
  const plannedTermIndices = input.plannedCourses.map(
    (course) =>
      (parseYearNumber(course.year) - 1) * 2 +
      parseSemesterNumber(course.semester),
  );

  const maxTermIndex = Math.max(
    0,
    ...completedTermIndices,
    ...inProgressTermIndices,
    ...plannedTermIndices,
  );

  return maxTermIndex + 1;
}

function toAutoCourse(
  course: CourseCatalogEntry,
  reason: string,
): AutoPlannedCourse {
  return {
    code: course.code,
    title: course.title,
    credits: course.credits,
    reason,
  };
}

function scorePlan(plan: {
  objective: PlanningObjective;
  terms: AutoPlannedTerm[];
  projectedTotalCredits: number;
  targetCredits: number;
}): number {
  const termCount = plan.terms.length;
  const creditGap = Math.max(
    0,
    plan.targetCredits - plan.projectedTotalCredits,
  );
  const averageCredits =
    termCount === 0
      ? 0
      : plan.terms.reduce((sum, term) => sum + term.totalCredits, 0) /
        termCount;
  const maxTermCredits = Math.max(
    0,
    ...plan.terms.map((term) => term.totalCredits),
  );

  if (plan.objective === "fastest") {
    return termCount * 100 + creditGap;
  }

  if (plan.objective === "balanced") {
    return Math.round(
      Math.abs(averageCredits - 45) * 10 + termCount * 5 + creditGap,
    );
  }

  return Math.round(maxTermCredits * 2 + termCount * 3 + creditGap);
}

export function generateAutoGraduationPlans(
  input: AutoPlannerInput,
): AutoGraduationPlan[] {
  const catalogByCode = new Map(
    input.catalog.map((course) => [course.code, course]),
  );

  const existingCompletedCodes = new Set(
    input.completedCourses.map((course) => course.code),
  );
  input.inProgressCourses.forEach((course) =>
    existingCompletedCodes.add(course.code),
  );
  input.plannedCourses.forEach((course) =>
    existingCompletedCodes.add(course.code),
  );

  const unresolvedCoreCodes = input.requirements.coreCourseCodes.filter(
    (code) => !existingCompletedCodes.has(code),
  );

  const currentCredits =
    input.completedCourses.reduce((sum, course) => sum + course.credits, 0) +
    input.inProgressCourses.reduce((sum, course) => sum + course.credits, 0) +
    input.plannedCourses.reduce((sum, course) => sum + course.credits, 0);

  const startTermIndex = getNextStartingTermIndex(input);

  const plans = OBJECTIVE_PROFILES.map((profile) => {
    const termPlans: AutoPlannedTerm[] = [];
    const satisfiedCodes = new Set(existingCompletedCodes);
    const remainingCoreCodes = new Set(unresolvedCoreCodes);
    let loopTermIndex = startTermIndex;

    while (remainingCoreCodes.size > 0 && termPlans.length < 12 && loopTermIndex <= 24) {
      const semesterName = semesterNameFromTermIndex(loopTermIndex);
      const termLabel = toTermLabel(loopTermIndex);

      const eligibleCourses = Array.from(remainingCoreCodes)
        .map((code) => catalogByCode.get(code))
        .filter((course): course is CourseCatalogEntry => Boolean(course))
        .filter((course) => course.semester === semesterName)
        .filter((course) => {
          const prereqs = parseCourseCodes(course.prerequisites);
          return prereqs.every((prereq) => satisfiedCodes.has(prereq));
        })
        .sort((a, b) => {
          const prereqDiff =
            parseCourseCodes(b.prerequisites).length -
            parseCourseCodes(a.prerequisites).length;
          if (prereqDiff !== 0) {
            return prereqDiff;
          }
          return b.credits - a.credits;
        });

      if (eligibleCourses.length === 0) {
        loopTermIndex += 1;
        continue;
      }

      const selected: AutoPlannedCourse[] = [];
      let selectedCredits = 0;
      eligibleCourses.forEach((course) => {
        const wouldBeCredits = selectedCredits + course.credits;
        if (
          selectedCredits < profile.preferredMinTermCredits ||
          wouldBeCredits <= profile.termCreditTarget
        ) {
          selected.push(
            toAutoCourse(
              course,
              "Matches semester offering and satisfies prerequisites.",
            ),
          );
          selectedCredits += course.credits;
        }
      });

      if (selected.length === 0) {
        const fallbackCourse = eligibleCourses[0];
        selected.push(
          toAutoCourse(
            fallbackCourse,
            "Added as next available core requirement for this semester.",
          ),
        );
        selectedCredits += fallbackCourse.credits;
      }

      selected.forEach((entry) => {
        satisfiedCodes.add(entry.code);
        remainingCoreCodes.delete(entry.code);
      });

      termPlans.push({
        termIndex: loopTermIndex,
        termLabel,
        semester: semesterName,
        totalCredits: selectedCredits,
        courses: selected,
      });

      loopTermIndex += 1;
    }

    const plannedCoreCredits = termPlans.reduce(
      (sum, term) => sum + term.totalCredits,
      0,
    );

    let projectedTotalCredits = currentCredits + plannedCoreCredits;
    let electiveShortfall = Math.max(
      0,
      input.requirements.targetCredits - projectedTotalCredits,
    );

    while (electiveShortfall > 0 && termPlans.length < 12) {
      const termIndex = startTermIndex + termPlans.length;
      const creditsToAllocate = Math.min(
        profile.termCreditTarget,
        electiveShortfall,
      );
      const electiveCourse: AutoPlannedCourse = {
        code: "ELECTIVE-BLOCK",
        title: "Elective / General Requirement Credits",
        credits: creditsToAllocate,
        reason: "Fills remaining credits toward graduation target.",
      };

      termPlans.push({
        termIndex,
        termLabel: toTermLabel(termIndex),
        semester: semesterNameFromTermIndex(termIndex),
        totalCredits: creditsToAllocate,
        courses: [electiveCourse],
      });

      projectedTotalCredits += creditsToAllocate;
      electiveShortfall -= creditsToAllocate;
    }

    // ── Year-by-year breakdown with elective suggestions ──────────────────
    const yearlyBreakdown: YearPlan[] = [];
    const termsByYear = new Map<number, AutoPlannedTerm[]>();
    termPlans.forEach((term) => {
      const yr = Math.ceil(term.termIndex / 2);
      if (!termsByYear.has(yr)) termsByYear.set(yr, []);
      termsByYear.get(yr)!.push(term);
    });

    termsByYear.forEach((yearTerms, yr) => {
      const totalCredits = yearTerms.reduce((s, t) => s + t.totalCredits, 0);

      // Collect elective suggestions for this year from the student's combinations
      const seenElectives = new Set<string>();
      const electiveSuggestions: ElectiveSuggestion[] = [];

      if (input.studentCombinationIds && input.majorCombinations) {
        input.studentCombinationIds.forEach((combId) => {
          const comb = input.majorCombinations!.find(
            (c) => c.id === combId && c.year === yr,
          );
          if (!comb) return;

          comb.suggestedElectiveCodes.forEach((code) => {
            if (satisfiedCodes.has(code)) return;
            if (seenElectives.has(code)) return;
            const entry = catalogByCode.get(code);
            if (!entry) return;
            seenElectives.add(code);
            electiveSuggestions.push({
              code,
              title: entry.title,
              credits: entry.credits,
              reason: `Recommended elective for ${comb.major} Year ${yr}`,
              semester: entry.semester,
            });
          });
        });
      }

      yearlyBreakdown.push({
        year: yr,
        yearLabel: `Year ${yr}`,
        terms: yearTerms,
        totalCredits,
        electiveSuggestions,
      });
    });

    const unresolvedCoreCount = remainingCoreCodes.size;
    const projectedCompletionTerm =
      termPlans.length > 0
        ? termPlans[termPlans.length - 1].termLabel
        : toTermLabel(startTermIndex);

    const rationale = [
      `${profile.title} targets around ${profile.termCreditTarget} credits per term.`,
      `${unresolvedCoreCount} unresolved core courses remain after planning.`,
      `Projected credits after plan: ${projectedTotalCredits}/${input.requirements.targetCredits}.`,
    ];

    const score = scorePlan({
      objective: profile.objective,
      terms: termPlans,
      projectedTotalCredits,
      targetCredits: input.requirements.targetCredits,
    });

    return {
      id: `plan-${profile.objective}`,
      title: profile.title,
      objective: profile.objective,
      score,
      estimatedTerms: termPlans.length,
      projectedCompletionTerm,
      projectedTotalCredits,
      rationale,
      terms: termPlans,
      yearlyBreakdown,
    } satisfies AutoGraduationPlan;
  });

  return plans.sort((a, b) => a.score - b.score);
}
