import type {
    AcademicValidationReport,
    CompletedCourseRecord,
    CourseCatalogEntry,
    DegreeRequirements,
    InProgressCourseRecord,
    MajorCombination,
    PlannedCourse,
    ScheduleItem,
    ValidationIssue,
} from "@/types/academic";
import { parseLectureTimes, UCT_PERIOD_TIMES } from "@/services/lecture-times-parser";

interface AcademicValidationInput {
  catalog: CourseCatalogEntry[];
  requirements: DegreeRequirements;
  plannedCourses: PlannedCourse[];
  completedCourses: CompletedCourseRecord[];
  inProgressCourses: InProgressCourseRecord[];
  scheduleItems?: ScheduleItem[];
  majorCombinations?: MajorCombination[];
  studentCombinationIds?: string[];
}

const MIN_TERM_CREDITS = 30;
const MAX_TERM_CREDITS = 72;
const MAX_DAILY_SCHEDULE_HOURS = 6;

// NQF difficulty multipliers: a Year-3 (NQF 7) course is significantly
// harder than a Year-1 (NQF 5) course for the same credit count.
const NQF_WEIGHT: Record<number, number> = {
  5: 1.0,
  6: 1.3,
  7: 1.6,
  8: 2.0,
};
function nqfWeight(level: number | undefined): number {
  return NQF_WEIGHT[level ?? 6] ?? 1.0;
}
// Weighted load threshold: warn if a term's NQF-weighted credits significantly
// exceed a balanced semester of mid-level courses.
const MAX_WEIGHTED_TERM_LOAD = MAX_TERM_CREDITS * 1.15; // ≈ 83

// Co-requisite patterns: language in prerequisite text that indicates a
// course must be taken concurrently (same semester).
const COREQ_PATTERNS = [
  /concurrently\s+with\s+([A-Z]{3,4}\d{4}[A-Z]?)/gi,
  /co-?requisite[:\s]+([A-Z]{3,4}\d{4}[A-Z]?)/gi,
  /simultaneously\s+with\s+([A-Z]{3,4}\d{4}[A-Z]?)/gi,
  /at\s+the\s+same\s+time\s+as\s+([A-Z]{3,4}\d{4}[A-Z]?)/gi,
];

function parseCorequisiteCodes(text: string): string[] {
  if (!text) return [];
  const codes: string[] = [];
  COREQ_PATTERNS.forEach((pattern) => {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      codes.push(match[1]);
    }
  });
  return Array.from(new Set(codes));
}

/**
 * Parse prerequisite text into OR-groups that are AND-connected.
 * Returns string[][] where each inner array is an OR group:
 *   - A planned course satisfies the requirement if, for EVERY group,
 *     at least ONE code in that group is in the student's known courses.
 *
 * Examples:
 *   "CSC1015F and CSC1016S"       → [["CSC1015F"], ["CSC1016S"]]   (both required)
 *   "STA1006S or STA1007S"        → [["STA1006S", "STA1007S"]]     (either satisfies)
 *   "CSC1015F/CSC1016S"           → [["CSC1015F", "CSC1016S"]]     (slash = or)
 *   "CSC1015F, CSC1016S, MAM1031F"→ [["CSC1015F"],["CSC1016S"],["MAM1031F"]]
 */
