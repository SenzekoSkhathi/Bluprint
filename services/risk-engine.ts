/**
 * Grade-aware risk engine.
 *
 * For every planned course, looks up the student's grades in its
 * prerequisite courses and computes a risk level:
 *
 *   none   — prerequisites passed ≥ 65 % (solid foundation)
 *   low    — prerequisite passed 58–64 % (worth reviewing)
 *   medium — prerequisite passed 50–57 % (at-risk — may struggle)
 *   high   — prerequisite grade < 50 % or supplementary pass,
 *             OR medium risk on an NQF 7 course (level amplifies gap)
 *
 * Also computes a DP-requirement map for surfacing attendance/test
 * requirements on planned courses.
 */

import type {
  CourseCatalogEntry,
  PlannedCourse,
} from "@/types/academic";

// ─── Types ─────────────────────────────────────────────────────────────────

export type RiskLevel = "none" | "low" | "medium" | "high";

export interface RiskAnnotation {
  level: RiskLevel;
  /** Human-readable reasons, one per problematic prerequisite. */
  reasons: string[];
}

export interface DpAnnotation {
  /** Raw dp_requirements text from the catalog. */
  text: string;
}

// ─── Grade parsing ─────────────────────────────────────────────────────────

/**
 * Converts any grade representation to a 0–100 percentage, or null if
 * the format is unrecognised. Handles:
 *   • numeric strings / numbers  "65", 65, "65%"
 *   • UCT/South-African letter grades  "A", "B+", "C-", "D", "F"
 *   • pass/fail keywords  "PASS", "SUPP", "FAIL", "ABS"
 */
export function parseGradeToPercent(
  grade: string | number | null | undefined,
): number | null {
  if (grade === null || grade === undefined) return null;

  if (typeof grade === "number") {
    return grade >= 0 && grade <= 100 ? grade : null;
  }

  const s = grade.trim().toUpperCase();
  const num = parseFloat(s.replace(/%$/, ""));
  if (!isNaN(num) && num >= 0 && num <= 100) return num;

  const letterMap: Record<string, number> = {
    "A+": 92, A: 86, "A-": 80,
    "B+": 75, B: 70, "B-": 65,
    "C+": 62, C: 58, "C-": 55,
    D: 52,
    PASS: 55, P: 55,
    SUPP: 50, SUPPLEMENTARY: 50,
    F: 45, FAIL: 45, ABS: 0,
  };

  return letterMap[s] ?? null;
}

/** Maps a grade percentage to a risk level using UCT pass thresholds. */
function gradeToRisk(percent: number): RiskLevel {
  if (percent >= 65) return "none";
  if (percent >= 58) return "low";
  if (percent >= 50) return "medium";
  return "high"; // Below outright pass (supp territory)
}

const RISK_ORDER: RiskLevel[] = ["none", "low", "medium", "high"];
function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_ORDER.indexOf(a) >= RISK_ORDER.indexOf(b) ? a : b;
}

// ─── Prerequisite code extraction ──────────────────────────────────────────

function extractPrereqCodes(text: string): string[] {
  if (!text || /^none$/i.test(text.trim())) return [];
  const matches = text.match(/[A-Z]{3,4}\d{4}[A-Z]?/g);
  return matches ? Array.from(new Set(matches)) : [];
}

// ─── Public API ────────────────────────────────────────────────────────────

interface RiskEngineInput {
  plannedCourses: PlannedCourse[];
  /** Accepts both string grades ("65%", "B+") and raw numeric grades. */
  completedCourses: Array<{
    code: string;
    grade?: string | number | null;
  }>;
  catalog: CourseCatalogEntry[];
}

/**
 * Returns a map from course code → RiskAnnotation for every planned course.
 * Courses with no prerequisite grade data get { level: "none", reasons: [] }.
 */
export function computeCourseRisks(
  input: RiskEngineInput,
): Map<string, RiskAnnotation> {
  const { plannedCourses, completedCourses, catalog } = input;

  const catalogByCode = new Map(catalog.map((c) => [c.code, c]));

  // Build grade lookup (code → percentage)
  const gradeByCode = new Map<string, number | null>();
  completedCourses.forEach((c) => {
    gradeByCode.set(c.code, parseGradeToPercent(c.grade));
  });

  const result = new Map<string, RiskAnnotation>();

  plannedCourses.forEach((planned) => {
    const entry = catalogByCode.get(planned.code);
    if (!entry) {
      result.set(planned.code, { level: "none", reasons: [] });
      return;
    }

    const prereqCodes = extractPrereqCodes(entry.prerequisites);
    const reasons: string[] = [];
    // Track worst risk as an index into RISK_ORDER to avoid TS narrowing issues.
    let worstRiskIdx = 0;

    prereqCodes.forEach((prereq) => {
      if (!gradeByCode.has(prereq)) return;
      const percent = gradeByCode.get(prereq);
      if (percent === null || percent === undefined) return;

      const risk = gradeToRisk(percent);
      const riskIdx = RISK_ORDER.indexOf(risk);
      if (riskIdx === 0) return; // "none" — no contribution

      if (riskIdx > worstRiskIdx) worstRiskIdx = riskIdx;

      if (risk === "high") {
        reasons.push(
          `Passed ${prereq} with ${percent}% — consider consolidating this foundation before taking ${planned.code}`,
        );
      } else if (risk === "medium") {
        reasons.push(
          `Passed ${prereq} with ${percent}% — ${planned.code} builds directly on this material`,
        );
      } else {
        reasons.push(
          `Grade in ${prereq} was ${percent}% — adequate, but worth reviewing before ${planned.code}`,
        );
      }
    });

    // Amplify: medium risk on an NQF 7 course → high risk.
    const currentLevel = RISK_ORDER[worstRiskIdx];
    if (currentLevel === "medium" && (entry.nqf_level ?? 0) >= 7) {
      worstRiskIdx = RISK_ORDER.indexOf("high");
      reasons.push(
        `${planned.code} is an NQF ${entry.nqf_level} course — the level jump significantly amplifies any prerequisite gaps`,
      );
    }

    result.set(planned.code, { level: RISK_ORDER[worstRiskIdx], reasons });
  });

  return result;
}

/**
 * Returns a map from course code → DpAnnotation for planned courses
 * that have a DP (duly performed) requirement in the catalog.
 */
export function computeDpRequirements(
  plannedCourses: PlannedCourse[],
  catalog: CourseCatalogEntry[],
): Map<string, DpAnnotation> {
  const catalogByCode = new Map(catalog.map((c) => [c.code, c]));
  const result = new Map<string, DpAnnotation>();

  plannedCourses.forEach((planned) => {
    const entry = catalogByCode.get(planned.code);
    if (entry?.dp_requirements) {
      result.set(planned.code, { text: entry.dp_requirements });
    }
  });

  return result;
}
