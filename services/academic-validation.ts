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
    addTermCredits(termFromPlannedCourse(course), course.credits);
  });
  completedCourses.forEach((course) => {
    addTermCredits(termFromRecordSemester(course.semester), course.credits);
  });
  inProgressCourses.forEach((course) => {
    addTermCredits(termFromRecordSemester(course.semester), course.credits);
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
  });

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
