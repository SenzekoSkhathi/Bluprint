export type FacultySlug =
  | "science"
  | "commerce"
  | "engineering"
  | "health-sciences"
  | "humanities"
  | "law";

const SUPPORTED_FACULTIES: FacultySlug[] = [
  "science",
  "commerce",
  "engineering",
  "health-sciences",
  "humanities",
  "law",
];

const PRIMARY_FACULTY: FacultySlug = "science";

export const FACULTY_LABELS: Record<FacultySlug, string> = {
  science: "Science",
  commerce: "Commerce",
  engineering: "Engineering",
  "health-sciences": "Health Sciences",
  humanities: "Humanities",
  law: "Law",
};

export function getAllFacultySlugs(): FacultySlug[] {
  return SUPPORTED_FACULTIES;
}

export function getPrimaryFacultySlug(): FacultySlug {
  return PRIMARY_FACULTY;
}

export function getCrossMajorFacultySlugs(): FacultySlug[] {
  return SUPPORTED_FACULTIES.filter((slug) => slug !== PRIMARY_FACULTY);
}

export function getActiveFacultySlug(): FacultySlug {
  const raw = (process.env.EXPO_PUBLIC_ACTIVE_FACULTY ?? PRIMARY_FACULTY)
    .trim()
    .toLowerCase();

  if (SUPPORTED_FACULTIES.includes(raw as FacultySlug)) {
    return raw as FacultySlug;
  }

  return PRIMARY_FACULTY;
}
