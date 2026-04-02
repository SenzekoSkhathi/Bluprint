// ...existing code...
import MainLayout from "@/components/main-layout";
import { theme } from "@/constants/theme";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { getStudentSchedule } from "@/services/backend-api";
import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getCountdown(dateStr: string, startTime: string, now: Date): string {
  const dt = new Date(`${dateStr}T${startTime}`);
  const diffMs = dt.getTime() - now.getTime();

  if (diffMs <= 0) return "In progress";

  const totalMins = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMins / 1440);
  const hours = Math.floor((totalMins % 1440) / 60);
  const mins = totalMins % 60;

  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

type ExamStatus = "upcoming" | "soon" | "imminent";

function getStatus(dateStr: string, startTime: string, now: Date): ExamStatus {
  const dt = new Date(`${dateStr}T${startTime}`);
  const hoursLeft = (dt.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursLeft <= 0) return "imminent";
  if (hoursLeft <= 48) return "soon";
  return "upcoming";
}

function formatDateLong(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

interface ExamSession {
  id: string;
  courseCode: string;
  courseName: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  duration: number;
  paper?: string;
}

function toDateOnly(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseExamDate(dayValue: string): string | null {
  const raw = dayValue.trim();
  if (!raw) return null;

  const isoDate = raw.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (isoDate) return isoDate;

  // Skip weekday-only strings like "Monday" to avoid converting class sessions.
  if (!/\d/.test(raw)) return null;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return toDateOnly(parsed);
}

function parseTimeToMinutes(value: string): number | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function getDurationMinutes(startTime: string, endTime: string): number {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  if (startMinutes == null || endMinutes == null) {
    return 0;
  }

  const normalizedEnd =
    endMinutes >= startMinutes ? endMinutes : endMinutes + 24 * 60;
  return normalizedEnd - startMinutes;
}

type SortMode = "date" | "countdown";
type FilterMode = "all" | "upcoming" | "soon" | "imminent";

// ─── Sub-components ───────────────────────────────────────────────────────────
function DetailChip({
  label,
  value,
  fullWidth = false,
  isDesktop = false,
}: {
  label: string;
  value: string;
  fullWidth?: boolean;
  isDesktop?: boolean;
}) {
  return (
    <View
      style={[
        styles.detailChip,
        isDesktop && styles.detailChipDesktop,
        fullWidth && styles.detailChipFull,
        fullWidth && isDesktop && styles.detailChipFullDesktop,
      ]}
    >
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={styles.chipValue} numberOfLines={fullWidth ? 1 : 2}>
        {value}
      </Text>
    </View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
interface TimetableProps {
  studentNumber?: string;
}

export default function Timetable({ studentNumber }: TimetableProps) {
  const isMobile = useIsMobile();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [exams, setExams] = useState<ExamSession[]>([]);
  const [isLoadingExams, setIsLoadingExams] = useState(false);
  const [examLoadError, setExamLoadError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortMode>("date");
  const [filterBy, setFilterBy] = useState<FilterMode>("all");

  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    let isMounted = true;

    if (!studentNumber) {
      setExams([]);
      setExamLoadError(null);
      return () => {
        isMounted = false;
      };
    }

    setIsLoadingExams(true);
    setExamLoadError(null);

    getStudentSchedule({ student_number: studentNumber })
      .then((response) => {
        if (!isMounted) return;

        const mappedExams = response.sessions
          .map((session, index) => {
            const date = parseExamDate(session.day || "");
            if (!date) return null;

            const title = (session.title || "").trim();
            const code = (session.course_code || "").trim().toUpperCase();
            const courseCode =
              code || title.split(/\s+/)[0]?.toUpperCase() || "EXAM";
            const courseName = title || code || "Exam";
            const startTime = (session.start_time || "09:00").trim();
            const endTime = (session.end_time || "11:00").trim();

            return {
              id: session.id || `exam-${index}`,
              courseCode,
              courseName,
              date,
              startTime,
              endTime,
              location: (session.location || "TBD").trim() || "TBD",
              duration: getDurationMinutes(startTime, endTime),
            } as ExamSession;
          })
          .filter((exam): exam is ExamSession => exam !== null)
          .sort(
            (a, b) =>
              new Date(`${a.date}T${a.startTime}`).getTime() -
              new Date(`${b.date}T${b.startTime}`).getTime(),
          );

        setExams(mappedExams);
        setIsLoadingExams(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setExams([]);
        setIsLoadingExams(false);
        setExamLoadError(
          "Could not load your exam timetable from the backend right now.",
        );
      });

    return () => {
      isMounted = false;
    };
  }, [studentNumber]);

  // ─── Derived data ─────────────────────────────────────────────────────────
  const sortedFilteredExams = useMemo(() => {
    let list = [...exams];

    // Filter
    if (filterBy !== "all") {
      list = list.filter(
        (exam) =>
          getStatus(exam.date, exam.startTime, currentTime) === filterBy,
      );
    }

    // Sort
    if (sortBy === "date") {
      list.sort(
        (a, b) =>
          new Date(`${a.date}T${a.startTime}`).getTime() -
          new Date(`${b.date}T${b.startTime}`).getTime(),
      );
    } else {
      list.sort(
        (a, b) =>
          new Date(`${a.date}T${a.startTime}`).getTime() -
          currentTime.getTime() -
          (new Date(`${b.date}T${b.startTime}`).getTime() -
            currentTime.getTime()),
      );
    }

    return list;
  }, [exams, sortBy, filterBy, currentTime]);

  const upcomingCount = useMemo(
    () =>
      exams.filter(
        (exam) =>
          new Date(`${exam.date}T${exam.startTime}`).getTime() >
          currentTime.getTime(),
      ).length,
    [exams, currentTime],
  );

  const nextExam = useMemo(
    () =>
      [...exams]
        .filter(
          (e) =>
            new Date(`${e.date}T${e.startTime}`).getTime() >
            currentTime.getTime(),
        )
        .sort(
          (a, b) =>
            new Date(`${a.date}T${a.startTime}`).getTime() -
            new Date(`${b.date}T${b.startTime}`).getTime(),
        )[0] ?? null,
    [exams, currentTime],
  );

  // ─── Accent / badge colours by status ────────────────────────────────────
  const STATUS_ACCENT: Record<ExamStatus, string> = {
    upcoming: theme.colors.gray,
    soon: "#185FA5",
    imminent: "#E24B4A",
  };

  const STATUS_BADGE_BG: Record<ExamStatus, string> = {
    upcoming: theme.colors.grayLight,
    soon: "#E6F1FB",
    imminent: "#FCEBEB",
  };

  const STATUS_BADGE_TEXT: Record<ExamStatus, string> = {
    upcoming: theme.colors.textSecondary,
    soon: "#0C447C",
    imminent: "#B3261E",
  };

  const STATUS_CARD_BORDER: Record<ExamStatus, string> = {
    upcoming: theme.colors.glassBorder,
    soon: "#B5D4F4",
    imminent: "#F7C1C1",
  };

  const STATUS_COUNTDOWN_TEXT: Record<ExamStatus, string> = {
    upcoming: theme.colors.textPrimary,
    soon: "#0C447C",
    imminent: "#B3261E",
  };

  const STATUS_LABEL: Record<ExamStatus, string> = {
    upcoming: "Upcoming",
    soon: "Soon",
    imminent: "Imminent",
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <MainLayout>
      {/* Page header */}
      <View style={styles.pageHeader}>
        <Text style={[styles.title, !isMobile && styles.titleDesktop]}>Exam timetable</Text>
        <Text style={styles.subtitle}>
          Your upcoming exams with live countdowns, venues, and times.
        </Text>
      </View>

      {/* ── Stat row ── */}
      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total exams</Text>
          <Text style={[styles.statValue, !isMobile && styles.statValueDesktop]}>{exams.length}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Upcoming</Text>
          <Text style={[styles.statValue, !isMobile && styles.statValueDesktop]}>{upcomingCount}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Next exam</Text>
          {nextExam ? (
            <>
              <Text style={styles.statValueSmall} numberOfLines={1}>
                {nextExam.courseCode}
              </Text>
              <Text style={styles.statSub}>
                {getCountdown(nextExam.date, nextExam.startTime, currentTime)}
              </Text>
            </>
          ) : (
            <Text style={styles.statValueSmall}>None</Text>
          )}
        </View>
      </View>

      {/* ── Sort + filter controls ── */}
      <View style={styles.controls}>
        {/* Sort pills */}
        <View style={styles.sortRow}>
          {(["date", "countdown"] as SortMode[]).map((mode) => {
            const isActive = sortBy === mode;
            return (
              <Pressable
                key={mode}
                onPress={() => setSortBy(mode)}
                style={[styles.sortPill, isActive && styles.sortPillActive]}
              >
                <Text
                  style={[
                    styles.sortPillText,
                    isActive && styles.sortPillTextActive,
                  ]}
                >
                  {mode === "date" ? "By date" : "By countdown"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Filter pills — horizontal scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {(["all", "imminent", "soon", "upcoming"] as FilterMode[]).map(
            (mode) => {
              const isActive = filterBy === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => setFilterBy(mode)}
                  style={[
                    styles.filterPill,
                    isActive && styles.filterPillActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      isActive && styles.filterPillTextActive,
                    ]}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </Text>
                </Pressable>
              );
            },
          )}
        </ScrollView>
      </View>

      {/* ── Exam list ── */}
      {isLoadingExams ? (
        <Text style={styles.emptyText}>Loading exam timetable...</Text>
      ) : sortedFilteredExams.length === 0 ? (
        <Text style={styles.emptyText}>
          {studentNumber
            ? examLoadError || "No exams found in your saved timetable yet."
            : "Sign in to view your exam timetable."}
        </Text>
      ) : (
        (() => {
          let lastDate = "";
          return sortedFilteredExams.map((exam) => {
            const status = getStatus(exam.date, exam.startTime, currentTime);
            const countdown = getCountdown(
              exam.date,
              exam.startTime,
              currentTime,
            );

            // Date group header (only when sorted by date)
            const showDateHeader = sortBy === "date" && exam.date !== lastDate;
            if (showDateHeader) lastDate = exam.date;

            return (
              <View key={exam.id}>
                {showDateHeader ? (
                  <Text style={styles.dateGroupHeader}>
                    {formatDateLong(exam.date)}
                  </Text>
                ) : null}

                <View
                  style={[
                    styles.examCard,
                    { borderColor: STATUS_CARD_BORDER[status] },
                  ]}
                >
                  <View style={styles.examInner}>
                    {/* Accent bar */}
                    <View
                      style={[
                        styles.accentBar,
                        { backgroundColor: STATUS_ACCENT[status] },
                      ]}
                    />

                    <View style={[styles.examBody, !isMobile && styles.examBodyDesktop]}>
                      {/* Top row: course + countdown */}
                      <View style={styles.examTop}>
                        <View style={styles.examTitleWrap}>
                          <Text style={styles.examCode}>{exam.courseCode}</Text>
                          <Text style={[styles.examName, !isMobile && styles.examNameDesktop]}>{exam.courseName}</Text>
                        </View>

                        <View style={styles.examRight}>
                          <View
                            style={[
                              styles.statusBadge,
                              {
                                backgroundColor: STATUS_BADGE_BG[status],
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusBadgeText,
                                { color: STATUS_BADGE_TEXT[status] },
                              ]}
                            >
                              {STATUS_LABEL[status]}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.countdownNum,
                              !isMobile && styles.countdownNumDesktop,
                              { color: STATUS_COUNTDOWN_TEXT[status] },
                            ]}
                          >
                            {countdown}
                          </Text>
                          <Text style={styles.countdownLabel}>remaining</Text>
                        </View>
                      </View>

                      {/* Detail chips grid */}
                      <View style={styles.detailGrid}>
                        <DetailChip
                          label="Date"
                          value={formatDateShort(exam.date)}
                          isDesktop={!isMobile}
                        />
                        <DetailChip
                          label="Time"
                          value={`${exam.startTime} – ${exam.endTime}`}
                          isDesktop={!isMobile}
                        />
                        <DetailChip
                          label="Duration"
                          value={`${exam.duration} min`}
                          isDesktop={!isMobile}
                        />
                        {exam.paper ? (
                          <DetailChip label="Paper" value={exam.paper} isDesktop={!isMobile} />
                        ) : null}
                        <DetailChip
                          label="Venue"
                          value={exam.location}
                          fullWidth
                          isDesktop={!isMobile}
                        />
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            );
          });
        })()
      )}
    </MainLayout>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Page header
  pageHeader: {
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: 3,
  },
  titleDesktop: {
    fontSize: theme.fontSize.xxl,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
    lineHeight: 20,
  },

  // Stats
  statRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: theme.spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    gap: 2,
  },
  statLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "500",
    color: theme.colors.textPrimary,
  },
  statValueDesktop: {
    fontSize: 22,
  },
  statValueSmall: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.textPrimary,
    marginTop: 3,
  },
  statSub: {
    fontSize: 10,
    color: theme.colors.textLight,
    marginTop: 1,
  },

  // Controls
  controls: {
    gap: 6,
    marginBottom: theme.spacing.md,
  },
  sortRow: {
    flexDirection: "row",
    gap: 5,
  },
  sortPill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    backgroundColor: theme.colors.card,
  },
  sortPillActive: {
    backgroundColor: "#E6F1FB",
    borderColor: "#B5D4F4",
  },
  sortPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  sortPillTextActive: {
    color: "#0C447C",
  },
  filterRow: {
    gap: 5,
    paddingRight: theme.spacing.sm,
  },
  filterPill: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    backgroundColor: theme.colors.card,
  },
  filterPillActive: {
    backgroundColor: theme.colors.grayLight,
    borderColor: theme.colors.gray,
  },
  filterPillText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: "500",
  },
  filterPillTextActive: {
    color: theme.colors.textPrimary,
  },

  // Empty state
  emptyText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.sm,
  },

  // Date group header
  dateGroupHeader: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    paddingTop: 6,
    paddingBottom: 5,
    letterSpacing: 0.2,
  },

  // Exam card
  examCard: {
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    backgroundColor: theme.colors.card,
    overflow: "hidden",
    marginBottom: 8,
  },
  examInner: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  accentBar: {
    width: 4,
    flexShrink: 0,
  },
  examBody: {
    flex: 1,
    padding: 12,
    gap: 10,
    minWidth: 0,
  },
  examBodyDesktop: {
    padding: 16,
  },

  // Top section
  examTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  examTitleWrap: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  examCode: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  examName: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.textPrimary,
    lineHeight: 20,
  },
  examNameDesktop: {
    fontSize: 15,
  },
  examRight: {
    flexShrink: 0,
    alignItems: "flex-end",
    gap: 4,
  },
  statusBadge: {
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 99,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  countdownNum: {
    fontSize: 17,
    fontWeight: "500",
    lineHeight: 20,
    fontVariant: ["tabular-nums"],
  },
  countdownNumDesktop: {
    fontSize: 20,
    lineHeight: 24,
  },
  countdownLabel: {
    fontSize: 9,
    color: theme.colors.textLight,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    textAlign: "right",
  },

  // Detail grid
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  detailChip: {
    backgroundColor: theme.colors.grayLight,
    borderRadius: theme.borderRadius.md,
    padding: 6,
    paddingHorizontal: 8,
    minWidth: 0,
    flex: 1,
    gap: 1,
  },
  detailChipDesktop: {
    padding: 8,
    paddingHorizontal: 10,
    minWidth: 90,
    flex: 0,
  },
  detailChipFull: {
    width: "100%",
    flexBasis: "100%",
  },
  detailChipFullDesktop: {
    flex: 1,
    width: undefined,
    flexBasis: undefined,
  },
  chipLabel: {
    fontSize: 10,
    color: theme.colors.textLight,
    fontWeight: "500",
  },
  chipValue: {
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.textPrimary,
  },
});
