// ...existing code...
import MainLayout from "@/components/main-layout";
import { getPrimaryFacultySlug } from "@/constants/faculty";
import { theme } from "@/constants/theme";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useLoggedInUser } from "@/hooks/use-logged-in-user";
import { academicRepository } from "@/services/academic-repository";
import { getHandbookCourses, getScienceCourses } from "@/services/backend-api";
import { getIssueActionHint } from "@/services/remediation-actions";
import type {
    CompletedCourseRecord,
    InProgressCourseRecord,
    PlannedCourse,
} from "@/types/academic";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

// ─── Constants ────────────────────────────────────────────────────────────────
const DEGREE_TARGET_CREDITS = 360;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getYearMilestoneTarget(yearNumber: number | undefined): number {
  if (yearNumber === 1) return 72;
  if (yearNumber === 2) return 144;
  if (yearNumber === 3) return 228;
  return DEGREE_TARGET_CREDITS;
}

/**
 * Convert a calendar semester string (e.g. "S1 2025", "S2 2024") into the
 * "Year X - Sem Y" degree-year format by combining the calendar year with the
 * student's current enrollment year.
 *
 * Formula: degreeYear = calendarYear - 2025 + studentYear
 * e.g. a Year 4 student in "S1 2025" → Year 4, in "S2 2024" → Year 3.
 * "S2 XXXX" → Sem 2, everything else (S1, FY) → Sem 1.
 */
function mockCourseToDegreeSemester(
  calSemester: string,
  studentYear: number,
): string {
  const calYearMatch = calSemester.match(/\d{4}/);
  const calYear = calYearMatch ? parseInt(calYearMatch[0], 10) : 2025;
  const degreeYear = Math.min(Math.max(calYear - 2025 + studentYear, 1), 4);
  const sem = calSemester.startsWith("S2") ? 2 : 1;
  return `Year ${degreeYear} - Sem ${sem}`;
}

/**
 * UCT GPA = the raw percentage grade (0–100).
 * The overall GPA is the simple average of all passed course grades.
 */
function gradeToGpa(grade?: number): number {
  return grade ?? 0;
}

