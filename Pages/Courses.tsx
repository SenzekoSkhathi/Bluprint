import MainLayout from "@/components/main-layout";
import { getPrimaryFacultySlug } from "@/constants/faculty";
import { theme } from "@/constants/theme";
import {
    academicRepository,
    type CourseCatalogEntry as Course,
    type CourseGroup,
} from "@/services/academic-repository";
import {
    getBackendSetupHint,
    getHandbookCourses,
    getScienceCourses,
    type ScienceCourseCatalogEntry,
} from "@/services/backend-api";
import React, { useMemo, useState } from "react";
import {
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

interface CoursesProps {
  onCourseSelect?: (course: Course) => void;
}

interface LoadCompleteness {
  totalCourses: number;
  postgradCourses: number;
}

const courseGroups = academicRepository.getCourseGroups();
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
] as const;
const VALID_CODE_RE = /^[A-Z]{3,4}\d{4}(?:[A-Z](?:\/[A-Z]){0,3})?$/;

const GENERIC_TITLE_RE =
  /^Course\s+[A-Z]{3,4}\d{4}(?:[A-Z](?:\/[A-Z]){0,3})?$/i;
const TITLE_NOISE_RE =
  /course outline|course entry requirements|convener|assessment|dp requirements|nqf credits|departments in the faculty/i;

function isGenericPlaceholderCourse(
  course: ScienceCourseCatalogEntry,
): boolean {
  const title = (course.title ?? "").trim();
  const description = (course.description ?? "").trim();
  const outline = (course.outline_details ?? "").trim();
  const defaultOutcome =
    course.outcomes.length === 1 &&
    (course.outcomes[0] ?? "").includes(
      "Refer to the handbook entry for detailed outcomes",
    );

  if (!GENERIC_TITLE_RE.test(title)) {
    return false;
  }

  // Placeholder rows are usually mention-only captures from prose/prereq lists.
  return (
    outline.length === 0 &&
    (description.startsWith("Extracted from handbook source") || defaultOutcome)
  );
}

function normalizeTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isLikelyCourseTitle(value: string, code?: string): boolean {
  const title = normalizeTitle(value);
  if (!title) {
    return false;
  }
  if (GENERIC_TITLE_RE.test(title)) {
    return false;
  }
  if (TITLE_NOISE_RE.test(title)) {
    return false;
  }
  if (code && title.toUpperCase().includes(code.toUpperCase())) {
    return false;
  }
  return true;
}

function titleQualityScore(value: string): number {
  const title = normalizeTitle(value);
  if (!title) {
    return -1;
  }

  let score = 0;
  if (!TITLE_NOISE_RE.test(title)) {
    score += 25;
  }

  if (title.length >= 6 && title.length <= 70) {
    score += 20;
  } else if (title.length <= 100) {
    score += 8;
  }

  const words = title.split(" ").length;
  if (words >= 2 && words <= 10) {
    score += 20;
  } else if (words <= 14) {
    score += 8;
  }

  if (/[A-Za-z]/.test(title)) {
    score += 10;
  }

  return score;
}

function isValidAndAllowedCourse(
  course: ScienceCourseCatalogEntry,
  _allowedDepartments?: Set<string>,
  _allowedPrefixes?: Set<string>,
): boolean {
  const code = (course.code ?? "").trim().toUpperCase();
  if (!VALID_CODE_RE.test(code)) {
    return false;
  }

  // Pass through all structurally valid course codes from backend.
  // Department collections are still used to enrich data quality.
  return true;
}

function courseRichnessScore(course: ScienceCourseCatalogEntry): number {
  const title = (course.title ?? "").trim();
  const description = (course.description ?? "").trim();
  const outline = (course.outline_details ?? "").trim();
  const entry = (course.entry_requirements ?? "").trim();
  const convener = (course.convener_details ?? "").trim();
  const outcomes = course.outcomes.length;
  const source = (course.source ?? "").trim();

  let score = 0;
  if (!GENERIC_TITLE_RE.test(title)) {
    score += 120 + Math.min(title.length, 100);
  }
  score += Math.min(outline.length, 350);
  score += Math.min(description.length, 150);
  score += Math.min(entry.length, 80);
  score += Math.min(convener.length, 60);
  score += Math.min(outcomes * 8, 64);
  if (source && !source.toLowerCase().endsWith(".pdf")) {
    score += 90;
  }

  return score;
}

