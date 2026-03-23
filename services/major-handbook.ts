import type {
    HandbookRulesResponse,
    ScienceCourseCatalogEntry,
} from "@/services/backend-api";

const TARGET_HANDBOOK = "2026 Science-Handbook-UCT";
const COURSE_CODE_RE = /\b[A-Z]{3,4}\d{4}(?:[A-Z](?:\/[A-Z]){0,3})?\b/g;
const MAJOR_HEADER_RE =
  /\bMajor in\s+([A-Za-z&/\-\s]+?)\s*\[\s*([A-Z][A-Z0-9\s]{3,10})\s*\]/gi;

export interface MajorCourse {
  code: string;
  title: string;
}

export interface MajorItem {
  id: string;
  name: string;
  majorCode: string;
  note: string;
  firstYearCourses: MajorCourse[];
  secondYearCourses: MajorCourse[];
  thirdYearCourses: MajorCourse[];
  rawText: string;
}

export interface BscRuleSummary {
  ruleCode: string;
  text: string;
}

export interface ParsedMajorHandbook {
  handbookTitle: string;
  bscRules: BscRuleSummary[];
  majors: MajorItem[];
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeMajorId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeComparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function uniqueCourseCodes(value: string): string[] {
  const matches = value.match(COURSE_CODE_RE) ?? [];
  return Array.from(new Set(matches));
}

function findMarkerIndex(source: string, patterns: RegExp[]): number {
  let best = -1;

  for (const pattern of patterns) {
    const match = pattern.exec(source);
    pattern.lastIndex = 0;

    if (!match || match.index < 0) {
      continue;
    }

    if (best === -1 || match.index < best) {
      best = match.index;
    }
  }

  return best;
}

function splitCoreCourseSections(source: string): {
  note: string;
  firstYearText: string;
  secondYearText: string;
  thirdYearText: string;
} {
  const firstMarker = findMarkerIndex(source, [
    /First\s*-?\s*Year\s+Core\s+Courses/i,
  ]);
  const secondMarker = findMarkerIndex(source, [
    /Second\s*-?\s*Year\s+Core\s+Courses/i,
  ]);
  const thirdMarker = findMarkerIndex(source, [
    /Third\s*-?\s*Year\s+Core\s+Courses/i,
    /Third\s*Year\s+Core\s*Cours\s*es/i,
  ]);

  const note =
    firstMarker >= 0 ? normalizeWhitespace(source.slice(0, firstMarker)) : "";

  const firstYearText =
    firstMarker >= 0
      ? normalizeWhitespace(
          source.slice(
            firstMarker,
            secondMarker >= 0
              ? secondMarker
              : thirdMarker >= 0
                ? thirdMarker
                : source.length,
          ),
        )
      : "";

  const secondYearText =
    secondMarker >= 0
      ? normalizeWhitespace(
          source.slice(
            secondMarker,
            thirdMarker >= 0 ? thirdMarker : source.length,
          ),
        )
      : "";

  const thirdYearText =
    thirdMarker >= 0 ? normalizeWhitespace(source.slice(thirdMarker)) : "";

  return {
    note,
    firstYearText,
    secondYearText,
    thirdYearText,
  };
}

function splitCoursesByLevel(courseCodes: string[]): {
  first: string[];
  second: string[];
  third: string[];
} {
  const first: string[] = [];
  const second: string[] = [];
  const third: string[] = [];

  for (const code of courseCodes) {
    const levelDigit = code.match(/\d{4}/)?.[0]?.charAt(0);
    if (levelDigit === "1") {
      first.push(code);
      continue;
    }
    if (levelDigit === "2") {
      second.push(code);
      continue;
    }
    if (levelDigit === "3") {
      third.push(code);
    }
  }

  return {
    first,
    second,
    third,
  };
}

function mapCourses(
  codes: string[],
  catalogMap: Map<string, string>,
): MajorCourse[] {
  return codes.map((code) => ({
    code,
    title: catalogMap.get(code) ?? "Title not found in extracted catalog",
  }));
}

export function parseMajorHandbook(
  rulesPayload: HandbookRulesResponse,
  catalog: ScienceCourseCatalogEntry[] = [],
): ParsedMajorHandbook {
  const focusedRules = (rulesPayload.focused_policy_rules ?? {}) as Record<
    string,
    unknown
  >;
  const bscRulesNode = (focusedRules.bsc_curricula_rules ?? {}) as Record<
    string,
    unknown
  >;
  const rulesList = Array.isArray(bscRulesNode.rules)
    ? (bscRulesNode.rules as Array<Record<string, unknown>>)
    : [];

  const bscRules: BscRuleSummary[] = rulesList.map((rule) => ({
    ruleCode: String(rule.rule_code ?? ""),
    text: normalizeWhitespace(String(rule.text ?? "")),
  }));

  const fb77 =
    bscRules.find((rule) => rule.ruleCode.toUpperCase() === "FB7.7")?.text ??
    "";

  const catalogMap = new Map<string, string>();
  catalog.forEach((course) => {
    catalogMap.set(course.code.toUpperCase(), course.title);
  });

  const headerMatches = Array.from(fb77.matchAll(MAJOR_HEADER_RE));

  const rawMajors: MajorItem[] = headerMatches.map((match, index) => {
    const headerStart = match.index ?? 0;
    const bodyStart = headerStart + match[0].length;
    const bodyEnd =
      index + 1 < headerMatches.length
        ? (headerMatches[index + 1].index ?? fb77.length)
        : fb77.length;

    const majorName = normalizeWhitespace(match[1]);
    const majorCode = normalizeWhitespace(match[2].replace(/\s+/g, ""));
    const rawBody = normalizeWhitespace(fb77.slice(bodyStart, bodyEnd));
    const { note, firstYearText, secondYearText, thirdYearText } =
      splitCoreCourseSections(rawBody);

    let firstYearCodes = uniqueCourseCodes(firstYearText).map((code) =>
      code.toUpperCase(),
    );
    let secondYearCodes = uniqueCourseCodes(secondYearText).map((code) =>
      code.toUpperCase(),
    );
    let thirdYearCodes = uniqueCourseCodes(thirdYearText).map((code) =>
      code.toUpperCase(),
    );

    // Fallback for OCR-distorted section markers: infer by course-code level.
    if (
      firstYearCodes.length === 0 &&
      secondYearCodes.length === 0 &&
      thirdYearCodes.length === 0
    ) {
      const allCodes = uniqueCourseCodes(rawBody).map((code) =>
        code.toUpperCase(),
      );
      const byLevel = splitCoursesByLevel(allCodes);
      firstYearCodes = byLevel.first;
      secondYearCodes = byLevel.second;
      thirdYearCodes = byLevel.third;
    }

    return {
      id: normalizeMajorId(majorName),
      name: majorName,
      majorCode,
      note,
      firstYearCourses: mapCourses(firstYearCodes, catalogMap),
      secondYearCourses: mapCourses(secondYearCodes, catalogMap),
      thirdYearCourses: mapCourses(thirdYearCodes, catalogMap),
      rawText: rawBody,
    };
  });

  const startIndex = rawMajors.findIndex(
    (major) =>
      normalizeComparable(major.name) ===
      normalizeComparable("Applied Mathematics"),
  );
  const endIndex = rawMajors.findIndex(
    (major) =>
      normalizeComparable(major.name) ===
      normalizeComparable("Statistics & Data Science"),
  );

  const majors =
    startIndex >= 0 && endIndex >= startIndex
      ? rawMajors.slice(startIndex, endIndex + 1)
      : rawMajors;

  return {
    handbookTitle: rulesPayload.handbook_title || TARGET_HANDBOOK,
    bscRules,
    majors,
  };
}
