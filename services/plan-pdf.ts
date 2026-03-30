/**
 * Plan PDF generation service.
 *
 * Produces two document types:
 *  - "table"     : Year-by-year academic plan table (A4 portrait)
 *  - "timetable" : Weekly period grid per semester (A4 landscape)
 *
 * Uses expo-print → expo-sharing to save/share the generated PDF.
 */

import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

// ─── UCT period definitions ────────────────────────────────────────────────

const UCT_PERIODS: Record<number, string> = {
  1: "08:00–09:00",
  2: "09:00–10:00",
  3: "10:00–11:00",
  4: "11:00–12:00",
  5: "14:00–15:00",
  6: "15:00–16:00",
  7: "16:00–17:00",
  8: "17:00–18:00",
};

const FULL_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
] as const;
const SHORT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

// ─── Types ─────────────────────────────────────────────────────────────────

export type PdfCourseStatus = "Completed" | "In Progress" | "Planned";

export interface PdfCourse {
  code: string;
  name: string;
  credits: number;
  status: PdfCourseStatus;
  lectureTimesRaw?: string | null;
}

export interface PdfSemester {
  label: "Semester 1" | "Semester 2";
  courses: PdfCourse[];
}

export interface PdfYear {
  yearNumber: number;
  calendarYear: number;
  isCurrent: boolean;
  isPast: boolean;
  semesters: PdfSemester[];
  totalCredits: number;
}

export interface PlanPdfData {
  studentName: string;
  studentNumber: string;
  degreeName: string;
  academicLevel: number;
  currentCalendarYear: number;
  years: PdfYear[];
  totalCredits: number;
  targetCredits: number;
}

// ─── Lecture-times parser ──────────────────────────────────────────────────

interface TimeSlot {
  day: string;
  period: number;
}

/**
 * Best-effort parser for UCT free-text lecture_times strings.
 * Handles patterns like:
 *   "Monday - Friday, 5th period"
 *   "Tuesday, Thursday, 2nd period. Tutorials: ..."
 *   "Monday - Thursday, 5th period. Practicals: Friday, 5th period."
 */
function parseLectureTimes(raw: string | null | undefined): TimeSlot[] {
  if (!raw) return [];

  // Only take the main lecture segment (drop Tutorials/Practicals/Labs)
  const mainPart = raw.split(/(?:Tutorials?|Practicals?|Labs?):/i)[0];

  // Extract period number (1st … 8th)
  const periodMatch = mainPart.match(/(\d)\s*(?:st|nd|rd|th)?\s*period/i);
  if (!periodMatch) return [];
  const period = parseInt(periodMatch[1], 10);
  if (period < 1 || period > 8) return [];

  const slots: TimeSlot[] = [];

  // "Monday - Friday" or "Monday – Thursday" style ranges
  const rangeMatch = mainPart.match(/(\b\w+day)\s*[-–]\s*(\b\w+day)/i);
  if (rangeMatch) {
    const startIdx = FULL_DAYS.findIndex(
      (d) => d.toLowerCase() === rangeMatch[1].toLowerCase(),
    );
    const endIdx = FULL_DAYS.findIndex(
      (d) => d.toLowerCase() === rangeMatch[2].toLowerCase(),
    );
    if (startIdx !== -1 && endIdx !== -1) {
      for (let i = startIdx; i <= endIdx; i++) {
        slots.push({ day: FULL_DAYS[i], period });
      }
      return slots;
    }
  }

  // Comma-separated or individual day mentions
  FULL_DAYS.forEach((day) => {
    if (new RegExp(`\\b${day}\\b`, "i").test(mainPart)) {
      slots.push({ day, period });
    }
  });

  return slots;
}

// ─── Logo loader ───────────────────────────────────────────────────────────

