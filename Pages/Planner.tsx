import MainLayout from "@/components/main-layout";
import {
    getCrossMajorFacultySlugs,
    getPrimaryFacultySlug,
} from "@/constants/faculty";
import { theme } from "@/constants/theme";
import { buildGuidanceTrustMessage } from "@/hooks/use-logged-in-user";
import { generateAutoGraduationPlans } from "@/services/academic-path-planner";
import { academicRepository } from "@/services/academic-repository";
import { validateAcademicPlan } from "@/services/academic-validation";
import type {
    AutoGraduationPlan,
    CompletedCourseRecord,
    PlannerCourseStatus as CourseStatus,
    InProgressCourseRecord,
    MajorCombination,
    PlannedCourse,
    ScheduleItem,
} from "@/types/academic";
import React, { useEffect, useMemo, useState } from "react";
import {
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

const semesters = academicRepository.getPlannerSemesters();

import type { CourseCatalogEntry as Course } from "@/services/academic-repository";
import {
    collectScienceDepartmentCourses,
    extractScienceHandbookRules,
    getHandbookCourses,
    getHandbookMajors,
    getScienceCourses,
    getScienceMajors,
    getStudentPlan,
    getStudentSchedule,
    type HandbookPlannerPolicy,
    type HandbookRuleValidationIssue,
    type HandbookRuleValidationResponse,
    type ScienceMajorCombination,
    type ScienceMajorEntry,
    updateStudentPlan,
    validatePlanAgainstHandbookRules,
    validateSciencePlanAgainstRules,
} from "@/services/backend-api";
import {
    getIssueActionHint,
    getIssueActionTarget,
} from "@/services/remediation-actions";
import { useRouter } from "expo-router";
import {
  type PdfDocType,
  type PlanPdfData,
  type PdfCourse,
  type PdfYear,
  type PdfSemester,
  downloadPlanPdf,
} from "@/services/plan-pdf";
import {
  computeCourseRisks,
  computeDpRequirements,
  type RiskLevel,
} from "@/services/risk-engine";

const TARGET_DEPARTMENTS = [
  "Archaeology",
  "Astronomy",
  "Biological Sciences",
  "Chemistry",
  "Computer Science",
  "Environmental and Geographical Science",
  "Geological Sciences",
  "Mathematics and Applied Mathematics",
  "Molecular and Cell Biology",
  "Oceanography",
  "Physics",
  "Statistical Sciences",
];
const TARGET_HANDBOOK = "2026 Science-Handbook-UCT";
const courseLevelFilters = ["All Years", "Year 1", "Year 2", "Year 3"] as const;
const MVP_BLOCKER_PREVENTION_TARGET = 0.95;
const MVP_CITATION_TARGET = 0.9;

type CourseLevelFilter = (typeof courseLevelFilters)[number];

const availableYears = academicRepository.getPlannerYears();

const degreeRequirements = academicRepository.getDegreeRequirements();

function buildPlanSnapshot(courses: PlannedCourse[], majors: string[]): string {
  return JSON.stringify({
    courses: courses.map((course) => ({
      code: course.code,
      year: course.year,
      semester: course.semester,
      credits: course.credits,
      status: course.status,
    })),
    majors,
  });
}

interface PlannerProps {
  studentNumber?: string;
  studentName?: string;
  degreeName?: string;
  currentYearNumber?: number;
  registeredMajors?: string[];
  completedCourses?: Array<{
    code: string;
    title: string;
    credits: number;
    semester: string;
    passed?: boolean;
    grade?: number;
  }>;
  inProgressCourses?: Array<{
    code: string;
    title: string;
    credits: number;
    semester: string;
  }>;
  plannedCourses?: Array<{
    code: string;
    title: string;
    credits: number;
    semester: string;
    nqfLevel: 5 | 6 | 7;
    year?: string;
  }>;
}

interface MajorRequirementGap {
  id: string;
  majorName: string;
  code: string;
  title: string;
  missingPrereqCodes: string[];
  recommendedYear?: string;
  recommendedSemester?: string;
}

/**
 * Converts handbook semester labels into the canonical values the planner
 * expects: "Semester 1", "Semester 2", or "FY".
 *
 * Courses offered in both semesters ("First or Second Semester (F/S)") are
 * mapped to "FY" so the planner can schedule them in whichever term fits.
 */
function normalizeSemesterLabel(raw: string): string {
  const s = (raw ?? "").trim().toLowerCase();

  // Both semesters / flexible offering → treat as full-year so planner can use either term
  if (
    s.includes("first or second") ||
    s.includes("first semester, second semester") ||
    s.includes("f/s")
  ) return "FY";

  // First Semester
  if (s.startsWith("first semester") || s === "semester 1" || /semester\s*1/.test(s)) return "Semester 1";

  // Second Semester
  if (s.startsWith("second semester") || s === "semester 2" || /semester\s*2/.test(s)) return "Semester 2";

  // Full year / half year
  if (
    s === "fy" ||
    s.startsWith("full year") ||
    s.startsWith("year course") ||
    s.startsWith("second half") ||
    s.startsWith("preliminary block")
  ) return "FY";

  return raw;
}

function normalizeMajorComparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function parsePrerequisiteCodes(text: string): string[] {
  const matches = text.match(/[A-Z]{3,4}\d{4}(?:[A-Z](?:\/[A-Z]){0,3})?/g);
  return matches
    ? Array.from(new Set(matches.map((code) => code.toUpperCase())))
    : [];
}

/**
 * Returns true if the given course code is satisfied by any entry in the
 * known-codes set. Handles three forms:
 *
 *   Slash-notation:  "CSC1015F/S"    → checks "CSC1015F/S", "CSC1015F", "CSC1015S"
 *                    "STA1000F/S/P/L" → checks each suffix variant
 *   X-pattern:       "STA100XF/S"    → matches any known code like "STA1000F",
 *                                      "STA1007S" (X = any digit, same as backend)
 *   Exact:           "CSC2001F"      → checks "CSC2001F" only
 */
function isCodeSatisfied(code: string, known: Set<string>): boolean {
  if (known.has(code)) return true;

  // X-pattern: 'X' in the 4-digit numeric section is a wildcard digit.
  // e.g. "STA100XF/S", "STA20XXF/S/H", "MAM304XF/S"
  if (code.includes("X")) {
    const xm = code.match(/^([A-Z]{3,4})([0-9X]{4})([A-Z](?:\/[A-Z])*)$/);
    if (xm && xm[2].includes("X")) {
      const digitPattern = xm[2].replace(/X/g, "[0-9]");
      const suffixes = xm[3].split("/");
      const re = new RegExp(
        `^${xm[1]}${digitPattern}(${suffixes.join("|")})$`,
      );
      for (const k of known) {
        if (re.test(k)) return true;
      }
    }
  }

  if (!code.includes("/")) return false;
  // Slash-notation: e.g. "CSC1015F/S" → base "CSC1015", suffixes ["F","S"]
  const compoundStart = code.search(/[A-Z](?:\/[A-Z])+$/);
  if (compoundStart === -1) return false;
  const base = code.slice(0, compoundStart);
  const suffixes = code.slice(compoundStart).split("/");
  return suffixes.some((s) => known.has(`${base}${s}`));
}

function getCombinationRequiredCodes(
  combination: ScienceMajorCombination,
): string[] {
  const fromRequiredCore = combination.required_core.map((course) =>
    course.code.trim().toUpperCase(),
  );
  const fromCourses = combination.courses.map((course) =>
    course.code.trim().toUpperCase(),
  );

  // Prefer explicit required_core when available. Fallback to courses list.
  const source = fromRequiredCore.length > 0 ? fromRequiredCore : fromCourses;
  return Array.from(new Set(source.filter((code) => code.length > 0)));
}

/**
 * Resolves a potentially ambiguous course code (slash-notation or X-pattern)
 * to the concrete catalog codes that actually exist. Returns up to one variant
 * per suffix so the planner can look them up directly.
 *
 * Examples:
 *   "CSC1015F/S" + catalog{"CSC1015F","CSC1015S"} → ["CSC1015F","CSC1015S"]
 *   "STA100XF/S" + catalog{"STA1000F","STA1007S"} → ["STA1000F","STA1007S"]
 *   "CSC2001F"   + catalog{"CSC2001F"}             → ["CSC2001F"]
 */
function resolveCodeAgainstCatalog(
  raw: string,
  catalogCodes: Set<string>,
): string[] {
  const code = raw.trim().toUpperCase();
  if (catalogCodes.has(code)) return [code];

  // X-pattern wildcard (e.g. "STA100XF/S")
  if (code.includes("X")) {
    const xm = code.match(/^([A-Z]{3,4})([0-9X]{4})([A-Z](?:\/[A-Z])*)$/);
    if (xm && xm[2].includes("X")) {
      const digitPattern = xm[2].replace(/X/g, "[0-9]");
      const suffixes = xm[3].split("/");
      const re = new RegExp(
        `^${xm[1]}${digitPattern}(${suffixes.join("|")})$`,
      );
      const matches = Array.from(catalogCodes).filter((k) => re.test(k));
      if (matches.length > 0) return matches;
    }
  }

  // Slash-notation (e.g. "CSC1015F/S" → try "CSC1015F" and "CSC1015S")
  if (code.includes("/")) {
    const compoundStart = code.search(/[A-Z](?:\/[A-Z])+$/);
    if (compoundStart !== -1) {
      const base = code.slice(0, compoundStart);
      const suffixes = code.slice(compoundStart).split("/");
      const resolved = suffixes
        .map((s) => `${base}${s}`)
        .filter((c) => catalogCodes.has(c));
      if (resolved.length > 0) return resolved;
    }
  }

  // No catalog match found — return the raw code so it shows as unresolved
  return [code];
}

function buildLiveMajorCombinations(
  entries: ScienceMajorEntry[],
  catalogCodes: Set<string>,
): MajorCombination[] {
  const result: MajorCombination[] = [];
  for (const entry of entries) {
    for (const yearData of entry.years) {
      for (const combo of yearData.combinations) {
        const rawRequired = getCombinationRequiredCodes(combo);
        const requiredCodes = Array.from(
          new Set(
            rawRequired.flatMap((c) =>
              resolveCodeAgainstCatalog(c, catalogCodes),
            ),
          ),
        );

        const rawElectives = [
          ...combo.choose_one_of,
          ...combo.choose_two_of,
          ...combo.choose_three_of,
        ]
          .map((c) => c.code.trim().toUpperCase())
          .filter((c) => c.length > 0);
        const electiveCodes = Array.from(
          new Set(
            rawElectives.flatMap((c) =>
              resolveCodeAgainstCatalog(c, catalogCodes),
            ),
          ),
        );

        result.push({
          id: combo.combination_id || `${entry.major_code}-Y${yearData.year}`,
          major: entry.major_name,
          year: yearData.year,
          requiredCourseCodes: requiredCodes,
          suggestedElectiveCodes: electiveCodes,
        });
      }
    }
  }
  return result;
}

function getDetectedYear(currentYearNumber?: number) {
  const normalizedYear = Number.isFinite(currentYearNumber)
    ? Math.max(1, Math.trunc(currentYearNumber as number))
    : 1;
  return (
    availableYears.find((year) => year === `Year ${normalizedYear}`) ??
    availableYears[0]
  );
}

export default function Planner({
  studentNumber,
  studentName = "Student",
  degreeName = "BSc",
  currentYearNumber,
  registeredMajors: registeredMajorsProp = [],
  completedCourses: completedCoursesProp = [],
  inProgressCourses: inProgressCoursesProp = [],
  plannedCourses: plannedCoursesProp = [],
}: PlannerProps) {
  const primaryFacultySlug = getPrimaryFacultySlug();
  const router = useRouter();
  const detectedYear = getDetectedYear(currentYearNumber);
  const [catalog, setCatalog] = useState<Course[]>([]);
  const [activeGroup, setActiveGroup] =
    useState<CourseLevelFilter>("All Years");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [courseSearch, setCourseSearch] = useState("");
  React.useEffect(() => {
    let isMounted = true;
    const loadHandbookCourses = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);
        const baselineResponse = await getHandbookCourses({
          faculty_slug: primaryFacultySlug,
        }).catch(() => getScienceCourses());

        let sourceCourses = baselineResponse.courses;
        if (primaryFacultySlug === "science") {
          const departmentResponses = await Promise.allSettled(
            TARGET_DEPARTMENTS.map((department) =>
              collectScienceDepartmentCourses({
                department,
                handbook_title: TARGET_HANDBOOK,
                run_id: baselineResponse.run_id,
              }),
            ),
          );
          const successfulResponses = departmentResponses
            .filter((item) => item.status === "fulfilled")
            .map((item) => (item as PromiseFulfilledResult<any>).value);
          const mergedDepartmentCourses = successfulResponses.flatMap(
            (response) => response.courses,
          );
          sourceCourses =
            mergedDepartmentCourses.length > 0
              ? mergedDepartmentCourses
              : baselineResponse.courses;
        }

        const normalized = sourceCourses.map((course: any) => ({
          id: course.id,
          code: course.code,
          title: course.title,
          group: course.group,
          credits: course.credits,
          nqf_level: course.nqf_level,
          semester: normalizeSemesterLabel(course.semester ?? ""),
          department: course.department,
          delivery: course.delivery,
          prerequisites: course.prerequisites,
          description: course.description,
          outcomes: course.outcomes,
          convener_details: course.convener_details,
          entry_requirements: course.entry_requirements,
          outline_details: course.outline_details,
          lecture_times: course.lecture_times,
        }));

        const uniqueByCode = Array.from(
          new Map(normalized.map((course) => [course.code, course])).values(),
        );

        if (isMounted) {
          setCatalog(uniqueByCode);
        }
      } catch (error) {
        if (isMounted) setLoadError("Unable to load courses.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    loadHandbookCourses();
    return () => {
      isMounted = false;
    };
  }, [primaryFacultySlug]);
  // Auto-select semester based on current month
  const getDetectedSemester = () => {
    const month = new Date().getMonth() + 1; // JS months are 0-based
    return month <= 6 ? semesters[0] : semesters[1];
  };
  const [selectedYear, setSelectedYear] = useState(detectedYear);
  const [selectedSemester, setSelectedSemester] = useState(
    getDetectedSemester(),
  );
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [isCourseDropdownOpen, setIsCourseDropdownOpen] = useState(false);

  const catalogTitleByCode = useMemo(
    () =>
      new Map(
        catalog.map((course) => [
          course.code.trim().toUpperCase(),
          course.title,
        ]),
      ),
    [catalog],
  );

  const seededPlannerCourses = useMemo<PlannedCourse[]>(
    () =>
      plannedCoursesProp.map((course, index) => {
        const rawSem = course.semester.toUpperCase().trim();
        const wholeYear =
          rawSem === "H" || rawSem === "W"
            ? rawSem
            : rawSem.startsWith("FY") || rawSem.includes("FULL YEAR")
              ? "H"
              : /([HW])\d*$/.exec(course.code.toUpperCase())?.[1];
        return {
          id: `seed-planned-${index}-${course.code}`,
          code: course.code,
          name: course.title,
          credits: course.credits,
          year:
            course.year ??
            `Year ${Math.min(Math.max(course.nqfLevel - 4, 1), 4)}`,
          semester:
            rawSem.includes("S2") || rawSem.includes("SEM 2")
              ? "Semester 2"
              : "Semester 1",
          semesterCode: wholeYear ?? undefined,
          status: "Planned" as const,
        };
      }),
    [plannedCoursesProp],
  );

  const registeredMajors = useMemo(
    () =>
      Array.from(new Set(registeredMajorsProp.map((major) => major.trim())))
        .filter((major) => major.length > 0)
        .sort(),
    [registeredMajorsProp],
  );

  const [courses, setCourses] = useState<PlannedCourse[]>([]);
  const [autoPlans, setAutoPlans] = useState<AutoGraduationPlan[]>([]);
  const [showAutoPlans, setShowAutoPlans] = useState(false);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [hasHydratedPlan, setHasHydratedPlan] = useState(false);
  const [lastPersistedSnapshot, setLastPersistedSnapshot] = useState("");
  const [warningAcknowledgementKey, setWarningAcknowledgementKey] =
    useState("");
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [planSyncError, setPlanSyncError] = useState<string | null>(null);
  const [planSyncNotice, setPlanSyncNotice] = useState<string | null>(null);
  const [saveAttemptCount, setSaveAttemptCount] = useState(0);
  const [blockerSaveAttemptCount, setBlockerSaveAttemptCount] = useState(0);
  const [blockedByGateCount, setBlockedByGateCount] = useState(0);
  const [planLastSyncedAt, setPlanLastSyncedAt] = useState<string | null>(null);
  const [isPlannerFallbackMode, setIsPlannerFallbackMode] = useState(false);
  const [isPlannerBackendUnavailable, setIsPlannerBackendUnavailable] =
    useState(false);
  const [scienceMajorsCatalog, setScienceMajorsCatalog] = useState<
    ScienceMajorEntry[]
  >([]);
  const [manualMajorPathwayLocks, setManualMajorPathwayLocks] = useState<
    Record<string, Record<string, string>>
  >({});
  const [majorRulesError, setMajorRulesError] = useState<string | null>(null);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);

  useEffect(() => {
    let isMounted = true;

    if (!studentNumber) {
      setCourses(seededPlannerCourses);
      setHasHydratedPlan(true);
      setPlanLastSyncedAt(null);
      setIsPlannerFallbackMode(true);
      setIsPlannerBackendUnavailable(false);
      setLastPersistedSnapshot(
        buildPlanSnapshot(seededPlannerCourses, registeredMajors),
      );
      setWarningAcknowledgementKey("");
      setPlanSyncError(null);
      setPlanSyncNotice(null);
      return () => {
        isMounted = false;
      };
    }

    setHasHydratedPlan(false);
    setIsPlannerBackendUnavailable(false);
    setPlanSyncError(null);
    setPlanSyncNotice(null);

    getStudentPlan({ student_number: studentNumber })
      .then((response) => {
        if (!isMounted) {
          return;
        }

        if (
          !response.planned_courses ||
          response.planned_courses.length === 0
        ) {
          setCourses(seededPlannerCourses);
          setHasHydratedPlan(true);
          setPlanLastSyncedAt(
            response.updated_at_iso ?? new Date().toISOString(),
          );
          setIsPlannerFallbackMode(true);
          setIsPlannerBackendUnavailable(false);
          setLastPersistedSnapshot(
            buildPlanSnapshot(seededPlannerCourses, registeredMajors),
          );
          setWarningAcknowledgementKey("");
          return;
        }

        const hydratedCourses = response.planned_courses.map(
          (course, index) => ({
            id: `persisted-${index}-${course.code}-${course.year}-${course.semester}`,
            code: course.code,
            name:
              catalogTitleByCode.get(course.code.trim().toUpperCase()) ??
              course.code,
            credits: course.credits,
            year: course.year,
            semester: course.semester,
            status: "Planned" as CourseStatus,
          }),
        );

        setCourses(hydratedCourses);
        setHasHydratedPlan(true);
        setPlanLastSyncedAt(
          response.updated_at_iso ?? new Date().toISOString(),
        );
        setIsPlannerFallbackMode(false);
        setIsPlannerBackendUnavailable(false);
        setLastPersistedSnapshot(
          buildPlanSnapshot(hydratedCourses, registeredMajors),
        );
        setWarningAcknowledgementKey("");
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setCourses(seededPlannerCourses);
        setHasHydratedPlan(true);
        setPlanLastSyncedAt(null);
        setIsPlannerFallbackMode(true);
        setIsPlannerBackendUnavailable(true);
        setLastPersistedSnapshot(
          buildPlanSnapshot(seededPlannerCourses, registeredMajors),
        );
        setWarningAcknowledgementKey("");
        setPlanSyncError(
          "Could not load your saved planner data. Using local seeded plan.",
        );
      });

    return () => {
      isMounted = false;
    };
  }, [
    catalogTitleByCode,
    studentNumber,
    seededPlannerCourses,
    registeredMajors,
  ]);

  useEffect(() => {
    if (catalogTitleByCode.size === 0) {
      return;
    }

    setCourses((previousCourses) =>
      previousCourses.map((course) => {
        const normalizedCode = course.code.trim().toUpperCase();
        const catalogTitle = catalogTitleByCode.get(normalizedCode);

        if (!catalogTitle || course.name === catalogTitle) {
          return course;
        }

        return {
          ...course,
          name: catalogTitle,
        };
      }),
    );
  }, [catalogTitleByCode]);

  useEffect(() => {
    let isMounted = true;

    if (registeredMajors.length === 0) {
      setScienceMajorsCatalog([]);
      setMajorRulesError(null);
      return () => {
        isMounted = false;
      };
    }

    const loadMajorCatalog = async () => {
      const seen = new Set<string>();
      const merged: ScienceMajorEntry[] = [];

      const responses = await Promise.allSettled([
        getHandbookMajors({ faculty_slug: primaryFacultySlug }).catch(() =>
          getScienceMajors(),
        ),
        ...getCrossMajorFacultySlugs().map((facultySlug) =>
          getHandbookMajors({ faculty_slug: facultySlug }),
        ),
      ]);

      for (const item of responses) {
        if (item.status !== "fulfilled") {
          continue;
        }
        for (const major of item.value.majors ?? []) {
          const key = `${major.major_code}|${major.major_name}`.toUpperCase();
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          merged.push(major);
        }
      }

      return merged;
    };

    loadMajorCatalog()
      .then((majors) => {
        if (!isMounted) {
          return;
        }
        setScienceMajorsCatalog(majors);
        setMajorRulesError(null);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }
        setScienceMajorsCatalog([]);
        setMajorRulesError(
          "Could not load major pathway rules. Major completion checks are temporarily unavailable.",
        );
      });

    return () => {
      isMounted = false;
    };
  }, [registeredMajors, primaryFacultySlug]);

  // Fetch student schedule for clash detection in the current term.
  useEffect(() => {
    if (!studentNumber) return;
    let isMounted = true;

    getStudentSchedule({ student_number: studentNumber })
      .then((response) => {
        if (!isMounted) return;
        const items: ScheduleItem[] = (response.sessions ?? [])
          .filter((s) => s.course_code && s.day && s.start_time && s.end_time)
          .map((s) => ({
            id: s.id,
            courseCode: (s.course_code ?? "").toUpperCase(),
            courseName: s.title,
            type: "Class" as const,
            day: s.day,
            startTime: s.start_time,
            endTime: s.end_time,
            location: s.location ?? "",
          }));
        setScheduleItems(items);
      })
      .catch(() => {
        // Schedule is optional — clash detection just won't fire without it.
      });

    return () => {
      isMounted = false;
    };
  }, [studentNumber]);

  const completedCourseRecords = useMemo<CompletedCourseRecord[]>(
    () =>
      completedCoursesProp
        .filter((course) => course.passed === true)
        .map((course, index) => ({
          id: `completed-${index}-${course.code}`,
          code: course.code,
          title: course.title,
          credits: course.credits,
          grade: typeof course.grade === "number" ? `${course.grade}%` : "Pass",
          gpa: typeof course.grade === "number" ? course.grade : 0,
          semester: course.semester,
        })),
    [completedCoursesProp],
  );

  const inProgressCourseRecords = useMemo<InProgressCourseRecord[]>(
    () =>
      inProgressCoursesProp.map((course, index) => ({
        id: `inprogress-${index}-${course.code}`,
        code: course.code,
        title: course.title,
        credits: course.credits,
        currentGrade: "-",
        status: 50,
        semester: course.semester,
      })),
    [inProgressCoursesProp],
  );

  // Fixed courses = completed (passed) + in-progress, shown in the semester
  // grid as irremovable chips. Year is inferred from the course code digit.
  const fixedCourses = useMemo<PlannedCourse[]>(() => {
    const normSem = (sem: string) =>
      sem.toUpperCase().includes("S2") || sem.toUpperCase().includes("SEM 2")
        ? "Semester 2"
        : "Semester 1";

    const wholeYearCode = (sem: string, code?: string): string | undefined => {
      const raw = sem.toUpperCase().trim();
      // Explicit semester code
      if (raw === "H" || raw === "W") return raw;
      // "FY" = Full Year (used in mock/backend data)
      if (raw.startsWith("FY") || raw.includes("FULL YEAR")) return "H";
      // Fall back to the UCT course code suffix (e.g. MAM1043H, MAM1000W)
      if (code) {
        const suffix = code.toUpperCase().match(/([HW])\d*$/);
        if (suffix) return suffix[1];
      }
      return undefined;
    };

    const yearFromSemester = (sem: string): string => {
      const m = sem.match(/Year\s*(\d+)/i);
      return m ? `Year ${m[1]}` : "Year 1";
    };

    const completed = completedCourseRecords.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.title,
      credits: r.credits,
      year: yearFromSemester(r.semester),
      semester: normSem(r.semester),
      semesterCode: wholeYearCode(r.semester, r.code),
      status: "Completed" as CourseStatus,
    }));

    const inProgress = inProgressCourseRecords.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.title,
      credits: r.credits,
      year: yearFromSemester(r.semester),
      semester: normSem(r.semester),
      semesterCode: wholeYearCode(r.semester, r.code),
      status: "In Progress" as CourseStatus,
    }));

    return [...completed, ...inProgress];
  }, [completedCourseRecords, inProgressCourseRecords]);

  const [handbookRuleValidation, setHandbookRuleValidation] =
    useState<HandbookRuleValidationResponse | null>(null);
  const [handbookRuleError, setHandbookRuleError] = useState<string | null>(
    null,
  );
  const [isHandbookValidationLoading, setIsHandbookValidationLoading] =
    useState(false);
  const [handbookPlannerPolicy, setHandbookPlannerPolicy] =
    useState<HandbookPlannerPolicy | null>(null);

  useEffect(() => {
    setSelectedYear(detectedYear);
  }, [detectedYear]);

  const hasPlannerCourses = courses.length > 0;
  const hasPlannerInputs = hasPlannerCourses || registeredMajors.length > 0;

  const yearCourses = useMemo(
    () => [
      ...fixedCourses.filter((c) => c.year === selectedYear),
      ...courses.filter((c) => c.year === selectedYear),
    ],
    [courses, fixedCourses, selectedYear],
  );

  // Set of IDs from user-added planned courses — used to determine whether
  // a chip in the grid should show a remove button (fixedCourses cannot be removed).
  const plannedCourseIdSet = useMemo(
    () => new Set(courses.map((c) => c.id)),
    [courses],
  );

  // Helper to determine if user is postgrad (simple check: currentYearNumber > 4)
  const isPostgrad = (currentYearNumber ?? 1) > 4;

  // Helper to extract course year from code or group
  function getCourseYear(course: Course) {
    if (course.group) {
      const match = course.group.match(/Year (\d+)/i);
      if (match && match[1]) {
        return parseInt(match[1], 10);
      }
    }
    if (course.code) {
      const match = course.code.match(/\d{4}/);
      if (match && match[0]) {
        const yearDigit = match[0][0];
        return parseInt(yearDigit, 10);
      }
    }
    return 1;
  }

  function isCoursePostgrad(course: Course) {
    return getCourseYear(course) >= 4;
  }

  const getYearNumber = (year: string) => {
    const match = year.match(/\d+/);
    return match ? Number(match[0]) : 1;
  };

  const getSemesterNumber = (semester: string) =>
    semester === "Semester 1" ? 1 : 2;

  function getCourseSemesterCode(course: Course): string {
    if (course.semester && /^(F|S|F\/S|H|W|L|P|Z)$/i.test(course.semester)) {
      return course.semester.toUpperCase();
    }
    if (course.code && /[FSHWLPZ]$/i.test(course.code)) {
      const suffix = course.code.slice(-1).toUpperCase();
      if (["F", "S", "H", "W", "L", "P", "Z"].includes(suffix)) {
        return suffix;
      }
    }
    return "";
  }

  function isCourseAvailableInSemester(course: Course, semester: string) {
    const semCode = getCourseSemesterCode(course);

    if (["F", "H", "W", "L"].includes(semCode)) {
      return semester === "Semester 1";
    }

    if (["S", "P"].includes(semCode)) {
      return semester === "Semester 2";
    }

    if (["Z", "F/S"].includes(semCode)) {
      return semester === "Semester 1" || semester === "Semester 2";
    }

    return true;
  }

  function canAddCourseToTerm(course: Course, year: string, semester: string) {
    if (!isCourseAvailableInSemester(course, semester)) {
      return false;
    }

    const courseYear = getCourseYear(course);
    const selectedYearNum = getYearNumber(year);
    if (courseYear === 1 && !(selectedYearNum >= 1 && selectedYearNum <= 4))
      return false;
    if (courseYear === 2 && !(selectedYearNum >= 2 && selectedYearNum <= 4))
      return false;
    if (courseYear === 3 && !(selectedYearNum >= 3 && selectedYearNum <= 4))
      return false;
    if (isCoursePostgrad(course) && !isPostgrad) return false;

    return true;
  }

  function canDisplayCourseInPicker(course: Course) {
    const courseYear = getCourseYear(course);
    if (courseYear < 1 || courseYear > 3) {
      return false;
    }

    if (!isCourseAvailableInSemester(course, selectedSemester)) {
      return false;
    }

    if (activeGroup !== "All Years" && course.group !== activeGroup) {
      return false;
    }

    if (isCoursePostgrad(course) && !isPostgrad) return false;

    return true;
  }

  function cycleMajorPathwayLock(
    majorName: string,
    yearLabel: string,
    options: string[],
  ) {
    if (options.length === 0) {
      return;
    }

    setManualMajorPathwayLocks((prev) => {
      const current =
        prev[majorName]?.[yearLabel] ??
        selectedMajorPathways[majorName]?.[yearLabel] ??
        options[0];
      const currentIndex = options.indexOf(current);
      const nextValue = options[(currentIndex + 1) % options.length];

      const next = { ...prev };
      const rows = { ...(next[majorName] ?? {}) };
      rows[yearLabel] = nextValue;
      next[majorName] = rows;
      return next;
    });
  }

  function clearMajorPathwayLock(majorName: string, yearLabel: string) {
    setManualMajorPathwayLocks((prev) => {
      if (!prev[majorName]?.[yearLabel]) {
        return prev;
      }

      const next = { ...prev };
      const rows = { ...(next[majorName] ?? {}) };
      delete rows[yearLabel];
      if (Object.keys(rows).length === 0) {
        delete next[majorName];
      } else {
        next[majorName] = rows;
      }
      return next;
    });
  }

  function getTermIndex(year: string, semester: string): number {
    return (getYearNumber(year) - 1) * 2 + getSemesterNumber(semester);
  }

  const visibleCourses = useMemo(
    () =>
      catalog
        .filter((course) =>
          courseSearch.trim() === ""
            ? true
            : course.title.toLowerCase().includes(courseSearch.toLowerCase()) ||
              course.code.toLowerCase().includes(courseSearch.toLowerCase()),
        )
        .filter((course) => canDisplayCourseInPicker(course)),
    [catalog, activeGroup, courseSearch, selectedSemester, isPostgrad],
  );

  const majorRequirementGaps = useMemo<MajorRequirementGap[]>(() => {
    if (registeredMajors.length === 0 || scienceMajorsCatalog.length === 0) {
      return [];
    }

    const progressionYear = Math.min(
      Math.max(Math.trunc(currentYearNumber ?? 1), 1),
      4,
    );

    const knownCodes = new Set<string>([
      ...completedCourseRecords.map((course) =>
        course.code.trim().toUpperCase(),
      ),
      ...inProgressCourseRecords.map((course) =>
        course.code.trim().toUpperCase(),
      ),
      ...courses.map((course) => course.code.trim().toUpperCase()),
    ]);

    const catalogByCode = new Map(
      catalog.map((course) => [course.code.trim().toUpperCase(), course]),
    );

    const recommendationForCode = (code: string) => {
      const catalogCourse = catalogByCode.get(code);
      if (!catalogCourse) {
        return null;
      }

      for (const year of availableYears) {
        for (const semester of semesters) {
          if (isPastTerm(year, semester)) {
            continue;
          }
          if (!canAddCourseToTerm(catalogCourse, year, semester)) {
            continue;
          }

          const currentTermCredits = [...courses, ...fixedCourses]
            .filter(
              (course) => course.year === year && course.semester === semester,
            )
            .reduce((sum, course) => sum + course.credits, 0);
          const policyCap = handbookPlannerPolicy?.max_term_credits ?? 72;

          if (currentTermCredits + catalogCourse.credits > policyCap) {
            continue;
          }

          return {
            year,
            semester,
          };
        }
      }

      return null;
    };

    const gaps: MajorRequirementGap[] = [];
    const selectedTermIndex = getTermIndex(selectedYear, selectedSemester);

    registeredMajors.forEach((registeredMajor) => {
      const majorComparable = normalizeMajorComparable(registeredMajor);
      const matchingMajor = scienceMajorsCatalog.find((major) => {
        const candidate = normalizeMajorComparable(major.major_name);
        return (
          candidate === majorComparable ||
          candidate.includes(majorComparable) ||
          majorComparable.includes(candidate)
        );
      });

      if (!matchingMajor) {
        return;
      }

      const applicableYears = matchingMajor.years
        .filter((year) => year.year <= progressionYear)
        .sort((a, b) => a.year - b.year);

      applicableYears.forEach((majorYear) => {
        if (!majorYear.combinations || majorYear.combinations.length === 0) {
          return;
        }

        // Pick the combination that best matches the student's already known courses.
        const bestCombination = [...majorYear.combinations].sort((a, b) => {
          const aRequired = getCombinationRequiredCodes(a);
          const bRequired = getCombinationRequiredCodes(b);
          const aMatched = aRequired.filter((code) =>
            isCodeSatisfied(code, knownCodes),
          ).length;
          const bMatched = bRequired.filter((code) =>
            isCodeSatisfied(code, knownCodes),
          ).length;
          if (aMatched !== bMatched) {
            return bMatched - aMatched;
          }
          return aRequired.length - bRequired.length;
        })[0];

        const requiredCodes = getCombinationRequiredCodes(bestCombination);

        requiredCodes.forEach((requiredCode) => {
          if (isCodeSatisfied(requiredCode, knownCodes)) {
            return;
          }

          const catalogCourse = catalogByCode.get(requiredCode);
          const prereqs = catalogCourse
            ? parsePrerequisiteCodes(catalogCourse.prerequisites)
            : [];
          const missingPrereqCodes = prereqs.filter(
            (prereqCode) => !isCodeSatisfied(prereqCode, knownCodes),
          );

          let recommendedYear: string | undefined;
          let recommendedSemester: string | undefined;

          if (missingPrereqCodes.length === 0) {
            const recommendation = recommendationForCode(requiredCode);
            if (recommendation) {
              const recommendationIndex = getTermIndex(
                recommendation.year,
                recommendation.semester,
              );

              if (recommendationIndex >= selectedTermIndex) {
                recommendedYear = recommendation.year;
                recommendedSemester = recommendation.semester;
              }
            }
          }

          gaps.push({
            id: `${matchingMajor.major_code}-${majorYear.year}-${requiredCode}`,
            majorName: matchingMajor.major_name,
            code: requiredCode,
            title:
              catalogCourse?.title ??
              bestCombination.courses.find(
                (course) => course.code.trim().toUpperCase() === requiredCode,
              )?.title ??
              requiredCode,
            missingPrereqCodes,
            recommendedYear,
            recommendedSemester,
          });
        });
      });
    });

    return gaps.slice(0, 12);
  }, [
    catalog,
    completedCourseRecords,
    courses,
    currentYearNumber,
    fixedCourses,
    handbookPlannerPolicy,
    inProgressCourseRecords,
    registeredMajors,
    scienceMajorsCatalog,
    selectedSemester,
    selectedYear,
  ]);

  const autoSelectedMajorPathways = useMemo<
    Record<string, Record<string, string>>
  >(() => {
    if (registeredMajors.length === 0 || scienceMajorsCatalog.length === 0) {
      return {};
    }

    const progressionYear = Math.min(
      Math.max(Math.trunc(currentYearNumber ?? 1), 1),
      4,
    );

    const knownCodes = new Set<string>([
      ...completedCourseRecords.map((course) =>
        course.code.trim().toUpperCase(),
      ),
      ...inProgressCourseRecords.map((course) =>
        course.code.trim().toUpperCase(),
      ),
      ...courses.map((course) => course.code.trim().toUpperCase()),
    ]);

    const locks: Record<string, Record<string, string>> = {};

    registeredMajors.forEach((registeredMajor) => {
      const majorComparable = normalizeMajorComparable(registeredMajor);
      const matchingMajor = scienceMajorsCatalog.find((major) => {
        const candidate = normalizeMajorComparable(major.major_name);
        return (
          candidate === majorComparable ||
          candidate.includes(majorComparable) ||
          majorComparable.includes(candidate)
        );
      });

      if (!matchingMajor) {
        return;
      }

      const applicableYears = matchingMajor.years
        .filter((year) => year.year <= progressionYear)
        .sort((a, b) => a.year - b.year);

      const majorLocks: Record<string, string> = {};

      applicableYears.forEach((majorYear) => {
        if (!majorYear.combinations || majorYear.combinations.length === 0) {
          return;
        }

        const bestCombination = [...majorYear.combinations].sort((a, b) => {
          const aRequired = getCombinationRequiredCodes(a);
          const bRequired = getCombinationRequiredCodes(b);
          const aMatched = aRequired.filter((code) =>
            isCodeSatisfied(code, knownCodes),
          ).length;
          const bMatched = bRequired.filter((code) =>
            isCodeSatisfied(code, knownCodes),
          ).length;

          if (aMatched !== bMatched) {
            return bMatched - aMatched;
          }
          return aRequired.length - bRequired.length;
        })[0];

        if (bestCombination?.combination_id) {
          majorLocks[`Year ${majorYear.year}`] = bestCombination.combination_id;
        }
      });

      if (Object.keys(majorLocks).length > 0) {
        locks[registeredMajor] = majorLocks;
      }
    });

    return locks;
  }, [
    completedCourseRecords,
    courses,
    currentYearNumber,
    inProgressCourseRecords,
    registeredMajors,
    scienceMajorsCatalog,
  ]);

  const majorPathwayChoices = useMemo<
    Array<{
      majorName: string;
      yearLabel: string;
      options: string[];
      selected: string;
      selectedDescription: string;
      selectedCourses: Array<{ code: string; title: string }>;
      source: "auto" | "manual";
    }>
  >(() => {
    if (registeredMajors.length === 0 || scienceMajorsCatalog.length === 0) {
      return [];
    }

    const progressionYear = Math.min(
      Math.max(Math.trunc(currentYearNumber ?? 1), 1),
      4,
    );

    const rows: Array<{
      majorName: string;
      yearLabel: string;
      options: string[];
      selected: string;
      selectedDescription: string;
      selectedCourses: Array<{ code: string; title: string }>;
      source: "auto" | "manual";
    }> = [];

    registeredMajors.forEach((registeredMajor) => {
      const majorComparable = normalizeMajorComparable(registeredMajor);
      const matchingMajor = scienceMajorsCatalog.find((major) => {
        const candidate = normalizeMajorComparable(major.major_name);
        return (
          candidate === majorComparable ||
          candidate.includes(majorComparable) ||
          majorComparable.includes(candidate)
        );
      });

      if (!matchingMajor) {
        return;
      }

      matchingMajor.years
        .filter((year) => year.year <= progressionYear)
        .sort((a, b) => a.year - b.year)
        .forEach((year) => {
          const options = (year.combinations ?? [])
            .map((combination) => combination.combination_id)
            .filter((value): value is string =>
              Boolean(value && value.trim().length > 0),
            );

          if (options.length === 0) {
            return;
          }

          const yearLabel = `Year ${year.year}`;
          const manualChoice =
            manualMajorPathwayLocks[registeredMajor]?.[yearLabel];
          const autoChoice =
            autoSelectedMajorPathways[registeredMajor]?.[yearLabel] ??
            options[0];
          const selected =
            manualChoice && options.includes(manualChoice)
              ? manualChoice
              : autoChoice;

          const selectedCombo = year.combinations.find(
            (c) => c.combination_id === selected,
          );

          rows.push({
            majorName: registeredMajor,
            yearLabel,
            options,
            selected,
            selectedDescription: selectedCombo?.description ?? selected,
            selectedCourses: [
              ...(selectedCombo?.required_core ?? []),
              ...(selectedCombo?.courses ?? []),
            ].map((c) => ({ code: c.code, title: c.title ?? "" })),
            source:
              manualChoice && options.includes(manualChoice)
                ? "manual"
                : "auto",
          });
        });
    });

    return rows;
  }, [
    autoSelectedMajorPathways,
    currentYearNumber,
    manualMajorPathwayLocks,
    registeredMajors,
    scienceMajorsCatalog,
  ]);

  const selectedMajorPathways = useMemo<
    Record<string, Record<string, string>>
  >(() => {
    const merged: Record<string, Record<string, string>> = {};

    Object.entries(autoSelectedMajorPathways).forEach(([major, rows]) => {
      merged[major] = { ...rows };
    });

    Object.entries(manualMajorPathwayLocks).forEach(([major, rows]) => {
      if (!merged[major]) {
        merged[major] = {};
      }
      Object.entries(rows).forEach(([yearLabel, combinationId]) => {
        if (combinationId && combinationId.trim().length > 0) {
          merged[major][yearLabel] = combinationId;
        }
      });
    });

    return merged;
  }, [autoSelectedMajorPathways, manualMajorPathwayLocks]);

  useEffect(() => {
    if (majorPathwayChoices.length === 0) {
      if (Object.keys(manualMajorPathwayLocks).length > 0) {
        setManualMajorPathwayLocks({});
      }
      return;
    }

    const validByMajorYear = new Map<string, Set<string>>();
    majorPathwayChoices.forEach((row) => {
      validByMajorYear.set(
        `${row.majorName}__${row.yearLabel}`,
        new Set(row.options),
      );
    });

    setManualMajorPathwayLocks((prev) => {
      let changed = false;
      const next: Record<string, Record<string, string>> = {};

      Object.entries(prev).forEach(([major, rows]) => {
        Object.entries(rows).forEach(([yearLabel, combinationId]) => {
          const key = `${major}__${yearLabel}`;
          const valid = validByMajorYear.get(key);
          if (!valid || !valid.has(combinationId)) {
            changed = true;
            return;
          }
          if (!next[major]) {
            next[major] = {};
          }
          next[major][yearLabel] = combinationId;
        });
      });

      return changed ? next : prev;
    });
  }, [majorPathwayChoices, manualMajorPathwayLocks]);

  function getCurrentSemesterNumberFromDate() {
    // UCT: Semester 1 = Feb–Jun (months 2–6), Semester 2 = Jul–Nov (months 7–11).
    // Jan and Dec are treated as Semester 1 (pre-academic year / registration).
    const month = new Date().getMonth() + 1;
    return month >= 7 && month <= 11 ? 2 : 1;
  }

  function isPastTerm(year: string, semester: string): boolean {
    const yearNum = Number.isFinite(currentYearNumber)
      ? Math.max(1, Math.trunc(currentYearNumber as number))
      : 1;
    const semNum = getCurrentSemesterNumberFromDate();
    const currentIndex = (yearNum - 1) * 2 + semNum;
    const targetIndex =
      (getYearNumber(year) - 1) * 2 + getSemesterNumber(semester);
    return targetIndex < currentIndex;
  }

  function isCurrentTerm(year: string, semester: string): boolean {
    const yearNum = Number.isFinite(currentYearNumber)
      ? Math.max(1, Math.trunc(currentYearNumber as number))
      : 1;
    const semNum = getCurrentSemesterNumberFromDate();
    const currentIndex = (yearNum - 1) * 2 + semNum;
    const targetIndex =
      (getYearNumber(year) - 1) * 2 + getSemesterNumber(semester);
    return targetIndex === currentIndex;
  }

  const validationReport = useMemo(
    () =>
      hasPlannerCourses ||
      completedCourseRecords.length > 0 ||
      inProgressCourseRecords.length > 0
        ? validateAcademicPlan({
            catalog:
              catalog.length > 0
                ? catalog
                : academicRepository.getCourseCatalog(),
            requirements: academicRepository.getDegreeRequirements(),
            plannedCourses: courses,
            completedCourses: completedCourseRecords,
            inProgressCourses: inProgressCourseRecords,
            scheduleItems,
          })
        : null,
    [
      catalog,
      courses,
      completedCourseRecords,
      inProgressCourseRecords,
      scheduleItems,
    ],
  );

  // Codes of courses the student is actively planning — excludes anything
  // already completed, in-progress, or in a locked (past) semester, because
  // those have been advisor-approved and should not surface issues.
  const plannedCourseCodes = useMemo(
    () =>
      new Set(
        courses
          .filter(
            (c) => c.status === "Planned" && !isPastTerm(c.year, c.semester),
          )
          .map((c) => c.code),
      ),
    [courses],
  );

  const fixedCourseCodes = useMemo(
    () => new Set(fixedCourses.map((c) => c.code)),
    [fixedCourses],
  );

  // ── Risk engine ───────────────────────────────────────────────────────────
  // Computes grade-aware risk annotations for every planned course.
  const riskMap = useMemo(
    () =>
      computeCourseRisks({
        plannedCourses: courses.filter((c) => c.status === "Planned"),
        completedCourses: completedCoursesProp.map((c) => ({
          code: c.code,
          grade: c.grade,
        })),
        catalog,
      }),
    [courses, completedCoursesProp, catalog],
  );

  // DP requirement annotations for planned courses.
  const dpMap = useMemo(
    () =>
      computeDpRequirements(
        courses.filter((c) => c.status === "Planned"),
        catalog,
      ),
    [courses, catalog],
  );

  // Issues are only shown for courses the student is actively planning.
  // Completed, in-progress, and past-semester courses are advisor-approved
  // so their issues are suppressed.
  const yearValidationIssues = useMemo(
    () =>
      (validationReport?.issues ?? [])
        .filter((issue) => {
          if (issue.relatedCourseCode) {
            return plannedCourseCodes.has(issue.relatedCourseCode);
          }
          // Term-level issues (e.g. load) only surface for non-past terms
          if (issue.relatedTerm) {
            const [termYear, termSem] = issue.relatedTerm.split(" - ");
            return termYear && termSem
              ? !isPastTerm(termYear.trim(), termSem.trim())
              : false;
          }
          return false;
        }),
    [validationReport, plannedCourseCodes],
  );

  const yearHandbookRuleIssues = useMemo(
    () =>
      (handbookRuleValidation?.issues ?? [])
        .filter((issue) => {
          // Degree-level issues have their own dedicated section — exclude here
          // to avoid double-display (which would make visible count > banner count).
          if (
            issue.category === "major-requirement" ||
            issue.category === "graduation"
          ) {
            return false;
          }
          // Suppress issues for advisor-approved (fixed) courses
          if (
            issue.relatedCourseCode &&
            fixedCourseCodes.has(issue.relatedCourseCode)
          ) {
            return false;
          }
          if (
            issue.relatedCourseCode &&
            !plannedCourseCodes.has(issue.relatedCourseCode)
          ) {
            return false;
          }
          if (issue.relatedTerm) {
            const [termYear, termSem] = issue.relatedTerm.split(" - ");
            if (
              termYear &&
              termSem &&
              isPastTerm(termYear.trim(), termSem.trim())
            ) {
              return false;
            }
            // Show issues from ALL years — not just selectedYear. This keeps
            // the displayed list consistent with the global banner count.
            return true;
          }
          // Issues with a planned course code but no term — show them
          if (issue.relatedCourseCode) return true;
          // Generic issues with no scope — exclude (nothing to show them against)
          return false;
        }),
    [
      handbookRuleValidation,
      plannedCourseCodes,
      fixedCourseCodes,
    ],
  );

  // Degree-level issues (major requirements + graduation credits) shown in a
  // dedicated section, not filtered by selected year or course code.
  const degreeRequirementIssues = useMemo(
    () =>
      (handbookRuleValidation?.issues ?? []).filter(
        (issue) =>
          issue.category === "major-requirement" ||
          issue.category === "graduation",
      ),
    [handbookRuleValidation],
  );

  const getTermLabel = (year: string, semester: string) => {
    const yearNumber = year.match(/\d+/)?.[0] ?? "1";
    const semesterNumber = semester.match(/\d+/)?.[0] ?? "1";
    return `Year ${yearNumber} - Semester ${semesterNumber}`;
  };

  const termLoadIssueCount = useMemo(() => {
    const counts = new Map<string, number>();
    (validationReport?.issues ?? [])
      .filter((issue) => {
        if (issue.category !== "load" || !issue.relatedTerm) return false;
        if (
          issue.relatedCourseCode &&
          fixedCourseCodes.has(issue.relatedCourseCode)
        )
          return false;
        const [tYear, tSem] = issue.relatedTerm.split(" - ");
        if (tYear && tSem && isPastTerm(tYear.trim(), tSem.trim()))
          return false;
        return true;
      })
      .forEach((issue) => {
        const key = issue.relatedTerm as string;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
    return counts;
  }, [validationReport, fixedCourseCodes]);

  const yearLoadIssues = useMemo(
    () =>
      (validationReport?.issues ?? [])
        .filter((issue) => {
          if (issue.category !== "load") return false;
          if (!issue.relatedTerm?.startsWith(selectedYear)) return false;
          if (
            issue.relatedCourseCode &&
            fixedCourseCodes.has(issue.relatedCourseCode)
          )
            return false;
          return true;
        })
        .slice(0, 3),
    [validationReport, selectedYear, fixedCourseCodes],
  );

  // Only issues for planned courses count toward the save gate / banners.
  // Completed, in-progress, and past-semester courses are advisor-approved.
  const handbookSaveIssues = useMemo<HandbookRuleValidationIssue[]>(
    () =>
      (handbookRuleValidation?.issues ?? []).filter((issue) => {
        if (
          issue.relatedCourseCode &&
          fixedCourseCodes.has(issue.relatedCourseCode)
        )
          return false;
        if (
          issue.relatedCourseCode &&
          !plannedCourseCodes.has(issue.relatedCourseCode)
        )
          return false;
        if (issue.relatedTerm) {
          const [tYear, tSem] = issue.relatedTerm.split(" - ");
          if (tYear && tSem && isPastTerm(tYear.trim(), tSem.trim()))
            return false;
        }
        return true;
      }),
    [handbookRuleValidation, fixedCourseCodes, plannedCourseCodes],
  );

  const localBlockerCount = useMemo(
    () =>
      (validationReport?.issues ?? []).filter(
        (i) =>
          i.severity === "blocker" &&
          (i.relatedCourseCode
            ? plannedCourseCodes.has(i.relatedCourseCode) &&
              !fixedCourseCodes.has(i.relatedCourseCode)
            : Boolean(i.relatedTerm)),
      ).length,
    [validationReport, plannedCourseCodes, fixedCourseCodes],
  );
  const localWarningCount = useMemo(
    () =>
      (validationReport?.issues ?? []).filter(
        (i) =>
          i.severity === "warning" &&
          (i.relatedCourseCode
            ? plannedCourseCodes.has(i.relatedCourseCode) &&
              !fixedCourseCodes.has(i.relatedCourseCode)
            : Boolean(i.relatedTerm)),
      ).length,
    [validationReport, plannedCourseCodes, fixedCourseCodes],
  );
  const handbookBlockerCount = handbookSaveIssues.filter(
    (issue) => issue.severity === "blocker",
  ).length;
  const handbookWarningCount = handbookSaveIssues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  const totalBlockerCount = localBlockerCount + handbookBlockerCount;
  const totalWarningCount = localWarningCount + handbookWarningCount;

  const saveGateConfidenceSummary = useMemo(() => {
    const localIssues = validationReport?.issues ?? [];
    const handbookIssues = handbookSaveIssues;

    const workloadWarnings = localIssues.filter(
      (issue) => issue.category === "load" && issue.severity === "warning",
    ).length;

    const scheduleWarnings = [...localIssues, ...handbookIssues].filter(
      (issue) => issue.category === "schedule" && issue.severity === "warning",
    ).length;

    const affectedTerms = Array.from(
      new Set(
        [...localIssues, ...handbookIssues]
          .filter(
            (issue) =>
              (issue.severity === "blocker" || issue.severity === "warning") &&
              Boolean(issue.relatedTerm),
          )
          .map((issue) => issue.relatedTerm as string),
      ),
    ).sort((a, b) => a.localeCompare(b));

    return {
      blockers: totalBlockerCount,
      warnings: totalWarningCount,
      workloadWarnings,
      scheduleWarnings,
      affectedTerms,
    };
  }, [
    handbookSaveIssues,
    totalBlockerCount,
    totalWarningCount,
    validationReport,
  ]);

  const currentPlanSnapshot = useMemo(
    () => buildPlanSnapshot(courses, registeredMajors),
    [courses, registeredMajors],
  );

  const warningAcknowledgementToken = useMemo(
    () =>
      JSON.stringify({
        snapshot: currentPlanSnapshot,
        localWarnings:
          validationReport?.issues
            .filter((issue) => issue.severity === "warning")
            .map((issue) => issue.id) ?? [],
        handbookWarnings: handbookSaveIssues
          .filter((issue) => issue.severity === "warning")
          .map((issue) => issue.id),
      }),
    [currentPlanSnapshot, handbookSaveIssues, validationReport],
  );

  const hasUnsavedChanges =
    hasHydratedPlan && currentPlanSnapshot !== lastPersistedSnapshot;
  const requiresWarningAcknowledgement =
    totalWarningCount > 0 &&
    warningAcknowledgementKey !== warningAcknowledgementToken;
  const isSaveBlocked = totalBlockerCount > 0;

  const saveGuardMessage = useMemo(() => {
    if (!studentNumber) {
      return "Local-only mode — connect an account to save.";
    }
    if (isHandbookValidationLoading) {
      return "Checking handbook rules…";
    }
    if (isSaveBlocked) {
      return `${totalBlockerCount} blocker${totalBlockerCount === 1 ? "" : "s"} must be resolved before saving.`;
    }
    if (requiresWarningAcknowledgement) {
      return `Acknowledge ${totalWarningCount} warning${totalWarningCount === 1 ? "" : "s"} before saving.`;
    }
    if (hasUnsavedChanges) {
      return "Plan is ready to save.";
    }
    return "All changes saved.";
  }, [
    hasUnsavedChanges,
    isHandbookValidationLoading,
    isSaveBlocked,
    requiresWarningAcknowledgement,
    studentNumber,
    totalBlockerCount,
    totalWarningCount,
  ]);

  const saveGatePriorityIssues = useMemo(() => {
    const localIssues = (validationReport?.issues ?? [])
      .filter(
        (issue) =>
          (issue.severity === "blocker" || issue.severity === "warning") &&
          (issue.relatedCourseCode
            ? plannedCourseCodes.has(issue.relatedCourseCode) &&
              !fixedCourseCodes.has(issue.relatedCourseCode)
            : Boolean(issue.relatedTerm)),
      )
      .map((issue) => ({
        id: `local-${issue.id}`,
        source: "Local",
        severity: issue.severity,
        category: issue.category,
        title: issue.title,
        message: issue.message,
        ruleReference: undefined,
        ruleSourceText: undefined,
        action: getIssueActionHint({
          category: issue.category,
          relatedCourseCode: issue.relatedCourseCode,
          relatedTerm: issue.relatedTerm,
        }),
      }));

    const handbookIssues = handbookSaveIssues
      .filter(
        (issue) => issue.severity === "blocker" || issue.severity === "warning",
      )
      .map((issue) => ({
        id: `handbook-${issue.id}`,
        source: "Handbook",
        severity: issue.severity,
        category: issue.category,
        title: issue.title,
        message: issue.message,
        ruleReference: issue.ruleReference,
        ruleSourceText: issue.ruleSourceText,
        action: getIssueActionHint({
          category: issue.category,
          relatedCourseCode: issue.relatedCourseCode,
          relatedTerm: issue.relatedTerm,
        }),
      }));

    return [...localIssues, ...handbookIssues].sort((a, b) => {
      if (a.severity === b.severity) {
        return a.title.localeCompare(b.title);
      }
      return a.severity === "blocker" ? -1 : 1;
    });
  }, [handbookSaveIssues, plannedCourseCodes, fixedCourseCodes, validationReport]);

  const plannerTrustMessage = useMemo(
    () =>
      buildGuidanceTrustMessage({
        syncStatus: !studentNumber
          ? "fallback"
          : !hasHydratedPlan || isHandbookValidationLoading
            ? "loading"
            : isPlannerBackendUnavailable
              ? "error"
              : isPlannerFallbackMode
                ? "fallback"
                : "synced",
        syncError: planSyncError || handbookRuleError,
        lastSyncedAt: planLastSyncedAt,
        hasSession: Boolean(studentNumber),
        hasFallbackData: isPlannerFallbackMode || !studentNumber,
        staleAfterMinutes: 20,
      }),
    [
      handbookRuleError,
      hasHydratedPlan,
      isHandbookValidationLoading,
      isPlannerBackendUnavailable,
      isPlannerFallbackMode,
      planLastSyncedAt,
      planSyncError,
      studentNumber,
    ],
  );

  const getAutoStatus = (year: string, semester: string): CourseStatus => {
    // Use the currentYearNumber prop directly — the student's actual academic
    // year level. Do NOT fall back to selectedYear (the tab the user is
    // viewing), which caused future-year semesters to be tagged "In Progress".
    const yearNum = Number.isFinite(currentYearNumber)
      ? Math.max(1, Math.trunc(currentYearNumber as number))
      : 1;
    const semNum = getCurrentSemesterNumberFromDate();
    const targetTermIndex =
      (getYearNumber(year) - 1) * 2 + getSemesterNumber(semester);
    const currentTermIndex = (yearNum - 1) * 2 + semNum;

    if (targetTermIndex < currentTermIndex) return "Completed";
    if (targetTermIndex === currentTermIndex) return "In Progress";
    return "Planned";
  };

  const [addError, setAddError] = useState<string | null>(null);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  /** Build the structured PlanPdfData object from current Planner state. */
  const buildPdfData = (): PlanPdfData => {
    const calYear = new Date().getFullYear();
    const yearNum = Number.isFinite(currentYearNumber)
      ? Math.max(1, Math.trunc(currentYearNumber as number))
      : 1;

    // Look up lecture_times from catalog by course code
    const catalogMap = new Map(catalog.map((c) => [c.code, c]));
    const getLectureTimes = (code: string): string | null =>
      catalogMap.get(code)?.lecture_times ?? null;

    // Collect all courses into a year→semester structure
    type MutableSem = { label: "Semester 1" | "Semester 2"; courses: PdfCourse[] };
    type MutableYear = { sems: Map<number, MutableSem> };
    const yearMap = new Map<number, MutableYear>();

    const getOrAddYear = (n: number): MutableYear => {
      if (!yearMap.has(n)) yearMap.set(n, { sems: new Map() });
      return yearMap.get(n)!;
    };
    const getOrAddSem = (yr: MutableYear, s: 1 | 2): MutableSem => {
      if (!yr.sems.has(s))
        yr.sems.set(s, { label: `Semester ${s}`, courses: [] });
      return yr.sems.get(s)!;
    };

    // Completed courses — semester format "Year X - Sem Y"
    completedCoursesProp.forEach((c) => {
      const ym = c.semester.match(/Year\s*(\d+)/i);
      const sm = c.semester.match(/Sem(?:ester)?\s*(\d+)/i);
      if (!ym || !sm) return;
      const y = parseInt(ym[1], 10);
      const s = (parseInt(sm[1], 10) as 1 | 2);
      getOrAddSem(getOrAddYear(y), s).courses.push({
        code: c.code,
        name: c.title,
        credits: c.credits,
        status: "Completed",
        lectureTimesRaw: getLectureTimes(c.code),
      });
    });

    // In-progress courses — same semester format
    inProgressCoursesProp.forEach((c) => {
      const ym = c.semester.match(/Year\s*(\d+)/i);
      const sm = c.semester.match(/Sem(?:ester)?\s*(\d+)/i);
      if (!ym || !sm) return;
      const y = parseInt(ym[1], 10);
      const s = (parseInt(sm[1], 10) as 1 | 2);
      getOrAddSem(getOrAddYear(y), s).courses.push({
        code: c.code,
        name: c.title,
        credits: c.credits,
        status: "In Progress",
        lectureTimesRaw: getLectureTimes(c.code),
      });
    });

    // User-planned courses from the planner grid
    courses.forEach((c) => {
      const y = getYearNumber(c.year);
      const s = (getSemesterNumber(c.semester) as 1 | 2);
      getOrAddSem(getOrAddYear(y), s).courses.push({
        code: c.code,
        name: c.name,
        credits: c.credits,
        status: "Planned",
        lectureTimesRaw: getLectureTimes(c.code),
      });
    });

    const allYearNumbers = Array.from(yearMap.keys()).sort((a, b) => a - b);
    const pdfYears: PdfYear[] = allYearNumbers.map((y) => {
      const calendarYear = calYear - yearNum + y;
      const entry = yearMap.get(y)!;
      const semesters: PdfSemester[] = ([1, 2] as const).map((s) => {
        const sem = entry.sems.get(s);
        return sem ?? { label: `Semester ${s}`, courses: [] };
      });
      const totalCredits = semesters.reduce(
        (sum, sem) => sum + sem.courses.reduce((ss, c) => ss + c.credits, 0),
        0,
      );
      return {
        yearNumber: y,
        calendarYear,
        isCurrent: y === yearNum,
        isPast: y < yearNum,
        semesters,
        totalCredits,
      };
    });

    const totalCredits = pdfYears.reduce((s, y) => s + y.totalCredits, 0);

    return {
      studentName,
      studentNumber: studentNumber ?? "—",
      degreeName,
      academicLevel: yearNum,
      currentCalendarYear: calYear,
      years: pdfYears,
      totalCredits,
      targetCredits: degreeRequirements.targetCredits,
    };
  };

  const handleDownloadPdf = async (type: PdfDocType) => {
    setPdfError(null);
    setIsGeneratingPdf(true);
    try {
      const data = buildPdfData();
      await downloadPlanPdf(type, data);
    } catch (err) {
      setPdfError("Failed to generate PDF. Please try again.");
      console.error("PDF generation error:", err);
    } finally {
      setIsGeneratingPdf(false);
      setShowDownloadModal(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadHandbookPolicy = async () => {
      try {
        const response = await extractScienceHandbookRules({
          handbook_title: TARGET_HANDBOOK,
        });

        if (!isMounted) {
          return;
        }

        setHandbookPlannerPolicy(response.planner_policy);
      } catch {
        if (!isMounted) {
          return;
        }
        setHandbookPlannerPolicy(null);
      }
    };

    loadHandbookPolicy();

    return () => {
      isMounted = false;
    };
  }, []);

  const addCourse = () => {
    setAddError(null);
    if (!selectedCourse) {
      return;
    }
    if (isPastTerm(selectedYear, selectedSemester)) {
      setAddError("Courses cannot be added to a past semester.");
      return;
    }
    if (isCurrentTerm(selectedYear, selectedSemester)) {
      setAddError("Current-semester courses are already tracked as in progress.");
      return;
    }
    if (!canAddCourseToTerm(selectedCourse, selectedYear, selectedSemester)) {
      setAddError(
        "This course cannot be added to the selected year or semester.",
      );
      return;
    }

    const policyMaxTermCredits = handbookPlannerPolicy?.max_term_credits ?? 72;
    const policyPostgradMinYear =
      handbookPlannerPolicy?.disallow_postgrad_before_year ?? 4;

    const selectedYearNumber = getYearNumber(selectedYear);
    if (
      isCoursePostgrad(selectedCourse) &&
      selectedYearNumber < policyPostgradMinYear
    ) {
      setAddError(
        `Postgraduate courses can only be planned from Year ${policyPostgradMinYear} onward.`,
      );
      return;
    }

    const currentTermCredits = [...courses, ...fixedCourses]
      .filter(
        (course) =>
          course.year === selectedYear && course.semester === selectedSemester,
      )
      .reduce((sum, course) => sum + course.credits, 0);

    if (currentTermCredits + selectedCourse.credits > policyMaxTermCredits) {
      setAddError(
        `Adding this course exceeds the handbook semester cap of ${policyMaxTermCredits} credits.`,
      );
      return;
    }

    let courseCode = selectedCourse.code;
    const semCode = getCourseSemesterCode(selectedCourse);
    if (semCode === "F/S") {
      if (selectedSemester === "Semester 1") {
        courseCode = courseCode.replace(/F\/S$/i, "F");
      } else if (selectedSemester === "Semester 2") {
        courseCode = courseCode.replace(/F\/S$/i, "S");
      }
    }

    if (
      courses.some((course) => course.code === courseCode) ||
      fixedCourses.some((course) => course.code === courseCode)
    ) {
      setAddError("This course is already in your plan.");
      return;
    }

    const rawSemCode = getCourseSemesterCode(selectedCourse).toUpperCase();
    const isWholeYear = rawSemCode === "H" || rawSemCode === "W";
    const newCourse: PlannedCourse = {
      id: `${Date.now()}`,
      code: courseCode,
      name: selectedCourse.title,
      credits: selectedCourse.credits,
      year: selectedYear,
      semester: selectedSemester,
      semesterCode: isWholeYear ? rawSemCode : undefined,
      status: getAutoStatus(selectedYear, selectedSemester),
    };
    setCourses((prev) => [newCourse, ...prev]);
    setSelectedCourse(null);
    setIsCourseDropdownOpen(false);
    setCourseSearch("");
  };

  const openSuggestedCourse = (
    courseCode: string,
    year: string,
    semester: string,
  ) => {
    const candidate = catalog.find(
      (course) =>
        course.code.trim().toUpperCase() === courseCode.trim().toUpperCase(),
    );

    if (!candidate) {
      return;
    }

    setSelectedYear(year);
    setSelectedSemester(semester);
    setSelectedCourse(candidate);
    setCourseSearch(courseCode.trim().toUpperCase());
    setIsCourseDropdownOpen(true);
  };

  const removeCourse = (id: string) => {
    // fixedCourses (completed/in-progress from student records) are never in
    // the `courses` array, so any ID found here is a user-added planned course.
    setCourses((prev) => prev.filter((course) => course.id !== id));
  };

  useEffect(() => {
    let isMounted = true;

    if (courses.length === 0 && registeredMajors.length === 0) {
      setHandbookRuleValidation(null);
      setHandbookRuleError(null);
      return () => {
        isMounted = false;
      };
    }

    const validateAgainstHandbookRules = async () => {
      setIsHandbookValidationLoading(true);
      try {
        // fixedCourses (completed + in-progress) are sent as context so the
        // backend understands which prerequisites are already satisfied.
        // Issues the backend returns for those courses are filtered out on
        // the client (they are advisor-approved) — only planned-course issues
        // surface in the UI.
        const allCoursesForValidation = [
          ...fixedCourses.map((c) => ({
            code: c.code,
            year: c.year,
            semester: c.semester,
            credits: c.credits,
          })),
          ...courses.map((course) => ({
            code: course.code,
            year: course.year,
            semester: course.semester,
            credits: course.credits,
          })),
        ];
        const attemptHistory = completedCoursesProp
          .filter((course) => course.code && course.code.trim().length > 0)
          .map((course) => {
            const yearMatch = course.semester.match(/Year\s*(\d+)/i);
            const year = yearMatch ? `Year ${yearMatch[1]}` : undefined;
            const semester = course.semester.toUpperCase().includes("S2")
              ? "Semester 2"
              : course.semester.toUpperCase().includes("S1")
                ? "Semester 1"
                : undefined;

            return {
              code: course.code.trim().toUpperCase(),
              year,
              semester,
              passed: course.passed === true,
              grade:
                typeof course.grade === "number" &&
                Number.isFinite(course.grade)
                  ? course.grade
                  : undefined,
            };
          });
        let response: HandbookRuleValidationResponse;
        try {
          response = await validatePlanAgainstHandbookRules({
            target_faculty: "science",
            planned_courses: allCoursesForValidation,
            selected_majors: registeredMajors,
          });
        } catch {
          response = await validateSciencePlanAgainstRules({
            handbook_title: TARGET_HANDBOOK,
            planned_courses: allCoursesForValidation,
            selected_majors: registeredMajors,
            selected_major_pathways: selectedMajorPathways,
            attempt_history: attemptHistory,
            plan_intent: "graduation_candidate",
            validation_mode: "strict_graduation",
          });
        }

        if (!isMounted) {
          return;
        }

        setHandbookRuleValidation(response);
        setHandbookRuleError(null);
      } catch (_error) {
        if (!isMounted) {
          return;
        }

        setHandbookRuleValidation(null);
        setHandbookRuleError(
          "Handbook rule checks are temporarily unavailable. Local validation is still active.",
        );
      } finally {
        if (isMounted) {
          setIsHandbookValidationLoading(false);
        }
      }
    };

    validateAgainstHandbookRules();

    return () => {
      isMounted = false;
    };
  }, [
    courses,
    fixedCourses,
    registeredMajors,
    completedCoursesProp,
    selectedMajorPathways,
  ]);

  useEffect(() => {
    if (hasUnsavedChanges) {
      setPlanSyncNotice(null);
    }
  }, [hasUnsavedChanges]);

  const acknowledgeWarnings = () => {
    setWarningAcknowledgementKey(warningAcknowledgementToken);
    setPlanSyncError(null);
    setPlanSyncNotice("Warnings acknowledged. You can now save this plan.");
  };

  const savePlan = async () => {
    setSaveAttemptCount((prev) => prev + 1);

    if (!studentNumber || !hasHydratedPlan) {
      return;
    }

    if (isHandbookValidationLoading) {
      setPlanSyncNotice(null);
      setPlanSyncError(
        "Please wait for handbook rule validation to finish before saving.",
      );
      return;
    }

    if (isSaveBlocked) {
      setBlockerSaveAttemptCount((prev) => prev + 1);
      setBlockedByGateCount((prev) => prev + 1);
      setPlanSyncNotice(null);
      setPlanSyncError(
        `Resolve ${totalBlockerCount} blocker issue${totalBlockerCount === 1 ? "" : "s"} before saving.`,
      );
      return;
    }

    if (requiresWarningAcknowledgement) {
      setPlanSyncNotice(null);
      setPlanSyncError(
        `Acknowledge ${totalWarningCount} warning${totalWarningCount === 1 ? "" : "s"} before saving this plan.`,
      );
      return;
    }

    if (!hasUnsavedChanges) {
      setPlanSyncError(null);
      setPlanSyncNotice("No new planner changes to save.");
      return;
    }

    setIsSavingPlan(true);
    setPlanSyncError(null);
    setPlanSyncNotice(null);

    try {
      await updateStudentPlan({
        student_number: studentNumber,
        planned_courses: courses.map((course) => ({
          code: course.code,
          year: course.year,
          semester: course.semester,
          credits: course.credits,
        })),
        selected_majors: registeredMajors,
      });

      setLastPersistedSnapshot(currentPlanSnapshot);
      setPlanLastSyncedAt(new Date().toISOString());
      setIsPlannerFallbackMode(false);
      setIsPlannerBackendUnavailable(false);
      setPlanSyncError(null);
      setPlanSyncNotice("Plan saved.");
    } catch {
      setIsPlannerBackendUnavailable(true);
      setIsPlannerFallbackMode(true);
      setPlanSyncNotice(null);
      setPlanSyncError(
        "Could not save to server. Your changes are kept locally.",
      );
    } finally {
      setIsSavingPlan(false);
    }
  };

  // ─── Derived display helpers ───────────────────────────────────────────────

  const completedCredits = useMemo(
    () => completedCourseRecords.reduce((sum, c) => sum + c.credits, 0),
    [completedCourseRecords],
  );

  const inProgressCredits = useMemo(
    () => inProgressCourseRecords.reduce((sum, c) => sum + c.credits, 0),
    [inProgressCourseRecords],
  );

  const plannedCredits = useMemo(
    () =>
      courses
        .filter((c) => c.status === "Planned")
        .reduce((sum, c) => sum + c.credits, 0),
    [courses],
  );

  const totalTrackedCredits =
    completedCredits + inProgressCredits + plannedCredits;
  const targetCredits = degreeRequirements.targetCredits;
  const progressPercent = Math.min(
    Math.round((totalTrackedCredits / targetCredits) * 100),
    100,
  );

  const sem1Courses = yearCourses.filter((c) => c.semester === "Semester 1");
  const sem2Courses = yearCourses.filter((c) => c.semester === "Semester 2");

  const sem1Credits = sem1Courses.reduce((sum, c) => sum + c.credits, 0);
  const sem2Credits = sem2Courses.reduce((sum, c) => sum + c.credits, 0);
  const maxTermCredits = handbookPlannerPolicy?.max_term_credits ?? 72;

  const issuesBySeverity = useMemo(() => {
    const allIssues = saveGatePriorityIssues.filter(
      (issue) =>
        (issue as any).relatedTerm?.startsWith(selectedYear) ||
        plannedCourseCodes.has((issue as any).relatedCourseCode ?? ""),
    );
    const yearBlockers = yearValidationIssues.filter(
      (i) => i.severity === "blocker",
    );
    const yearWarnings = yearValidationIssues.filter(
      (i) => i.severity === "warning",
    );
    return { blockers: yearBlockers, warnings: yearWarnings };
  }, [
    saveGatePriorityIssues,
    yearValidationIssues,
    selectedYear,
    plannedCourseCodes,
  ]);

  const getCourseChipVariant = (course: PlannedCourse) => {
    const hasBlocker = yearValidationIssues.some(
      (i) => i.severity === "blocker" && i.relatedCourseCode === course.code,
    );
    const hasWarning = yearValidationIssues.some(
      (i) => i.severity === "warning" && i.relatedCourseCode === course.code,
    );
    if (hasBlocker) return "blocker";
    if (hasWarning) return "warning";
    if (course.status === "Completed") return "completed";
    if (course.status === "In Progress") return "inProgress";
    return "default";
  };

  const syncStatusLabel = useMemo(() => {
    if (!studentNumber) return "Local only";
    if (isHandbookValidationLoading) return "Checking…";
    if (isPlannerBackendUnavailable) return "Offline";
    if (planLastSyncedAt) {
      const mins = Math.round(
        (Date.now() - new Date(planLastSyncedAt).getTime()) / 60000,
      );
      return mins < 2 ? "Just synced" : `Synced ${mins}m ago`;
    }
    return "Not synced";
  }, [
    studentNumber,
    isHandbookValidationLoading,
    isPlannerBackendUnavailable,
    planLastSyncedAt,
  ]);

  const saveBtnLabel = useMemo(() => {
    if (isSavingPlan) return "Saving…";
    if (isHandbookValidationLoading) return "Checking…";
    if (isSaveBlocked)
      return `${totalBlockerCount} blocker${totalBlockerCount === 1 ? "" : "s"} to resolve`;
    if (requiresWarningAcknowledgement)
      return `Acknowledge ${totalWarningCount} warning${totalWarningCount === 1 ? "" : "s"}`;
    if (hasUnsavedChanges) return "Save changes";
    return "Up to date";
  }, [
    isSavingPlan,
    isHandbookValidationLoading,
    isSaveBlocked,
    requiresWarningAcknowledgement,
    hasUnsavedChanges,
    totalBlockerCount,
    totalWarningCount,
  ]);

  const saveBtnVariant: "blocked" | "warn" | "ready" | "idle" = isSaveBlocked
    ? "blocked"
    : requiresWarningAcknowledgement
      ? "warn"
      : hasUnsavedChanges
        ? "ready"
        : "idle";

  // ─── Auto-plan generator ─────────────────────────────────────────────────

  function handleGeneratePlan() {
    if (catalog.length === 0) {
      setAddError(
        "Course catalog is still loading — please try again in a moment.",
      );
      return;
    }
    if (registeredMajors.length > 0 && scienceMajorsCatalog.length === 0) {
      setAddError(
        "Major pathway data is still loading — please try again in a moment.",
      );
      return;
    }
    setIsGeneratingPlan(true);
    const catalogCodes = new Set(catalog.map((c) => c.code.trim().toUpperCase()));
    const liveCombinations = buildLiveMajorCombinations(
      scienceMajorsCatalog,
      catalogCodes,
    );
    const majorCombinationsToUse =
      liveCombinations.length > 0
        ? liveCombinations
        : academicRepository.getMajorCombinations();
    const plans = generateAutoGraduationPlans({
      catalog,
      requirements: degreeRequirements,
      completedCourses: completedCourseRecords,
      inProgressCourses: inProgressCourseRecords,
      plannedCourses: courses,
      majorCombinations: majorCombinationsToUse,
      studentCombinationIds: registeredMajors,
    });
    setAutoPlans(plans);
    setIsGeneratingPlan(false);
    setShowAutoPlans(true);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <MainLayout>
      {/* ── Page header ── */}
      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderRow}>
          <View style={styles.pageHeaderLeft}>
            <Text style={styles.title}>Academic planner</Text>
            <Text style={styles.subtitle}>
              Design and validate your degree year by year.
            </Text>
          </View>
          <View style={styles.headerBtns}>
            <Pressable
              style={styles.downloadPlanBtn}
              onPress={() => {
                setPdfError(null);
                setShowDownloadModal(true);
              }}
            >
              <Text style={styles.downloadPlanBtnText}>Download Plan</Text>
            </Pressable>
            <Pressable
              onPress={handleGeneratePlan}
              disabled={isGeneratingPlan}
              style={[
                styles.generatePlanBtn,
                isGeneratingPlan && styles.generatePlanBtnDisabled,
              ]}
            >
              <Text style={styles.generatePlanBtnText}>
                {isGeneratingPlan ? "Generating…" : "Generate my plan"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* ── Auto-generated graduation paths ── */}
      {showAutoPlans && autoPlans.length > 0 ? (
        <View style={styles.autoPlanPanel}>
          <View style={styles.autoPlanPanelHeader}>
            <Text style={styles.autoPlanPanelTitle}>Graduation paths</Text>
            <Pressable onPress={() => setShowAutoPlans(false)}>
              <Text style={styles.autoPlanClose}>Dismiss</Text>
            </Pressable>
          </View>
          {autoPlans.map((plan) => (
            <View key={plan.id} style={styles.autoPlanCard}>
              <Text style={styles.autoPlanCardTitle}>{plan.title}</Text>
              <Text style={styles.autoPlanCardMeta}>
                {plan.estimatedTerms} semester
                {plan.estimatedTerms === 1 ? "" : "s"} ·{" "}
                {plan.projectedTotalCredits} credits · Finishes{" "}
                {plan.projectedCompletionTerm}
              </Text>
              {plan.rationale.slice(0, 2).map((line, i) => (
                <Text key={i} style={styles.autoPlanRationale}>
                  · {line}
                </Text>
              ))}
              {plan.terms.map((term) => (
                <View key={term.termIndex} style={styles.autoPlanTerm}>
                  <Text style={styles.autoPlanTermLabel}>
                    {term.termLabel} — {term.totalCredits} cr
                  </Text>
                  {term.courses.map((c) => (
                    <Text key={c.code} style={styles.autoPlanTermCourse}>
                      {c.code} {c.title}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}

      {/* ── Download PDF modal ── */}
      {showDownloadModal && (
        <View style={styles.downloadModalOverlay}>
          <View style={styles.downloadModal}>
            <Text style={styles.downloadModalTitle}>Download Plan</Text>
            <Text style={styles.downloadModalSub}>
              Choose a format for your academic plan PDF
            </Text>

            <Pressable
              style={[styles.downloadOption, styles.downloadOptionPrimary]}
              onPress={() => void handleDownloadPdf("table")}
              disabled={isGeneratingPdf}
            >
              <Text style={styles.downloadOptionIcon}>📋</Text>
              <View style={styles.downloadOptionBody}>
                <Text style={styles.downloadOptionTitle}>Year Table</Text>
                <Text style={styles.downloadOptionDesc}>
                  Courses organised by year and semester with credits and status
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={[styles.downloadOption, styles.downloadOptionPrimary]}
              onPress={() => void handleDownloadPdf("timetable")}
              disabled={isGeneratingPdf}
            >
              <Text style={styles.downloadOptionIcon}>🗓</Text>
              <View style={styles.downloadOptionBody}>
                <Text style={styles.downloadOptionTitle}>Weekly Timetable</Text>
                <Text style={styles.downloadOptionDesc}>
                  Period grid per semester — shows lecture slots and detects clashes
                </Text>
              </View>
            </Pressable>

            {pdfError ? (
              <Text style={styles.downloadErrorText}>{pdfError}</Text>
            ) : null}

            {isGeneratingPdf && (
              <Text style={styles.downloadGeneratingText}>Generating PDF…</Text>
            )}

            <Pressable
              style={styles.downloadCancelBtn}
              onPress={() => {
                setShowDownloadModal(false);
                setPdfError(null);
              }}
              disabled={isGeneratingPdf}
            >
              <Text style={styles.downloadCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Sync bar ── */}
      <View style={styles.syncBar}>
        <Text style={styles.syncStatusText}>
          {syncStatusLabel}
          {planSyncError || planSyncNotice ? (
            <Text
              style={
                planSyncError ? styles.syncErrorInline : styles.syncNoticeInline
              }
            >
              {" · "}
              {planSyncError ?? planSyncNotice}
            </Text>
          ) : null}
        </Text>
        <View style={styles.syncActions}>
          {requiresWarningAcknowledgement ? (
            <Pressable
              onPress={acknowledgeWarnings}
              style={[styles.saveBtnBase, styles.saveBtnWarn]}
            >
              <Text style={styles.saveBtnWarnText}>Acknowledge warnings</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => void savePlan()}
            disabled={
              !studentNumber ||
              isSavingPlan ||
              isHandbookValidationLoading ||
              isSaveBlocked ||
              requiresWarningAcknowledgement ||
              !hasUnsavedChanges
            }
            style={[
              styles.saveBtnBase,
              studentNumber && saveBtnVariant === "blocked" && styles.saveBtnBlocked,
              studentNumber && saveBtnVariant === "ready" && styles.saveBtnReady,
              (!studentNumber || saveBtnVariant === "idle") && styles.saveBtnIdle,
              (!studentNumber ||
                isSavingPlan ||
                isHandbookValidationLoading ||
                !hasUnsavedChanges) &&
                styles.saveBtnDisabled,
            ]}
          >
            <Text
              style={[
                styles.saveBtnText,
                studentNumber && saveBtnVariant === "blocked" && styles.saveBtnBlockedText,
                studentNumber && saveBtnVariant === "ready" && styles.saveBtnReadyText,
              ]}
            >
              {!studentNumber ? "Log in to save" : saveBtnLabel}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ── Top-level blocker / warning banners ── */}
      {/* Suppress counts while handbook check is still running — local issues
          resolve instantly but handbook issues arrive async, so showing a
          partial count would be misleading. */}
      {!isHandbookValidationLoading && totalBlockerCount > 0 && (
        <View style={[styles.issueBanner, styles.issueBannerBlocker]}>
          <View style={[styles.issueDot, styles.issueDotBlocker]} />
          <Text style={styles.issueBannerText}>
            <Text style={styles.issueBannerBold}>
              {totalBlockerCount} blocker{totalBlockerCount === 1 ? "" : "s"}
            </Text>{" "}
            — {saveGuardMessage}
          </Text>
        </View>
      )}
      {!isHandbookValidationLoading && totalBlockerCount === 0 && totalWarningCount > 0 && (
        <View style={[styles.issueBanner, styles.issueBannerWarn]}>
          <View style={[styles.issueDot, styles.issueDotWarn]} />
          <Text style={[styles.issueBannerText, styles.issueBannerWarnText]}>
            <Text style={styles.issueBannerBold}>
              {totalWarningCount} warning{totalWarningCount === 1 ? "" : "s"}
            </Text>{" "}
            — review before saving.
          </Text>
        </View>
      )}
      {!isHandbookValidationLoading &&
        totalBlockerCount === 0 &&
        totalWarningCount === 0 &&
        hasPlannerCourses && (
          <View style={[styles.issueBanner, styles.issueBannerOk]}>
            <View style={[styles.issueDot, styles.issueDotOk]} />
            <Text style={[styles.issueBannerText, styles.issueBannerOkText]}>
              Plan looks good — no issues detected.
            </Text>
          </View>
        )}

      {/* ── Registered majors ── */}
      {registeredMajors.length > 0 ? (
        <View style={styles.majorsRow}>
          <Text style={styles.majorsLabel}>Majors</Text>
          {registeredMajors.map((major) => (
            <View key={major} style={styles.majorPill}>
              <Text style={styles.majorPillText}>{major}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {majorPathwayChoices.length > 0 ? (
        <View style={styles.pathwayLockSection}>
          <Text style={styles.pathwayLockTitle}>Your major pathways</Text>
          <Text style={styles.pathwayLockSubtitle}>
            These are the courses being checked for your major requirements each
            year. Tap Change if the detected route doesn't match what you're
            actually doing.
          </Text>

          {majorPathwayChoices.map((row) => (
            <View
              key={`${row.majorName}-${row.yearLabel}`}
              style={styles.pathwayLockRow}
            >
              {/* Header: major + year on left, controls on right */}
              <View style={styles.pathwayLockRowHead}>
                <View style={styles.pathwayLockRowHeadLeft}>
                  <Text style={styles.pathwayLockMajor}>{row.majorName}</Text>
                  <Text style={styles.pathwayLockYear}>{row.yearLabel}</Text>
                </View>
                <View style={styles.pathwayLockActions}>
                  {row.source === "manual" ? (
                    <Pressable
                      onPress={() =>
                        clearMajorPathwayLock(row.majorName, row.yearLabel)
                      }
                      style={styles.pathwayResetBtn}
                    >
                      <Text style={styles.pathwayResetBtnText}>Reset</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.pathwayAutoTag}>Auto</Text>
                  )}
                  <Pressable
                    onPress={() =>
                      cycleMajorPathwayLock(
                        row.majorName,
                        row.yearLabel,
                        row.options,
                      )
                    }
                    style={styles.pathwayLockBtn}
                  >
                    <Text style={styles.pathwayLockBtnText}>Change</Text>
                  </Pressable>
                </View>
              </View>

              {/* Route description */}
              <Text style={styles.pathwayRouteLabel}>
                {row.selectedDescription}
              </Text>

              {/* Course code pills */}
              {row.selectedCourses.length > 0 ? (
                <View style={styles.pathwayCoursePills}>
                  {row.selectedCourses.map((course) => (
                    <View key={course.code} style={styles.pathwayCoursePill}>
                      <Text style={styles.pathwayCoursePillText}>
                        {course.code}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {/* ── Year tabs ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.yearTabsScroll}
        contentContainerStyle={styles.yearTabsContent}
      >
        {availableYears.map((year) => {
          const isActive = year === selectedYear;
          const yearNum = getYearNumber(year);
          const yearBlockers = (validationReport?.issues ?? []).filter(
            (i) => i.severity === "blocker" && i.relatedTerm?.startsWith(year),
          ).length;
          return (
            <Pressable
              key={year}
              onPress={() => setSelectedYear(year)}
              style={[styles.yearTab, isActive && styles.yearTabActive]}
            >
              <Text
                style={[
                  styles.yearTabText,
                  isActive && styles.yearTabTextActive,
                ]}
              >
                Year {yearNum}
              </Text>
              {yearBlockers > 0 ? (
                <View style={styles.yearTabBadge}>
                  <Text style={styles.yearTabBadgeText}>{yearBlockers}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Semester grid ── */}
      <View style={styles.semGrid}>
        {(["Semester 1", "Semester 2"] as const).map((sem) => {
          // Whole-year courses (H/W) are rendered below the grid, not inside a column
          const semCourses = yearCourses.filter(
            (c) => c.semester === sem && !c.semesterCode,
          );
          const semCredits = semCourses.reduce((s, c) => s + c.credits, 0);
          const isOver = semCredits > maxTermCredits;
          const isPickingSem = selectedSemester === sem;

          return (
            <View key={sem} style={styles.semCol}>
              {/* Column header */}
              <View style={styles.semColHeader}>
                <Text style={styles.semLabel}>{sem}</Text>
                <Text
                  style={[styles.semCredits, isOver && styles.semCreditsOver]}
                >
                  {semCredits} cr{isOver ? " · over limit" : ""}
                </Text>
              </View>

              {/* Course chips */}
              {semCourses.length === 0 ? (
                <Text style={styles.semEmpty}>No courses added.</Text>
              ) : (
                semCourses.map((course) => {
                  const variant = getCourseChipVariant(course);
                  const risk = riskMap.get(course.code);
                  const dp = dpMap.get(course.code);
                  const riskLevel: RiskLevel = risk?.level ?? "none";
                  return (
                    <View
                      key={course.id}
                      style={[
                        styles.courseChip,
                        variant === "blocker" && styles.courseChipBlocker,
                        variant === "warning" && styles.courseChipWarning,
                        variant === "completed" && styles.courseChipCompleted,
                        variant === "inProgress" && styles.courseChipInProgress,
                      ]}
                    >
                      <View style={styles.chipLeft}>
                        <Text
                          style={[
                            styles.chipCode,
                            variant === "blocker" && styles.chipCodeBlocker,
                            variant === "warning" && styles.chipCodeWarning,
                          ]}
                        >
                          {course.code}
                        </Text>
                        <Text style={styles.chipName} numberOfLines={2}>
                          {course.name}
                        </Text>
                        {/* Risk badge — only shown on planned courses with risk */}
                        {riskLevel !== "none" && course.status === "Planned" && (
                          <View
                            style={[
                              styles.riskBadge,
                              riskLevel === "high" && styles.riskBadgeHigh,
                              riskLevel === "medium" && styles.riskBadgeMedium,
                              riskLevel === "low" && styles.riskBadgeLow,
                            ]}
                          >
                            <Text style={styles.riskBadgeText}>
                              {riskLevel === "high"
                                ? "⚠ High risk"
                                : riskLevel === "medium"
                                  ? "⚠ At risk"
                                  : "· Review prereqs"}
                            </Text>
                          </View>
                        )}
                        {/* DP requirement badge */}
                        {dp && course.status === "Planned" && (
                          <View style={styles.dpBadge}>
                            <Text style={styles.dpBadgeText}>DP req</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.chipRight}>
                        <Text style={styles.chipCredits}>
                          {course.credits} cr
                        </Text>
                        {plannedCourseIdSet.has(course.id) ? (
                          <Pressable
                            onPress={() => removeCourse(course.id)}
                            style={styles.chipRemove}
                            hitSlop={8}
                          >
                            <Text style={styles.chipRemoveText}>×</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              )}

              {/* Inline add course */}
              <View style={styles.addCourseRow}>
                {isPastTerm(selectedYear, sem) ? (
                  <Text style={styles.pastTermText}>
                    Past semester — locked
                  </Text>
                ) : isCurrentTerm(selectedYear, sem) ? (
                  <Text style={styles.pastTermText}>
                    Current semester — in progress
                  </Text>
                ) : (
                  <Pressable
                    onPress={() => {
                      setSelectedSemester(sem);
                      setIsCourseDropdownOpen(true);
                    }}
                    style={styles.addCourseTrigger}
                  >
                    <Text style={styles.addCourseTriggerText}>
                      + Add course
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* ── Whole-year courses (H / W semester codes) ── */}
      {yearCourses.some((c) => c.semesterCode) && (
        <View style={styles.wholeYearRow}>
          <View style={styles.wholeYearHeader}>
            <Text style={styles.wholeYearLabel}>Full Year</Text>
            <Text style={styles.wholeYearSub}>
              {yearCourses
                .filter((c) => c.semesterCode)
                .reduce((s, c) => s + c.credits, 0)}{" "}
              cr
            </Text>
          </View>
          <View style={styles.wholeYearChips}>
            {yearCourses
              .filter((c) => c.semesterCode)
              .map((course) => {
                const variant = getCourseChipVariant(course);
                const risk = riskMap.get(course.code);
                const dp = dpMap.get(course.code);
                const riskLevel: RiskLevel = risk?.level ?? "none";
                return (
                  <View
                    key={course.id}
                    style={[
                      styles.courseChip,
                      styles.wholeYearChip,
                      variant === "blocker" && styles.courseChipBlocker,
                      variant === "warning" && styles.courseChipWarning,
                      variant === "completed" && styles.courseChipCompleted,
                      variant === "inProgress" && styles.courseChipInProgress,
                    ]}
                  >
                    <View style={styles.chipLeft}>
                      <Text
                        style={[
                          styles.chipCode,
                          variant === "blocker" && styles.chipCodeBlocker,
                          variant === "warning" && styles.chipCodeWarning,
                        ]}
                      >
                        {course.code}
                      </Text>
                      <Text style={styles.chipName} numberOfLines={2}>
                        {course.name}
                      </Text>
                      {riskLevel !== "none" && course.status === "Planned" && (
                        <View
                          style={[
                            styles.riskBadge,
                            riskLevel === "high" && styles.riskBadgeHigh,
                            riskLevel === "medium" && styles.riskBadgeMedium,
                            riskLevel === "low" && styles.riskBadgeLow,
                          ]}
                        >
                          <Text style={styles.riskBadgeText}>
                            {riskLevel === "high"
                              ? "⚠ High risk"
                              : riskLevel === "medium"
                                ? "⚠ At risk"
                                : "· Review prereqs"}
                          </Text>
                        </View>
                      )}
                      {dp && course.status === "Planned" && (
                        <View style={styles.dpBadge}>
                          <Text style={styles.dpBadgeText}>DP req</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.chipRight}>
                      <Text style={styles.chipCredits}>
                        {course.credits} cr
                      </Text>
                      {plannedCourseIdSet.has(course.id) ? (
                        <Pressable
                          onPress={() => removeCourse(course.id)}
                          style={styles.chipRemove}
                          hitSlop={8}
                        >
                          <Text style={styles.chipRemoveText}>×</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                );
              })}
          </View>
        </View>
      )}

      {/* ── Course picker (shown when open) ── */}
      {isCourseDropdownOpen ? (
        <View style={styles.pickerCard}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>
              Add to {selectedYear} · {selectedSemester}
            </Text>
            <Pressable
              onPress={() => {
                setIsCourseDropdownOpen(false);
                setSelectedCourse(null);
                setCourseSearch("");
                setAddError(null);
              }}
              hitSlop={8}
            >
              <Text style={styles.pickerClose}>✕</Text>
            </Pressable>
          </View>

          {/* Level filter */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.levelFilterRow}
          >
            {courseLevelFilters.map((group) => {
              const isActive = group === activeGroup;
              return (
                <Pressable
                  key={group}
                  onPress={() => setActiveGroup(group)}
                  style={[styles.levelPill, isActive && styles.levelPillActive]}
                >
                  <Text
                    style={[
                      styles.levelPillText,
                      isActive && styles.levelPillTextActive,
                    ]}
                  >
                    {group}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Search */}
          <TextInput
            value={courseSearch}
            onChangeText={setCourseSearch}
            placeholder="Search by code or name…"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.searchInput}
          />

          {/* Results */}
          {isLoading ? (
            <Text style={styles.pickerEmpty}>Loading courses…</Text>
          ) : loadError ? (
            <Text style={styles.pickerError}>{loadError}</Text>
          ) : (
            <ScrollView
              style={styles.pickerList}
              keyboardShouldPersistTaps="handled"
            >
              {visibleCourses.length === 0 ? (
                <Text style={styles.pickerEmpty}>
                  No courses match this filter.
                </Text>
              ) : (
                visibleCourses.map((course) => {
                  const isActive = selectedCourse?.code === course.code;
                  return (
                    <Pressable
                      key={course.code}
                      onPress={() => setSelectedCourse(course)}
                      style={[
                        styles.pickerOption,
                        isActive && styles.pickerOptionActive,
                      ]}
                    >
                      <View style={styles.pickerOptionContent}>
                        <Text
                          style={[
                            styles.pickerOptionCode,
                            isActive && styles.pickerOptionActiveText,
                          ]}
                        >
                          {course.code}
                        </Text>
                        <Text
                          style={[
                            styles.pickerOptionName,
                            isActive && styles.pickerOptionActiveText,
                          ]}
                          numberOfLines={1}
                        >
                          {course.title}
                        </Text>
                      </View>
                      <Text style={styles.pickerOptionCredits}>
                        {course.credits} cr
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          )}

          {addError ? <Text style={styles.addError}>{addError}</Text> : null}

          <Pressable
            onPress={addCourse}
            disabled={!selectedCourse}
            style={[
              styles.addConfirmBtn,
              !selectedCourse && styles.addConfirmBtnDisabled,
            ]}
          >
            <Text style={styles.addConfirmBtnText}>
              {selectedCourse
                ? `Add ${selectedCourse.code} to ${selectedSemester}`
                : "Select a course above"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* ── Degree progress ── */}
      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Degree progress</Text>
          <Text style={styles.progressValue}>
            {totalTrackedCredits} / {targetCredits} credits
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: `${progressPercent}%` }]}
          />
        </View>
        <View style={styles.progressLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.legendDotCompleted]} />
            <Text style={styles.legendText}>
              Completed · {completedCredits} cr
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.legendDotInProgress]} />
            <Text style={styles.legendText}>
              In progress · {inProgressCredits} cr
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.legendDotPlanned]} />
            <Text style={styles.legendText}>Planned · {plannedCredits} cr</Text>
          </View>
        </View>
      </View>

      {/* ── Major completion gaps ── */}
      {majorRequirementGaps.length > 0 ? (
        <View style={styles.majorGapSection}>
          <Text style={styles.majorGapTitle}>Major completion check</Text>
          <Text style={styles.majorGapSubtitle}>
            Required major courses are missing from your approved history and
            current plan.
          </Text>

          {majorRequirementGaps.map((gap) => (
            <View key={gap.id} style={styles.majorGapRow}>
              <View style={styles.majorGapHeader}>
                <Text style={styles.majorGapMajor}>{gap.majorName}</Text>
                <Text style={styles.majorGapCode}>{gap.code}</Text>
              </View>
              <Text style={styles.majorGapName}>{gap.title}</Text>
              {gap.missingPrereqCodes.length > 0 ? (
                <Text style={styles.majorGapBlockedText}>
                  Missing prerequisite(s): {gap.missingPrereqCodes.join(", ")}
                </Text>
              ) : gap.recommendedYear && gap.recommendedSemester ? (
                <Pressable
                  onPress={() =>
                    openSuggestedCourse(
                      gap.code,
                      gap.recommendedYear as string,
                      gap.recommendedSemester as string,
                    )
                  }
                  style={styles.majorGapActionBtn}
                >
                  <Text style={styles.majorGapActionText}>
                    Option: plan in {gap.recommendedYear} ·{" "}
                    {gap.recommendedSemester}
                  </Text>
                </Pressable>
              ) : (
                <Text style={styles.majorGapPendingText}>
                  No valid open slot found yet under current term/load rules.
                </Text>
              )}
            </View>
          ))}

          {majorRulesError ? (
            <Text style={styles.majorGapError}>{majorRulesError}</Text>
          ) : null}
        </View>
      ) : majorRulesError ? (
        <View style={styles.majorGapSection}>
          <Text style={styles.majorGapError}>{majorRulesError}</Text>
        </View>
      ) : null}

      {/* ── Degree Requirements ── */}
      {hasPlannerInputs && degreeRequirementIssues.length > 0 ? (
        <View style={styles.degreeReqSection}>
          <Text style={styles.issuesSectionTitle}>Degree Requirements</Text>
          {degreeRequirementIssues.map((issue) => (
            <View key={issue.id} style={styles.degreeReqRow}>
              <View style={styles.issueDot} />
              <View style={styles.issueBody}>
                <Text style={styles.issueTitle}>{issue.title}</Text>
                <Text style={styles.issueMsg}>{issue.message}</Text>
                <Pressable
                  onPress={() =>
                    router.push(
                      getIssueActionTarget(issue.category).route as any,
                    )
                  }
                >
                  <Text style={styles.issueAction}>
                    {getIssueActionHint({
                      category: issue.category,
                    })}{" "}
                    →
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* ── Issues list ── */}
      {hasPlannerInputs &&
      (yearValidationIssues.length > 0 || yearHandbookRuleIssues.length > 0) ? (
        <View style={styles.issuesSection}>
          <Text style={styles.issuesSectionTitle}>
            Issues
          </Text>

          {yearValidationIssues.map((issue) => (
            <View
              key={issue.id}
              style={[
                styles.issueRow,
                issue.severity === "blocker" && styles.issueRowBlocker,
              ]}
            >
              <View
                style={[
                  styles.issueDot,
                  issue.severity === "blocker"
                    ? styles.issueDotBlocker
                    : styles.issueDotWarn,
                ]}
              />
              <View style={styles.issueBody}>
                <Text
                  style={[
                    styles.issueTitle,
                    issue.severity === "blocker" && styles.issueTitleBlocker,
                  ]}
                >
                  {issue.title}
                </Text>
                <Text style={styles.issueMsg}>{issue.message}</Text>
                <Pressable
                  onPress={() =>
                    router.push(
                      getIssueActionTarget(issue.category).route as any,
                    )
                  }
                >
                  <Text style={styles.issueAction}>
                    {getIssueActionHint({
                      category: issue.category,
                      relatedCourseCode: issue.relatedCourseCode,
                      relatedTerm: issue.relatedTerm,
                    })}{" "}
                    →
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}

          {yearHandbookRuleIssues.map((issue) => (
            <View
              key={issue.id}
              style={[
                styles.issueRow,
                issue.severity === "blocker" && styles.issueRowBlocker,
              ]}
            >
              <View
                style={[
                  styles.issueDot,
                  issue.severity === "blocker"
                    ? styles.issueDotBlocker
                    : styles.issueDotWarn,
                ]}
              />
              <View style={styles.issueBody}>
                <Text
                  style={[
                    styles.issueTitle,
                    issue.severity === "blocker" && styles.issueTitleBlocker,
                  ]}
                >
                  {issue.title}
                </Text>
                <Text style={styles.issueMsg}>{issue.message}</Text>
                {issue.ruleReference ? (
                  <Text style={styles.issueEvidence}>
                    {issue.ruleReference}
                    {issue.ruleSourceText ? ` — ${issue.ruleSourceText}` : ""}
                  </Text>
                ) : null}
                <Pressable
                  onPress={() =>
                    router.push(
                      getIssueActionTarget(issue.category).route as any,
                    )
                  }
                >
                  <Text style={styles.issueAction}>
                    {getIssueActionHint({
                      category: issue.category,
                      relatedCourseCode: issue.relatedCourseCode,
                      relatedTerm: issue.relatedTerm,
                    })}{" "}
                    →
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}

          {isHandbookValidationLoading ? (
            <Text style={styles.handbookCheckingText}>
              Checking handbook rules…
            </Text>
          ) : null}
          {handbookRuleError ? (
            <Text style={styles.handbookErrorText}>{handbookRuleError}</Text>
          ) : null}
        </View>
      ) : null}

      {/* ── Risk & DP summary panel ── */}
      {(() => {
        const riskEntries = Array.from(riskMap.entries()).filter(
          ([, ann]) => ann.level !== "none",
        );
        const dpEntries = Array.from(dpMap.entries());
        if (riskEntries.length === 0 && dpEntries.length === 0) return null;
        return (
          <View style={styles.riskPanel}>
            <Text style={styles.riskPanelTitle}>Academic Risk Summary</Text>
            <Text style={styles.riskPanelSub}>
              Based on your grades in prerequisite courses
            </Text>

            {riskEntries.map(([code, ann]) => (
              <View
                key={code}
                style={[
                  styles.riskRow,
                  ann.level === "high" && styles.riskRowHigh,
                  ann.level === "medium" && styles.riskRowMedium,
                  ann.level === "low" && styles.riskRowLow,
                ]}
              >
                <View style={styles.riskRowHeader}>
                  <Text style={styles.riskRowCode}>{code}</Text>
                  <View
                    style={[
                      styles.riskLevelPill,
                      ann.level === "high" && styles.riskLevelPillHigh,
                      ann.level === "medium" && styles.riskLevelPillMedium,
                      ann.level === "low" && styles.riskLevelPillLow,
                    ]}
                  >
                    <Text style={styles.riskLevelText}>
                      {ann.level === "high"
                        ? "High Risk"
                        : ann.level === "medium"
                          ? "At Risk"
                          : "Low Risk"}
                    </Text>
                  </View>
                </View>
                {ann.reasons.map((reason, i) => (
                  <Text key={i} style={styles.riskReason}>
                    • {reason}
                  </Text>
                ))}
              </View>
            ))}

            {dpEntries.length > 0 && (
              <>
                <Text style={styles.riskPanelDpHeading}>
                  DP Requirements (Duly Performed)
                </Text>
                {dpEntries.map(([code, dp]) => (
                  <View key={code} style={styles.dpRow}>
                    <Text style={styles.dpRowCode}>{code}</Text>
                    <Text style={styles.dpRowText}>{dp.text}</Text>
                  </View>
                ))}
              </>
            )}
          </View>
        );
      })()}
    </MainLayout>
  );
}

const styles = StyleSheet.create({
  // ── Page header ──────────────────────────────────────────────────────────
  pageHeader: {
    marginBottom: theme.spacing.md,
  },
  pageHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  pageHeaderLeft: {
    flex: 1,
    gap: 3,
  },
  generatePlanBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.deepBlue,
    flexShrink: 0,
    alignSelf: "flex-start",
  },
  generatePlanBtnDisabled: {
    opacity: 0.5,
  },
  generatePlanBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  // ── Auto-plan panel ───────────────────────────────────────────────────────
  autoPlanPanel: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  autoPlanPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  autoPlanPanelTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  autoPlanClose: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.deepBlue,
  },
  autoPlanCard: {
    borderWidth: 1,
    borderColor: theme.colors.gray,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    gap: 4,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.deepBlue,
  },
  autoPlanCardTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  autoPlanCardMeta: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  autoPlanRationale: {
    fontSize: 11,
    color: theme.colors.textLight,
    lineHeight: 16,
  },
  autoPlanTerm: {
    marginTop: 6,
    gap: 2,
  },
  autoPlanTermLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  autoPlanTermCourse: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    paddingLeft: 8,
  },

  title: {
    fontSize: Platform.OS === "web" ? theme.fontSize.xxl : theme.fontSize.xl,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
    lineHeight: 20,
  },

  // ── Sync bar ─────────────────────────────────────────────────────────────
  syncBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
    flexWrap: "wrap",
  },
  syncStatusText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    flexShrink: 1,
  },
  syncErrorInline: {
    color: "#B3261E",
    fontWeight: "600",
  },
  syncNoticeInline: {
    color: theme.colors.success,
    fontWeight: "600",
  },
  syncActions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    alignItems: "center",
    flexWrap: "wrap",
  },
  headerBtns: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.sm,
    flexShrink: 0,
  },
  downloadPlanBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.deepBlue,
    flexShrink: 0,
    alignSelf: "flex-start",
  },
  downloadPlanBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.deepBlue,
  },
  downloadModalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  downloadModal: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "88%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  downloadModalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1E3A5F",
    marginBottom: 4,
  },
  downloadModalSub: {
    fontSize: 13,
    color: "#64748B",
    marginBottom: 18,
  },
  downloadOption: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
    gap: 12,
  },
  downloadOptionPrimary: {
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
  },
  downloadOptionIcon: {
    fontSize: 24,
    marginTop: 2,
  },
  downloadOptionBody: {
    flex: 1,
  },
  downloadOptionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E3A5F",
    marginBottom: 3,
  },
  downloadOptionDesc: {
    fontSize: 12,
    color: "#475569",
    lineHeight: 17,
  },
  downloadErrorText: {
    fontSize: 12,
    color: "#DC2626",
    marginBottom: 8,
    textAlign: "center",
  },
  downloadGeneratingText: {
    fontSize: 13,
    color: "#2563EB",
    marginBottom: 8,
    textAlign: "center",
    fontStyle: "italic",
  },
  downloadCancelBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 4,
  },
  downloadCancelText: {
    fontSize: 14,
    color: "#64748B",
    fontWeight: "600",
  },
  saveBtnBase: {
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderColor: theme.colors.gray,
    backgroundColor: theme.colors.white,
  },
  saveBtnBlocked: {
    borderColor: "#B3261E",
    backgroundColor: "#FDF2F2",
  },
  saveBtnBlockedText: {
    color: "#B3261E",
  },
  saveBtnWarn: {
    borderColor: theme.colors.blue,
    backgroundColor: theme.colors.babyBlue,
  },
  saveBtnWarnText: {
    color: theme.colors.deepBlue,
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
  },
  saveBtnReady: {
    borderColor: theme.colors.success,
    backgroundColor: theme.colors.successLight,
  },
  saveBtnReadyText: {
    color: theme.colors.deepBlue,
  },
  saveBtnIdle: {
    borderColor: theme.colors.gray,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },

  // ── Issue banners ─────────────────────────────────────────────────────────
  issueBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    marginBottom: theme.spacing.sm,
  },
  issueBannerBlocker: {
    backgroundColor: "#FDF2F2",
    borderColor: "#F7C1C1",
  },
  issueBannerWarn: {
    backgroundColor: "#FAEEDA",
    borderColor: "#FAC775",
  },
  issueBannerOk: {
    backgroundColor: theme.colors.successLight,
    borderColor: theme.colors.success,
  },
  issueBannerText: {
    fontSize: theme.fontSize.sm,
    color: "#791F1F",
    flex: 1,
    lineHeight: 20,
  },
  issueBannerWarnText: {
    color: "#633806",
  },
  issueBannerOkText: {
    color: theme.colors.deepBlue,
  },
  issueBannerBold: {
    fontWeight: "700",
  },
  issueDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    flexShrink: 0,
  },
  issueDotBlocker: {
    backgroundColor: "#E24B4A",
  },
  issueDotWarn: {
    backgroundColor: "#EF9F27",
  },
  issueDotOk: {
    backgroundColor: theme.colors.success,
  },

  // ── Majors ───────────────────────────────────────────────────────────────
  majorsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginBottom: theme.spacing.md,
  },
  majorsLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
    marginRight: 2,
  },
  majorPill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: theme.borderRadius.round,
    backgroundColor: theme.colors.babyBlue,
    borderWidth: 1,
    borderColor: theme.colors.blue,
  },
  majorPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.deepBlue,
  },

  pathwayLockSection: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    gap: 8,
  },
  pathwayLockTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  pathwayLockSubtitle: {
    fontSize: 12,
    color: theme.colors.textLight,
    marginBottom: 4,
  },
  pathwayLockRow: {
    borderWidth: 1,
    borderColor: theme.colors.gray,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.grayLight,
    padding: 10,
    gap: 8,
  },
  pathwayLockRowHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  pathwayLockRowHeadLeft: {
    flex: 1,
    gap: 2,
  },
  pathwayLockMajor: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  pathwayLockYear: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  pathwayRouteLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontStyle: "italic",
  },
  pathwayCoursePills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  pathwayCoursePill: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.blue,
    backgroundColor: theme.colors.babyBlue,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pathwayCoursePillText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.deepBlue,
  },
  pathwayLockActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  pathwayLockBtn: {
    borderWidth: 1,
    borderColor: theme.colors.blue,
    backgroundColor: theme.colors.babyBlue,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pathwayLockBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.deepBlue,
  },
  pathwayResetBtn: {
    borderWidth: 1,
    borderColor: theme.colors.gray,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: theme.colors.white,
  },
  pathwayResetBtnText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: "600",
  },
  pathwayAutoTag: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontWeight: "600",
  },

  // ── Year tabs ─────────────────────────────────────────────────────────────
  yearTabsScroll: {
    marginBottom: theme.spacing.md,
  },
  yearTabsContent: {
    gap: 6,
    paddingRight: theme.spacing.sm,
    alignItems: "center",
  },
  yearTab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    width: 104,
    height: 38,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    backgroundColor: theme.colors.card,
  },
  yearTabActive: {
    borderColor: theme.colors.blue,
    backgroundColor: theme.colors.babyBlue,
  },
  yearTabText: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  yearTabTextActive: {
    color: theme.colors.deepBlue,
  },
  yearTabBadge: {
    backgroundColor: "#E24B4A",
    borderRadius: 99,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  yearTabBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },

  // ── Semester grid ─────────────────────────────────────────────────────────
  semGrid: {
    flexDirection: Platform.OS === "web" ? "row" : "column",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  wholeYearRow: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.babyBlue,
    borderStyle: "dashed",
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  wholeYearHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing.sm,
  },
  wholeYearLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.babyBlue,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  wholeYearSub: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  wholeYearChips: {
    flexDirection: "column",
    gap: 4,
  },
  wholeYearChip: {
    width: "100%",
    paddingVertical: 5,
    alignItems: "center",
    marginBottom: 0,
  },
  semCol: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    padding: theme.spacing.md,
  },
  semColHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing.sm,
  },
  semLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  semCredits: {
    fontSize: 12,
    color: theme.colors.textLight,
  },
  semCreditsOver: {
    color: "#B3261E",
    fontWeight: "600",
  },
  semEmpty: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.sm,
  },

  // ── Course chips ──────────────────────────────────────────────────────────
  courseChip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    backgroundColor: theme.colors.grayLight,
    marginBottom: 6,
  },
  courseChipBlocker: {
    borderColor: "#F7C1C1",
    backgroundColor: "#FDF2F2",
  },
  courseChipWarning: {
    borderColor: "#FAC775",
    backgroundColor: "#FAEEDA",
  },
  courseChipCompleted: {
    opacity: 0.55,
  },
  courseChipInProgress: {
    borderColor: theme.colors.blue,
    backgroundColor: theme.colors.babyBlue,
  },
  chipLeft: {
    flex: 1,
    gap: 2,
  },
  chipCode: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  chipCodeBlocker: {
    color: "#B3261E",
  },
  chipCodeWarning: {
    color: "#854F0B",
  },
  chipName: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textPrimary,
    lineHeight: 18,
  },
  chipRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  chipCredits: {
    fontSize: 11,
    color: theme.colors.textLight,
  },
  chipRemove: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    backgroundColor: theme.colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  chipRemoveText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 14,
  },

  // ── Inline add row ────────────────────────────────────────────────────────
  addCourseRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.gray,
  },
  addCourseTrigger: {
    paddingVertical: 6,
  },
  addCourseTriggerText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
    fontWeight: "600",
  },
  pastTermText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textMuted,
    fontStyle: "italic",
    paddingVertical: 6,
  },

  // ── Course picker card ────────────────────────────────────────────────────
  pickerCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing.sm,
  },
  pickerTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  pickerClose: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    padding: 4,
  },
  levelFilterRow: {
    gap: 6,
    marginBottom: theme.spacing.sm,
  },
  levelPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.round,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    backgroundColor: theme.colors.grayLight,
  },
  levelPillActive: {
    backgroundColor: theme.colors.blue,
    borderColor: theme.colors.blue,
  },
  levelPillText: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  levelPillTextActive: {
    color: theme.colors.white,
  },
  searchInput: {
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  pickerList: {
    maxHeight: 300,
    marginBottom: theme.spacing.sm,
  },
  pickerOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    backgroundColor: theme.colors.white,
    marginBottom: 6,
    gap: 8,
  },
  pickerOptionActive: {
    borderColor: theme.colors.blue,
    backgroundColor: theme.colors.babyBlue,
    borderWidth: 2,
  },
  pickerOptionContent: {
    flex: 1,
    gap: 2,
  },
  pickerOptionCode: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  pickerOptionName: {
    fontSize: theme.fontSize.md,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  pickerOptionCredits: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
    fontWeight: "600",
  },
  pickerOptionActiveText: {
    color: theme.colors.deepBlue,
  },
  pickerEmpty: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textMuted,
    paddingVertical: theme.spacing.sm,
  },
  pickerError: {
    fontSize: theme.fontSize.sm,
    color: "#B3261E",
    paddingVertical: theme.spacing.sm,
  },
  addError: {
    fontSize: theme.fontSize.sm,
    color: "#B3261E",
    marginBottom: theme.spacing.sm,
    fontWeight: "600",
  },
  addConfirmBtn: {
    backgroundColor: theme.colors.blue,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  addConfirmBtnDisabled: {
    opacity: 0.45,
  },
  addConfirmBtnText: {
    color: theme.colors.white,
    fontSize: theme.fontSize.md,
    fontWeight: "700",
  },

  // ── Degree progress ───────────────────────────────────────────────────────
  progressSection: {
    marginBottom: theme.spacing.md,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  progressValue: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  progressTrack: {
    height: 6,
    borderRadius: 99,
    backgroundColor: theme.colors.grayLight,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressFill: {
    height: "100%",
    borderRadius: 99,
    backgroundColor: theme.colors.success,
  },
  progressLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 99,
  },
  legendDotCompleted: {
    backgroundColor: theme.colors.deepBlue,
  },
  legendDotInProgress: {
    backgroundColor: theme.colors.success,
  },
  legendDotPlanned: {
    backgroundColor: theme.colors.babyBlue,
  },
  legendText: {
    fontSize: 12,
    color: theme.colors.textLight,
  },

  // ── Major completion gaps ───────────────────────────────────────────────
  majorGapSection: {
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    padding: theme.spacing.md,
    gap: 8,
  },
  majorGapTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  majorGapSubtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
    lineHeight: 18,
  },
  majorGapRow: {
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: "#FAC775",
    backgroundColor: "#FFF8EC",
    padding: theme.spacing.sm,
    gap: 4,
  },
  majorGapHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  majorGapMajor: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: "#5A3A00",
    flex: 1,
  },
  majorGapCode: {
    fontSize: 12,
    fontWeight: "700",
    color: "#7A4B00",
  },
  majorGapName: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textPrimary,
    lineHeight: 18,
  },
  majorGapBlockedText: {
    fontSize: theme.fontSize.sm,
    color: "#9A2A1A",
    fontWeight: "600",
  },
  majorGapPendingText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
  },
  majorGapActionBtn: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: theme.colors.blue,
    backgroundColor: theme.colors.babyBlue,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  majorGapActionText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
    fontWeight: "600",
  },
  majorGapError: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },

  // ── Issues list ───────────────────────────────────────────────────────────
  degreeReqSection: {
    marginBottom: theme.spacing.md,
  },
  degreeReqRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: "#C8D8F0",
    backgroundColor: "#EEF4FF",
    marginBottom: 6,
  },
  issuesSection: {
    marginBottom: theme.spacing.md,
  },
  issuesSectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  issueRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    backgroundColor: theme.colors.card,
    marginBottom: 6,
  },
  issueRowBlocker: {
    borderColor: "#F7C1C1",
  },
  issueBody: {
    flex: 1,
    gap: 3,
  },
  issueTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  issueTitleBlocker: {
    color: "#B3261E",
  },
  issueMsg: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
    lineHeight: 18,
  },
  issueEvidence: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontStyle: "italic",
    lineHeight: 18,
  },
  issueAction: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
    fontWeight: "600",
    marginTop: 2,
  },
  handbookCheckingText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  handbookErrorText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },

  // ── Risk badges (on course chips) ─────────────────────────────────────────
  riskBadge: {
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginTop: 3,
    alignSelf: "flex-start",
  },
  riskBadgeHigh: { backgroundColor: "#FEE2E2" },
  riskBadgeMedium: { backgroundColor: "#FFEDD5" },
  riskBadgeLow: { backgroundColor: "#FEF9C3" },
  riskBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#78350F",
  },
  dpBadge: {
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginTop: 2,
    alignSelf: "flex-start",
    backgroundColor: "#EDE9FE",
  },
  dpBadgeText: {
    fontSize: 9,
    fontWeight: "600",
    color: "#5B21B6",
  },

  // ── Risk & DP summary panel ────────────────────────────────────────────────
  riskPanel: {
    margin: theme.spacing.md,
    marginTop: 0,
    backgroundColor: "#FFFBEB",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  riskPanelTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#78350F",
    marginBottom: 2,
  },
  riskPanelSub: {
    fontSize: 12,
    color: "#92400E",
    marginBottom: 12,
  },
  riskRow: {
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
  },
  riskRowHigh: {
    backgroundColor: "#FEF2F2",
    borderLeftColor: "#DC2626",
  },
  riskRowMedium: {
    backgroundColor: "#FFF7ED",
    borderLeftColor: "#EA580C",
  },
  riskRowLow: {
    backgroundColor: "#FEFCE8",
    borderLeftColor: "#CA8A04",
  },
  riskRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  riskRowCode: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1E3A5F",
  },
  riskLevelPill: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  riskLevelPillHigh: { backgroundColor: "#FEE2E2" },
  riskLevelPillMedium: { backgroundColor: "#FFEDD5" },
  riskLevelPillLow: { backgroundColor: "#FEF9C3" },
  riskLevelText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#78350F",
  },
  riskReason: {
    fontSize: 12,
    color: "#44403C",
    lineHeight: 17,
    marginTop: 2,
  },
  riskPanelDpHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: "#5B21B6",
    marginTop: 12,
    marginBottom: 6,
  },
  dpRow: {
    backgroundColor: "#F5F3FF",
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: "#7C3AED",
  },
  dpRowCode: {
    fontSize: 12,
    fontWeight: "800",
    color: "#4C1D95",
    marginBottom: 2,
  },
  dpRowText: {
    fontSize: 12,
    color: "#374151",
    lineHeight: 17,
  },
});
