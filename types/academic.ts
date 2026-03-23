export type CourseGroup = "Year 1" | "Year 2" | "Year 3" | "Postgrad";

export interface CourseCatalogEntry {
  id: string;
  code: string;
  title: string;
  group: CourseGroup;
  credits: number;
  nqf_level?: number;
  semester: string;
  department: string;
  delivery: string;
  prerequisites: string;
  description: string;
  outcomes: string[];
  convener_details?: string;
  entry_requirements?: string;
  outline_details?: string;
  lecture_times?: string;
  dp_requirements?: string;
  assessment?: string;
}

export type PlannerCourseStatus = "Planned" | "In Progress" | "Completed";

export interface PlannerCourseOption {
  code: string;
  name: string;
  credits: number;
}

export interface PlannedCourse {
  id: string;
  code: string;
  name: string;
  credits: number;
  year: string;
  semester: string;
  status: PlannerCourseStatus;
}

export interface CompletedCourseRecord {
  id: string;
  code: string;
  title: string;
  credits: number;
  grade: string;
  gpa: number;
  semester: string;
}

export interface InProgressCourseRecord {
  id: string;
  code: string;
  title: string;
  credits: number;
  currentGrade: string;
  status: number;
  semester: string;
}

export type FeedbackType = "positive" | "improvement" | "suggestion";

export interface ProgressFeedback {
  id: string;
  title: string;
  message: string;
  type: FeedbackType;
}

export type SessionType = "Class" | "Tutorial" | "Lab";

export interface ScheduleItem {
  id: string;
  courseCode: string;
  courseName: string;
  type: SessionType;
  day: string;
  startTime: string;
  endTime: string;
  location: string;
}

export type TodoScope = "Daily" | "Weekly" | "Monthly" | "Once Off";

export interface TodoItem {
  id: string;
  title: string;
  scope: TodoScope;
  dueAt: string;
  completed: boolean;
}

export interface DegreeRequirements {
  id: string;
  name: string;
  targetCredits: number;
  minimumYearlyCredits: number;
  coreCourseCodes: string[];
}

export type ValidationSeverity = "blocker" | "warning" | "info";

export type ValidationCategory =
  | "prerequisite"
  | "sequencing"
  | "credits"
  | "core-requirement"
  | "schedule"
  | "load";

export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  category: ValidationCategory;
  title: string;
  message: string;
  relatedCourseCode?: string;
  relatedTerm?: string;
}

export interface ValidationSummary {
  blockers: number;
  warnings: number;
  infos: number;
}

export interface AcademicValidationReport {
  issues: ValidationIssue[];
  summary: ValidationSummary;
  creditsCompleted: number;
  creditsInProgress: number;
  creditsPlanned: number;
  projectedCredits: number;
  creditShortfall: number;
  isProjectedGraduationEligible: boolean;
}

export type PlanningObjective = "fastest" | "balanced" | "light";

export interface AutoPlannedCourse {
  code: string;
  title: string;
  credits: number;
  reason: string;
}

export interface AutoPlannedTerm {
  termIndex: number;
  termLabel: string;
  semester: string;
  totalCredits: number;
  courses: AutoPlannedCourse[];
}

export interface AutoGraduationPlan {
  id: string;
  title: string;
  objective: PlanningObjective;
  score: number;
  estimatedTerms: number;
  projectedCompletionTerm: string;
  projectedTotalCredits: number;
  rationale: string[];
  terms: AutoPlannedTerm[];
}
