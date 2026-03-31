/**
 * Shared UCT lecture-times parser.
 *
 * Converts free-text lecture_times strings (e.g. "Monday - Friday, 5th period.
 * Tutorials: one per week.") into structured day × period slots.
 *
 * UCT period→time mapping:
 *   Period 1  08:00–09:00
 *   Period 2  09:00–10:00
 *   Period 3  10:00–11:00
 *   Period 4  11:00–12:00
 *   Period 5  14:00–15:00  (after lunch break)
 *   Period 6  15:00–16:00
 *   Period 7  16:00–17:00
 *   Period 8  17:00–18:00
 */

export interface LectureSlot {
  day: string;   // e.g. "Monday"
  period: number; // 1–8
}

export const UCT_PERIOD_TIMES: Record<number, string> = {
  1: "08:00–09:00",
  2: "09:00–10:00",
  3: "10:00–11:00",
  4: "11:00–12:00",
  5: "14:00–15:00",
  6: "15:00–16:00",
  7: "16:00–17:00",
  8: "17:00–18:00",
};

export const FULL_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
] as const;

export const SHORT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

/**
 * Parses a UCT lecture_times string into structured day × period slots.
 *
 * Handles:
 *   "Monday - Friday, 5th period"               → Mon–Fri × P5
 *   "Tuesday, Thursday, 2nd period"              → Tue, Thu × P2
 *   "Monday - Thursday, 5th period. Tutorials…"  → Mon–Thu × P5 (tutorials dropped)
 *   null / undefined / ""                        → []
 *
 * Only the main lecture segment is parsed; Tutorials/Practicals/Labs are
 * intentionally ignored because they don't typically cause academic clashes.
 */
export function parseLectureTimes(
  raw: string | null | undefined,
): LectureSlot[] {
  if (!raw) return [];

  // Keep only the main lecture segment
  const mainPart = raw.split(/(?:Tutorials?|Practicals?|Labs?):/i)[0];

  // Extract period number (1st … 8th period)
  const periodMatch = mainPart.match(/(\d)\s*(?:st|nd|rd|th)?\s*period/i);
  if (!periodMatch) return [];
  const period = parseInt(periodMatch[1], 10);
  if (period < 1 || period > 8) return [];

  const slots: LectureSlot[] = [];

  // "Monday - Friday" or "Tuesday – Thursday" range
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