async function loadLogoBase64(): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const asset = Asset.fromModule(require("@/Public/Bluprint favicon.png"));
    await asset.downloadAsync();

    // On web, localUri is already an accessible URL — use it directly
    if (Platform.OS === "web") {
      return asset.localUri ?? asset.uri ?? "";
    }

    if (!asset.localUri) return "";
    const b64 = await FileSystem.readAsStringAsync(asset.localUri, {
      encoding: "base64" as const,
    });
    return `data:image/png;base64,${b64}`;
  } catch {
    return "";
  }
}

// ─── Shared helpers ────────────────────────────────────────────────────────

function yearBadge(year: PdfYear): string {
  const cal = year.calendarYear;
  if (year.isCurrent) return `${cal} — Current`;
  if (year.isPast) return `${cal} — Past`;
  return `${cal} — Forecast`;
}

function statusColor(status: PdfCourseStatus): {
  bg: string;
  text: string;
  border: string;
} {
  switch (status) {
    case "Completed":
      return { bg: "#DCFCE7", text: "#15803D", border: "#86EFAC" };
    case "In Progress":
      return { bg: "#DBEAFE", text: "#1D4ED8", border: "#93C5FD" };
    case "Planned":
      return { bg: "#F1F5F9", text: "#475569", border: "#CBD5E1" };
  }
}