function buildBestTitleMap(
  entries: ScienceCourseCatalogEntry[],
): Map<string, string> {
  const bestByCode = new Map<string, { title: string; score: number }>();

  for (const entry of entries) {
    const code = (entry.code ?? "").trim().toUpperCase();
    if (!VALID_CODE_RE.test(code)) {
      continue;
    }

    const title = normalizeTitle(entry.title ?? "");
    if (!isLikelyCourseTitle(title, code)) {
      continue;
    }

    const score = titleQualityScore(title);
    const existing = bestByCode.get(code);
    if (!existing || score > existing.score) {
      bestByCode.set(code, { title, score });
    }
  }

  return new Map(
    Array.from(bestByCode.entries()).map(([code, value]) => [
      code,
      value.title,
    ]),
  );
}

function repairCourseTitles(
  entries: ScienceCourseCatalogEntry[],
  bestTitleByCode: Map<string, string>,
): ScienceCourseCatalogEntry[] {
  return entries.map((entry) => {
    const code = (entry.code ?? "").trim().toUpperCase();
    const currentTitle = normalizeTitle(entry.title ?? "");
    const bestTitle = bestTitleByCode.get(code);

    if (!bestTitle) {
      return {
        ...entry,
        title: currentTitle,
      };
    }

    if (isLikelyCourseTitle(currentTitle, code)) {
      return {
        ...entry,
        title: currentTitle,
      };
    }

    return {
      ...entry,
      title: bestTitle,
    };
  });
}

