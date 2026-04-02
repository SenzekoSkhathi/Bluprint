import type {
    AutoGraduationPlan,
    AutoPlannedCourse,
    AutoPlannedCourseKind,
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
  electiveOvershootAllowance: number;
}

const MAX_UNDERGRAD_TERM_INDEX = 8; // Year 4 - Semester 2
const MIN_CREDITS_PER_TERM = 30;

// Courses in the same group are treated as credit-equivalent. Planning more
// than one from the same group can lead to "no additional degree credit".
const CREDIT_EXCLUSION_GROUPS: string[][] = [
  ["CSC1015F", "CSC1010H"],
  ["MAM1000W", "MAM1005H", "MAM1006H"],
];

const OBJECTIVE_PROFILES: ObjectiveProfile[] = [
  {
    objective: "fastest",
    title: "Fastest Graduation",
    termCreditTarget: 60,
    preferredMinTermCredits: 45,
    electiveOvershootAllowance: 12,
  },
  {
    objective: "balanced",
    title: "Balanced Workload",
    termCreditTarget: 45,
    preferredMinTermCredits: 30,
    electiveOvershootAllowance: 6,
  },
  {
    objective: "light",
    title: "Light Workload",
    termCreditTarget: 30,
    preferredMinTermCredits: 15,
    electiveOvershootAllowance: 0,
  },
];

function parseCourseCodes(text: string): string[] {
  const matches = text.match(/[A-Z]{3,4}\d{4}(?:[A-Z](?:\/[A-Z]){0,3})?/g);
  return matches ? Array.from(new Set(matches)) : [];
}

/**
 * Returns true if `code` is considered satisfied by anything in `knownCodes`.
 * Handles slash-notation in both directions:
 *   - Required "CSC1015F/S" → satisfied by completed "CSC1015F" or "CSC1015S"
 *   - Required "CSC1015F"   → satisfied by scheduled "CSC1015F/S" in knownCodes
 */
function isSatisfied(code: string, knownCodes: Set<string>): boolean {
  if (knownCodes.has(code)) return true;

  // Forward: slash-notation required code → check each suffix variant
  if (code.includes("/")) {
    const compoundStart = code.search(/[A-Z](?:\/[A-Z])+$/);
    if (compoundStart !== -1) {
      const base = code.slice(0, compoundStart);
      const suffixes = code.slice(compoundStart).split("/");
      if (suffixes.some((s) => knownCodes.has(`${base}${s}`))) return true;
    }
  }

  // Reverse: exact required code → check if a slash-notation entry covers it
  for (const known of knownCodes) {
    if (!known.includes("/")) continue;
    const compoundStart = known.search(/[A-Z](?:\/[A-Z])+$/);
    if (compoundStart === -1) continue;
    const base = known.slice(0, compoundStart);
    const suffixes = known.slice(compoundStart).split("/");
    if (suffixes.some((s) => `${base}${s}` === code)) return true;
  }

  return false;
}

/**
 * For each required course, counts how many OTHER required courses list it
 * as a prerequisite. A higher score means the course is more foundational
 * and should be scheduled earlier to unlock the most future progress.
 */
function computeUnlockScores(
  requiredCodes: string[],
  catalogByCode: Map<string, CourseCatalogEntry>,
): Map<string, number> {
  const scores = new Map<string, number>(requiredCodes.map((c) => [c, 0]));
  requiredCodes.forEach((code) => {
    const entry = catalogByCode.get(code);
    if (!entry) return;
    parseCourseCodes(entry.prerequisites).forEach((prereq) => {
      if (scores.has(prereq)) scores.set(prereq, (scores.get(prereq) ?? 0) + 1);
    });
  });
  return scores;
}

/**
 * Collects all suggested elective codes from the student's registered
 * major combinations, excluding any already satisfied codes.
 */
