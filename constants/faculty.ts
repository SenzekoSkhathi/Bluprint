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
