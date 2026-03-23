import { handbookCategoriesSeed } from "@/data/handbook-data";
import type {
    HandbookCategory,
    HandbookIngestionJob,
    HandbookIngestionRequest,
    HandbookIngestionStatus,
    HandbookIngestionStore,
    HandbookReviewDecision,
    NormalizedRequirementSnapshot,
    RequirementVersion,
} from "@/types/handbook";

function nowIso() {
  return new Date().toISOString();
}

function parseCourseCodes(text: string): string[] {
  const matches = text.match(/[A-Z]{3,4}\d{4}(?:[A-Z](?:\/[A-Z]){0,3})?/g);
  return matches ? Array.from(new Set(matches)) : [];
}

function buildInMemoryStore(): HandbookIngestionStore {
  let categories = handbookCategoriesSeed.map((category) => ({
    ...category,
    handbooks: category.handbooks.map((handbook) => ({ ...handbook })),
  }));

  let jobs: HandbookIngestionJob[] = [];
  let versions: RequirementVersion[] = [];

  return {
    listCategories(): HandbookCategory[] {
      return categories.map((category) => ({
        ...category,
        handbooks: category.handbooks.map((handbook) => ({ ...handbook })),
      }));
    },

    listJobs(): HandbookIngestionJob[] {
      return jobs.map((job) => ({
        ...job,
        request: { ...job.request },
        extractedRules: job.extractedRules.map((rule) => ({
          ...rule,
          courseCodes: [...rule.courseCodes],
        })),
        normalizedSnapshot: job.normalizedSnapshot
          ? {
              ...job.normalizedSnapshot,
              coreCourseCodes: [...job.normalizedSnapshot.coreCourseCodes],
              prerequisitePairs: job.normalizedSnapshot.prerequisitePairs.map(
                (pair) => ({ ...pair }),
              ),
              sourceRuleIds: [...job.normalizedSnapshot.sourceRuleIds],
            }
          : undefined,
      }));
    },

    createJob(request: HandbookIngestionRequest): HandbookIngestionJob {
      const job: HandbookIngestionJob = {
        id: `job-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        request: { ...request },
        status: "submitted",
        submittedAtIso: nowIso(),
        updatedAtIso: nowIso(),
        extractedRules: [],
      };
      jobs = [job, ...jobs];
      return { ...job, request: { ...job.request }, extractedRules: [] };
    },

    updateJob(job: HandbookIngestionJob): void {
      jobs = jobs.map((existing) => (existing.id === job.id ? job : existing));
    },

    getJob(jobId: string): HandbookIngestionJob | undefined {
      const found = jobs.find((job) => job.id === jobId);
      if (!found) {
        return undefined;
      }
      return {
        ...found,
        request: { ...found.request },
        extractedRules: found.extractedRules.map((rule) => ({
          ...rule,
          courseCodes: [...rule.courseCodes],
        })),
        normalizedSnapshot: found.normalizedSnapshot
          ? {
              ...found.normalizedSnapshot,
              coreCourseCodes: [...found.normalizedSnapshot.coreCourseCodes],
              prerequisitePairs: found.normalizedSnapshot.prerequisitePairs.map(
                (pair) => ({ ...pair }),
              ),
              sourceRuleIds: [...found.normalizedSnapshot.sourceRuleIds],
            }
          : undefined,
      };
    },

    listVersions(programId?: string): RequirementVersion[] {
      const filtered = programId
        ? versions.filter((version) => version.programId === programId)
        : versions;

      return filtered.map((version) => ({
        ...version,
        normalizedSnapshot: {
          ...version.normalizedSnapshot,
          coreCourseCodes: [...version.normalizedSnapshot.coreCourseCodes],
          prerequisitePairs: version.normalizedSnapshot.prerequisitePairs.map(
            (pair) => ({ ...pair }),
          ),
          sourceRuleIds: [...version.normalizedSnapshot.sourceRuleIds],
        },
      }));
    },

    createVersion(version: RequirementVersion): void {
      versions = [version, ...versions];
    },

    replaceVersions(
      programId: string,
      replacementVersions: RequirementVersion[],
    ): void {
      versions = [
        ...replacementVersions,
        ...versions.filter((version) => version.programId !== programId),
      ];
    },
  };
}

function updateJobStatus(
  store: HandbookIngestionStore,
  jobId: string,
  status: HandbookIngestionStatus,
  updates?: Partial<HandbookIngestionJob>,
) {
  const current = store.getJob(jobId);
  if (!current) {
    return;
  }
  const next: HandbookIngestionJob = {
    ...current,
    ...updates,
    status,
    updatedAtIso: nowIso(),
  };
  store.updateJob(next);
}

function buildNormalizedSnapshot(
  job: HandbookIngestionJob,
): NormalizedRequirementSnapshot {
  const coreCodes = new Set<string>();
  const prerequisitePairs: Array<{
    courseCode: string;
    prerequisiteCode: string;
  }> = [];

  job.extractedRules.forEach((rule) => {
    if (rule.type === "core") {
      rule.courseCodes.forEach((code) => coreCodes.add(code));
    }
    if (rule.type === "prerequisite") {
      const [courseCode, prerequisiteCode] = rule.courseCodes;
      if (courseCode && prerequisiteCode) {
        prerequisitePairs.push({ courseCode, prerequisiteCode });
      }
    }
  });

  const targetCreditsRule = job.extractedRules.find(
    (rule) => rule.type === "credit",
  );
  const targetCreditsMatch = targetCreditsRule?.text.match(/(\d{2,3})/);
  const targetCredits = targetCreditsMatch
    ? Number(targetCreditsMatch[1])
    : 360;

  return {
    id: `snapshot-${job.id}`,
    programId: job.request.programId,
    intakeYear: job.request.intakeYear,
    targetCredits,
    coreCourseCodes: Array.from(coreCodes),
    prerequisitePairs,
    sourceRuleIds: job.extractedRules.map((rule) => rule.id),
  };
}

function extractRulesFromSource(source: string, jobId: string) {
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const extracted = lines.flatMap((line, index) => {
    const courseCodes = parseCourseCodes(line);
    const lower = line.toLowerCase();
    const baseId = `${jobId}-r${index + 1}`;

    if (lower.includes("prerequisite") && courseCodes.length >= 2) {
      return [
        {
          id: baseId,
          type: "prerequisite" as const,
          text: line,
          courseCodes: [courseCodes[0], courseCodes[1]],
          confidence: 0.78,
        },
      ];
    }

    if (lower.includes("core") && courseCodes.length > 0) {
      return [
        {
          id: baseId,
          type: "core" as const,
          text: line,
          courseCodes,
          confidence: 0.82,
        },
      ];
    }

    if (lower.includes("credit")) {
      return [
        {
          id: baseId,
          type: "credit" as const,
          text: line,
          courseCodes,
          confidence: 0.7,
        },
      ];
    }

    if (courseCodes.length > 0) {
      return [
        {
          id: baseId,
          type: "text" as const,
          text: line,
          courseCodes,
          confidence: 0.55,
        },
      ];
    }

    return [];
  });

  return extracted;
}

class HandbookIngestionService {
  private readonly store: HandbookIngestionStore;

  constructor(store?: HandbookIngestionStore) {
    this.store = store ?? buildInMemoryStore();
  }

  listHandbookCategories() {
    return this.store.listCategories();
  }

  listIngestionJobs() {
    return this.store.listJobs();
  }

  listRequirementVersions(programId?: string) {
    return this.store.listVersions(programId);
  }

  submitIngestion(request: HandbookIngestionRequest) {
    const job = this.store.createJob(request);

    try {
      updateJobStatus(this.store, job.id, "parsed", {
        extractedRules: extractRulesFromSource(request.source, job.id),
      });

      const parsedJob = this.store.getJob(job.id);
      if (!parsedJob) {
        throw new Error("Ingestion job missing after parsing.");
      }

      const normalizedSnapshot = buildNormalizedSnapshot(parsedJob);
      updateJobStatus(this.store, job.id, "normalized", {
        normalizedSnapshot,
      });

      updateJobStatus(this.store, job.id, "pending-review");
      return this.store.getJob(job.id);
    } catch (error) {
      updateJobStatus(this.store, job.id, "failed", {
        errorMessage:
          error instanceof Error
            ? error.message
            : "Unknown ingestion pipeline error.",
      });
      return this.store.getJob(job.id);
    }
  }

  reviewIngestion(decision: HandbookReviewDecision) {
    const job = this.store.getJob(decision.jobId);
    if (!job) {
      return undefined;
    }

    if (decision.decision === "reject") {
      updateJobStatus(this.store, job.id, "rejected", {
        errorMessage: decision.note,
      });
      return this.store.getJob(job.id);
    }

    if (!job.normalizedSnapshot) {
      updateJobStatus(this.store, job.id, "failed", {
        errorMessage: "Cannot approve ingestion without normalized snapshot.",
      });
      return this.store.getJob(job.id);
    }

    const existingVersions = this.store.listVersions(job.request.programId);
    const nextVersionNumber =
      existingVersions.length === 0
        ? 1
        : Math.max(
            ...existingVersions.map((version) => version.versionNumber),
          ) + 1;

    const archivedExisting = existingVersions.map((version) =>
      version.status === "active"
        ? { ...version, status: "archived" as const }
        : version,
    );

    const newVersion: RequirementVersion = {
      id: `rv-${job.request.programId}-${nextVersionNumber}`,
      programId: job.request.programId,
      intakeYear: job.request.intakeYear,
      handbookId: job.request.handbookId,
      versionNumber: nextVersionNumber,
      status: "active",
      createdAtIso: nowIso(),
      approvedAtIso: nowIso(),
      approvedBy: decision.reviewerId,
      normalizedSnapshot: {
        ...job.normalizedSnapshot,
        coreCourseCodes: [...job.normalizedSnapshot.coreCourseCodes],
        prerequisitePairs: job.normalizedSnapshot.prerequisitePairs.map(
          (pair) => ({
            ...pair,
          }),
        ),
        sourceRuleIds: [...job.normalizedSnapshot.sourceRuleIds],
      },
    };

    this.store.replaceVersions(job.request.programId, [
      newVersion,
      ...archivedExisting,
    ]);
    updateJobStatus(this.store, job.id, "approved");
    return this.store.getJob(job.id);
  }
}

export const handbookIngestionService = new HandbookIngestionService();
