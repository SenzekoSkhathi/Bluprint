// Static imports of verified Backend data files used as offline fallback.
// When the FastAPI backend is unavailable, these ensure the app has complete,
// real course/major/advisor data instead of thin mock stubs built from mockUsers.
//
// If a new pipeline run produces new verified JSON files, update the paths below
// to point to the latest run_id versions.

import advisorsData from "@/Backend/data/advisors/science-advisors.verified.json";
import archaeologyData from "@/Backend/data/courses/science-9c4d410a59e1.dept-archaeology.verified.json";
import astronomyData from "@/Backend/data/courses/science-9c4d410a59e1.dept-astronomy.verified.json";
import biologicalSciencesData from "@/Backend/data/courses/science-9c4d410a59e1.dept-biological-sciences.verified.json";
import chemistryData from "@/Backend/data/courses/science-9c4d410a59e1.dept-chemistry.verified.json";
import computerScienceData from "@/Backend/data/courses/science-9c4d410a59e1.dept-computer-science.verified.json";
import egsData from "@/Backend/data/courses/science-9c4d410a59e1.dept-environmental-and-geographical-science.verified.json";
import geologicalSciencesData from "@/Backend/data/courses/science-9c4d410a59e1.dept-geological-sciences.verified.json";
import mathData from "@/Backend/data/courses/science-9c4d410a59e1.dept-mathematics-and-applied-mathematics.verified.json";
import mcbData from "@/Backend/data/courses/science-9c4d410a59e1.dept-molecular-and-cell-biology.verified.json";
import multiData from "@/Backend/data/courses/science-9c4d410a59e1.dept-multiple-offered-by-other-faculties.verified.json";
import oceanographyData from "@/Backend/data/courses/science-9c4d410a59e1.dept-oceanography.verified.json";
import physicsData from "@/Backend/data/courses/science-9c4d410a59e1.dept-physics.verified.json";
import statisticsData from "@/Backend/data/courses/science-9c4d410a59e1.dept-statistical-sciences.verified.json";
import majorsData from "@/Backend/data/majors/science-9c4d410a59e1.majors.verified.json";

export const LOCAL_RUN_ID = "science-9c4d410a59e1";

interface RawCourseFile {
  courses?: unknown[];
}

interface RawAdvisorEntry {
  name?: string;
  area?: string;
  room?: string;
  email?: string;
  note?: string;
}

interface RawAdvisorsFile {
  faculty?: string;
  university?: string;
  year?: number;
  senior_student_advisors?: RawAdvisorEntry[];
  student_advisors?: RawAdvisorEntry[];
}

/**
 * Returns the flat raw course array from all 13 department JSON files.
 * Each entry matches the RawScienceCourseCatalogEntry shape expected by
 * normalizeScienceCourseCatalogEntry in backend-api.ts.
 */
export function getLocalRawCourses(): unknown[] {
  const deptFiles: RawCourseFile[] = [
    archaeologyData as RawCourseFile,
    astronomyData as RawCourseFile,
    biologicalSciencesData as RawCourseFile,
    chemistryData as RawCourseFile,
    computerScienceData as RawCourseFile,
    egsData as RawCourseFile,
    geologicalSciencesData as RawCourseFile,
    mathData as RawCourseFile,
    mcbData as RawCourseFile,
    multiData as RawCourseFile,
    oceanographyData as RawCourseFile,
    physicsData as RawCourseFile,
    statisticsData as RawCourseFile,
  ];

  return deptFiles.flatMap((file) =>
    Array.isArray(file.courses) ? file.courses : [],
  );
}

/**
 * Returns the raw majors JSON object.
 * Matches the shape expected by normalizeScienceMajorsResponse in backend-api.ts.
 */
export function getLocalRawMajors(): unknown {
  return majorsData;
}

/**
 * Returns the raw advisors JSON object with senior and regular tiers already
 * normalized into the ScienceAdvisorsListResponse shape.
 */
export function getLocalAdvisorsResponse(): {
  faculty: string;
  university: string;
  year: number;
  count: number;
  advisors: Array<{
    name: string;
    area: string;
    room: string;
    email: string;
    note?: string;
    tier: "senior" | "regular";
  }>;
} {
  const raw = advisorsData as RawAdvisorsFile;

  const toAdvisor = (
    entry: RawAdvisorEntry,
    tier: "senior" | "regular",
  ) => ({
    name: String(entry.name ?? "").trim(),
    area: String(entry.area ?? "").trim(),
    room: String(entry.room ?? "").trim(),
    email: String(entry.email ?? "").trim(),
    note: entry.note ? String(entry.note).trim() : undefined,
    tier,
  });

  const advisors = [
    ...(raw.senior_student_advisors ?? []).map((e) => toAdvisor(e, "senior")),
    ...(raw.student_advisors ?? []).map((e) => toAdvisor(e, "regular")),
  ];

  return {
    faculty: String(raw.faculty ?? "").trim(),
    university: String(raw.university ?? "").trim(),
    year: typeof raw.year === "number" ? raw.year : 0,
    count: advisors.length,
    advisors,
  };
}
