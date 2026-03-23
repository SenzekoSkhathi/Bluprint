import {
    courseCatalog,
    courseGroups,
    defaultDegreeRequirements,
    plannerCourseOptions,
    plannerInitialCourses,
    plannerSemesters,
    plannerYears,
    progressAiFeedback,
    progressCompletedCourses,
    progressInProgressCourses,
    scheduleInitialItems,
    scheduleSessionTypes,
    scheduleTodoScopes,
    scheduleWeekDays,
} from "@/data/academic-data";
import { generateAutoGraduationPlans } from "@/services/academic-path-planner";
import { academicTelemetry } from "@/services/academic-telemetry";
import { validateAcademicPlan } from "@/services/academic-validation";
import { handbookIngestionService } from "@/services/handbook-ingestion";
import type {
    AcademicValidationReport,
    AutoGraduationPlan,
    CompletedCourseRecord,
    CourseCatalogEntry,
    CourseGroup,
    DegreeRequirements,
    InProgressCourseRecord,
    PlannedCourse,
    PlannerCourseOption,
    ProgressFeedback,
    ScheduleItem,
    SessionType,
    TodoItem,
    TodoScope,
} from "@/types/academic";
import type {
    HandbookIngestionRequest,
    HandbookReviewDecision,
    RequirementVersion,
} from "@/types/handbook";

const cloneCatalog = (): CourseCatalogEntry[] =>
  courseCatalog.map((course) => ({
    ...course,
    outcomes: [...course.outcomes],
  }));

const clonePlanned = (): PlannedCourse[] =>
  plannerInitialCourses.map((item) => ({ ...item }));

const cloneSchedule = (): ScheduleItem[] =>
  scheduleInitialItems.map((item) => ({ ...item }));

const cloneCompleted = (): CompletedCourseRecord[] =>
  progressCompletedCourses.map((item) => ({ ...item }));

const cloneInProgress = (): InProgressCourseRecord[] =>
  progressInProgressCourses.map((item) => ({ ...item }));

const cloneFeedback = (): ProgressFeedback[] =>
  progressAiFeedback.map((item) => ({ ...item }));