function collectSuggestedElectives(
  input: AutoPlannerInput,
  satisfiedCodes: Set<string>,
): Set<string> {
  const result = new Set<string>();
  if (!input.majorCombinations || !input.studentCombinationIds) return result;
  const registeredNames = new Set(
    input.studentCombinationIds.map((n) => n.trim().toLowerCase()),
  );
  input.majorCombinations.forEach((combo) => {
    if (!registeredNames.has(combo.major.trim().toLowerCase())) return;
    combo.suggestedElectiveCodes.forEach((code) => {
      if (!isSatisfied(code, satisfiedCodes)) result.add(code);
    });
  });
  return result;
}

function collectPreferredDepartments(
  input: AutoPlannerInput,
  catalogByCode: Map<string, CourseCatalogEntry>,
): Set<string> {
  const preferred = new Set<string>();

  const addDepartmentByCode = (code: string) => {
    const entry = catalogByCode.get(code);
    if (entry?.department) preferred.add(entry.department);
  };

  input.completedCourses.forEach((course) => addDepartmentByCode(course.code));
  input.inProgressCourses.forEach((course) => addDepartmentByCode(course.code));
  input.plannedCourses.forEach((course) => addDepartmentByCode(course.code));

  if (input.majorCombinations && input.studentCombinationIds) {
    const selectedMajors = new Set(
      input.studentCombinationIds.map((name) => name.trim().toLowerCase()),
    );

    input.majorCombinations
      .filter((combo) => selectedMajors.has(combo.major.trim().toLowerCase()))
      .forEach((combo) => {
        combo.requiredCourseCodes.forEach((code) => addDepartmentByCode(code));
        combo.suggestedElectiveCodes.forEach((code) =>
          addDepartmentByCode(code),
        );
      });
  }

  return preferred;
}

function hasCreditExclusionConflict(
  code: string,
  scheduledOrSatisfiedCodes: Set<string>,
): boolean {
  const group = CREDIT_EXCLUSION_GROUPS.find((g) => g.includes(code));
  if (!group) return false;
  return group.some(
    (other) => other !== code && scheduledOrSatisfiedCodes.has(other),
  );
}

function canScheduleCourse(
  course: CourseCatalogEntry,
  semesterName: string,
  satisfiedCodes: Set<string>,
): boolean {
  const normalizedSemester = normalizeCourseSemester(course.semester);
  const offeredInTerm =
    normalizedSemester === semesterName ||
    (normalizedSemester === "FY" && semesterName === "Semester 1");
  if (!offeredInTerm) return false;

  if (hasCreditExclusionConflict(course.code, satisfiedCodes)) return false;

  const prereqs = parseCourseCodes(course.prerequisites);
  if (prereqs.length === 0) return true;

  const unsatisfied = prereqs.filter(
    (p) => !isSatisfied(p, satisfiedCodes),
  ).length;
  return unsatisfied <= Math.floor(prereqs.length / 2);
}

function isWholeYearCourse(course: CourseCatalogEntry): boolean {
  return (
    normalizeCourseSemester(course.semester) === "FY" ||
    /[HW]$/i.test(course.code)
  );
}