function parsePrerequisiteGroups(text: string): string[][] {
  if (!text || /^none$/i.test(text.trim())) return [];

  // Add spaces around slashes that sit between two course codes so they
  // become OR separators rather than being glued to the preceding code.
  const normalized = text.replace(
    /([A-Z]{3,4}\d{4}[A-Z]?)\s*\/\s*([A-Z]{3,4})/g,
    "$1 / $2",
  );

  // Split on "and" and "," to get the AND-connected segments.
  const andSegments = normalized
    .split(/\s*,\s*|\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const groups: string[][] = [];

  andSegments.forEach((segment) => {
    // Within each AND-segment, split on "or" and "/" for OR alternatives.
    const orParts = segment.split(/\s+or\s+|\s*\/\s*/i);
    const orCodes: string[] = [];

    orParts.forEach((part) => {
      const matches = part.match(/[A-Z]{3,4}\d{4}[A-Z]?/g) ?? [];
      orCodes.push(...matches);
    });

    if (orCodes.length > 0) {
      groups.push(orCodes);
    }
  });

  return groups;
}

function parseYearNumber(year: string): number {
  const yearMatch = year.match(/\d+/);
  return yearMatch ? Number(yearMatch[0]) : 1;
}

function parseSemesterNumber(semester: string): number {
  const semMatch = semester.match(/\d+/);
  return semMatch ? Number(semMatch[0]) : 1;
}

function getPlannedTermIndex(course: PlannedCourse): number {
  const yearNumber = parseYearNumber(course.year);
  const semesterNumber = parseSemesterNumber(course.semester);
  return (yearNumber - 1) * 2 + semesterNumber;
}

function getRecordTermIndex(semester: string): number {
  const yearMatch = semester.match(/Year\s*(\d+)/i);
  const semMatch = semester.match(/Sem(?:ester)?\s*(\d+)/i);
  const yearNumber = yearMatch ? Number(yearMatch[1]) : 1;
  const semesterNumber = semMatch ? Number(semMatch[1]) : 1;
  return (yearNumber - 1) * 2 + semesterNumber;
}

function buildIssue(
  id: string,
  issue: Omit<ValidationIssue, "id">,
): ValidationIssue {
  return { id, ...issue };
}

function parseTimeToMinutes(value: string): number | null {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function formatTermLabel(yearNumber: number, semesterNumber: number): string {
  return `Year ${yearNumber} - Semester ${semesterNumber}`;
}

function termFromPlannedCourse(course: PlannedCourse): string {
  return formatTermLabel(
    parseYearNumber(course.year),
    parseSemesterNumber(course.semester),
  );
}

function termFromRecordSemester(semester: string): string {
  const yearMatch = semester.match(/Year\s*(\d+)/i);
  const semMatch = semester.match(/Sem(?:ester)?\s*(\d+)/i);
  const yearNumber = yearMatch ? Number(yearMatch[1]) : 1;
  const semesterNumber = semMatch ? Number(semMatch[1]) : 1;
  return formatTermLabel(yearNumber, semesterNumber);
}

export function validateAcademicPlan({
  catalog,
  requirements,
  plannedCourses,
  completedCourses,
  inProgressCourses,
  scheduleItems = [],
  majorCombinations,
  studentCombinationIds,
}: AcademicValidationInput): AcademicValidationReport {
  const issues: ValidationIssue[] = [];
  const catalogByCode = new Map(catalog.map((course) => [course.code, course]));

  const completedCodes = new Set(completedCourses.map((course) => course.code));
  const inProgressCodes = new Set(
    inProgressCourses.map((course) => course.code),
  );
  const plannedCodes = new Set(plannedCourses.map((course) => course.code));
  const allKnownCodes = new Set([
    ...completedCodes,
    ...inProgressCodes,
    ...plannedCodes,
  ]);

  const plannedTermByCode = new Map<string, number>();
  const plannedCourseOccurrences = new Map<string, number>();
  plannedCourses.forEach((course) => {
    const previous = plannedTermByCode.get(course.code);
    const current = getPlannedTermIndex(course);
    if (previous === undefined || current < previous) {
      plannedTermByCode.set(course.code, current);
    }
    plannedCourseOccurrences.set(
      course.code,
      (plannedCourseOccurrences.get(course.code) ?? 0) + 1,
    );
  });

  const completedTermByCode = new Map<string, number>();
  completedCourses.forEach((course) => {
    const previous = completedTermByCode.get(course.code);
    const current = getRecordTermIndex(course.semester);
    if (previous === undefined || current < previous) {
      completedTermByCode.set(course.code, current);
    }
  });

  const inProgressTermByCode = new Map<string, number>();
  inProgressCourses.forEach((course) => {
    const previous = inProgressTermByCode.get(course.code);
    const current = getRecordTermIndex(course.semester);
    if (previous === undefined || current < previous) {
      inProgressTermByCode.set(course.code, current);
    }
  });

  let issueCounter = 1;
  const nextId = () => `val-${issueCounter++}`;

  plannedCourseOccurrences.forEach((count, code) => {
    if (count < 2) {
      return;
    }

    issues.push(
      buildIssue(nextId(), {
        severity: "warning",
        category: "sequencing",
        title: `Repeated planned course: ${code}`,
        message: `${code} appears ${count} times in your planned courses. Keep only one valid attempt term unless a repeat is intentional.`,
        relatedCourseCode: code,
      }),
    );
  });

  plannedCourses.forEach((plannedCourse) => {
    const catalogEntry = catalogByCode.get(plannedCourse.code);
    if (!catalogEntry) {
      return;
    }

    const prerequisiteGroups = parsePrerequisiteGroups(catalogEntry.prerequisites);
    const targetTerm = getPlannedTermIndex(plannedCourse);

    // Each group is an OR-group: the requirement is met if ANY code in
    // the group is already completed, in progress, or planned earlier.
    prerequisiteGroups.forEach((orGroup) => {
      // ── Satisfied check ──────────────────────────────────────────────
      const isSatisfied = orGroup.some((prereqCode) => {
        const completedTerm = completedTermByCode.get(prereqCode);
        const inProgressTerm = inProgressTermByCode.get(prereqCode);
        const prereqPlannedTerm = plannedTermByCode.get(prereqCode);
        return (
          completedCodes.has(prereqCode) ||
          inProgressCodes.has(prereqCode) ||
          (completedTerm !== undefined && completedTerm < targetTerm) ||
          (inProgressTerm !== undefined && inProgressTerm < targetTerm) ||
          (prereqPlannedTerm !== undefined && prereqPlannedTerm < targetTerm)
        );
      });

      if (isSatisfied) return;

      // ── Same-term violation ──────────────────────────────────────────
      // Any OR alternative being taken in the same term as the target.
      const sameTermCode = orGroup.find((prereqCode) => {
        const inProgressTerm = inProgressTermByCode.get(prereqCode);
        const prereqPlannedTerm = plannedTermByCode.get(prereqCode);
        return (
          (inProgressTerm !== undefined && inProgressTerm === targetTerm) ||
          (prereqPlannedTerm !== undefined && prereqPlannedTerm === targetTerm)
        );
      });

      if (sameTermCode) {
        issues.push(
          buildIssue(nextId(), {
            severity: "blocker",
            category: "prerequisite",
            title: `Same-term prerequisite for ${plannedCourse.code}`,
            message: `${plannedCourse.code} depends on ${sameTermCode}, but both are in the same term. Move ${sameTermCode} to an earlier term.`,
            relatedCourseCode: plannedCourse.code,
            relatedTerm: termFromPlannedCourse(plannedCourse),
          }),
        );
        return;
      }

      // ── Late-placed prerequisite ─────────────────────────────────────
      const lateCode = orGroup.find((prereqCode) => {
        const inProgressTerm = inProgressTermByCode.get(prereqCode);
        const prereqPlannedTerm = plannedTermByCode.get(prereqCode);
        return (
          (inProgressTerm !== undefined && inProgressTerm > targetTerm) ||
          (prereqPlannedTerm !== undefined && prereqPlannedTerm > targetTerm)
        );
      });

      if (lateCode) {
        issues.push(
          buildIssue(nextId(), {
            severity: "blocker",
            category: "prerequisite",
            title: `Prerequisite placed too late for ${plannedCourse.code}`,
            message: `${plannedCourse.code} requires ${lateCode} before this term, but ${lateCode} is currently scheduled later.`,
            relatedCourseCode: plannedCourse.code,
            relatedTerm: termFromPlannedCourse(plannedCourse),
          }),
        );
        return;
      }

      // ── Truly missing ────────────────────────────────────────────────
      const displayPrereq =
        orGroup.length === 1
          ? orGroup[0]
          : `one of (${orGroup.join(", ")})`;
      issues.push(
        buildIssue(nextId(), {
          severity: "blocker",
          category: "prerequisite",
          title: `Missing prerequisite for ${plannedCourse.code}`,
          message: `${plannedCourse.code} requires ${displayPrereq} in an earlier term.`,
          relatedCourseCode: plannedCourse.code,
          relatedTerm: termFromPlannedCourse(plannedCourse),
        }),
      );
    });
  });

  requirements.coreCourseCodes.forEach((coreCode) => {
    if (!allKnownCodes.has(coreCode)) {
      issues.push(
        buildIssue(nextId(), {
          severity: "warning",
          category: "core-requirement",
          title: `Core requirement missing: ${coreCode}`,
          message: `${coreCode} is required in ${requirements.name} but is not in completed, in-progress, or planned courses.`,
          relatedCourseCode: coreCode,
        }),
      );
    }
  });

  const creditsCompleted = completedCourses.reduce(
    (sum, course) => sum + course.credits,
    0,
  );
  const creditsInProgress = inProgressCourses.reduce(
    (sum, course) => sum + course.credits,
    0,
  );
  const creditsPlanned = plannedCourses
    .filter((course) => course.status === "Planned")
    .reduce((sum, course) => sum + course.credits, 0);

  const projectedCredits =
    creditsCompleted + creditsInProgress + creditsPlanned;
  const creditShortfall = Math.max(
    0,
    requirements.targetCredits - projectedCredits,
  );

  if (creditShortfall > 0) {
    issues.push(
      buildIssue(nextId(), {
        severity: "warning",
        category: "credits",
        title: "Credit shortfall to graduation",
        message: `${creditShortfall} more credits are needed to reach ${requirements.targetCredits}.`,
      }),
    );
  }

  const termCreditMap = new Map<string, number>();
  const addTermCredits = (term: string, credits: number) => {
    termCreditMap.set(term, (termCreditMap.get(term) ?? 0) + credits);
  };

  plannedCourses.forEach((course) => {
    const term = termFromPlannedCourse(course);
    addTermCredits(term, course.credits);
    // FY (W/H suffix) courses run across both semesters of the year.
    // Count their credits toward the paired semester so the load check catches
    // over-enrolment in both S1 and S2 when a full-year course is present.
    const entry = catalogByCode.get(course.code);
    if (entry?.semester === "FY") {
      const yearNum = parseYearNumber(course.year);
      const semNum = parseSemesterNumber(course.semester);
      addTermCredits(formatTermLabel(yearNum, semNum === 1 ? 2 : 1), course.credits);
    }
  });
  completedCourses.forEach((course) => {
    addTermCredits(termFromRecordSemester(course.semester), course.credits);
  });
  inProgressCourses.forEach((course) => {
    const term = termFromRecordSemester(course.semester);
    addTermCredits(term, course.credits);
    // FY in-progress courses (e.g. PHY1004W) also occupy S2 — count there too.
    const entry = catalogByCode.get(course.code);
    if (entry?.semester === "FY") {
      const yearMatch = term.match(/Year\s*(\d+)/i);
      const yearNum = yearMatch ? Number(yearMatch[1]) : 1;
      addTermCredits(formatTermLabel(yearNum, 2), course.credits);
    }
  });

  // ── NQF-weighted load per term (planned courses only) ───────────────────
  const termWeightedLoadMap = new Map<string, number>();
  plannedCourses.forEach((course) => {
    const entry = catalogByCode.get(course.code);
    const w = nqfWeight(entry?.nqf_level);
    const term = termFromPlannedCourse(course);
    termWeightedLoadMap.set(
      term,
      (termWeightedLoadMap.get(term) ?? 0) + course.credits * w,
    );
    // FY planned courses also weight the paired semester.
    if (entry?.semester === "FY") {
      const yearNum = parseYearNumber(course.year);
      const semNum = parseSemesterNumber(course.semester);
      const pairedTerm = formatTermLabel(yearNum, semNum === 1 ? 2 : 1);
      termWeightedLoadMap.set(
        pairedTerm,
        (termWeightedLoadMap.get(pairedTerm) ?? 0) + course.credits * w,
      );
    }
  });

  termCreditMap.forEach((credits, term) => {
    if (credits < MIN_TERM_CREDITS) {
      issues.push(
        buildIssue(nextId(), {
          severity: "warning",
          category: "load",
          title: `Underload detected in ${term}`,
          message: `${term} has ${credits} credits. Recommended minimum is ${MIN_TERM_CREDITS}.`,
          relatedTerm: term,
        }),
      );
    }

    if (credits > MAX_TERM_CREDITS) {
      issues.push(
        buildIssue(nextId(), {
          severity: "warning",
          category: "load",
          title: `Overload detected in ${term}`,
          message: `${term} has ${credits} credits. Recommended maximum is ${MAX_TERM_CREDITS}.`,
          relatedTerm: term,
        }),
      );
    }

    // NQF-weighted difficulty warning (planned terms only)
    const weightedLoad = termWeightedLoadMap.get(term);
    if (
      weightedLoad !== undefined &&
      weightedLoad > MAX_WEIGHTED_TERM_LOAD &&
      credits <= MAX_TERM_CREDITS // raw load is fine — this is a difficulty flag
    ) {
      issues.push(
        buildIssue(nextId(), {
          severity: "warning",
          category: "load",
          title: `High difficulty load in ${term}`,
          message: `${term} has a weighted difficulty score of ${Math.round(weightedLoad)} (raw credits: ${credits}). Several advanced-level (NQF 7) courses in the same term significantly increases difficulty — consider spreading them across semesters.`,
          relatedTerm: term,
        }),
      );
    }
  });

  // ── Co-requisite validation ───────────────────────────────────────────────
  // Checks for language like "concurrently with X" in prerequisites and
  // verifies that X is in the same semester as the planned course.
  plannedCourses.forEach((plannedCourse) => {
    const catalogEntry = catalogByCode.get(plannedCourse.code);
    if (!catalogEntry) return;

    const coreqCodes = parseCorequisiteCodes(catalogEntry.prerequisites);
    if (coreqCodes.length === 0) return;

    const targetTerm = getPlannedTermIndex(plannedCourse);

    coreqCodes.forEach((coreqCode) => {
      // Check if the co-req is in the same term
      const plannedTerm = plannedTermByCode.get(coreqCode);
      const inProgressTerm = inProgressTermByCode.get(coreqCode);
      const completedTerm = completedTermByCode.get(coreqCode);

      const isSameTerm =
        (plannedTerm !== undefined && plannedTerm === targetTerm) ||
        (inProgressTerm !== undefined && inProgressTerm === targetTerm);
      const isAlreadyDone = completedTerm !== undefined;

      if (!isSameTerm && !isAlreadyDone) {
        const isInPlan =
          plannedTerm !== undefined || inProgressTerm !== undefined;
        issues.push(
          buildIssue(nextId(), {
            severity: isInPlan ? "warning" : "blocker",
            category: "prerequisite",
            title: `Co-requisite not in same semester: ${plannedCourse.code}`,
            message: isInPlan
              ? `${plannedCourse.code} requires ${coreqCode} to be taken in the same semester, but ${coreqCode} is scheduled in a different term.`
              : `${plannedCourse.code} requires ${coreqCode} to be taken concurrently, but ${coreqCode} is not in your plan.`,
            relatedCourseCode: plannedCourse.code,
            relatedTerm: termFromPlannedCourse(plannedCourse),
          }),
        );
      }
    });
  });

  // ── DP requirement surfacing ──────────────────────────────────────────────
  // For each planned course that has a DP (duly performed) requirement,
  // surface it as an info issue so the student is aware before enrolling.
  plannedCourses.forEach((plannedCourse) => {
    const catalogEntry = catalogByCode.get(plannedCourse.code);
    if (!catalogEntry?.dp_requirements) return;

    issues.push(
      buildIssue(nextId(), {
        severity: "info",
        category: "prerequisite",
        title: `DP requirement — ${plannedCourse.code}`,
        message: `${plannedCourse.code}: ${catalogEntry.dp_requirements}`,
        relatedCourseCode: plannedCourse.code,
        relatedTerm: termFromPlannedCourse(plannedCourse),
      }),
    );
  });

  // ── Lecture-time clash detection ──────────────────────────────────────────
  // Groups planned + in-progress courses by term, parses lecture_times from
  // the catalog, and flags any period×day slot occupied by two or more courses.
  // Courses without parseable times generate an "unconfirmed" info notice only
  // when there IS at least one real clash in the same term (to avoid noise).
  //
  // Co-schedulable exemptions — two sources:
  //
  // 1. HANDBOOK_COSCHEDULABLE hardcoded set: courses the handbook explicitly
  //    states can be taken concurrently.
  //
  // 2. AUTOMATIC split-credit detection: UCT structures companion courses so
  //    each carries half the credits of a standard semester course for that
  //    year level, and their lectures are timetabled to not overlap:
  //      NQF5 (Y1): standard 18cr → companion pair each 9cr
  //      NQF6 (Y2): standard 24cr → companion pair each 12cr
  //      NQF7 (Y3+): standard 36cr → companion pair each 18cr
  //    Any two courses in the same semester with the same NQF level whose
  //    individual credits exactly equal half the standard for that level are
  //    treated as intentional companions and exempt from clash reporting.
  //    Example: MAM2042S (12cr, NQF6) + MAM2043S (12cr, NQF6) → exempt.
  //    Example: CSC3041F (18cr, NQF7) + CSC3042F (18cr, NQF7) → exempt.

  const HANDBOOK_COSCHEDULABLE = new Set([
    // MAM Year 2 — explicitly co-schedulable per handbook notes
    "MAM2000W",
    "MAM2004F",
    "MAM2005S",
    "MAM2010F",
    "MAM2011F",
    "MAM2012F",
    "MAM2013S",
    "MAM2014S",
    "MAM2015F",
    "MAM2020F",
    "MAM2021S",
    "MAM2040F",
    "MAM2041F",
    "MAM2046F",
    "MAM2047S",
    // CSC Year 3 (period-3 electives — shared slot by design)
    "CSC3024S",
    "CSC3041F",
    "CSC3042F",
    "CSC3043S",
    "CSC3044S",
  ]);

  // Standard semester credits by NQF level — used for auto split-credit detection.
  const NQF_STANDARD_CREDITS: Record<number, number> = {
    5: 18, // Year 1
    6: 24, // Year 2
    7: 36, // Year 3+
    8: 36, // Honours/postgrad
  };

  /**
   * Returns true when two courses sharing a lecture slot are intentional
   * split-credit companions — i.e. each carries exactly half the standard
   * semester credits for their NQF level, meaning the handbook timetabled
   * them to run concurrently on purpose.
   */
  function isSplitCreditCompanion(codeA: string, codeB: string): boolean {
    const entryA = catalogByCode.get(codeA);
    const entryB = catalogByCode.get(codeB);
    if (!entryA || !entryB) return false;

    const nqfA = entryA.nqf_level;
    const nqfB = entryB.nqf_level;
    if (!nqfA || !nqfB || nqfA !== nqfB) return false;

    const standard = NQF_STANDARD_CREDITS[nqfA];
    if (!standard) return false;

    const half = standard / 2;
    return entryA.credits === half && entryB.credits === half;
  }
  {
    type CourseEntry = { code: string; slots: ReturnType<typeof parseLectureTimes> };
    const termCourseEntries = new Map<string, CourseEntry[]>();

    const addEntry = (code: string, term: string) => {
      const entry = catalogByCode.get(code);
      const slots = parseLectureTimes(entry?.lecture_times);
      if (!termCourseEntries.has(term)) termCourseEntries.set(term, []);
      termCourseEntries.get(term)!.push({ code, slots });
    };

    plannedCourses.forEach((c) => {
      const term = termFromPlannedCourse(c);
      addEntry(c.code, term);
      // FY planned courses run in both semesters — check clashes in S2 as well.
      const entry = catalogByCode.get(c.code);
      if (entry?.semester === "FY") {
        const yearNum = parseYearNumber(c.year);
        const semNum = parseSemesterNumber(c.semester);
        addEntry(c.code, formatTermLabel(yearNum, semNum === 1 ? 2 : 1));
      }
    });
    inProgressCourses.forEach((c) => {
      const term = termFromRecordSemester(c.semester);
      addEntry(c.code, term);
      // FY in-progress courses also clash-check in S2.
      const entry = catalogByCode.get(c.code);
      if (entry?.semester === "FY") {
        const yearMatch = term.match(/Year\s*(\d+)/i);
        const yearNum = yearMatch ? Number(yearMatch[1]) : 1;
        addEntry(c.code, formatTermLabel(yearNum, 2));
      }
    });

    termCourseEntries.forEach((entries, term) => {
      // Build slot map: "Monday-5" → [courseA, courseB, …]
      const slotMap = new Map<string, string[]>();
      entries.forEach(({ code, slots }) => {
        slots.forEach(({ day, period }) => {
          const key = `${day}-${period}`;
          if (!slotMap.has(key)) slotMap.set(key, []);
          slotMap.get(key)!.push(code);
        });
      });

      // Report clashes (blocker) — deduplicate pair reporting
      const reportedPairs = new Set<string>();
      let hasConfirmedClash = false;

      slotMap.forEach((codes, slotKey) => {
        if (codes.length < 2) return;
        // Check if any non-exempt pair exists before marking as confirmed clash.
        const hasNonExemptPair = codes.some((a, i) =>
          codes.slice(i + 1).some(
            (b) =>
              !(HANDBOOK_COSCHEDULABLE.has(a) && HANDBOOK_COSCHEDULABLE.has(b)) &&
              !isSplitCreditCompanion(a, b),
          ),
        );
        if (hasNonExemptPair) hasConfirmedClash = true;
        const [day, periodStr] = slotKey.split("-");
        const period = parseInt(periodStr, 10);
        const timeLabel = UCT_PERIOD_TIMES[period] ?? `Period ${period}`;

        for (let i = 0; i < codes.length; i++) {
          for (let j = i + 1; j < codes.length; j++) {
            const pair = [codes[i], codes[j]].sort().join("|");
            if (reportedPairs.has(pair)) continue;
            reportedPairs.add(pair);

            // Exempt pairs that are explicitly co-schedulable per the handbook,
            // or are auto-detected split-credit companions (each = half the
            // standard semester credits for their NQF level).
            if (
              (HANDBOOK_COSCHEDULABLE.has(codes[i]) && HANDBOOK_COSCHEDULABLE.has(codes[j])) ||
              isSplitCreditCompanion(codes[i], codes[j])
            ) {
              continue;
            }

            issues.push(
              buildIssue(nextId(), {
                severity: "blocker",
                category: "schedule",
                title: `Timetable clash: ${codes[i]} and ${codes[j]}`,
                message: `${codes[i]} and ${codes[j]} are both scheduled on ${day} Period ${period} (${timeLabel}) in ${term}. Move one course to a different semester.`,
                relatedTerm: term,
              }),
            );
          }
        }
      });

      // If there is a confirmed clash, also flag courses with no time data
      // so the student knows to verify manually.
      if (hasConfirmedClash) {
        entries
          .filter(({ slots }) => slots.length === 0)
          .forEach(({ code }) => {
            issues.push(
              buildIssue(nextId(), {
                severity: "info",
                category: "schedule",
                title: `Lecture time unconfirmed — ${code}`,
                message: `${code} has no parseable lecture time in the handbook. Verify manually that it does not clash with other courses in ${term}.`,
                relatedTerm: term,
              }),
            );
          });
      }
    });
  }

  const scheduleByDay = new Map<string, ScheduleItem[]>();
  scheduleItems.forEach((item) => {
    const dayItems = scheduleByDay.get(item.day) ?? [];
    dayItems.push(item);
    scheduleByDay.set(item.day, dayItems);
  });

  scheduleByDay.forEach((dayItems, day) => {
    const parsedDayItems = dayItems
      .map((item) => ({
        item,
        startMinutes: parseTimeToMinutes(item.startTime),
        endMinutes: parseTimeToMinutes(item.endTime),
      }))
      .sort((a, b) => {
        const aStart = a.startMinutes ?? Number.MAX_SAFE_INTEGER;
        const bStart = b.startMinutes ?? Number.MAX_SAFE_INTEGER;
        return aStart - bStart;
      });

    parsedDayItems.forEach(({ item, startMinutes, endMinutes }) => {
      if (startMinutes === null || endMinutes === null) {
        issues.push(
          buildIssue(nextId(), {
            severity: "warning",
            category: "schedule",
            title: `Invalid time format in ${item.courseCode}`,
            message: `${item.courseCode} has invalid time values (${item.startTime}-${item.endTime}). Use HH:MM.`,
            relatedCourseCode: item.courseCode,
          }),
        );
        return;
      }

      if (endMinutes <= startMinutes) {
        issues.push(
          buildIssue(nextId(), {
            severity: "blocker",
            category: "schedule",
            title: `Invalid session range for ${item.courseCode}`,
            message: `${item.courseCode} has an end time earlier than or equal to start time on ${day}.`,
            relatedCourseCode: item.courseCode,
          }),
        );
      }
    });

    for (let i = 0; i < parsedDayItems.length; i += 1) {
      const current = parsedDayItems[i];
      if (current.startMinutes === null || current.endMinutes === null) {
        continue;
      }

      for (let j = i + 1; j < parsedDayItems.length; j += 1) {
        const candidate = parsedDayItems[j];
        if (candidate.startMinutes === null || candidate.endMinutes === null) {
          continue;
        }

        if (candidate.startMinutes >= current.endMinutes) {
          break;
        }

        issues.push(
          buildIssue(nextId(), {
            severity: "blocker",
            category: "schedule",
            title: `Time conflict on ${day}`,
            message: `${current.item.courseCode} (${current.item.startTime}-${current.item.endTime}) overlaps with ${candidate.item.courseCode} (${candidate.item.startTime}-${candidate.item.endTime}).`,
            relatedCourseCode: current.item.courseCode,
          }),
        );
      }
    }

    const duplicateKeyCount = new Map<string, number>();
    dayItems.forEach((item) => {
      const key = `${item.courseCode}|${item.type}|${item.day}|${item.startTime}|${item.endTime}`;
      duplicateKeyCount.set(key, (duplicateKeyCount.get(key) ?? 0) + 1);
    });

    duplicateKeyCount.forEach((count, key) => {
      if (count < 2) {
        return;
      }

      const [courseCode, type, scheduleDay, startTime, endTime] =
        key.split("|");
      issues.push(
        buildIssue(nextId(), {
          severity: "warning",
          category: "schedule",
          title: `Duplicate session detected for ${courseCode}`,
          message: `${count} duplicate ${type} sessions are scheduled on ${scheduleDay} at ${startTime}-${endTime}.`,
          relatedCourseCode: courseCode,
        }),
      );
    });

    const totalMinutes = parsedDayItems.reduce((sum, entry) => {
      if (entry.startMinutes === null || entry.endMinutes === null) {
        return sum;
      }
      return sum + Math.max(0, entry.endMinutes - entry.startMinutes);
    }, 0);

    const totalHours = totalMinutes / 60;
    if (totalHours > MAX_DAILY_SCHEDULE_HOURS) {
      issues.push(
        buildIssue(nextId(), {
          severity: "warning",
          category: "schedule",
          title: `Heavy day load on ${day}`,
          message: `${day} has ${totalHours.toFixed(1)} scheduled hours. Recommended max is ${MAX_DAILY_SCHEDULE_HOURS} hours.`,
        }),
      );
    }
  });

  const inProgressCodesWithoutSchedule = inProgressCourses
    .map((course) => course.code)
    .filter(
      (code) =>
        !scheduleItems.some(
          (session) => session.courseCode.toUpperCase() === code,
        ),
    );

  inProgressCodesWithoutSchedule.forEach((code) => {
    issues.push(
      buildIssue(nextId(), {
        severity: "warning",
        category: "schedule",
        title: `No timetable sessions found for ${code}`,
        message: `${code} is in progress but has no linked class/tutorial/lab in your schedule.`,
        relatedCourseCode: code,
      }),
    );
  });

  // ── Major combination validation ─────────────────────────────────────────
  // For each combination the student is enrolled in, check that all required
  // courses are covered by completed, in-progress, or planned courses.
  if (majorCombinations && studentCombinationIds && studentCombinationIds.length > 0) {
    studentCombinationIds.forEach((combId) => {
      const combination = majorCombinations.find((c) => c.id === combId);
      if (!combination) {
        issues.push(
          buildIssue(nextId(), {
            severity: "info",
            category: "major-combination",
            title: `Unknown combination: ${combId}`,
            message: `Combination ${combId} is not in the registry. Verify your enrolled stream with the faculty.`,
          }),
        );
        return;
      }

      const missingRequired = combination.requiredCourseCodes.filter(
        (code) => !allKnownCodes.has(code),
      );

      missingRequired.forEach((missingCode) => {
        issues.push(
          buildIssue(nextId(), {
            severity: "warning",
            category: "major-combination",
            title: `Missing required course for ${combination.major} (Year ${combination.year})`,
            message: `${missingCode} is required for your ${combination.major} Year ${combination.year} stream (${combId}) but is not in your completed, in-progress, or planned courses.`,
            relatedCourseCode: missingCode,
          }),
        );
      });
    });
  }

  const blockers = issues.filter(
    (issue) => issue.severity === "blocker",
  ).length;
  const warnings = issues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  const infos = issues.filter((issue) => issue.severity === "info").length;

  return {
    issues,
    summary: {
      blockers,
      warnings,
      infos,
    },
    creditsCompleted,
    creditsInProgress,
    creditsPlanned,
    projectedCredits,
    creditShortfall,
    isProjectedGraduationEligible: blockers === 0 && creditShortfall === 0,
  };
}
