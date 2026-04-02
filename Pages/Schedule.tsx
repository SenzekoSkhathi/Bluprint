import MainLayout from "@/components/main-layout";
import { theme } from "@/constants/theme";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { academicRepository } from "@/services/academic-repository";
import {
  getStudentSchedule,
  updateStudentSchedule,
} from "@/services/backend-api";
import type {
  ScheduleItem,
  SessionType,
  TodoItem,
  TodoScope,
} from "@/types/academic";
import { MaterialIcons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type ViewMode = "Daily" | "Weekly";

const weekDays = academicRepository.getScheduleWeekDays();
const todoScopes = academicRepository.getScheduleTodoScopes();
const sessionTypes = academicRepository.getScheduleSessionTypes();

// ─── Colour map per session type ─────────────────────────────────────────────
const SESSION_COLORS: Record<
  SessionType | "personal",
  { bg: string; border: string; accent: string; tagBg: string; tagText: string }
> = {
  Class: {
    bg: "#E6F1FB",
    border: "#B5D4F4",
    accent: "#185FA5",
    tagBg: "#B5D4F4",
    tagText: "#0C447C",
  },
  Tutorial: {
    bg: "#E1F5EE",
    border: "#9FE1CB",
    accent: "#1D9E75",
    tagBg: "#9FE1CB",
    tagText: "#085041",
  },
  Lab: {
    bg: "#FAEEDA",
    border: "#FAC775",
    accent: "#BA7517",
    tagBg: "#FAC775",
    tagText: "#633806",
  },
  personal: {
    bg: "#EEEDFE",
    border: "#AFA9EC",
    accent: "#7F77DD",
    tagBg: "#AFA9EC",
    tagText: "#3C3489",
  },
};

function getSessionColors(type: SessionType | string) {
  if (type in SESSION_COLORS) {
    return SESSION_COLORS[type as SessionType | "personal"];
  }
  return SESSION_COLORS["Class"];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function padTime(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateInput(date: Date) {
  return `${date.getFullYear()}-${padTime(date.getMonth() + 1)}-${padTime(
    date.getDate(),
  )}`;
}

function toDayName(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "long" });
}

function getStartOfWeek(date: Date) {
  const copy = new Date(date);
  const jsDay = copy.getDay();
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay;
  copy.setDate(copy.getDate() + diffToMonday);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function getCountdownText(dueAt: string, now: Date) {
  const due = new Date(dueAt);
  const diffMs = due.getTime() - now.getTime();
  if (diffMs <= 0) return "Due now";
  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) return `${days}d ${hours}h left`;
  return `${hours}h left`;
}

function isUrgent(dueAt: string, now: Date) {
  const due = new Date(dueAt);
  const diffMs = due.getTime() - now.getTime();
  return diffMs > 0 && diffMs < 1000 * 60 * 60 * 6; // under 6 hours
}

function parseTodoTitle(title: string): { scope: TodoScope; text: string } {
  const match = title.match(/^\[(Daily|Weekly|Monthly|Once Off)\]\s+(.+)$/);
  if (!match) return { scope: "Daily", text: title };
  return { scope: match[1] as TodoScope, text: match[2] };
}

function encodeTodoTitle(todo: TodoItem): string {
  return `[${todo.scope}] ${todo.title}`;
}

function buildScheduleSnapshot(
  scheduleItems: ScheduleItem[],
  todos: TodoItem[],
) {
  return JSON.stringify({
    sessions: scheduleItems.map((item) => ({
      id: item.id,
      courseCode: item.courseCode,
      courseName: item.courseName,
      type: item.type,
      day: item.day,
      startTime: item.startTime,
      endTime: item.endTime,
      location: item.location,
    })),
    todos: todos.map((todo) => ({
      id: todo.id,
      title: todo.title,
      scope: todo.scope,
      dueAt: todo.dueAt,
      completed: todo.completed,
    })),
  });
}

// ─── Derived timeline hours ───────────────────────────────────────────────────
function getTimelineHours(items: ScheduleItem[]): number[] {
  if (items.length === 0) {
    return [8, 10, 12, 14, 16, 18];
  }
  const minHour = Math.max(
    0,
    Math.min(...items.map((i) => parseInt(i.startTime.split(":")[0], 10))) - 1,
  );
  const maxHour = Math.min(
    23,
    Math.max(...items.map((i) => parseInt(i.endTime.split(":")[0], 10))) + 1,
  );
  const hours: number[] = [];
  for (let h = minHour; h <= maxHour; h += 2) hours.push(h);
  return hours;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface ScheduleProps {
  studentNumber?: string;
}

export default function Schedule({ studentNumber }: ScheduleProps) {
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<ViewMode>("Daily");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>(
    toDayName(new Date()),
  );
  const [selectedWeekStart, setSelectedWeekStart] = useState(
    getStartOfWeek(new Date()),
  );
  const [currentTime, setCurrentTime] = useState(new Date());

  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [hasHydratedSchedule, setHasHydratedSchedule] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [lastPersistedSnapshot, setLastPersistedSnapshot] = useState<string>(
    buildScheduleSnapshot([], []),
  );

  // Session form
  const [showAddSession, setShowAddSession] = useState(false);
  const [sessionCourseCode, setSessionCourseCode] = useState("");
  const [sessionCourseName, setSessionCourseName] = useState("");
  const [sessionType, setSessionType] = useState<SessionType>("Class");
  const [sessionDay, setSessionDay] = useState<string>("Monday");
  const [sessionStartTime, setSessionStartTime] = useState("09:00");
  const [sessionEndTime, setSessionEndTime] = useState("10:00");
  const [sessionLocation, setSessionLocation] = useState("");
  const [sessionIsPersonal, setSessionIsPersonal] = useState(false);

  // Todo state
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [showAddTodo, setShowAddTodo] = useState(false);
  const [todoFilter, setTodoFilter] = useState<TodoScope>("Daily");
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [todoTitle, setTodoTitle] = useState("");
  const [todoScope, setTodoScope] = useState<TodoScope>("Daily");
  const [todoDueDate, setTodoDueDate] = useState(formatDateInput(new Date()));
  const [todoDueTime, setTodoDueTime] = useState("23:59");

  const validationReport = useMemo(
    () =>
      academicRepository.getAcademicValidationReport({
        scheduleItems,
        inProgressCourses: [],
      }),
    [scheduleItems],
  );

  const scheduleIssues = useMemo(
    () =>
      validationReport.issues
        .filter((issue) => issue.category === "schedule")
        .slice(0, 5),
    [validationReport.issues],
  );

  const isSaveBlocked = validationReport.summary.blockers > 0;

  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    let isMounted = true;

    if (!studentNumber) {
      setScheduleItems([]);
      setTodos([]);
      setLastPersistedSnapshot(buildScheduleSnapshot([], []));
      setHasHydratedSchedule(true);
      setSyncError(null);
      setSyncNotice(null);
      return () => {
        isMounted = false;
      };
    }

    setHasHydratedSchedule(false);
    setSyncError(null);
    setSyncNotice(null);

    getStudentSchedule({ student_number: studentNumber })
      .then((response) => {
        if (!isMounted) return;

        const nextScheduleItems = response.sessions.map((session, index) => ({
          id: session.id || `session-${index}`,
          courseCode: (session.course_code || "GEN0000").toUpperCase(),
          courseName: session.title || session.course_code || "Session",
          type: "Class" as SessionType,
          day: session.day || "Monday",
          startTime: session.start_time || "09:00",
          endTime: session.end_time || "10:00",
          location: session.location || "TBD",
        }));

        const nextTodos = response.todos.map((todo, index) => {
          const parsed = parseTodoTitle(todo.title || "Task");
          return {
            id: todo.id || `todo-${index}`,
            title: parsed.text,
            scope: parsed.scope,
            dueAt: todo.due_iso || new Date().toISOString(),
            completed: Boolean(todo.done),
          } as TodoItem;
        });

        setScheduleItems(nextScheduleItems);
        setTodos(nextTodos);
        setLastPersistedSnapshot(
          buildScheduleSnapshot(nextScheduleItems, nextTodos),
        );
        setHasHydratedSchedule(true);
      })
      .catch(() => {
        if (!isMounted) return;
        setScheduleItems([]);
        setTodos([]);
        setLastPersistedSnapshot(buildScheduleSnapshot([], []));
        setHasHydratedSchedule(true);
        setSyncError(
          "Could not load your saved schedule. Showing an empty schedule.",
        );
      });

    return () => {
      isMounted = false;
    };
  }, [studentNumber]);

  // ─── Derived schedule data ──────────────────────────────────────────────────
  const dailySchedule = useMemo(
    () =>
      scheduleItems
        .filter((item) => item.day === selectedDayFilter)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [scheduleItems, selectedDayFilter],
  );

  const weeklySchedule = useMemo(
    () =>
      weekDays.map((day) => ({
        day,
        items: scheduleItems
          .filter((item) => item.day === day)
          .sort((a, b) => a.startTime.localeCompare(b.startTime)),
      })),
    [scheduleItems],
  );

  const filteredTodos = useMemo(
    () =>
      todos
        .filter((todo) => todo.scope === todoFilter)
        .sort(
          (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
        ),
    [todos, todoFilter],
  );

  const currentSnapshot = useMemo(
    () => buildScheduleSnapshot(scheduleItems, todos),
    [scheduleItems, todos],
  );

  const hasUnsavedChanges =
    hasHydratedSchedule && currentSnapshot !== lastPersistedSnapshot;

  const timelineHours = useMemo(
    () => getTimelineHours(dailySchedule),
    [dailySchedule],
  );

  // Generate the 7-day strip around today
  const dayStrip = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfWeek = getStartOfWeek(today);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      return d;
    });
  }, []);

  const selectedWeekLabel = useMemo(() => {
    const weekEnd = new Date(selectedWeekStart);
    weekEnd.setDate(selectedWeekStart.getDate() + 6);
    return `${selectedWeekStart.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })} – ${weekEnd.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;
  }, [selectedWeekStart]);

  const syncStatusLabel = useMemo(() => {
    if (!studentNumber) return "Local only";
    if (!hasHydratedSchedule) return "Loading…";
    if (syncError) return "Sync error";
    if (hasUnsavedChanges) return "Unsaved changes";
    return "Synced";
  }, [studentNumber, hasHydratedSchedule, syncError, hasUnsavedChanges]);

  const saveBtnLabel = useMemo(() => {
    if (isSavingSchedule) return "Saving…";
    if (isSaveBlocked) return "Timetable clash — resolve first";
    if (hasUnsavedChanges) return "Save changes";
    return "Up to date";
  }, [isSavingSchedule, isSaveBlocked, hasUnsavedChanges]);

  const saveBtnVariant: "blocked" | "ready" | "idle" = isSaveBlocked
    ? "blocked"
    : hasUnsavedChanges
      ? "ready"
      : "idle";

  // ─── Actions ───────────────────────────────────────────────────────────────
  const saveSchedule = async () => {
    if (!studentNumber) {
      setSyncNotice("Local-only mode — connect a student account to save.");
      return;
    }
    if (!hasUnsavedChanges) {
      setSyncNotice("No unsaved changes.");
      return;
    }
    if (isSaveBlocked) {
      setSyncError("Resolve timetable clashes before saving.");
      return;
    }

    setIsSavingSchedule(true);
    setSyncError(null);
    setSyncNotice(null);

    try {
      await updateStudentSchedule({
        student_number: studentNumber,
        sessions: scheduleItems.map((item) => ({
          id: item.id,
          title: item.courseName,
          day: item.day,
          start_time: item.startTime,
          end_time: item.endTime,
          course_code: item.courseCode,
          location: item.location,
        })),
        todos: todos.map((todo) => ({
          id: todo.id,
          title: encodeTodoTitle(todo),
          due_iso: todo.dueAt,
          done: todo.completed,
        })),
      });

      setLastPersistedSnapshot(currentSnapshot);
      setSyncNotice("Schedule saved.");
    } catch {
      setSyncError("Could not save to server. Changes kept locally.");
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const removeScheduleItem = (id: string) => {
    setScheduleItems((prev) => prev.filter((item) => item.id !== id));
  };

  const clearSessionForm = () => {
    setShowAddSession(false);
    setSessionCourseCode("");
    setSessionCourseName("");
    setSessionType("Class");
    setSessionDay(selectedDayFilter || "Monday");
    setSessionStartTime("09:00");
    setSessionEndTime("10:00");
    setSessionLocation("");
    setSessionIsPersonal(false);
  };

  const saveSession = () => {
    if (
      !sessionCourseName.trim() ||
      !sessionDay ||
      !sessionStartTime.trim() ||
      !sessionEndTime.trim()
    ) {
      return;
    }

    const newSession: ScheduleItem = {
      id: `${Date.now()}-sch`,
      courseCode: sessionIsPersonal
        ? "PERSONAL"
        : sessionCourseCode.trim().toUpperCase() || "GEN000",
      courseName: sessionCourseName.trim(),
      type: sessionIsPersonal ? ("personal" as any) : sessionType,
      day: sessionDay,
      startTime: sessionStartTime.trim(),
      endTime: sessionEndTime.trim(),
      location: sessionLocation.trim() || "TBD",
    };

    setScheduleItems((prev) => [...prev, newSession]);
    clearSessionForm();
  };

  const clearTodoForm = () => {
    setEditingTodoId(null);
    setTodoTitle("");
    setTodoScope("Daily");
    setTodoDueDate(formatDateInput(new Date()));
    setTodoDueTime("23:59");
    setShowAddTodo(false);
  };

  const saveTodo = () => {
    if (!todoTitle.trim()) return;
    const dueAt = new Date(`${todoDueDate}T${todoDueTime}:00`);
    if (Number.isNaN(dueAt.getTime())) return;

    const payload: TodoItem = {
      id: editingTodoId ?? `${Date.now()}-todo`,
      title: todoTitle.trim(),
      scope: todoScope,
      dueAt: dueAt.toISOString(),
      completed: false,
    };

    setTodos((prev) => {
      if (editingTodoId) {
        const existing = prev.find((item) => item.id === editingTodoId);
        return prev.map((item) =>
          item.id === editingTodoId
            ? { ...payload, completed: existing?.completed ?? false }
            : item,
        );
      }
      return [payload, ...prev];
    });

    clearTodoForm();
  };

  const toggleTodo = (id: string) => {
    setTodos((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item,
      ),
    );
  };

  const editTodo = (item: TodoItem) => {
    const due = new Date(item.dueAt);
    setEditingTodoId(item.id);
    setTodoTitle(item.title);
    setTodoScope(item.scope);
    setTodoDueDate(formatDateInput(due));
    setTodoDueTime(`${padTime(due.getHours())}:${padTime(due.getMinutes())}`);
    setShowAddTodo(true);
  };

  const removeTodo = (id: string) => {
    setTodos((prev) => prev.filter((item) => item.id !== id));
    if (editingTodoId === id) clearTodoForm();
  };

  // ─── Sub-components ─────────────────────────────────────────────────────────
  const renderSessionBlock = (item: ScheduleItem, showDelete = true) => {
    const colors = getSessionColors(item.type);
    return (
      <View
        key={item.id}
        style={[
          styles.sessionBlock,
          {
            backgroundColor: colors.bg,
            borderColor: colors.border,
            borderLeftColor: colors.accent,
          },
        ]}
      >
        <View style={styles.sessionBlockTop}>
          <Text style={[styles.sessionCode, { color: colors.tagText }]}>
            {item.courseCode}
          </Text>
          <View style={[styles.sessionTag, { backgroundColor: colors.tagBg }]}>
            <Text style={[styles.sessionTagText, { color: colors.tagText }]}>
              {item.type}
            </Text>
          </View>
        </View>
        <Text style={styles.sessionName}>{item.courseName}</Text>
        <Text style={styles.sessionMeta}>
          {item.startTime} – {item.endTime} · {item.location}
        </Text>
        {showDelete ? (
          <Pressable
            onPress={() => removeScheduleItem(item.id)}
            style={styles.sessionRemove}
            hitSlop={8}
          >
            <Text style={styles.sessionRemoveText}>Remove</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  const renderWeekChip = (item: ScheduleItem) => {
    const colors = getSessionColors(item.type);
    return (
      <View
        key={item.id}
        style={[styles.weekChip, { backgroundColor: colors.bg }]}
      >
        <Text style={[styles.weekChipCode, { color: colors.tagText }]}>
          {item.courseCode}
        </Text>
        <Text style={[styles.weekChipTime, { color: colors.tagText }]}>
          {item.startTime}–{item.endTime}
        </Text>
      </View>
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <MainLayout>
      {/* Page header */}
      <View style={styles.pageHeader}>
        <Text style={[styles.title, !isMobile && styles.titleDesktop]}>Schedule</Text>
        {!isMobile && (
          <Text style={styles.subtitle}>
            Your classes, tutorials, and tasks — all in one place.
          </Text>
        )}
      </View>

      {/* Sync bar */}
      <View style={styles.syncBar}>
        <Text style={styles.syncLabel}>
          {syncStatusLabel}
          {syncError || syncNotice ? (
            <Text
              style={
                syncError ? styles.syncErrorInline : styles.syncNoticeInline
              }
            >
              {" · "}
              {syncError ?? syncNotice}
            </Text>
          ) : null}
        </Text>
        {studentNumber ? (
          <Pressable
            onPress={() => void saveSchedule()}
            disabled={isSavingSchedule || isSaveBlocked || !hasUnsavedChanges}
            style={[
              styles.saveBtnBase,
              saveBtnVariant === "blocked" && styles.saveBtnBlocked,
              saveBtnVariant === "ready" && styles.saveBtnReady,
              (isSavingSchedule || isSaveBlocked || !hasUnsavedChanges) &&
                styles.saveBtnDisabled,
            ]}
          >
            <Text
              style={[
                styles.saveBtnText,
                saveBtnVariant === "blocked" && styles.saveBtnBlockedText,
                saveBtnVariant === "ready" && styles.saveBtnReadyText,
              ]}
            >
              {saveBtnLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Schedule clash issues */}
      {scheduleIssues.length > 0 ? (
        <View style={styles.clashBanner}>
          <View style={styles.clashDot} />
          <Text style={styles.clashBannerText}>
            <Text style={styles.clashBold}>
              {scheduleIssues.length} timetable{" "}
              {scheduleIssues.length === 1 ? "issue" : "issues"}
            </Text>
            {" — "}
            {scheduleIssues[0].message}
          </Text>
        </View>
      ) : null}

      {/* View toggle */}
      <View style={styles.viewToggle}>
        {(["Daily", "Weekly"] as ViewMode[]).map((mode) => {
          const isActive = viewMode === mode;
          return (
            <Pressable
              key={mode}
              onPress={() => setViewMode(mode)}
              style={[styles.viewTab, isActive && styles.viewTabActive]}
            >
              <Text
                style={[
                  styles.viewTabText,
                  isActive && styles.viewTabTextActive,
                ]}
              >
                {mode === "Daily" ? "Day" : "Week"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {viewMode === "Daily" ? (
        <>
          {/* Day strip */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.dayStripScroll}
            contentContainerStyle={styles.dayStripContent}
          >
            {dayStrip.map((date) => {
              const isToday =
                formatDateInput(date) === formatDateInput(new Date());
              const isSelected =
                formatDateInput(date) === formatDateInput(selectedDate);
              const dayName = toDayName(date);
              const hasItems = scheduleItems.some(
                (item) => item.day === dayName,
              );
              return (
                <Pressable
                  key={formatDateInput(date)}
                  onPress={() => {
                    setSelectedDate(date);
                    setSelectedDayFilter(dayName);
                    setSelectedWeekStart(getStartOfWeek(date));
                  }}
                  style={[
                    styles.dayBtn,
                    isSelected && styles.dayBtnActive,
                    isToday && !isSelected && styles.dayBtnToday,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayBtnName,
                      isSelected && styles.dayBtnNameActive,
                    ]}
                  >
                    {date
                      .toLocaleDateString("en-US", { weekday: "short" })
                      .slice(0, 3)}
                  </Text>
                  <Text
                    style={[
                      styles.dayBtnNum,
                      isSelected && styles.dayBtnNumActive,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                  {hasItems ? <View style={styles.dayBtnDot} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Legend */}
          <View style={styles.legendRow}>
            {[
              { label: "Lecture", color: "#185FA5" },
              { label: "Tutorial", color: "#1D9E75" },
              { label: "Lab", color: "#BA7517" },
              { label: "Personal", color: "#7F77DD" },
            ].map((item) => (
              <View key={item.label} style={styles.legendItem}>
                <View
                  style={[styles.legendBar, { backgroundColor: item.color }]}
                />
                <Text style={styles.legendText}>{item.label}</Text>
              </View>
            ))}
          </View>

          {/* Section header */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderLabel}>
              {selectedDate.toLocaleDateString("en-US", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </Text>
            <Pressable onPress={() => setShowAddSession(!showAddSession)}>
              <Text style={styles.addLink}>+ Add session</Text>
            </Pressable>
          </View>

          {/* Add session form */}
          {showAddSession ? (
            <View style={styles.addForm}>
              <Pressable onPress={clearSessionForm} style={styles.formBackBtn}>
                <View style={styles.formBackContent}>
                  <MaterialIcons
                    name="arrow-back"
                    size={16}
                    color={theme.colors.deepBlue}
                  />
                </View>
              </Pressable>

              {/* Personal toggle */}
              <View style={styles.personalToggleRow}>
                <Text style={styles.addFormLabel}>Session type</Text>
                <View style={styles.personalTogglePills}>
                  <Pressable
                    onPress={() => setSessionIsPersonal(false)}
                    style={[
                      styles.personalPill,
                      !sessionIsPersonal && styles.personalPillActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.personalPillText,
                        !sessionIsPersonal && styles.personalPillTextActive,
                      ]}
                    >
                      Academic
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setSessionIsPersonal(true)}
                    style={[
                      styles.personalPill,
                      sessionIsPersonal && styles.personalPillPersonal,
                    ]}
                  >
                    <Text
                      style={[
                        styles.personalPillText,
                        sessionIsPersonal && styles.personalPillPersonalText,
                      ]}
                    >
                      Personal
                    </Text>
                  </Pressable>
                </View>
              </View>

              {!sessionIsPersonal ? (
                <>
                  <TextInput
                    value={sessionCourseCode}
                    onChangeText={setSessionCourseCode}
                    placeholder="Course code (e.g. STA2004F)"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.formInput}
                    autoCapitalize="characters"
                  />
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.formPillsRow}
                  >
                    {sessionTypes.map((type) => {
                      const isActive = sessionType === type;
                      return (
                        <Pressable
                          key={type}
                          onPress={() => setSessionType(type)}
                          style={[
                            styles.formPill,
                            isActive && styles.formPillActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.formPillText,
                              isActive && styles.formPillTextActive,
                            ]}
                          >
                            {type}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </>
              ) : null}

              <TextInput
                value={sessionCourseName}
                onChangeText={setSessionCourseName}
                placeholder={
                  sessionIsPersonal
                    ? "e.g. Gym, Study session, Coffee"
                    : "Session name"
                }
                placeholderTextColor={theme.colors.textMuted}
                style={styles.formInput}
              />

              {/* Day picker */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.formPillsRow}
              >
                {weekDays.map((day) => {
                  const isActive = sessionDay === day;
                  return (
                    <Pressable
                      key={day}
                      onPress={() => setSessionDay(day)}
                      style={[
                        styles.formPill,
                        isActive && styles.formPillActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.formPillText,
                          isActive && styles.formPillTextActive,
                        ]}
                      >
                        {day.slice(0, 3)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={[styles.formTimeRow, !isMobile && styles.formTimeRowDesktop]}>
                <TextInput
                  value={sessionStartTime}
                  onChangeText={setSessionStartTime}
                  placeholder="09:00"
                  placeholderTextColor={theme.colors.textMuted}
                  style={[styles.formInput, styles.formTimeInput, !isMobile && styles.formTimeInputDesktop]}
                />
                <Text style={styles.formTimeSep}>–</Text>
                <TextInput
                  value={sessionEndTime}
                  onChangeText={setSessionEndTime}
                  placeholder="10:00"
                  placeholderTextColor={theme.colors.textMuted}
                  style={[styles.formInput, styles.formTimeInput, !isMobile && styles.formTimeInputDesktop]}
                />
                <TextInput
                  value={sessionLocation}
                  onChangeText={setSessionLocation}
                  placeholder="Venue"
                  placeholderTextColor={theme.colors.textMuted}
                  style={[styles.formInput, { flex: 1 }]}
                />
              </View>

              <View style={styles.formActions}>
                <Pressable onPress={saveSession} style={styles.formBtnPrimary}>
                  <Text style={styles.formBtnPrimaryText}>Add session</Text>
                </Pressable>
                <Pressable
                  onPress={clearSessionForm}
                  style={styles.formBtnSecondary}
                >
                  <Text style={styles.formBtnSecondaryText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* Timeline */}
          {dailySchedule.length === 0 ? (
            <Text style={styles.emptyText}>
              No sessions for {selectedDayFilter}. Tap "+ Add session" to add
              one.
            </Text>
          ) : (
            <View style={styles.timeline}>
              {timelineHours.map((hour, index) => {
                const timeKey = `${padTime(hour)}:00`;
                const sessionAtHour = dailySchedule.filter((item) => {
                  const itemHour = parseInt(item.startTime.split(":")[0], 10);
                  const nextHour = timelineHours[index + 1] ?? hour + 2;
                  return itemHour >= hour && itemHour < nextHour;
                });
                const isNowInSlot =
                  currentTime.getHours() >= hour &&
                  currentTime.getHours() <
                    (timelineHours[index + 1] ?? hour + 2);

                return (
                  <View key={timeKey} style={styles.timelineRow}>
                    <View style={styles.timelineTimeCol}>
                      <Text style={styles.timelineTimeText}>{timeKey}</Text>
                    </View>
                    <View style={styles.timelineLineCol}>
                      {isNowInSlot ? <View style={styles.nowDot} /> : null}
                    </View>
                    <View style={styles.timelineSessionCol}>
                      {sessionAtHour.length === 0 ? (
                        <Text style={styles.timelineGapText}>—</Text>
                      ) : (
                        sessionAtHour.map((item) => renderSessionBlock(item))
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </>
      ) : (
        <>
          {/* Weekly view */}
          <Text style={styles.weekRangeLabel}>{selectedWeekLabel}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.weekGridScroll}
            contentContainerStyle={styles.weekGridContent}
          >
            {weeklySchedule.map((dayGroup) => {
              const isToday = dayGroup.day === toDayName(new Date());
              return (
                <View
                  key={dayGroup.day}
                  style={[styles.weekCol, !isMobile && styles.weekColDesktop, isToday && styles.weekColToday]}
                >
                  <View style={styles.weekColHead}>
                    <Text style={styles.weekColDay}>
                      {dayGroup.day.slice(0, 3)}
                    </Text>
                    <Text
                      style={[
                        styles.weekColDate,
                        isToday && styles.weekColDateToday,
                      ]}
                    >
                      {(() => {
                        const idx = weekDays.indexOf(dayGroup.day);
                        const d = new Date(selectedWeekStart);
                        d.setDate(selectedWeekStart.getDate() + idx);
                        return d.getDate();
                      })()}
                    </Text>
                  </View>
                  <View style={styles.weekColSessions}>
                    {dayGroup.items.length === 0 ? (
                      <Text style={styles.weekColEmpty}>Free</Text>
                    ) : (
                      dayGroup.items.map((item) => renderWeekChip(item))
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </>
      )}

      {/* ── Divider ── */}
      <View style={styles.divider} />

      {/* ── To-do section ── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderLabel}>To-do</Text>
        <Pressable onPress={() => setShowAddTodo(!showAddTodo)}>
          <Text style={styles.addLink}>+ Add task</Text>
        </Pressable>
      </View>

      {/* Todo scope filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.todoFiltersScroll}
        contentContainerStyle={styles.todoFiltersContent}
      >
        {todoScopes.map((scope) => {
          const isActive = todoFilter === scope;
          return (
            <Pressable
              key={scope}
              onPress={() => setTodoFilter(scope)}
              style={[styles.todoFilter, isActive && styles.todoFilterActive]}
            >
              <Text
                style={[
                  styles.todoFilterText,
                  isActive && styles.todoFilterTextActive,
                ]}
              >
                {scope}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Add todo form */}
      {showAddTodo ? (
        <View style={styles.addForm}>
          <Pressable onPress={clearTodoForm} style={styles.formBackBtn}>
            <View style={styles.formBackContent}>
              <MaterialIcons
                name="arrow-back"
                size={16}
                color={theme.colors.deepBlue}
              />
            </View>
          </Pressable>

          <TextInput
            value={todoTitle}
            onChangeText={setTodoTitle}
            placeholder="Task title"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.formInput}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.formPillsRow}
          >
            {todoScopes.map((scope) => {
              const isActive = todoScope === scope;
              return (
                <Pressable
                  key={scope}
                  onPress={() => setTodoScope(scope)}
                  style={[styles.formPill, isActive && styles.formPillActive]}
                >
                  <Text
                    style={[
                      styles.formPillText,
                      isActive && styles.formPillTextActive,
                    ]}
                  >
                    {scope}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={[styles.formTimeRow, !isMobile && styles.formTimeRowDesktop]}>
            <TextInput
              value={todoDueDate}
              onChangeText={setTodoDueDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.formInput, { flex: 1 }]}
            />
            <TextInput
              value={todoDueTime}
              onChangeText={setTodoDueTime}
              placeholder="HH:MM"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.formInput, styles.formTimeInput, !isMobile && styles.formTimeInputDesktop]}
            />
          </View>
          <View style={styles.formActions}>
            <Pressable onPress={saveTodo} style={styles.formBtnPrimary}>
              <Text style={styles.formBtnPrimaryText}>
                {editingTodoId ? "Update task" : "Add task"}
              </Text>
            </Pressable>
            {editingTodoId ? (
              <Pressable
                onPress={clearTodoForm}
                style={styles.formBtnSecondary}
              >
                <Text style={styles.formBtnSecondaryText}>Cancel</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Todo list */}
      <View style={styles.todoList}>
        {filteredTodos.length === 0 ? (
          <Text style={styles.emptyText}>
            No {todoFilter.toLowerCase()} tasks. Tap "+ Add task" to create one.
          </Text>
        ) : (
          filteredTodos.map((todo) => (
            <Pressable
              key={todo.id}
              onPress={() => toggleTodo(todo.id)}
              style={[styles.todoItem, todo.completed && styles.todoItemDone]}
            >
              {/* Checkbox */}
              <View
                style={[
                  styles.todoCheck,
                  todo.completed && styles.todoCheckDone,
                ]}
              >
                {todo.completed ? (
                  <Text style={styles.todoCheckMark}>✓</Text>
                ) : null}
              </View>

              {/* Body */}
              <View style={styles.todoBody}>
                <Text
                  style={[
                    styles.todoTitle,
                    todo.completed && styles.todoTitleDone,
                  ]}
                >
                  {todo.title}
                </Text>
                <View style={styles.todoMeta}>
                  <View style={styles.todoScopePill}>
                    <Text style={styles.todoScopeText}>{todo.scope}</Text>
                  </View>
                  <Text style={styles.todoDue}>
                    Due{" "}
                    {new Date(todo.dueAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                  {!todo.completed ? (
                    <Text
                      style={[
                        styles.todoCountdown,
                        isUrgent(todo.dueAt, currentTime) &&
                          styles.todoCountdownUrgent,
                      ]}
                    >
                      {getCountdownText(todo.dueAt, currentTime)}
                    </Text>
                  ) : (
                    <Text style={styles.todoCountdownDone}>Completed</Text>
                  )}
                </View>
              </View>

              {/* Actions */}
              <View style={styles.todoActions}>
                <Pressable
                  onPress={() => editTodo(todo)}
                  hitSlop={8}
                  style={styles.todoActionBtn}
                >
                  <Text style={styles.todoActionText}>Edit</Text>
                </Pressable>
                <Pressable
                  onPress={() => removeTodo(todo.id)}
                  hitSlop={8}
                  style={styles.todoActionBtn}
                >
                  <Text style={styles.todoActionText}>Remove</Text>
                </Pressable>
              </View>
            </Pressable>
          ))
        )}
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
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  titleDesktop: {
    fontSize: theme.fontSize.xxl,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
    lineHeight: 20,
  },

  // Sync bar
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
  syncLabel: {
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
  saveBtnReady: {
    borderColor: theme.colors.success,
    backgroundColor: theme.colors.successLight,
  },
  saveBtnReadyText: {
    color: theme.colors.deepBlue,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },

  // Clash banner
  clashBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FAEEDA",
    borderWidth: 1,
    borderColor: "#FAC775",
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    marginBottom: theme.spacing.md,
  },
  clashDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#BA7517",
    marginTop: 4,
    flexShrink: 0,
  },
  clashBannerText: {
    fontSize: theme.fontSize.sm,
    color: "#633806",
    flex: 1,
    lineHeight: 20,
  },
  clashBold: {
    fontWeight: "700",
  },

  // View toggle
  viewToggle: {
    flexDirection: "row",
    gap: 5,
    marginBottom: theme.spacing.md,
  },
  viewTab: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    backgroundColor: theme.colors.card,
  },
  viewTabActive: {
    borderColor: theme.colors.blue,
    backgroundColor: theme.colors.babyBlue,
  },
  viewTabText: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  viewTabTextActive: {
    color: theme.colors.deepBlue,
  },

  // Day strip
  dayStripScroll: {
    marginBottom: theme.spacing.md,
  },
  dayStripContent: {
    gap: 5,
    paddingRight: theme.spacing.sm,
    alignItems: "center",
  },
  dayBtn: {
    alignItems: "center",
    justifyContent: "center",
    width: 56,
    height: 64,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    backgroundColor: theme.colors.card,
    gap: 1,
  },
  dayBtnActive: {
    backgroundColor: theme.colors.babyBlue,
    borderColor: theme.colors.blue,
  },
  dayBtnToday: {
    borderColor: theme.colors.deepBlue,
  },
  dayBtnName: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  dayBtnNameActive: {
    color: theme.colors.deepBlue,
  },
  dayBtnNum: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  dayBtnNumActive: {
    color: theme.colors.deepBlue,
  },
  dayBtnDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.deepBlue,
    marginTop: 2,
  },

  // Legend
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: theme.spacing.md,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendBar: {
    width: 3,
    height: 12,
    borderRadius: 99,
  },
  legendText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionHeaderLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  addLink: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.deepBlue,
  },

  // Add form
  addForm: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  formBackBtn: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  formBackContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  addFormLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  personalToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  personalTogglePills: {
    flexDirection: "row",
    gap: 5,
  },
  personalPill: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.round,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    backgroundColor: theme.colors.grayLight,
  },
  personalPillActive: {
    backgroundColor: theme.colors.babyBlue,
    borderColor: theme.colors.blue,
  },
  personalPillPersonal: {
    backgroundColor: "#EEEDFE",
    borderColor: "#AFA9EC",
  },
  personalPillText: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  personalPillTextActive: {
    color: theme.colors.deepBlue,
  },
  personalPillPersonalText: {
    color: "#3C3489",
  },
  formInput: {
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textPrimary,
  },
  formPillsRow: {
    gap: 5,
  },
  formPill: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.round,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    backgroundColor: theme.colors.grayLight,
  },
  formPillActive: {
    backgroundColor: theme.colors.blue,
    borderColor: theme.colors.blue,
  },
  formPillText: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  formPillTextActive: {
    color: theme.colors.white,
  },
  formTimeRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    alignItems: "center",
    flexWrap: "wrap",
  },
  formTimeRowDesktop: {
    flexWrap: "nowrap",
  },
  formTimeInput: {
    width: "auto",
    flexShrink: 0,
  },
  formTimeInputDesktop: {
    width: 90,
  },
  formTimeSep: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  formActions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    alignItems: "center",
  },
  formBtnPrimary: {
    backgroundColor: theme.colors.blue,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  formBtnPrimaryText: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: theme.colors.white,
  },
  formBtnSecondary: {
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    backgroundColor: theme.colors.grayLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  formBtnSecondaryText: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },

  // Timeline
  timeline: {
    marginBottom: theme.spacing.md,
  },
  timelineRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "stretch",
    minHeight: 56,
  },
  timelineTimeCol: {
    width: 40,
    flexShrink: 0,
    alignItems: "flex-end",
    paddingTop: 2,
  },
  timelineTimeText: {
    fontSize: 11,
    color: theme.colors.textLight,
  },
  timelineLineCol: {
    width: 1,
    backgroundColor: theme.colors.gray,
    flexShrink: 0,
    position: "relative",
  },
  nowDot: {
    position: "absolute",
    top: 0,
    left: -3,
    width: 7,
    height: 7,
    borderRadius: 99,
    backgroundColor: "#E24B4A",
  },
  timelineSessionCol: {
    flex: 1,
    paddingBottom: 8,
    gap: 6,
  },
  timelineGapText: {
    fontSize: 11,
    color: theme.colors.textMuted,
    paddingTop: 4,
  },

  // Session block
  sessionBlock: {
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: 10,
    gap: 2,
  },
  sessionBlockTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  sessionCode: {
    fontSize: 11,
    fontWeight: "700",
  },
  sessionTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 99,
  },
  sessionTagText: {
    fontSize: 10,
    fontWeight: "600",
  },
  sessionName: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  sessionMeta: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  sessionRemove: {
    alignSelf: "flex-start",
    marginTop: 4,
  },
  sessionRemoveText: {
    fontSize: 11,
    color: theme.colors.textLight,
    fontWeight: "600",
  },

  // Empty state
  emptyText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.md,
    lineHeight: 20,
  },

  // Week view
  weekRangeLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  weekGridScroll: {
    marginBottom: theme.spacing.md,
  },
  weekGridContent: {
    gap: 6,
    paddingRight: theme.spacing.sm,
  },
  weekCol: {
    width: 90,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    borderRadius: theme.borderRadius.md,
    overflow: "hidden",
    backgroundColor: theme.colors.card,
  },
  weekColDesktop: {
    width: 140,
  },
  weekColToday: {
    borderColor: theme.colors.deepBlue,
  },
  weekColHead: {
    padding: 8,
    backgroundColor: theme.colors.grayLight,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.gray,
  },
  weekColDay: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  weekColDate: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  weekColDateToday: {
    color: theme.colors.deepBlue,
  },
  weekColSessions: {
    padding: 5,
    gap: 3,
  },
  weekChip: {
    padding: 5,
    borderRadius: 6,
  },
  weekChipCode: {
    fontSize: 10,
    fontWeight: "600",
  },
  weekChipTime: {
    fontSize: 9,
    opacity: 0.8,
    marginTop: 1,
  },
  weekColEmpty: {
    fontSize: 10,
    color: theme.colors.textMuted,
    padding: 6,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: theme.colors.gray,
    marginBottom: theme.spacing.md,
  },

  // Todo filters
  todoFiltersScroll: {
    marginBottom: theme.spacing.sm,
  },
  todoFiltersContent: {
    gap: 5,
    paddingRight: theme.spacing.sm,
    alignItems: "center",
  },
  todoFilter: {
    width: 92,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 99,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    backgroundColor: theme.colors.card,
  },
  todoFilterActive: {
    backgroundColor: theme.colors.babyBlue,
    borderColor: theme.colors.blue,
  },
  todoFilterText: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  todoFilterTextActive: {
    color: theme.colors.deepBlue,
  },

  // Todo list
  todoList: {
    gap: 6,
    marginBottom: theme.spacing.md,
  },
  todoItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 10,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    backgroundColor: theme.colors.card,
  },
  todoItemDone: {
    opacity: 0.55,
  },
  todoCheck: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: theme.colors.gray,
    backgroundColor: theme.colors.white,
    flexShrink: 0,
    marginTop: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  todoCheckDone: {
    backgroundColor: theme.colors.success,
    borderColor: theme.colors.success,
  },
  todoCheckMark: {
    fontSize: 11,
    color: theme.colors.white,
    fontWeight: "700",
    lineHeight: 14,
  },
  todoBody: {
    flex: 1,
    gap: 4,
  },
  todoTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    lineHeight: 18,
  },
  todoTitleDone: {
    textDecorationLine: "line-through",
    color: theme.colors.textMuted,
  },
  todoMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  todoScopePill: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 99,
    backgroundColor: theme.colors.grayLight,
  },
  todoScopeText: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  todoDue: {
    fontSize: 11,
    color: theme.colors.textLight,
  },
  todoCountdown: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.deepBlue,
  },
  todoCountdownUrgent: {
    color: "#B3261E",
  },
  todoCountdownDone: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.success,
  },
  todoActions: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    flexShrink: 0,
  },
  todoActionBtn: {
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.grayLight,
  },
  todoActionText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
});