function addHours(isoDate: string, hours: number) {
  const date = new Date(isoDate);
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

function buildInitialTodos(nowIso: string): TodoItem[] {
  return [
    {
      id: "t1",
      title: "Finish database assignment",
      scope: "Weekly",
      dueAt: addHours(nowIso, 42),
      completed: false,
    },
    {
      id: "t2",
      title: "Review lecture slides",
      scope: "Daily",
      dueAt: addHours(nowIso, 10),
      completed: false,
    },
    {
      id: "t3",
      title: "Prepare monthly study reflection",
      scope: "Monthly",
      dueAt: addHours(nowIso, 240),
      completed: false,
    },
  ];
}

export const academicRepository = {
  getCourseGroups(): CourseGroup[] {
    return [...courseGroups];
  },

  getCourseCatalog(): CourseCatalogEntry[] {
    return cloneCatalog();
  },

  getDegreeRequirements(): DegreeRequirements {
    return {
      ...defaultDegreeRequirements,
      coreCourseCodes: [...defaultDegreeRequirements.coreCourseCodes],
    };
  },

  getPlannerSemesters(): string[] {
    return [...plannerSemesters];
  },

  getPlannerYears(): string[] {
    return [...plannerYears];
  },

  getPlannerCourseOptions(): PlannerCourseOption[] {
    return plannerCourseOptions.map((item) => ({ ...item }));
  },

  getInitialPlannedCourses(): PlannedCourse[] {
    return clonePlanned();
  },

  getCompletedCourses(): CompletedCourseRecord[] {
    return cloneCompleted();
  },

  getInProgressCourses(): InProgressCourseRecord[] {
    return cloneInProgress();
  },

  getProgressFeedback(): ProgressFeedback[] {
    return cloneFeedback();
  },

  getScheduleWeekDays(): string[] {
    return [...scheduleWeekDays];
  },

  getScheduleSessionTypes(): SessionType[] {
    return [...scheduleSessionTypes];
  },

  getScheduleTodoScopes(): TodoScope[] {
    return [...scheduleTodoScopes];
  },

  getInitialScheduleItems(): ScheduleItem[] {
    return cloneSchedule();
  },

  getInitialTodos(now: Date = new Date()): TodoItem[] {
    return buildInitialTodos(now.toISOString()).map((item) => ({ ...item }));
  },

  getAcademicValidationReport(options?: {
    plannedCourses?: PlannedCourse[];
    completedCourses?: CompletedCourseRecord[];
    inProgressCourses?: InProgressCourseRecord[];
    scheduleItems?: ScheduleItem[];
  }): AcademicValidationReport {
    const report = validateAcademicPlan({
      catalog: this.getCourseCatalog(),
      requirements: this.getDegreeRequirements(),
      plannedCourses:
        options?.plannedCourses ?? this.getInitialPlannedCourses(),
      completedCourses: options?.completedCourses ?? this.getCompletedCourses(),
      inProgressCourses:
        options?.inProgressCourses ?? this.getInProgressCourses(),
      scheduleItems: options?.scheduleItems ?? this.getInitialScheduleItems(),
    });
    academicTelemetry.logValidationReport(report);
    return report;
  },

  getAutoGraduationPlans(options?: {
    plannedCourses?: PlannedCourse[];
    completedCourses?: CompletedCourseRecord[];
    inProgressCourses?: InProgressCourseRecord[];
  }): AutoGraduationPlan[] {
    const plans = generateAutoGraduationPlans({
      catalog: this.getCourseCatalog(),
      requirements: this.getDegreeRequirements(),
      plannedCourses:
        options?.plannedCourses ?? this.getInitialPlannedCourses(),
      completedCourses: options?.completedCourses ?? this.getCompletedCourses(),
      inProgressCourses:
        options?.inProgressCourses ?? this.getInProgressCourses(),
    });
    academicTelemetry.logAutoPlans(plans);
    return plans;
  },

  listHandbookCategories() {
    return handbookIngestionService.listHandbookCategories();
  },

  submitHandbookIngestion(request: HandbookIngestionRequest) {
    const job = handbookIngestionService.submitIngestion(request);
    if (job) {
      academicTelemetry.logHandbookIngestionSubmitted(
        request.programId,
        request.handbookId,
        job.status,
      );
    }
    return job;
  },

  seedDemoHandbookIngestion() {
    return handbookIngestionService.submitIngestion({
      handbookId: "h6",
      programId: "bsc-computing",
      intakeYear: "2026",
      sourceType: "raw-text",
      source:
        "Core courses include COMP3002 and COMP3010.\nPrerequisite: COMP3002 requires COMP2001.\nDegree requires 360 credits total.",
      submittedBy: "system-demo",
    });
  },

  listHandbookIngestionJobs() {
    return handbookIngestionService.listIngestionJobs();
  },

  reviewHandbookIngestion(decision: HandbookReviewDecision) {
    const reviewedJob = handbookIngestionService.reviewIngestion(decision);
    if (reviewedJob) {
      academicTelemetry.logHandbookReview(
        reviewedJob.request.programId,
        decision.jobId,
        decision.decision,
      );
    }
    return reviewedJob;
  },

  listRequirementVersions(programId?: string) {
    return handbookIngestionService.listRequirementVersions(programId);
  },

  ensureDemoRequirementVersion(
    programId: string = "bsc-computing",
  ): RequirementVersion | undefined {
    const existingActive = this.listRequirementVersions(programId).find(
      (version) => version.status === "active",
    );

    if (existingActive) {
      return existingActive;
    }

    const job = this.seedDemoHandbookIngestion();
    if (!job || job.status !== "pending-review") {
      return this.listRequirementVersions(programId).find(
        (version) => version.status === "active",
      );
    }

    this.reviewHandbookIngestion({
      jobId: job.id,
      decision: "approve",
      reviewerId: "system-auto-reviewer",
      note: "Auto-approved for grounded advisor baseline.",
    });

    return this.listRequirementVersions(programId).find(
      (version) => version.status === "active",
    );
  },

  listTelemetryEvents(limit?: number) {
    return academicTelemetry.listEvents(limit);
  },

  clearTelemetryEvents() {
    academicTelemetry.clearEvents();
  },
};

export type { CourseCatalogEntry, CourseGroup } from "@/types/academic";