export default function Courses({ onCourseSelect }: CoursesProps) {
  const activeFacultySlug = getPrimaryFacultySlug();
  const [catalog, setCatalog] = useState<Course[]>([]);
  const [activeGroup, setActiveGroup] = useState<CourseGroup>("Year 1");
  const [catalogRunId, setCatalogRunId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadCompleteness, setLoadCompleteness] =
    useState<LoadCompleteness | null>(null);

  React.useEffect(() => {
    let isMounted = true;
    const COURSE_LOAD_TIMEOUT_MS = 45000;
    const COURSE_LOAD_RETRY_DELAY_MS = 1200;

    const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number) => {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          const timer = setTimeout(() => {
            clearTimeout(timer);
            reject(new Error("Request timed out while loading courses."));
          }, timeoutMs);
        }),
      ]);
    };

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      });

    const loadCoursesWithRetry = async () => {
      try {
        return await withTimeout(
          getHandbookCourses({ faculty_slug: activeFacultySlug }),
          COURSE_LOAD_TIMEOUT_MS,
        );
      } catch (firstError) {
        // Retry once for transient cold-start/network hiccups.
        await sleep(COURSE_LOAD_RETRY_DELAY_MS);
        try {
          return await withTimeout(
            getHandbookCourses({ faculty_slug: activeFacultySlug }),
            COURSE_LOAD_TIMEOUT_MS,
          );
        } catch {
          if (activeFacultySlug === "science") {
            return await withTimeout(
              getScienceCourses(),
              COURSE_LOAD_TIMEOUT_MS,
            );
          }
          throw firstError;
        }
      }
    };

    const normalizeCourses = (entries: ScienceCourseCatalogEntry[]): Course[] =>
      entries.map((course) => ({
        id: course.id,
        code: course.code,
        title: course.title,
        group: course.group,
        credits: course.credits,
        nqf_level: course.nqf_level,
        semester: course.semester,
        department: course.department,
        delivery: course.delivery,
        prerequisites: course.prerequisites,
        description: course.description,
        outcomes: course.outcomes,
        convener_details: course.convener_details,
        entry_requirements: course.entry_requirements,
        outline_details: course.outline_details,
        lecture_times: course.lecture_times,
        dp_requirements: course.dp_requirements,
        assessment: course.assessment,
      }));

    const dedupeByCode = (entries: ScienceCourseCatalogEntry[]) => {
      const byCode = new Map<string, ScienceCourseCatalogEntry>();

      for (const entry of entries) {
        if (!isValidAndAllowedCourse(entry)) {
          continue;
        }

        const key = (entry.code ?? "").trim().toUpperCase();
        const existing = byCode.get(key);

        if (
          !existing ||
          courseRichnessScore(entry) > courseRichnessScore(existing)
        ) {
          byCode.set(key, entry);
        }
      }

      return Array.from(byCode.values());
    };

    const loadHandbookCourses = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);

        const baselineResponse = await loadCoursesWithRetry();
        const finalRunId = baselineResponse.run_id;
        let finalCourses = dedupeByCode(baselineResponse.courses);
        const bestTitleByCode = buildBestTitleMap(finalCourses);
        finalCourses = repairCourseTitles(finalCourses, bestTitleByCode);

        if (!isMounted) {
          return;
        }

        const normalized = normalizeCourses(finalCourses);
        setCatalog(normalized);
        setCatalogRunId(finalRunId);
        setLoadCompleteness({
          totalCourses: normalized.length,
          postgradCourses: normalized.filter(
            (course) => course.group === "Postgrad",
          ).length,
        });

        const firstNonEmptyGroup = courseGroups.find((group) =>
          normalized.some((course) => course.group === group),
        );
        if (firstNonEmptyGroup) {
          setActiveGroup(firstNonEmptyGroup);
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Unable to load handbook courses from backend.";

        setLoadError(
          `Backend course load is slow or unavailable. ${message}. ${getBackendSetupHint()}`,
        );
        if (catalog.length === 0) {
          setCatalog([]);
          setCatalogRunId(null);
          setLoadCompleteness(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadHandbookCourses();

    return () => {
      isMounted = false;
    };
  }, [activeFacultySlug]);

  const visibleCourses = useMemo(
    () =>
      [...catalog]
        .filter((course) => course.group === activeGroup)
        .sort((a, b) => a.code.localeCompare(b.code)),
    [catalog, activeGroup],
  );

  return (
    <MainLayout>
      <View style={styles.header}>
        <Text style={styles.title}>Courses</Text>
        <Text style={styles.subtitle}>
          Browse handbook-derived course offerings from:{" "}
          {TARGET_DEPARTMENTS.join(", ")}.
        </Text>
        <Text style={styles.dataStatus}>
          Source:{" "}
          {catalogRunId
            ? `Handbook extraction (${catalogRunId})`
            : "Backend only"}
        </Text>
        {!isLoading && loadCompleteness ? (
          <Text style={styles.dataStatus}>
            {`Listed courses: ${loadCompleteness.totalCourses} | Postgrad: ${loadCompleteness.postgradCourses}`}
          </Text>
        ) : null}
        {isLoading ? (
          <Text style={styles.infoText}>Loading handbook courses...</Text>
        ) : null}
        {!isLoading && loadError ? (
          <Text style={styles.errorText}>
            Could not load handbook courses: {loadError}
          </Text>
        ) : null}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Course Levels</Text>
        <View style={styles.groupRow}>
          {courseGroups.map((group) => {
            const isActive = group === activeGroup;
            return (
              <Pressable
                key={group}
                onPress={() => setActiveGroup(group)}
                style={[styles.pill, isActive && styles.pillActive]}
              >
                <Text
                  style={[styles.pillText, isActive && styles.pillTextActive]}
                >
                  {group}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{activeGroup} Courses</Text>
        <ScrollView
          style={styles.courseList}
          contentContainerStyle={styles.courseListContent}
        >
          {!isLoading && visibleCourses.length === 0 ? (
            <Text style={styles.infoText}>
              No handbook courses found for {activeGroup}. Run the science
              pipeline and retry.
            </Text>
          ) : null}
          {visibleCourses.map((course) => (
            <Pressable
              key={course.id}
              onPress={() => onCourseSelect?.(course)}
              style={styles.courseRow}
            >
              <Text style={styles.courseCode}>{course.code}</Text>
              <Text style={styles.courseName}>{course.title}</Text>
              <Text style={styles.courseMeta}>
                {`Credits ${course.credits} | NQF Level ${course.nqf_level ?? "?"}`}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </MainLayout>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: Platform.OS === "web" ? theme.fontSize.xxl : theme.fontSize.xl,
    fontWeight: "800",
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textLight,
  },
  dataStatus: {
    marginTop: theme.spacing.xs,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
  },
  infoText: {
    marginTop: theme.spacing.xs,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
  },
  errorText: {
    marginTop: theme.spacing.xs,
    fontSize: theme.fontSize.sm,
    color: "#b91c1c",
  },
  sectionCard: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.fontSize.lg,
    color: theme.colors.textPrimary,
    fontWeight: "700",
    marginBottom: theme.spacing.sm,
  },
  groupRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  pill: {
    backgroundColor: theme.colors.grayLight,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    borderRadius: theme.borderRadius.round,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillActive: {
    backgroundColor: theme.colors.blue,
    borderColor: theme.colors.blue,
  },
  pillText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
  },
  pillTextActive: {
    color: theme.colors.white,
  },
  courseList: {
    maxHeight: Platform.OS === "web" ? 600 : undefined,
  },
  courseListContent: {
    gap: theme.spacing.sm,
  },
  courseRow: {
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    gap: 2,
  },
  courseCode: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: "700",
  },
  courseName: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    fontWeight: "700",
  },
  courseMeta: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
  },
});