const TODAY = new Date().toLocaleDateString("en-ZA", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

// ─── Shared HTML header & footer ───────────────────────────────────────────

function buildHeader(
  data: PlanPdfData,
  logoSrc: string,
  docType: "Academic Plan" | "Academic Timetable",
): string {
  const minYears = Math.ceil(data.targetCredits / 120);
  const levelLabel = `Year ${data.academicLevel} (${data.currentCalendarYear})`;

  return `
    <div class="header">
      <div class="header-left">
        ${logoSrc ? `<img src="${logoSrc}" class="logo" alt="Bluprint" />` : `<div class="logo-placeholder">B</div>`}
        <div class="header-brand">
          <div class="brand-name">Bluprint</div>
          <div class="brand-sub">Academic Planner</div>
        </div>
      </div>
      <div class="header-center">
        <div class="doc-title">${docType}</div>
        <div class="student-name">${data.studentName}</div>
        <div class="meta-row">
          <span><b>Student No:</b> ${data.studentNumber || "—"}</span>
          <span class="meta-sep">|</span>
          <span><b>Degree:</b> ${data.degreeName || "—"}</span>
          <span class="meta-sep">|</span>
          <span><b>Level:</b> ${levelLabel}</span>
          <span class="meta-sep">|</span>
          <span><b>Min Duration:</b> ${minYears} year${minYears !== 1 ? "s" : ""}</span>
        </div>
        <div class="meta-row">
          <span><b>Credits:</b> ${data.totalCredits} / ${data.targetCredits} accumulated</span>
          <span class="meta-sep">|</span>
          <span><b>Majors:</b> ${data.degreeName || "—"}</span>
        </div>
      </div>
      <div class="header-right">
        <div class="doc-date">${TODAY}</div>
        <div class="doc-label">Downloaded</div>
      </div>
    </div>`;
}

function buildFooter(): string {
  return `
    <div class="footer">
      <span>Lumen AI (Pty) Ltd &nbsp;|&nbsp; Reg No. 2026/056944/07</span>
      <span>For planning purposes only — not official academic advice</span>
      <span>Generated by Bluprint &nbsp;|&nbsp; ${TODAY}</span>
    </div>
    <div class="stamp">BLUPRINT</div>`;
}

// ─── TABLE document ────────────────────────────────────────────────────────

function buildTableHtml(data: PlanPdfData, logoSrc: string): string {
  const yearSections = data.years
    .map((year) => {
      const semRows = year.semesters
        .map((sem) => {
          if (sem.courses.length === 0) return "";
          const rows = sem.courses
            .map((c) => {
              const col = statusColor(c.status);
              return `
              <tr>
                <td class="code-cell" style="color:${col.text};background:${col.bg};">${c.code}</td>
                <td class="name-cell">${c.name}</td>
                <td class="center-cell">${c.credits}</td>
                <td class="status-cell" style="color:${col.text};background:${col.bg};">${c.status}</td>
              </tr>`;
            })
            .join("");

          const semCredits = sem.courses.reduce((s, c) => s + c.credits, 0);
          return `
          <div class="sem-block">
            <div class="sem-heading">${sem.label}</div>
            <table class="plan-table">
              <thead>
                <tr>
                  <th style="width:15%">Code</th>
                  <th>Course Name</th>
                  <th style="width:8%">Credits</th>
                  <th style="width:14%">Status</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
              <tfoot>
                <tr>
                  <td colspan="2" class="total-label">Semester Total</td>
                  <td class="center-cell total-val">${semCredits}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>`;
        })
        .join("");

      return `
        <div class="year-section">
          <div class="year-header">
            <span class="year-title">Year ${year.yearNumber}</span>
            <span class="year-badge">${yearBadge(year)}</span>
            <span class="year-credits">${year.totalCredits} credits</span>
          </div>
          ${semRows}
        </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  @page { size: A4 portrait; margin: 14mm 14mm 20mm 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9px; color: #1a1a2e; }

  /* ── Header ── */
  .header { display: flex; align-items: flex-start; gap: 10px; padding-bottom: 8px;
            border-bottom: 2.5px solid #2563EB; margin-bottom: 12px; }
  .header-left { display: flex; align-items: center; gap: 6px; min-width: 80px; }
  .logo { width: 38px; height: 38px; object-fit: contain; }
  .logo-placeholder { width: 38px; height: 38px; background: #2563EB; color: white;
                      font-size: 20px; font-weight: bold; display: flex;
                      align-items: center; justify-content: center; border-radius: 6px; }
  .header-brand .brand-name { font-size: 13px; font-weight: 800; color: #1E3A5F; }
  .header-brand .brand-sub  { font-size: 7px; color: #64748B; }
  .header-center { flex: 1; }
  .doc-title    { font-size: 11px; font-weight: 700; color: #2563EB; margin-bottom: 2px; }
  .student-name { font-size: 14px; font-weight: 800; color: #1E3A5F; margin-bottom: 3px; }
  .meta-row     { font-size: 7.5px; color: #475569; margin-bottom: 2px; }
  .meta-sep     { margin: 0 5px; color: #CBD5E1; }
  .header-right { text-align: right; min-width: 70px; }
  .doc-date     { font-size: 8px; font-weight: 600; color: #1E3A5F; }
  .doc-label    { font-size: 7px; color: #94A3B8; }

  /* ── Year sections ── */
  .year-section  { margin-bottom: 10px; }
  .year-header   { display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
                   background: #EFF6FF; padding: 4px 8px; border-radius: 5px;
                   border-left: 4px solid #2563EB; }
  .year-title    { font-size: 11px; font-weight: 800; color: #1E3A5F; }
  .year-badge    { font-size: 8px; color: #2563EB; font-weight: 600; }
  .year-credits  { margin-left: auto; font-size: 8px; color: #64748B; }
  .sem-block     { margin-bottom: 6px; margin-left: 8px; }
  .sem-heading   { font-size: 9px; font-weight: 700; color: #3B82F6; margin-bottom: 3px; }

  /* ── Table ── */
  .plan-table    { width: 100%; border-collapse: collapse; }
  .plan-table th { background: #1E3A5F; color: #fff; padding: 3px 6px; text-align: left;
                   font-size: 8px; }
  .plan-table td { border: 1px solid #E2E8F0; padding: 3px 6px; vertical-align: middle; }
  .code-cell     { font-weight: 700; font-size: 8px; white-space: nowrap; }
  .name-cell     { font-size: 8px; }
  .center-cell   { text-align: center; font-size: 8px; }
  .status-cell   { font-size: 7.5px; font-weight: 600; text-align: center; }
  .total-label   { text-align: right; font-weight: 700; font-size: 8px;
                   background: #F8FAFC; color: #1E3A5F; padding-right: 8px; }
  .total-val     { font-weight: 800; color: #1E3A5F; background: #EFF6FF; }

  /* ── Footer & stamp ── */
  .footer { position: fixed; bottom: 0; left: 0; right: 0; height: 16px;
            display: flex; justify-content: space-between; align-items: center;
            font-size: 6.5px; color: #94A3B8; border-top: 1px solid #E2E8F0;
            padding: 0 14mm; background: white; }
  .stamp  { position: fixed; bottom: 40px; right: 14mm; opacity: 0.09;
            transform: rotate(-18deg); font-size: 22px; font-weight: 900;
            color: #2563EB; border: 4px solid #2563EB; padding: 4px 10px;
            border-radius: 4px; letter-spacing: 4px; pointer-events: none; }
</style>
</head>
<body>
  ${buildHeader(data, logoSrc, "Academic Plan")}
  ${yearSections}
  ${buildFooter()}
</body>
</html>`;
}

// ─── TIMETABLE document ────────────────────────────────────────────────────

interface TimetableGrid {
  // grid[period][dayIndex] = list of courses in that slot
  slots: Map<number, Map<number, PdfCourse[]>>;
  usedPeriods: number[];
  unscheduled: PdfCourse[];
}

function buildTimetableGrid(courses: PdfCourse[]): TimetableGrid {
  const slots = new Map<number, Map<number, PdfCourse[]>>();
  const unscheduled: PdfCourse[] = [];
  const scheduledCodes = new Set<string>();

  courses.forEach((course) => {
    const timeSlots = parseLectureTimes(course.lectureTimesRaw);
    if (timeSlots.length === 0) {
      unscheduled.push(course);
      return;
    }
    scheduledCodes.add(course.code);
    timeSlots.forEach(({ day, period }) => {
      const dayIdx = FULL_DAYS.indexOf(day as (typeof FULL_DAYS)[number]);
      if (dayIdx === -1) return;
      if (!slots.has(period)) slots.set(period, new Map());
      const dayMap = slots.get(period)!;
      if (!dayMap.has(dayIdx)) dayMap.set(dayIdx, []);
      dayMap.get(dayIdx)!.push(course);
    });
  });

  // Also add courses that had some slots but might not have been in unscheduled
  courses.forEach((c) => {
    if (!scheduledCodes.has(c.code) && !unscheduled.find((u) => u.code === c.code)) {
      unscheduled.push(c);
    }
  });

  const usedPeriods = Array.from(slots.keys()).sort((a, b) => a - b);
  // If no courses have times at all, show all 8 periods as empty placeholders
  const finalPeriods = usedPeriods.length > 0 ? usedPeriods : [];

  return { slots, usedPeriods: finalPeriods, unscheduled };
}

function renderTimetableGrid(
  courses: PdfCourse[],
  semLabel: string,
): string {
  const { slots, usedPeriods, unscheduled } = buildTimetableGrid(courses);

  // If no courses at all
  if (courses.length === 0) {
    return `<div class="sem-tt-block"><div class="sem-tt-heading">${semLabel}</div>
      <div class="empty-sem">No courses</div></div>`;
  }

  const periodsToShow =
    usedPeriods.length > 0
      ? usedPeriods
      : ([1, 2, 3, 4, 5, 6] as number[]);

  const headerCells = SHORT_DAYS.map(
    (d) => `<th class="day-header">${d}</th>`,
  ).join("");

  const bodyRows = periodsToShow
    .map((p) => {
      const dayMap = slots.get(p) ?? new Map<number, PdfCourse[]>();
      const dayCells = FULL_DAYS.map((_, dayIdx) => {
        const cellCourses = dayMap.get(dayIdx) ?? [];
        if (cellCourses.length === 0)
          return `<td class="empty-cell"></td>`;

        const isClash = cellCourses.length > 1;
        const cellContent = cellCourses
          .map((c) => {
            const col = statusColor(c.status);
            return `<div class="course-chip" style="background:${col.bg};color:${col.text};border:1px solid ${col.border};">${c.code}</div>`;
          })
          .join("");

        return `<td class="${isClash ? "clash-cell" : "course-cell"}">${cellContent}</td>`;
      }).join("");

      return `<tr>
        <td class="period-num">${p}</td>
        <td class="period-time">${UCT_PERIODS[p] ?? ""}</td>
        ${dayCells}
      </tr>`;
    })
    .join("");

  const unscheduledHtml =
    unscheduled.length > 0
      ? `<div class="unscheduled">
          <span class="unsched-label">Time unconfirmed: </span>
          ${unscheduled
            .map((c) => {
              const col = statusColor(c.status);
              return `<span class="unsched-chip" style="background:${col.bg};color:${col.text};">${c.code}</span>`;
            })
            .join(" ")}
        </div>`
      : "";

  const clashNote = periodsToShow.some((p) =>
    Array.from((slots.get(p) ?? new Map()).values()).some((cs) => cs.length > 1),
  )
    ? `<div class="clash-note">⚠ Clash detected — cells highlighted in red</div>`
    : "";

  return `
    <div class="sem-tt-block">
      <div class="sem-tt-heading">${semLabel}</div>
      ${clashNote}
      <table class="tt-table">
        <thead>
          <tr>
            <th class="p-header">P</th>
            <th class="time-header">Time</th>
            ${headerCells}
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
      ${unscheduledHtml}
    </div>`;
}

function buildTimetableHtml(data: PlanPdfData, logoSrc: string): string {
  const yearSections = data.years
    .map((year) => {
      const semGrids = year.semesters
        .map((sem) => renderTimetableGrid(sem.courses, sem.label))
        .join("");

      return `
        <div class="year-section">
          <div class="year-header">
            <span class="year-title">Year ${year.yearNumber}</span>
            <span class="year-badge">${yearBadge(year)}</span>
            <span class="year-credits">${year.totalCredits} credits</span>
          </div>
          <div class="sems-row">${semGrids}</div>
        </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  @page { size: A4 landscape; margin: 10mm 12mm 18mm 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 8px; color: #1a1a2e; }

  /* ── Header ── */
  .header { display: flex; align-items: flex-start; gap: 8px; padding-bottom: 6px;
            border-bottom: 2.5px solid #2563EB; margin-bottom: 8px; }
  .header-left { display: flex; align-items: center; gap: 5px; min-width: 75px; }
  .logo { width: 32px; height: 32px; object-fit: contain; }
  .logo-placeholder { width: 32px; height: 32px; background: #2563EB; color: white;
                      font-size: 16px; font-weight: bold; display: flex;
                      align-items: center; justify-content: center; border-radius: 5px; }
  .header-brand .brand-name { font-size: 11px; font-weight: 800; color: #1E3A5F; }
  .header-brand .brand-sub  { font-size: 6.5px; color: #64748B; }
  .header-center { flex: 1; }
  .doc-title    { font-size: 10px; font-weight: 700; color: #2563EB; margin-bottom: 1px; }
  .student-name { font-size: 12px; font-weight: 800; color: #1E3A5F; margin-bottom: 2px; }
  .meta-row     { font-size: 7px; color: #475569; margin-bottom: 1px; }
  .meta-sep     { margin: 0 4px; color: #CBD5E1; }
  .header-right { text-align: right; min-width: 65px; }
  .doc-date     { font-size: 7.5px; font-weight: 600; color: #1E3A5F; }
  .doc-label    { font-size: 6.5px; color: #94A3B8; }

  /* ── Year sections ── */
  .year-section { margin-bottom: 7px; page-break-inside: avoid; }
  .year-header  { display: flex; align-items: center; gap: 7px; margin-bottom: 4px;
                  background: #EFF6FF; padding: 3px 7px; border-radius: 4px;
                  border-left: 3px solid #2563EB; }
  .year-title   { font-size: 10px; font-weight: 800; color: #1E3A5F; }
  .year-badge   { font-size: 7.5px; color: #2563EB; font-weight: 600; }
  .year-credits { margin-left: auto; font-size: 7px; color: #64748B; }
  .sems-row     { display: flex; gap: 8px; }
  .sem-tt-block { flex: 1; min-width: 0; }
  .sem-tt-heading { font-size: 8px; font-weight: 700; color: #3B82F6; margin-bottom: 2px; }
  .empty-sem    { font-size: 7.5px; color: #94A3B8; font-style: italic; padding: 4px; }

  /* ── Timetable grid ── */
  .tt-table     { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .p-header     { width: 12px; background: #1E3A5F; color: #fff; padding: 2px 3px;
                  text-align: center; font-size: 7px; }
  .time-header  { width: 52px; background: #1E3A5F; color: #fff; padding: 2px 3px;
                  text-align: center; font-size: 7px; }
  .day-header   { background: #2563EB; color: #fff; padding: 2px 3px;
                  text-align: center; font-size: 7px; }
  .period-num   { text-align: center; font-weight: 700; color: #64748B; font-size: 7px;
                  background: #F8FAFC; border: 1px solid #E2E8F0; padding: 2px; }
  .period-time  { text-align: center; color: #94A3B8; font-size: 6.5px;
                  background: #F8FAFC; border: 1px solid #E2E8F0; padding: 2px; }
  .empty-cell   { border: 1px solid #F1F5F9; height: 18px; }
  .course-cell  { border: 1px solid #E2E8F0; padding: 1px 2px; vertical-align: middle; }
  .clash-cell   { border: 2px solid #DC2626; padding: 1px 2px; background: #FEF2F2; }
  .course-chip  { border-radius: 3px; padding: 1px 3px; font-size: 6.5px; font-weight: 700;
                  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                  margin-bottom: 1px; }

  /* ── Unscheduled / notes ── */
  .unscheduled  { margin-top: 3px; font-size: 7px; display: flex; flex-wrap: wrap;
                  align-items: center; gap: 2px; }
  .unsched-label{ color: #64748B; font-style: italic; }
  .unsched-chip { border-radius: 3px; padding: 1px 4px; font-size: 6.5px; font-weight: 600; }
  .clash-note   { font-size: 6.5px; color: #DC2626; font-weight: 600; margin-bottom: 2px; }

  /* ── Footer & stamp ── */
  .footer { position: fixed; bottom: 0; left: 0; right: 0; height: 14px;
            display: flex; justify-content: space-between; align-items: center;
            font-size: 6px; color: #94A3B8; border-top: 1px solid #E2E8F0;
            padding: 0 12mm; background: white; }
  .stamp  { position: fixed; bottom: 30px; right: 12mm; opacity: 0.08;
            transform: rotate(-18deg); font-size: 18px; font-weight: 900;
            color: #2563EB; border: 3px solid #2563EB; padding: 3px 8px;
            border-radius: 3px; letter-spacing: 3px; pointer-events: none; }
</style>
</head>
<body>
  ${buildHeader(data, logoSrc, "Academic Timetable")}
  ${yearSections}
  ${buildFooter()}
</body>
</html>`;
}

// ─── Public API ────────────────────────────────────────────────────────────

export type PdfDocType = "table" | "timetable";

/**
 * Generates and shares a PDF of the student's academic plan.
 * @param type   "table" for the year-table view, "timetable" for the period grid view
 * @param data   Structured plan data produced by the Planner component
 */
export async function downloadPlanPdf(
  type: PdfDocType,
  data: PlanPdfData,
): Promise<void> {
  const logoSrc = await loadLogoBase64();
  const html =
    type === "table"
      ? buildTableHtml(data, logoSrc)
      : buildTimetableHtml(data, logoSrc);

  if (Platform.OS === "web") {
    // On web, expo-print falls back to window.print() which captures the
    // current screen. Instead, open the HTML in a new tab and let the browser
    // print/save it as PDF — this also gives the student a preview first.
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.addEventListener("load", () => {
        win.focus();
        win.print();
      });
      // Clean up the object URL after a delay
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
    return;
  }

  // iOS / Android — use expo-print + expo-sharing
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: `Bluprint Academic ${type === "table" ? "Plan" : "Timetable"}`,
      UTI: "com.adobe.pdf",
    });
  }
}