function formatLastSyncedAt(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString();
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface ForecastCourseRecord {
  id: string;
  code: string;
  title: string;
  credits: number;
  semester: string;
}

interface ProgressInsight {
  id: string;
  title: string;
  message: string;
  type: "positive" | "improvement" | "suggestion";
}

type CourseTab = "completed" | "inprogress" | "planned";

// ─── Ring SVG helper ──────────────────────────────────────────────────────────
// Renders a segmented donut showing completed / in-progress / planned vs total
function CreditRing({
  completed,
  inProgress,
  planned,
  total,
  size = 120,
  strokeWidth = 12,
}: {
  completed: number;
  inProgress: number;
  planned: number;
  total: number;
  size?: number;
  strokeWidth?: number;
}) {
  const isMobile = useIsMobile();
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  const safeTotal = Math.max(total, 1);
  const completedArc = (completed / safeTotal) * circumference;
  const inProgressArc = (inProgress / safeTotal) * circumference;
  const plannedArc = (planned / safeTotal) * circumference;

  // Each segment starts where the previous ends (rotating around -90° origin)
  const completedOffset = circumference - completedArc;
  const inProgressRotate = -90 + (completed / safeTotal) * 360;
  const plannedRotate = -90 + ((completed + inProgress) / safeTotal) * 360;

  const pct = Math.min(
    100,
    Math.round(((completed + inProgress + planned) / safeTotal) * 100),
  );

  return (
    <View style={{ width: size, height: size, position: "relative" }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ position: "absolute" } as any}
      >
        {/* Track */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={theme.colors.grayLight}
          strokeWidth={strokeWidth}
        />
        {/* Planned */}
        {plannedArc > 0 && (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#9FE1CB"
            strokeWidth={strokeWidth}
            strokeDasharray={`${plannedArc} ${circumference}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            transform={`rotate(${plannedRotate} ${cx} ${cy})`}
          />
        )}
        {/* In progress */}
        {inProgressArc > 0 && (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#1D9E75"
            strokeWidth={strokeWidth}
            strokeDasharray={`${inProgressArc} ${circumference}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            transform={`rotate(${inProgressRotate} ${cx} ${cy})`}
          />
        )}
        {/* Completed */}
        {completedArc > 0 && (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#085041"
            strokeWidth={strokeWidth}
            strokeDasharray={`${completedArc} ${circumference}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        )}
      </svg>
      <View style={styles.ringCenter}>
        <Text style={[styles.ringPct, !isMobile && styles.ringPctDesktop]}>{pct}%</Text>
        <Text style={styles.ringLabel}>complete</Text>
      </View>
    </View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Progress() {
  const isMobile = useIsMobile();
  const activeFacultySlug = getPrimaryFacultySlug();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<CourseTab>("completed");
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [catalogTitles, setCatalogTitles] = useState<Map<string, string>>(
    () => new Map(),
  );

  const {
    loggedInUser,
    mockUser,
    savedPlan,
    isLoading,
    syncStatus,
    syncError,
    lastSyncedAt,
    trustMessage,
    refresh,
  } = useLoggedInUser();

  useEffect(() => {
    let isMounted = true;

    getHandbookCourses({ faculty_slug: activeFacultySlug })
      .then((response) => {
        if (!isMounted) return;
        const nextMap = new Map<string, string>();
        response.courses.forEach((course) => {
          nextMap.set(course.code.trim().toUpperCase(), course.title);
        });
        setCatalogTitles(nextMap);
      })
      .catch(async () => {
        if (!isMounted) return;
        if (activeFacultySlug === "science") {
          try {
            const response = await getScienceCourses();
            const nextMap = new Map<string, string>();
            response.courses.forEach((course) => {
              nextMap.set(course.code.trim().toUpperCase(), course.title);
            });
            setCatalogTitles(nextMap);
            return;
          } catch {
            // fall through to repository fallback
          }
        }
        const fallbackCatalog = academicRepository.getCourseCatalog();
        const nextMap = new Map<string, string>();
        fallbackCatalog.forEach((course) => {
          nextMap.set(course.code.trim().toUpperCase(), course.title);
        });
        setCatalogTitles(nextMap);
      });

    return () => {
      isMounted = false;
    };
  }, [activeFacultySlug]);

  const courseCatalog = useMemo(
    () => academicRepository.getCourseCatalog(),
    [],
  );

  const courseTitleByCode = useMemo(
    () => (catalogTitles.size > 0 ? catalogTitles : new Map()),
    [catalogTitles],
  );

  const plannedCourses = useMemo<PlannedCourse[]>(() => {
    if (!savedPlan?.planned_courses?.length) return [];
    return savedPlan.planned_courses.map((course, index) => {
      const normalizedCode = course.code.trim().toUpperCase();
      return {
        id: `plan-${index}-${normalizedCode}-${course.year}-${course.semester}`,
        code: normalizedCode,
        name: courseTitleByCode.get(normalizedCode) ?? normalizedCode,
        credits: Number.isFinite(course.credits) ? course.credits : 0,
        year: course.year,
        semester: course.semester,
        status: "Planned",
      };
    });
  }, [courseTitleByCode, savedPlan]);

  const completedCourses = useMemo<CompletedCourseRecord[]>(() => {
    // Real student data — build from mock user's actual course history.
    // This feeds the validation engine so it has real prerequisite chains to check.
    if (mockUser) {
      return mockUser.completedCourses.passed.map((course, index) => ({
        id: `completed-${index}-${course.code}`,
        code: course.code,
        title:
          courseTitleByCode.get(course.code.trim().toUpperCase()) ??
          course.title,
        credits: course.credits,
        grade: course.grade != null ? `${course.grade}%` : "N/A",
        gpa: gradeToGpa(course.grade),
        semester: mockCourseToDegreeSemester(course.semester, mockUser.year),
      }));
    }
    // Fallback for unauthenticated/demo state
    if (!loggedInUser && !savedPlan)
      return academicRepository.getCompletedCourses();
    return [];
  }, [mockUser, loggedInUser, savedPlan, courseTitleByCode]);

  const failedCourses = useMemo<CompletedCourseRecord[]>(() => {
    if (mockUser) {
      return mockUser.completedCourses.failed.map((course, index) => ({
        id: `failed-${index}-${course.code}`,
        code: course.code,
        title:
          courseTitleByCode.get(course.code.trim().toUpperCase()) ??
          course.title,
        credits: course.credits,
        grade: course.grade != null ? `${course.grade}%` : "N/A",
        gpa: gradeToGpa(course.grade),
        semester: mockCourseToDegreeSemester(course.semester, mockUser.year),
        failed: true,
      }));
    }
    return [];
  }, [mockUser, courseTitleByCode]);

  const inProgressCourses = useMemo<InProgressCourseRecord[]>(() => {
    // Real student data — all courses registered for in the current academic year.
    if (mockUser) {
      return mockUser.coursesInProgress.map((course, index) => ({
        id: `inprogress-${index}-${course.code}`,
        code: course.code,
        title:
          courseTitleByCode.get(course.code.trim().toUpperCase()) ??
          course.title,
        credits: course.credits,
        currentGrade: "-",
        status: 50,
        semester: mockCourseToDegreeSemester(course.semester, mockUser.year),
      }));
    }
    if (!loggedInUser && !savedPlan)
      return academicRepository.getInProgressCourses();
    return [];
  }, [mockUser, loggedInUser, savedPlan, courseTitleByCode]);

  const forecastCourses = useMemo<ForecastCourseRecord[]>(() => {
    if (savedPlan?.planned_courses?.length) {
      return savedPlan.planned_courses.map((course, index) => {
        const normalizedCode = course.code.trim().toUpperCase();
        return {
          id: `forecast-${index}-${normalizedCode}-${course.year}-${course.semester}`,
          code: normalizedCode,
          title: courseTitleByCode.get(normalizedCode) ?? normalizedCode,
          credits: Number.isFinite(course.credits) ? course.credits : 0,
          semester: `${course.year} - ${course.semester}`,
        };
      });
    }

    if (loggedInUser || savedPlan) return [];

    return academicRepository
      .getInitialPlannedCourses()
      .filter((course) => course.status === "Planned")
      .map((course) => ({
        id: `forecast-${course.id}`,
        code: course.code,
        title: course.name,
        credits: course.credits,
        semester: `${course.year} - ${course.semester}`,
      }));
  }, [courseCatalog, courseTitleByCode, loggedInUser, savedPlan]);

  const validationReport = useMemo(
    () =>
      academicRepository.getAcademicValidationReport({
        plannedCourses,
        completedCourses,
        inProgressCourses,
        studentCombinationIds: mockUser?.combinationIds ?? [],
      }),
    [plannedCourses, completedCourses, inProgressCourses, mockUser],
  );

  const priorityFixes = useMemo(
    () =>
      validationReport.issues
        .filter(
          (issue) =>
            issue.severity === "blocker" || issue.severity === "warning",
        )
        .sort((a, b) => {
          if (a.severity === b.severity) return a.title.localeCompare(b.title);
          return a.severity === "blocker" ? -1 : 1;
        })
        .slice(0, 4)
        .map((issue) => ({
          ...issue,
          source: "Local",
          action: getIssueActionHint({
            category: issue.category,
            relatedCourseCode: issue.relatedCourseCode,
            relatedTerm: issue.relatedTerm,
          }),
        })),
    [validationReport.issues],
  );

  // ─── Derived numbers ─────────────────────────────────────────────────────
  const completedCredits = useMemo(
    () => completedCourses.reduce((sum, c) => sum + c.credits, 0),
    [completedCourses],
  );
  const inProgressCredits = useMemo(
    () => inProgressCourses.reduce((sum, c) => sum + c.credits, 0),
    [inProgressCourses],
  );
  const plannedCredits = useMemo(
    () => forecastCourses.reduce((sum, c) => sum + c.credits, 0),
    [forecastCourses],
  );

  const isProjectionOnly =
    !mockUser &&
    completedCourses.length === 0 &&
    inProgressCourses.length === 0 &&
    forecastCourses.length > 0;

  const cumulativeCredits =
    mockUser?.academicProgress.creditsEarned ?? completedCredits;
  const totalCreditsTarget =
    mockUser?.academicProgress.creditsTotal ?? DEGREE_TARGET_CREDITS;
  const projectedCredits =
    mockUser?.academicProgress.forecastCreditsEarned ??
    validationReport.projectedCredits;
  const projectedCreditShortfall = Math.max(
    totalCreditsTarget - projectedCredits,
    0,
  );
  const milestoneTarget =
    mockUser?.academicProgress.creditsMilestoneRequired ??
    getYearMilestoneTarget(loggedInUser?.year);
  const milestoneShortfall = Math.max(milestoneTarget - cumulativeCredits, 0);

  const cumulativeGPA = useMemo(() => {
    const graded = completedCourses.filter((c) => c.gpa > 0);
    if (graded.length === 0) return "0.0";
    const avg = graded.reduce((sum, c) => sum + c.gpa, 0) / graded.length;
    return avg.toFixed(1);
  }, [completedCourses]);

  // NQF7 credits — level-7 (third-year) courses
  // Use the pre-computed value from mock progress data if available (most accurate),
  // otherwise fall back to counting from completedCourses by course code level.
  const nqf7Earned = useMemo(() => {
    if (mockUser?.academicProgress.nqf7CreditsEarned != null) {
      return mockUser.academicProgress.nqf7CreditsEarned;
    }
    return completedCourses
      .filter((c) => {
        const match = c.code.match(/\d/);
        return match && parseInt(match[0], 10) >= 3;
      })
      .reduce((sum, c) => sum + c.credits, 0);
  }, [mockUser, completedCourses]);

  const nqf7Required = mockUser?.academicProgress.nqf7CreditsRequired ?? 120;

  // Milestone bar widths
  const milestoneBarCompleted = Math.min(
    (cumulativeCredits / milestoneTarget) * 100,
    100,
  );
  const milestoneBarInProgress = Math.min(
    (inProgressCredits / milestoneTarget) * 100,
    Math.max(0, 100 - milestoneBarCompleted),
  );
  const milestoneBarPlanned = Math.min(
    (plannedCredits / milestoneTarget) * 100,
    Math.max(0, 100 - milestoneBarCompleted - milestoneBarInProgress),
  );

  const lastSyncedLabel = formatLastSyncedAt(lastSyncedAt);

  // ─── Graduation readiness checklist ──────────────────────────────────────
  const prerequisiteIssues = validationReport.issues.filter(
    (i) => i.category === "prerequisite",
  );
  const coreRequirementIssues = validationReport.issues.filter(
    (i) => i.category === "core-requirement",
  );

  const remainingCredits = mockUser
    ? Math.max(
        mockUser.academicProgress.creditsTotal -
          mockUser.academicProgress.forecastCreditsEarned,
        0,
      )
    : validationReport.creditShortfall;

  const gradChecklist = [
    {
      id: "prereqs",
      title:
        prerequisiteIssues.length === 0
          ? "Prerequisites clear"
          : `${prerequisiteIssues.length} prerequisite issue${prerequisiteIssues.length === 1 ? "" : "s"} found`,
      detail:
        prerequisiteIssues.length === 0
          ? "No missing prerequisites detected in your current plan."
          : `${prerequisiteIssues.length} prerequisite issue${prerequisiteIssues.length === 1 ? "" : "s"} need sequencing fixes.`,
      status: (prerequisiteIssues.length === 0 ? "pass" : "fail") as
        | "pass"
        | "fail"
        | "pending",
      actionLabel: prerequisiteIssues.length > 0 ? "Fix in Planner" : undefined,
      route: "/(tabs)/planner" as const,
    },
    {
      id: "credits",
      title:
        remainingCredits > 0
          ? `${remainingCredits} credits remaining`
          : "Credit target met",
      detail:
        remainingCredits > 0
          ? `You need ${remainingCredits} more credits to reach the ${totalCreditsTarget}-credit target.`
          : "Your projected plan reaches the overall degree credit requirement.",
      status: (remainingCredits > 0 ? "fail" : "pass") as
        | "pass"
        | "fail"
        | "pending",
      actionLabel: remainingCredits > 0 ? "Go to Planner" : undefined,
      route: "/(tabs)/planner" as const,
    },
    {
      id: "core",
      title:
        coreRequirementIssues.length === 0
          ? "Core requirements on track"
          : `${coreRequirementIssues.length} core requirement${coreRequirementIssues.length === 1 ? "" : "s"} unresolved`,
      detail:
        coreRequirementIssues.length === 0
          ? "All tracked core requirement groups are represented in your plan."
          : `${coreRequirementIssues.length} core requirement rules are still unresolved.`,
      status: (coreRequirementIssues.length === 0 ? "pass" : "fail") as
        | "pass"
        | "fail"
        | "pending",
      actionLabel:
        coreRequirementIssues.length > 0 ? "View Handbook" : undefined,
      route: "/(tabs)/handbooks" as const,
    },
    {
      id: "nqf7",
      title: `NQF 7 — ${nqf7Earned} of ${nqf7Required} cr`,
      detail:
        nqf7Earned >= nqf7Required
          ? "NQF Level 7 credit requirement is satisfied."
          : `${nqf7Required - nqf7Earned} more NQF7 credits needed. Add third-year courses to close this gap.`,
      status: (nqf7Earned >= nqf7Required
        ? "pass"
        : nqf7Earned > 0
          ? "pending"
          : "fail") as "pass" | "fail" | "pending",
      actionLabel: nqf7Earned < nqf7Required ? "Ask BluBot" : undefined,
      route: "/(tabs)/blubot" as const,
    },
  ];

  // ─── AI insights ──────────────────────────────────────────────────────────
  const insights = useMemo<ProgressInsight[]>(() => {
    const result: ProgressInsight[] = [];

    if (validationReport.summary.blockers === 0) {
      result.push({
        id: "plan-health",
        title: "No graduation blockers",
        message:
          "Your completed, in-progress, and planned courses don't trigger any blocker-level validation issues.",
        type: "positive",
      });
    } else {
      result.push({
        id: "plan-health",
        title: "Plan has blocker issues",
        message: `${validationReport.summary.blockers} blocker${validationReport.summary.blockers === 1 ? "" : "s"} must be resolved before your plan is safe for graduation.`,
        type: "improvement",
      });
    }

    if (projectedCreditShortfall > 0) {
      result.push({
        id: "credit-gap",
        title: `${projectedCreditShortfall} credits still needed`,
        message: `Use the Planner to map out remaining years and fill the ${projectedCreditShortfall}-credit gap before your final year.`,
        type: "suggestion",
      });
    } else {
      result.push({
        id: "credit-gap",
        title: "Credit target is covered",
        message:
          "Your projected plan reaches the overall degree credit requirement, assuming all planned courses are completed.",
        type: "positive",
      });
    }

    if (nqf7Earned < nqf7Required) {
      result.push({
        id: "nqf7-gap",
        title: `NQF7 gap — ${nqf7Required - nqf7Earned} cr short`,
        message: `Add Year 3 courses to close the NQF Level 7 shortfall. Ask BluBot for specific course recommendations.`,
        type: "improvement",
      });
    }

    if (isProjectionOnly) {
      result.push({
        id: "projection-only",
        title: "Showing projections only",
        message:
          "Transcript history is not connected yet, so totals are based on planned courses rather than confirmed results.",
        type: "suggestion",
      });
    }

    return result.slice(0, 4);
  }, [
    isProjectionOnly,
    nqf7Earned,
    nqf7Required,
    projectedCreditShortfall,
    validationReport.summary.blockers,
  ]);

  // ─── Sync status label ────────────────────────────────────────────────────
  const syncLabel = useMemo(() => {
    if (!loggedInUser && !mockUser) return "Demo data";
    if (syncStatus === "loading") return "Syncing…";
    if (syncStatus === "synced") return lastSyncedLabel ? `Synced` : "Synced";
    if (syncStatus === "fallback") return "Fallback data";
    if (syncStatus === "error") return "Sync error";
    return mockUser ? "Mock data" : "Ready";
  }, [lastSyncedLabel, loggedInUser, mockUser, syncStatus]);

  const syncLabelStyle =
    syncStatus === "error"
      ? styles.syncLabelError
      : syncStatus === "fallback"
        ? styles.syncLabelWarn
        : styles.syncLabelOk;

  // ─── Tab counts ───────────────────────────────────────────────────────────
  const tabCounts: Record<CourseTab, number> = {
    completed: completedCourses.length + failedCourses.length,
    inprogress: inProgressCourses.length,
    planned: forecastCourses.length,
  };

  const tabLabels: Record<CourseTab, string> = {
    completed: "Completed",
    inprogress: "In progress",
    planned: "Planned",
  };

  // ─── Render helpers ───────────────────────────────────────────────────────
  const renderGradCheckItem = (item: (typeof gradChecklist)[0]) => {
    const isPass = item.status === "pass";
    const isFail = item.status === "fail";
    const isPending = item.status === "pending";

    return (
      <View
        key={item.id}
        style={[
          styles.gradItem,
          isPass && styles.gradItemPass,
          isFail && styles.gradItemFail,
        ]}
      >
        <View
          style={[
            styles.gradCheck,
            isPass && styles.gradCheckPass,
            isFail && styles.gradCheckFail,
            isPending && styles.gradCheckPending,
          ]}
        >
          <Text
            style={[
              styles.gradCheckText,
              isPass && styles.gradCheckTextPass,
              isFail && styles.gradCheckTextFail,
              isPending && styles.gradCheckTextPending,
            ]}
          >
            {isPass ? "✓" : isFail ? "!" : "–"}
          </Text>
        </View>
        <View style={styles.gradBody}>
          <Text
            style={[
              styles.gradTitle,
              isPass && styles.gradTitlePass,
              isFail && styles.gradTitleFail,
            ]}
          >
            {item.title}
          </Text>
          <Text style={styles.gradDetail}>{item.detail}</Text>
          {item.actionLabel ? (
            <Pressable onPress={() => router.push(item.route as any)}>
              <Text style={styles.gradAction}>{item.actionLabel} →</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  const renderInsight = (insight: ProgressInsight) => (
    <View
      key={insight.id}
      style={[
        styles.insightItem,
        insight.type === "positive" && styles.insightPositive,
        insight.type === "improvement" && styles.insightImprovement,
        insight.type === "suggestion" && styles.insightSuggestion,
      ]}
    >
      <View style={styles.insightBody}>
        <Text style={styles.insightTitle}>{insight.title}</Text>
        <Text style={styles.insightMsg}>{insight.message}</Text>
      </View>
    </View>
  );

  const renderCompletedCourse = (course: CompletedCourseRecord) => {
    const isExpanded = expandedCourse === course.id;
    const isFailed = course.failed === true;
    return (
      <Pressable
        key={course.id}
        onPress={() => setExpandedCourse(isExpanded ? null : course.id)}
        style={[styles.courseRow, isFailed && styles.courseRowFailed]}
      >
        <View style={styles.courseLeft}>
          <Text
            style={[styles.courseCode, isFailed && styles.courseCodeFailed]}
          >
            {course.code}
          </Text>
          <Text style={styles.courseName} numberOfLines={isExpanded ? 0 : 1}>
            {course.title}
          </Text>
          <Text style={styles.courseMeta}>
            {course.credits} cr · {course.semester}
          </Text>
        </View>
        <View style={styles.courseRight}>
          <View style={[styles.gradeBox, isFailed && styles.gradeBoxFailed]}>
            <Text
              style={[styles.gradeText, isFailed && styles.gradeTextFailed]}
            >
              {course.grade}
            </Text>
          </View>
          {isFailed && <Text style={styles.gradeSubFailed}>Failed</Text>}
        </View>
      </Pressable>
    );
  };

  const renderInProgressCourse = (course: InProgressCourseRecord) => {
    const isExpanded = expandedCourse === course.id;
    return (
      <Pressable
        key={course.id}
        onPress={() => setExpandedCourse(isExpanded ? null : course.id)}
        style={styles.courseRow}
      >
        <View style={styles.courseLeft}>
          <Text style={styles.courseCode}>{course.code}</Text>
          <Text style={styles.courseName} numberOfLines={isExpanded ? 0 : 1}>
            {course.title}
          </Text>
          <Text style={styles.courseMeta}>
            {course.credits} cr · {course.semester}
          </Text>
          <View style={styles.progressMiniTrack}>
            <View
              style={[
                styles.progressMiniFill,
                { width: `${course.status}%` as any },
              ]}
            />
          </View>
          {isExpanded ? (
            <View style={styles.courseExpanded}>
              <Text style={styles.expandDetail}>
                Current grade: {course.currentGrade} · Progress: {course.status}
                %
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.courseRight}>
          <View style={[styles.gradeBox, styles.gradeBoxInProgress]}>
            <Text style={[styles.gradeText, styles.gradeTextInProgress]}>
              {course.currentGrade}
            </Text>
          </View>
          <Text style={styles.gradeSub}>{course.status}%</Text>
        </View>
      </Pressable>
    );
  };

  const renderPlannedCourse = (course: ForecastCourseRecord) => {
    const isExpanded = expandedCourse === course.id;
    return (
      <Pressable
        key={course.id}
        onPress={() => setExpandedCourse(isExpanded ? null : course.id)}
        style={styles.courseRow}
      >
        <View style={styles.courseLeft}>
          <Text style={styles.courseCode}>{course.code}</Text>
          <Text style={styles.courseName} numberOfLines={isExpanded ? 0 : 1}>
            {course.title}
          </Text>
          <Text style={styles.courseMeta}>
            {course.credits} cr · {course.semester}
          </Text>
          {isExpanded ? (
            <View style={styles.courseExpanded}>
              <Text style={styles.expandDetail}>
                Status: Planned · {course.semester}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.courseRight}>
          <View style={[styles.gradeBox, styles.gradeBoxPlanned]}>
            <Text style={[styles.gradeText, styles.gradeTextPlanned]}>PL</Text>
          </View>
          <Text style={styles.gradeSub}>Planned</Text>
        </View>
      </Pressable>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <MainLayout>
      {/* Page header */}
      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderRow}>
          <View style={styles.pageHeaderLeft}>
            <Text style={[styles.title, !isMobile && styles.titleDesktop]}>Academic progress</Text>
            {!isMobile && (
              <Text style={styles.subtitle}>
                {loggedInUser
                  ? `${loggedInUser.degree} · Year ${loggedInUser.year}`
                  : "Your full academic journey at a glance."}
              </Text>
            )}
            {loggedInUser?.majors.length ? (
              <Text style={styles.headerMeta}>
                {loggedInUser.majors.join(" · ")}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={() => void refresh()}
            disabled={isLoading}
            style={[
              styles.syncChip,
              syncLabelStyle,
              isLoading && styles.syncChipDisabled,
            ]}
          >
            <Text style={styles.syncChipText}>
              {isLoading ? "Syncing…" : syncLabel}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ── Hero: ring + legend ── */}
      <View style={styles.hero}>
        {/* Credit ring — SVG via react-native-svg on native, inline svg on web */}
        <View style={styles.ringWrap}>
          {!isMobile ? (
            /* web: inline svg */
            <View style={{ width: 120, height: 120, position: "relative" }}>
              <svg
                width="120"
                height="120"
                viewBox="0 0 120 120"
                style={{ position: "absolute" } as any}
              >
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  stroke={theme.colors.grayLight}
                  strokeWidth="12"
                />
                {/* planned */}
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  stroke="#9FE1CB"
                  strokeWidth="12"
                  strokeDasharray={`${(plannedCredits / Math.max(totalCreditsTarget, 1)) * 314} 314`}
                  strokeDashoffset="0"
                  strokeLinecap="round"
                  transform={`rotate(${-90 + ((cumulativeCredits + inProgressCredits) / Math.max(totalCreditsTarget, 1)) * 360} 60 60)`}
                />
                {/* in-progress */}
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  stroke="#1D9E75"
                  strokeWidth="12"
                  strokeDasharray={`${(inProgressCredits / Math.max(totalCreditsTarget, 1)) * 314} 314`}
                  strokeDashoffset="0"
                  strokeLinecap="round"
                  transform={`rotate(${-90 + (cumulativeCredits / Math.max(totalCreditsTarget, 1)) * 360} 60 60)`}
                />
                {/* completed */}
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  stroke="#085041"
                  strokeWidth="12"
                  strokeDasharray={`${(cumulativeCredits / Math.max(totalCreditsTarget, 1)) * 314} 314`}
                  strokeDashoffset="0"
                  strokeLinecap="round"
                  transform="rotate(-90 60 60)"
                />
              </svg>
              <View style={styles.ringCenter}>
                <Text style={[styles.ringPct, !isMobile && styles.ringPctDesktop]}>
                  {Math.min(
                    100,
                    Math.round(
                      ((cumulativeCredits +
                        inProgressCredits +
                        plannedCredits) /
                        Math.max(totalCreditsTarget, 1)) *
                        100,
                    ),
                  )}
                  %
                </Text>
                <Text style={styles.ringLabel}>complete</Text>
              </View>
            </View>
          ) : (
            /* native: simple progress arc approximation */
            <View style={styles.ringNativeFallback}>
              <Text style={[styles.ringPct, !isMobile && styles.ringPctDesktop]}>
                {Math.min(
                  100,
                  Math.round(
                    (cumulativeCredits / Math.max(totalCreditsTarget, 1)) * 100,
                  ),
                )}
                %
              </Text>
              <Text style={styles.ringLabel}>complete</Text>
            </View>
          )}
        </View>

        <View style={styles.heroRight}>
          <Text style={styles.heroTitle}>
            {cumulativeCredits + inProgressCredits + plannedCredits} /{" "}
            {totalCreditsTarget} credits
          </Text>
          <View style={styles.creditLegend}>
            {[
              {
                color: "#085041",
                label: "Completed",
                value: cumulativeCredits,
              },
              {
                color: "#1D9E75",
                label: "In progress",
                value: inProgressCredits,
              },
              { color: "#9FE1CB", label: "Planned", value: plannedCredits },
              {
                color: theme.colors.grayLight,
                label: "Remaining",
                value: Math.max(
                  totalCreditsTarget -
                    cumulativeCredits -
                    inProgressCredits -
                    plannedCredits,
                  0,
                ),
                border: true,
              },
            ].map((item) => (
              <View key={item.label} style={styles.legendRow}>
                <View
                  style={[
                    styles.legendSwatch,
                    { backgroundColor: item.color },
                    (item as any).border && styles.legendSwatchBorder,
                  ]}
                />
                <Text style={styles.legendText}>{item.label}</Text>
                <Text style={styles.legendValue}>{item.value} cr</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* ── Stat cards 2×2 ── */}
      <View style={styles.statGrid}>
        {[
          {
            label: "Avg grade",
            value: cumulativeGPA,
            sub: "avg % (GPA)",
          },
          {
            label: "Completed",
            value: String(completedCourses.length),
            sub: "courses",
          },
          {
            label: "In progress",
            value: String(inProgressCourses.length),
            sub: "this semester",
          },
          {
            label: "NQF 7",
            value: String(nqf7Earned),
            sub: `of ${nqf7Required} cr`,
          },
        ].map((stat) => (
          <View key={stat.label} style={[styles.statCard, !isMobile && styles.statCardDesktop]}>
            <Text style={styles.statLabel}>{stat.label}</Text>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statSub}>{stat.sub}</Text>
          </View>
        ))}
      </View>

      {/* ── Milestone progress ── */}
      <View style={styles.milestoneSection}>
        <View style={styles.milestoneHeader}>
          <Text style={styles.milestoneTitle}>
            Year {loggedInUser?.year ?? 2} milestone
          </Text>
          <Text style={styles.milestoneValue}>
            {cumulativeCredits} / {milestoneTarget} cr
          </Text>
        </View>
        <View style={styles.multiBar}>
          <View
            style={[
              styles.barSeg,
              styles.barCompleted,
              { width: `${milestoneBarCompleted}%` as any },
            ]}
          />
          <View
            style={[
              styles.barSeg,
              styles.barInProgress,
              { width: `${milestoneBarInProgress}%` as any },
            ]}
          />
          <View
            style={[
              styles.barSeg,
              styles.barPlanned,
              { width: `${milestoneBarPlanned}%` as any },
            ]}
          />
        </View>
        <View style={styles.barLegend}>
          {[
            { color: "#085041", label: `Done · ${cumulativeCredits}` },
            { color: "#1D9E75", label: `Active · ${inProgressCredits}` },
            { color: "#9FE1CB", label: `Planned · ${plannedCredits}` },
          ].map((item) => (
            <View key={item.label} style={styles.barLegendItem}>
              <View
                style={[styles.barLegendDot, { backgroundColor: item.color }]}
              />
              <Text style={styles.barLegendText}>{item.label}</Text>
            </View>
          ))}
          {milestoneShortfall > 0 ? (
            <Text style={styles.milestoneRemaining}>
              {milestoneShortfall} cr left
            </Text>
          ) : (
            <Text style={[styles.milestoneRemaining, { color: "#085041" }]}>
              Milestone reached ✓
            </Text>
          )}
        </View>
      </View>

      {/* ── Graduation readiness ── */}
      <Text style={styles.sectionLabel}>Graduation readiness</Text>
      <View style={styles.gradList}>
        {gradChecklist.map(renderGradCheckItem)}
      </View>

      {/* ── Insights ── */}
      <Text style={styles.sectionLabel}>Insights</Text>
      <View style={styles.insightList}>{insights.map(renderInsight)}</View>

      {/* ── Priority issues ── */}
      {priorityFixes.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>Priority issues</Text>
          <View
            style={[styles.insightList, { marginBottom: theme.spacing.md }]}
          >
            {priorityFixes.map((fix) => (
              <View
                key={fix.id}
                style={[
                  styles.insightItem,
                  fix.severity === "blocker"
                    ? styles.priorityFixBlocker
                    : styles.insightImprovement,
                ]}
              >
                <View style={styles.insightBody}>
                  <Text style={styles.insightTitle}>{fix.title}</Text>
                  <Text style={styles.insightMsg}>{fix.message}</Text>
                  {fix.action ? (
                    <Text style={styles.priorityFixAction}>{fix.action} →</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {/* ── Course history ── */}
      <Text style={styles.sectionLabel}>Courses</Text>

      {/* Tab strip */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.courseTabsScroll}
        contentContainerStyle={styles.courseTabsContent}
      >
        {(["completed", "inprogress", "planned"] as CourseTab[]).map((tab) => (
          <Pressable
            key={tab}
            onPress={() => {
              setActiveTab(tab);
              setExpandedCourse(null);
            }}
            style={[
              styles.courseTab,
              activeTab === tab && styles.courseTabActive,
            ]}
          >
            <Text
              style={[
                styles.courseTabText,
                activeTab === tab && styles.courseTabTextActive,
              ]}
            >
              {tabLabels[tab]} ({tabCounts[tab]})
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Course list */}
      <View style={styles.courseList}>
        {activeTab === "completed" &&
          (completedCourses.length === 0 && failedCourses.length === 0 ? (
            <Text style={styles.emptyText}>
              {isProjectionOnly
                ? "Completed transcript history is not synced yet."
                : "No completed courses yet."}
            </Text>
          ) : (
            <>
              {completedCourses.map(renderCompletedCourse)}
              {failedCourses.length > 0 && (
                <>
                  <Text
                    style={[styles.sectionLabel, styles.sectionLabelFailed]}
                  >
                    Failed ({failedCourses.length})
                  </Text>
                  {failedCourses.map(renderCompletedCourse)}
                </>
              )}
            </>
          ))}

        {activeTab === "inprogress" &&
          (inProgressCourses.length === 0 ? (
            <Text style={styles.emptyText}>
              {isProjectionOnly
                ? "No in-progress transcript data connected yet."
                : "No in-progress courses."}
            </Text>
          ) : (
            inProgressCourses.map(renderInProgressCourse)
          ))}

        {activeTab === "planned" &&
          (forecastCourses.length === 0 ? (
            <Text style={styles.emptyText}>
              No planned courses. Add courses in the Planner.
            </Text>
          ) : (
            forecastCourses.map(renderPlannedCourse)
          ))}
      </View>
    </MainLayout>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Page header
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
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  titleDesktop: {
    fontSize: theme.fontSize.xxl,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
    lineHeight: 20,
  },
  headerMeta: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },

  // Sync chip
  syncChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
    borderWidth: 1,
    flexShrink: 0,
  },
  syncChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  syncLabelOk: {
    backgroundColor: theme.colors.successLight,
    borderColor: theme.colors.success,
  },
  syncLabelWarn: {
    backgroundColor: "#FAEEDA",
    borderColor: "#FAC775",
  },
  syncLabelError: {
    backgroundColor: "#FCEBEB",
    borderColor: "#F7C1C1",
  },
  syncChipDisabled: {
    opacity: 0.6,
  },

  // Hero
  hero: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  ringWrap: {
    flexShrink: 0,
  },
  ringCenter: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  ringPct: {
    fontSize: 16,
    fontWeight: "500",
    color: theme.colors.textPrimary,
  },
  ringPctDesktop: {
    fontSize: 20,
  },
  ringLabel: {
    fontSize: 9,
    color: theme.colors.textLight,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  ringNativeFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 8,
    borderColor: "#085041",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.successLight,
  },
  heroRight: {
    flex: 1,
    gap: 8,
  },
  heroTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  creditLegend: {
    gap: 5,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendSwatch: {
    width: 9,
    height: 9,
    borderRadius: 2,
    flexShrink: 0,
  },
  legendSwatchBorder: {
    borderWidth: 1,
    borderColor: theme.colors.gray,
  },
  legendText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  legendValue: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },

  // Stats
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: theme.spacing.md,
  },
  statCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    flex: 0.46,
    minWidth: "45%",
  },
  statCardDesktop: {
    flex: 0.22,
    minWidth: 0,
  },
  statLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginBottom: 3,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "500",
    color: theme.colors.textPrimary,
  },
  statSub: {
    fontSize: 10,
    color: theme.colors.textLight,
    marginTop: 2,
  },

  // Milestone
  milestoneSection: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  milestoneHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  milestoneTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  milestoneValue: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  multiBar: {
    height: 7,
    borderRadius: 99,
    backgroundColor: theme.colors.grayLight,
    overflow: "hidden",
    flexDirection: "row",
    marginBottom: 8,
  },
  barSeg: {
    height: "100%",
  },
  barCompleted: {
    backgroundColor: "#085041",
  },
  barInProgress: {
    backgroundColor: "#1D9E75",
  },
  barPlanned: {
    backgroundColor: "#9FE1CB",
  },
  barLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  barLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  barLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  barLegendText: {
    fontSize: 10,
    color: theme.colors.textSecondary,
  },
  milestoneRemaining: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginLeft: "auto",
  },

  // Section label
  sectionLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },

  // Graduation checklist
  gradList: {
    gap: 6,
    marginBottom: theme.spacing.md,
  },
  gradItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 10,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    backgroundColor: theme.colors.card,
  },
  gradItemPass: {
    borderColor: "#9FE1CB",
    backgroundColor: "#E1F5EE",
  },
  gradItemFail: {
    borderColor: "#F7C1C1",
    backgroundColor: "#FCEBEB",
  },
  gradCheck: {
    width: 20,
    height: 20,
    borderRadius: 5,
    flexShrink: 0,
    marginTop: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  gradCheckPass: {
    backgroundColor: "#1D9E75",
  },
  gradCheckFail: {
    backgroundColor: "#F7C1C1",
  },
  gradCheckPending: {
    backgroundColor: theme.colors.grayLight,
    borderWidth: 1,
    borderColor: theme.colors.gray,
  },
  gradCheckText: {
    fontSize: 11,
    fontWeight: "700",
  },
  gradCheckTextPass: {
    color: "#fff",
  },
  gradCheckTextFail: {
    color: "#B3261E",
  },
  gradCheckTextPending: {
    color: theme.colors.textLight,
  },
  gradBody: {
    flex: 1,
    gap: 2,
  },
  gradTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  gradTitlePass: {
    color: "#085041",
  },
  gradTitleFail: {
    color: "#B3261E",
  },
  gradDetail: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    lineHeight: 16,
  },
  gradAction: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.deepBlue,
    marginTop: 3,
  },

  // Insights
  insightList: {
    gap: 6,
    marginBottom: theme.spacing.md,
  },
  insightItem: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    padding: 10,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    backgroundColor: theme.colors.card,
    borderLeftWidth: 3,
  },
  insightPositive: {
    borderLeftColor: "#1D9E75",
  },
  insightImprovement: {
    borderLeftColor: "#BA7517",
  },
  insightSuggestion: {
    borderLeftColor: "#185FA5",
  },
  priorityFixBlocker: {
    borderLeftColor: "#C0392B",
  },
  priorityFixAction: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.deepBlue,
    marginTop: 3,
  },
  insightBody: {
    flex: 1,
    gap: 3,
  },
  insightTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  insightMsg: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    lineHeight: 16,
  },

  // Course tabs
  courseTabsScroll: {
    marginBottom: 8,
  },
  courseTabsContent: {
    gap: 5,
    paddingRight: theme.spacing.sm,
  },
  courseTab: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    backgroundColor: theme.colors.card,
  },
  courseTabActive: {
    backgroundColor: theme.colors.babyBlue,
    borderColor: theme.colors.blue,
  },
  courseTabText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  courseTabTextActive: {
    color: theme.colors.deepBlue,
  },

  // Course list
  courseList: {
    gap: 5,
    marginBottom: theme.spacing.md,
  },
  courseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    backgroundColor: theme.colors.card,
    flexWrap: "wrap",
  },
  courseLeft: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  courseCode: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  courseName: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  courseMeta: {
    fontSize: 10,
    color: theme.colors.textLight,
    marginTop: 1,
  },
  progressMiniTrack: {
    height: 3,
    borderRadius: 99,
    backgroundColor: theme.colors.grayLight,
    overflow: "hidden",
    marginTop: 4,
    width: "100%",
  },
  progressMiniFill: {
    height: "100%",
    borderRadius: 99,
    backgroundColor: "#1D9E75",
  },
  courseExpanded: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: theme.colors.gray,
  },
  expandDetail: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  courseRight: {
    flexShrink: 0,
    alignItems: "flex-end",
    gap: 3,
  },
  gradeBox: {
    width: 42,
    height: 42,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.babyBlue,
    alignItems: "center",
    justifyContent: "center",
  },
  gradeBoxInProgress: {
    backgroundColor: "#E1F5EE",
  },
  gradeBoxPlanned: {
    backgroundColor: theme.colors.grayLight,
  },
  gradeText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.deepBlue,
  },
  gradeTextInProgress: {
    color: "#085041",
  },
  gradeTextPlanned: {
    color: theme.colors.textSecondary,
  },
  gradeSub: {
    fontSize: 10,
    color: theme.colors.textLight,
  },
  courseRowFailed: {
    borderColor: "#F7C1C1",
    backgroundColor: "#FCEBEB",
  },
  courseCodeFailed: {
    color: "#B3261E",
  },
  gradeBoxFailed: {
    backgroundColor: "#F7C1C1",
  },
  gradeTextFailed: {
    color: "#B3261E",
  },
  gradeSubFailed: {
    fontSize: 10,
    color: "#B3261E",
    fontWeight: "600",
  },
  sectionLabelFailed: {
    color: "#B3261E",
    marginTop: 8,
  },

  emptyText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
});
