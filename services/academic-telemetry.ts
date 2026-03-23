import type {
    AcademicValidationReport,
    AutoGraduationPlan,
} from "@/types/academic";

export type TelemetryEventType =
  | "validation_report_generated"
  | "auto_plans_generated"
  | "handbook_ingestion_submitted"
  | "handbook_ingestion_reviewed";

export interface TelemetryEvent {
  id: string;
  type: TelemetryEventType;
  timestampIso: string;
  payload: Record<string, string | number | boolean | null | undefined>;
}

class AcademicTelemetryService {
  private events: TelemetryEvent[] = [];

  private emit(
    type: TelemetryEventType,
    payload: Record<string, string | number | boolean | null | undefined>,
  ) {
    this.events.unshift({
      id: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type,
      timestampIso: new Date().toISOString(),
      payload,
    });
  }

  logValidationReport(report: AcademicValidationReport) {
    this.emit("validation_report_generated", {
      blockers: report.summary.blockers,
      warnings: report.summary.warnings,
      projectedCredits: report.projectedCredits,
      creditShortfall: report.creditShortfall,
      eligible: report.isProjectedGraduationEligible,
    });
  }

  logAutoPlans(plans: AutoGraduationPlan[]) {
    const top = plans[0];
    this.emit("auto_plans_generated", {
      plansCount: plans.length,
      topPlanId: top?.id,
      topPlanObjective: top?.objective,
      topPlanTerms: top?.estimatedTerms,
    });
  }

  logHandbookIngestionSubmitted(
    programId: string,
    handbookId: string,
    status: string,
  ) {
    this.emit("handbook_ingestion_submitted", {
      programId,
      handbookId,
      status,
    });
  }

  logHandbookReview(
    programId: string,
    jobId: string,
    decision: "approve" | "reject",
  ) {
    this.emit("handbook_ingestion_reviewed", {
      programId,
      jobId,
      decision,
    });
  }

  listEvents(limit: number = 100) {
    return this.events.slice(0, limit).map((event) => ({
      ...event,
      payload: { ...event.payload },
    }));
  }

  clearEvents() {
    this.events = [];
  }
}

export const academicTelemetry = new AcademicTelemetryService();
