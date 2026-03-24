export type HandbookCategoryId =
  | "general"
  | "faculty"
  | "fees-funding";

export interface HandbookDocument {
  id: string;
  title: string;
  description: string;
  pdfUrl: string;
  publishDate: string;
  fileSize: string;
  categoryId: HandbookCategoryId;
}

export interface HandbookCategory {
  id: HandbookCategoryId;
  title: string;
  icon: string;
  backgroundColorToken: "babyBlue" | "blue" | "success" | "deepBlue";
  handbooks: HandbookDocument[];
}

export interface FacultyHandbookFile {
  filename: string;
  key: string;
  size_bytes: number;
  last_modified: string;
  view_url: string;
  download_url: string;
}

export type IngestionSourceType = "pdf-url" | "raw-text";

export interface HandbookIngestionRequest {
  handbookId: string;
  programId: string;
  intakeYear: string;
  sourceType: IngestionSourceType;
  source: string;
  submittedBy: string;
}

export type HandbookIngestionStatus =
  | "submitted"
  | "parsed"
  | "normalized"
  | "pending-review"
  | "approved"
  | "rejected"
  | "failed";

export interface ExtractedRule {
  id: string;
  type: "core" | "prerequisite" | "credit" | "text";
  text: string;
  courseCodes: string[];
  confidence: number;
}

export interface NormalizedRequirementSnapshot {
  id: string;
  programId: string;
  intakeYear: string;
  targetCredits: number;
  coreCourseCodes: string[];
  prerequisitePairs: Array<{ courseCode: string; prerequisiteCode: string }>;
  sourceRuleIds: string[];
}

export interface HandbookIngestionJob {
  id: string;
  request: HandbookIngestionRequest;
  status: HandbookIngestionStatus;
  submittedAtIso: string;
  updatedAtIso: string;
  errorMessage?: string;
  extractedRules: ExtractedRule[];
  normalizedSnapshot?: NormalizedRequirementSnapshot;
}

export interface RequirementVersion {
  id: string;
  programId: string;
  intakeYear: string;
  handbookId: string;
  versionNumber: number;
  status: "draft" | "active" | "archived";
  createdAtIso: string;
  approvedAtIso?: string;
  approvedBy?: string;
  normalizedSnapshot: NormalizedRequirementSnapshot;
}

export interface HandbookReviewDecision {
  jobId: string;
  decision: "approve" | "reject";
  reviewerId: string;
  note?: string;
}

export interface HandbookIngestionStore {
  listCategories(): HandbookCategory[];
  listJobs(): HandbookIngestionJob[];
  createJob(request: HandbookIngestionRequest): HandbookIngestionJob;
  updateJob(job: HandbookIngestionJob): void;
  getJob(jobId: string): HandbookIngestionJob | undefined;
  listVersions(programId?: string): RequirementVersion[];
  createVersion(version: RequirementVersion): void;
  replaceVersions(programId: string, versions: RequirementVersion[]): void;
}