function normalizeCourseSemester(raw: string): string {
  const value = (raw ?? "").trim().toLowerCase();

  if (
    value === "fy" ||
    value === "full year" ||
    value === "whole year" ||
    value === "year course" ||
    value === "h" ||
    value === "w" ||
    value.includes("first or second") ||
    value.includes("f/s")
  ) {
    return "FY";
  }

  if (
    value === "s1" ||
    value === "sem 1" ||
    value === "semester 1" ||
    value.startsWith("first semester") ||
    /semester\s*1/.test(value)
  ) {
    return "Semester 1";
  }

  if (
    value === "s2" ||
    value === "sem 2" ||
    value === "semester 2" ||
    value.startsWith("second semester") ||
    /semester\s*2/.test(value)
  ) {
    return "Semester 2";
  }

  return raw;
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
  kind: AutoPlannedCourseKind,
): AutoPlannedCourse {
  return {
    code: course.code,
    title: course.title,
    credits: course.credits,
    reason,
    kind,
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
  // Exclude postgraduate courses (NQF 8+) — undergrad plans never schedule Honours/Masters courses.
  const undergradCatalog = input.catalog.filter(
    (course) => !course.nqf_level || course.nqf_level <= 7,
  );

  const catalogByCode = new Map(
    undergradCatalog.map((course) => [course.code, course]),
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

  // Collect required courses from the student's major combinations.
  // studentCombinationIds holds major names (e.g. "Computer Science"), so
  // match by combination.major rather than combination.id.
  //
  // For each (major, year) group there may be multiple variants (A/B/C). Pick
  // the single variant whose required courses best overlap with what the student
  // has already completed — this prevents merging ALL variants and incorrectly
  // treating every alternative course as required.
  const majorCoreCodes = new Set<string>(input.requirements.coreCourseCodes);
  if (input.majorCombinations && input.studentCombinationIds) {
    const registeredMajorNames = new Set(
      input.studentCombinationIds.map((n) => n.trim().toLowerCase()),
    );

    // Group matching combinations by (major, year)
    const groupedCombos = new Map<string, typeof input.majorCombinations>();
    input.majorCombinations.forEach((combo) => {
      if (!registeredMajorNames.has(combo.major.trim().toLowerCase())) return;
      const key = `${combo.major.trim().toLowerCase()}|${combo.year}`;
      if (!groupedCombos.has(key)) groupedCombos.set(key, []);
      groupedCombos.get(key)!.push(combo);
    });

    // For each group pick the best-matching variant — prefer the one that
    // leaves the fewest unresolved required courses for this student.
    groupedCombos.forEach((variants) => {
      const best = [...variants].sort((a, b) => {
        const aUnresolved = a.requiredCourseCodes.filter(
          (c) => !isSatisfied(c, existingCompletedCodes),
        ).length;
        const bUnresolved = b.requiredCourseCodes.filter(
          (c) => !isSatisfied(c, existingCompletedCodes),
        ).length;
        if (aUnresolved !== bUnresolved) return aUnresolved - bUnresolved;
        // Tie-break: fewer total required codes = leaner combo
        return a.requiredCourseCodes.length - b.requiredCourseCodes.length;
      })[0];
      best.requiredCourseCodes.forEach((code) => majorCoreCodes.add(code));
    });
  }

  const unresolvedCoreCodes = Array.from(majorCoreCodes).filter(
    (code) => !isSatisfied(code, existingCompletedCodes),
  );

  const currentCredits =
    input.completedCourses.reduce((sum, course) => sum + course.credits, 0) +
    input.inProgressCourses.reduce((sum, course) => sum + course.credits, 0) +
    input.plannedCourses.reduce((sum, course) => sum + course.credits, 0);

  const startTermIndex = getNextStartingTermIndex(input);

  // Pre-compute unlock scores once (shared across all profiles)
  const unlockScores = computeUnlockScores(unresolvedCoreCodes, catalogByCode);
  const preferredDepartments = collectPreferredDepartments(
    input,
    catalogByCode,
  );

  const plans = OBJECTIVE_PROFILES.map((profile) => {
    const termPlans: AutoPlannedTerm[] = [];
    const satisfiedCodes = new Set(existingCompletedCodes);
    const remainingCoreCodes = new Set(unresolvedCoreCodes);
    let underloadedRequiredTerms = 0;
    // Collect suggested electives from the student's combinations for
    // real course filling (avoids generic ELECTIVE-BLOCK placeholders).
    const availableElectiveCodes = collectSuggestedElectives(
      input,
      satisfiedCodes,
    );
    let loopTermIndex = startTermIndex;

    const getElectiveCandidates = (
      semesterName: string,
      usedCodesThisTerm: Set<string>,
    ): CourseCatalogEntry[] => {
      const suggestedCandidates = Array.from(availableElectiveCodes)
        .map((code) => catalogByCode.get(code))
        .filter((course): course is CourseCatalogEntry => Boolean(course))
        .filter((course) => !isWholeYearCourse(course))
        .filter((c) => !usedCodesThisTerm.has(c.code))
        .filter((c) => canScheduleCourse(c, semesterName, satisfiedCodes))
        .sort((a, b) => b.credits - a.credits);

      const fallbackCandidates = undergradCatalog
        .filter((course) => !isSatisfied(course.code, satisfiedCodes))
        .filter((course) => !majorCoreCodes.has(course.code))
        .filter((course) => !usedCodesThisTerm.has(course.code))
        .filter((course) => course.credits > 0)
        .filter((course) => !isWholeYearCourse(course))
        .filter((course) =>
          canScheduleCourse(course, semesterName, satisfiedCodes),
        )
        .sort((a, b) => {
          const aPreferred = preferredDepartments.has(a.department) ? 1 : 0;
          const bPreferred = preferredDepartments.has(b.department) ? 1 : 0;
          if (aPreferred !== bPreferred) return bPreferred - aPreferred;
          return b.credits - a.credits;
        });

      return suggestedCandidates.length > 0
        ? suggestedCandidates
        : fallbackCandidates;
    };

    while (
      remainingCoreCodes.size > 0 &&
      termPlans.length < 12 &&
      loopTermIndex <= MAX_UNDERGRAD_TERM_INDEX
    ) {
      const semesterName = semesterNameFromTermIndex(loopTermIndex);
      const termLabel = toTermLabel(loopTermIndex);
      const minTermCredits = MIN_CREDITS_PER_TERM;

      const eligibleCourses = Array.from(remainingCoreCodes)
        .map((code) => catalogByCode.get(code))
        .filter((course): course is CourseCatalogEntry => Boolean(course))
        .filter((course) =>
          canScheduleCourse(course, semesterName, satisfiedCodes),
        )
        .sort((a, b) => {
          // 1. Higher unlock score first — prioritise foundational courses
          //    that unblock the most future required courses.
          const unlockDiff =
            (unlockScores.get(b.code) ?? 0) - (unlockScores.get(a.code) ?? 0);
          if (unlockDiff !== 0) return unlockDiff;
          // 2. Fewer existing prerequisites first — simpler/earlier courses
          //    should be taken before more advanced ones.
          const prereqDiff =
            parseCourseCodes(a.prerequisites).length -
            parseCourseCodes(b.prerequisites).length;
          if (prereqDiff !== 0) return prereqDiff;
          // 3. Higher credits first — maximise progress per term.
          return b.credits - a.credits;
        });

      if (eligibleCourses.length === 0) {
        loopTermIndex += 1;
        continue;
      }

      const selected: AutoPlannedCourse[] = [];
      let selectedCredits = 0;
      const usedCodesThisTerm = new Set<string>();
      const provisionalElectiveCodes = new Set<string>();
      eligibleCourses.forEach((course) => {
        if (usedCodesThisTerm.has(course.code)) return;
        const wouldBeCredits = selectedCredits + course.credits;
        if (
          selectedCredits < minTermCredits ||
          wouldBeCredits <= profile.termCreditTarget
        ) {
          selected.push(
            toAutoCourse(
              course,
              "Matches semester offering and satisfies prerequisites.",
              "required",
            ),
          );
          selectedCredits += course.credits;
          usedCodesThisTerm.add(course.code);
        }
      });

      if (selected.length === 0) {
        const fallbackCourse = eligibleCourses[0];
        selected.push(
          toAutoCourse(
            fallbackCourse,
            "Added as next available core requirement for this semester.",
            "required",
          ),
        );
        selectedCredits += fallbackCourse.credits;
        usedCodesThisTerm.add(fallbackCourse.code);
      }

      // Required courses stay top priority; then fill remaining load to satisfy
      // the minimum semester-credit rule using valid electives.
      if (selectedCredits < MIN_CREDITS_PER_TERM) {
        const topUpCandidates = getElectiveCandidates(
          semesterName,
          usedCodesThisTerm,
        );

        topUpCandidates.forEach((course) => {
          if (selectedCredits >= MIN_CREDITS_PER_TERM) return;
          if (usedCodesThisTerm.has(course.code)) return;
          if (hasCreditExclusionConflict(course.code, satisfiedCodes)) return;

          selected.push(
            toAutoCourse(
              course,
              `Elective selected to reach minimum ${MIN_CREDITS_PER_TERM} credits for ${semesterName}.`,
              "elective",
            ),
          );
          selectedCredits += course.credits;
          usedCodesThisTerm.add(course.code);
          satisfiedCodes.add(course.code);
          provisionalElectiveCodes.add(course.code);
        });
      }

      // Once required courses satisfy minimum load, objective profiles diverge by
      // how much elective load they add in the same term.
      if (
        selectedCredits >= MIN_CREDITS_PER_TERM &&
        selectedCredits < profile.termCreditTarget
      ) {
        const enrichmentCandidates = getElectiveCandidates(
          semesterName,
          usedCodesThisTerm,
        );
        const upperCreditBound =
          profile.termCreditTarget + profile.electiveOvershootAllowance;

        enrichmentCandidates.forEach((course) => {
          if (selectedCredits >= profile.termCreditTarget) return;
          if (usedCodesThisTerm.has(course.code)) return;
          if (hasCreditExclusionConflict(course.code, satisfiedCodes)) return;

          const wouldBe = selectedCredits + course.credits;
          if (wouldBe > upperCreditBound) return;

          selected.push(
            toAutoCourse(
              course,
              `${profile.title} enrichment elective to align with ${profile.termCreditTarget}-credit objective.`,
              "elective",
            ),
          );
          selectedCredits += course.credits;
          usedCodesThisTerm.add(course.code);
          satisfiedCodes.add(course.code);
          provisionalElectiveCodes.add(course.code);
        });
      }

      selected.forEach((entry) => {
        satisfiedCodes.add(entry.code);
        remainingCoreCodes.delete(entry.code);
      });

      if (selectedCredits < MIN_CREDITS_PER_TERM) {
        // Keep required-course terms visible even when a same-semester top-up
        // is unavailable; otherwise plans can appear empty.
        underloadedRequiredTerms += 1;
      }

      provisionalElectiveCodes.forEach((code) => {
        availableElectiveCodes.delete(code);
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

    let electiveLoopTermIndex = startTermIndex + termPlans.length;
    while (
      electiveShortfall > 0 &&
      termPlans.length < 12 &&
      electiveLoopTermIndex <= MAX_UNDERGRAD_TERM_INDEX
    ) {
      const termIndex = electiveLoopTermIndex;
      const semesterName = semesterNameFromTermIndex(termIndex);
      const termLabel = toTermLabel(termIndex);
      const minTermCredits = MIN_CREDITS_PER_TERM;
      const usedCodesThisTerm = new Set<string>();

      const electiveCandidates = getElectiveCandidates(
        semesterName,
        usedCodesThisTerm,
      );

      if (electiveCandidates.length === 0) {
        electiveLoopTermIndex += 1;
        continue;
      }

      const selected: AutoPlannedCourse[] = [];
      let selectedCredits = 0;
      const provisionalElectiveCodes = new Set<string>();
      const objectiveTermTarget = Math.min(
        profile.termCreditTarget,
        electiveShortfall,
      );
      const objectiveCreditUpperBound =
        objectiveTermTarget + profile.electiveOvershootAllowance;
      const usingFallbackCandidates =
        availableElectiveCodes.size === 0 ||
        electiveCandidates.every((c) => !availableElectiveCodes.has(c.code));

      electiveCandidates.forEach((course) => {
        if (usedCodesThisTerm.has(course.code)) return;
        const wouldBe = selectedCredits + course.credits;
        if (
          selectedCredits < minTermCredits ||
          wouldBe <= objectiveCreditUpperBound
        ) {
          selected.push(
            toAutoCourse(
              course,
              usingFallbackCandidates
                ? `Pathway elective candidate from ${course.department} — available ${semesterName} with prerequisites satisfied.`
                : `Suggested elective — available ${semesterName} with prerequisites satisfied.`,
              "elective",
            ),
          );
          selectedCredits += course.credits;
          usedCodesThisTerm.add(course.code);
          satisfiedCodes.add(course.code);
          if (availableElectiveCodes.has(course.code)) {
            provisionalElectiveCodes.add(course.code);
          }
        }
      });

      if (selected.length === 0) {
        // All candidates exceed target credit budget — take the smallest
        const smallest = [...electiveCandidates].sort(
          (a, b) => a.credits - b.credits,
        )[0];
        selected.push(
          toAutoCourse(
            smallest,
            usingFallbackCandidates
              ? `Pathway elective candidate from ${smallest.department} — fits ${semesterName}.`
              : `Suggested elective — fits ${semesterName}.`,
            "elective",
          ),
        );
        selectedCredits = smallest.credits;
        usedCodesThisTerm.add(smallest.code);
        satisfiedCodes.add(smallest.code);
        if (availableElectiveCodes.has(smallest.code)) {
          provisionalElectiveCodes.add(smallest.code);
        }
      }

      if (selectedCredits < MIN_CREDITS_PER_TERM) {
        selected.forEach((entry) => {
          satisfiedCodes.delete(entry.code);
        });
        electiveLoopTermIndex += 1;
        continue;
      }

      provisionalElectiveCodes.forEach((code) => {
        availableElectiveCodes.delete(code);
      });

      termPlans.push({
        termIndex,
        termLabel,
        semester: semesterName,
        totalCredits: selectedCredits,
        courses: selected,
      });

      projectedTotalCredits += selectedCredits;
      electiveShortfall -= selectedCredits;
      electiveLoopTermIndex += 1;
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
          // combId may be a combination ID (e.g. "CSC05-Y1-A") or a major name
          // (e.g. "Computer Science") — match either way
          const comb = input.majorCombinations!.find(
            (c) =>
              c.year === yr &&
              (c.id === combId ||
                c.major.trim().toLowerCase() === combId.trim().toLowerCase()),
          );
          if (!comb) return;

          comb.suggestedElectiveCodes.forEach((code) => {
            if (isSatisfied(code, satisfiedCodes)) return;
            if (seenElectives.has(code)) return;
            const entry = catalogByCode.get(code);
            if (!entry) return;
            if (isWholeYearCourse(entry)) return;
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

    // Only count codes that actually exist in the catalog — codes absent from the
    // catalog (e.g. MAM1000W offered as a full-year alternative not in this dataset)
    // are not schedulable and should not inflate the "unresolved" warning count.
    const unresolvedCoreCount = Array.from(remainingCoreCodes).filter((code) =>
      catalogByCode.has(code),
    ).length;
    const projectedCompletionTerm =
      termPlans.length > 0
        ? termPlans[termPlans.length - 1].termLabel
        : toTermLabel(startTermIndex);

    const rationale = [
      `${profile.title} targets around ${profile.termCreditTarget} credits per term.`,
      `${unresolvedCoreCount} unresolved core courses remain after planning.`,
      `Planner is capped at Year 4 (Semester 2) with a minimum ${MIN_CREDITS_PER_TERM} credits per generated term.`,
      `Projected credits after plan: ${projectedTotalCredits}/${input.requirements.targetCredits}.`,
    ];

    if (underloadedRequiredTerms > 0) {
      rationale.push(
        `${underloadedRequiredTerms} required-course term${underloadedRequiredTerms === 1 ? "" : "s"} are below ${MIN_CREDITS_PER_TERM} credits because no valid same-semester elective top-up was available.`,
      );
    }

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
