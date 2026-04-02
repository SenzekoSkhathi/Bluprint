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
    let loopTermIndex = startTermIndex;

    while (
      remainingCoreCodes.size > 0 &&
      termPlans.length < 12 &&
      loopTermIndex <= 24
    ) {
      const semesterName = semesterNameFromTermIndex(loopTermIndex);
      const termLabel = toTermLabel(loopTermIndex);

      const eligibleCourses = Array.from(remainingCoreCodes)
        .map((code) => catalogByCode.get(code))
        .filter((course): course is CourseCatalogEntry => Boolean(course))
        // "FY" (W/H suffix) courses run all year — place them in Semester 1 of their year.
        .filter(
          (course) =>
            course.semester === semesterName ||
            (course.semester === "FY" && semesterName === "Semester 1"),
        )
        .filter((course) => {
          const prereqs = parseCourseCodes(course.prerequisites);
          if (prereqs.length === 0) return true;
          // Prerequisites text may contain OR alternatives (inflating the parsed code
          // list). Allow the course if at most half the extracted codes are unsatisfied
          // so that students who completed one valid alternative still qualify.
          const unsatisfied = prereqs.filter(
            (p) => !isSatisfied(p, satisfiedCodes),
          ).length;
          return unsatisfied <= Math.floor(prereqs.length / 2);
        })
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

    // Collect suggested electives from the student's combinations for
    // real course filling (avoids generic ELECTIVE-BLOCK placeholders).
    const availableElectiveCodes = collectSuggestedElectives(
      input,
      satisfiedCodes,
    );

    let electiveLoopTermIndex = startTermIndex + termPlans.length;
    while (
      electiveShortfall > 0 &&
      termPlans.length < 12 &&
      electiveLoopTermIndex <= 24
    ) {
      const termIndex = electiveLoopTermIndex;
      const semesterName = semesterNameFromTermIndex(termIndex);
      const termLabel = toTermLabel(termIndex);

      // Find real electives available this semester with prerequisites met
      const suggestedCandidates = Array.from(availableElectiveCodes)
        .map((code) => catalogByCode.get(code))
        .filter((course): course is CourseCatalogEntry => Boolean(course))
        // FY courses are eligible in Semester 1 (they start then and run all year).
        .filter(
          (c) =>
            c.semester === semesterName ||
            (c.semester === "FY" && semesterName === "Semester 1"),
        )
        .filter((c) => {
          const prereqs = parseCourseCodes(c.prerequisites);
          if (prereqs.length === 0) return true;
          const unsatisfied = prereqs.filter(
            (p) => !isSatisfied(p, satisfiedCodes),
          ).length;
          return unsatisfied <= Math.floor(prereqs.length / 2);
        })
        .sort((a, b) => b.credits - a.credits);

      // If combination-defined electives are sparse, backfill from real catalog
      // courses that fit the student's likely pathway (same departments first).
      const fallbackCandidates = undergradCatalog
        .filter((course) => !isSatisfied(course.code, satisfiedCodes))
        .filter((course) => !majorCoreCodes.has(course.code))
        .filter((course) => course.credits > 0)
        .filter(
          (course) =>
            course.semester === semesterName ||
            (course.semester === "FY" && semesterName === "Semester 1"),
        )
        .filter((course) => {
          const prereqs = parseCourseCodes(course.prerequisites);
          if (prereqs.length === 0) return true;
          const unsatisfied = prereqs.filter(
            (p) => !isSatisfied(p, satisfiedCodes),
          ).length;
          return unsatisfied <= Math.floor(prereqs.length / 2);
        })
        .sort((a, b) => {
          const aPreferred = preferredDepartments.has(a.department) ? 1 : 0;
          const bPreferred = preferredDepartments.has(b.department) ? 1 : 0;
          if (aPreferred !== bPreferred) return bPreferred - aPreferred;
          return b.credits - a.credits;
        });

      const electiveCandidates =
        suggestedCandidates.length > 0
          ? suggestedCandidates
          : fallbackCandidates;

      if (electiveCandidates.length === 0) {
        electiveLoopTermIndex += 1;
        continue;
      }

      const selected: AutoPlannedCourse[] = [];
      let selectedCredits = 0;
      const usingFallbackCandidates = suggestedCandidates.length === 0;

      electiveCandidates.forEach((course) => {
        const wouldBe = selectedCredits + course.credits;
        if (
          selectedCredits < profile.preferredMinTermCredits ||
          wouldBe <= Math.min(profile.termCreditTarget, electiveShortfall)
        ) {
          selected.push(
            toAutoCourse(
              course,
              usingFallbackCandidates
                ? `Pathway elective candidate from ${course.department} — available ${semesterName} with prerequisites satisfied.`
                : `Suggested elective — available ${semesterName} with prerequisites satisfied.`,
            ),
          );
          selectedCredits += course.credits;
          satisfiedCodes.add(course.code);
          availableElectiveCodes.delete(course.code);
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
          ),
        );
        selectedCredits = smallest.credits;
        satisfiedCodes.add(smallest.code);
        availableElectiveCodes.delete(smallest.code);
      }

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
