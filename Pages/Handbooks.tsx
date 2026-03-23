import MainLayout from "@/components/main-layout";
import { theme } from "@/constants/theme";
import { academicRepository } from "@/services/academic-repository";
import {
    getBackendBaseUrl,
    getBackendHealth,
    getBackendSetupHint,
    runSciencePipeline,
    type BackendHealthResponse,
    type SciencePipelineResponse,
} from "@/services/backend-api";
import type { HandbookCategory } from "@/types/handbook";
import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

const handbookCategories: HandbookCategory[] =
  academicRepository.listHandbookCategories();

function getCategoryBackgroundColor(
  token: HandbookCategory["backgroundColorToken"],
) {
  if (token === "babyBlue") {
    return theme.colors.babyBlue;
  }
  if (token === "blue") {
    return theme.colors.blue;
  }
  if (token === "success") {
    return theme.colors.success;
  }
  return theme.colors.deepBlue;
}

export default function Handbooks() {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(
    "general",
  );
  const [backendHealth, setBackendHealth] =
    useState<BackendHealthResponse | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [lastPipelineRun, setLastPipelineRun] =
    useState<SciencePipelineResponse | null>(null);
  const [isRefreshingBackend, setIsRefreshingBackend] =
    useState<boolean>(false);
  const [isRunningPipeline, setIsRunningPipeline] = useState<boolean>(false);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategory(expandedCategory === categoryId ? null : categoryId);
  };

  const openPDF = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      }
    } catch (error) {
      console.error("Error opening PDF:", error);
    }
  };

  const ingestionSnapshot = useMemo(() => {
    const jobs = academicRepository.listHandbookIngestionJobs();
    const versions =
      academicRepository.listRequirementVersions("bsc-computing");

    return {
      pending: jobs.filter((job) => job.status === "pending-review").length,
      approved: jobs.filter((job) => job.status === "approved").length,
      failed: jobs.filter((job) => job.status === "failed").length,
      activeVersion: versions.find((version) => version.status === "active"),
    };
  }, []);

  useEffect(() => {
    void refreshBackendStatus();
  }, []);

  const refreshBackendStatus = async () => {
    setIsRefreshingBackend(true);

    try {
      const health = await getBackendHealth();
      setBackendHealth(health);
      setBackendError(null);
    } catch (error) {
      setBackendHealth(null);
      setBackendError(
        error instanceof Error ? error.message : "Unable to reach backend.",
      );
    } finally {
      setIsRefreshingBackend(false);
    }
  };

  const handleRunSciencePipeline = async () => {
    setIsRunningPipeline(true);

    try {
      const result = await runSciencePipeline();
      setLastPipelineRun(result);
      setBackendError(null);
      await refreshBackendStatus();
    } catch (error) {
      setBackendError(
        error instanceof Error ? error.message : "Pipeline run failed.",
      );
    } finally {
      setIsRunningPipeline(false);
    }
  };

  return (
    <MainLayout>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Handbooks</Text>
          <Text style={styles.subtitle}>
            Access institutional handbooks and guides
          </Text>
        </View>

        <View style={styles.pipelineCard}>
          <Text style={styles.pipelineTitle}>Science Pipeline</Text>
          <Text style={styles.pipelineMeta}>
            Backend Endpoint: {getBackendBaseUrl()}
          </Text>
          <Text style={styles.pipelineMeta}>
            Backend Status: {backendHealth ? "Connected" : "Unavailable"}
          </Text>
          {backendHealth && (
            <>
              <Text style={styles.pipelineMeta}>
                Service: {backendHealth.app} ({backendHealth.env})
              </Text>
              <Text style={styles.pipelineMeta}>
                Target Domain: {backendHealth.target_domain}
              </Text>
            </>
          )}
          <Text style={styles.pipelineMeta}>
            Local Review Queue: Pending {ingestionSnapshot.pending} • Approved{" "}
            {ingestionSnapshot.approved} • Failed {ingestionSnapshot.failed}
          </Text>
          <Text style={styles.pipelineMeta}>
            Active Local Rule Version:{" "}
            {ingestionSnapshot.activeVersion?.versionNumber ?? "None"}
          </Text>
          {lastPipelineRun ? (
            <View style={styles.pipelineSummary}>
              <Text style={styles.pipelineMeta}>
                Last Run: {lastPipelineRun.run_id}
              </Text>
              <Text style={styles.pipelineMeta}>
                Documents: {lastPipelineRun.document_count} • Chunks{" "}
                {String(lastPipelineRun.artifacts.chunk_count ?? 0)} • Index{" "}
                {String(lastPipelineRun.artifacts.index_count ?? 0)}
              </Text>
            </View>
          ) : (
            <Text style={styles.pipelineMeta}>
              No backend pipeline run has been triggered from this app session
              yet.
            </Text>
          )}
          {backendError && (
            <Text style={styles.pipelineWarning}>
              {backendError}. {getBackendSetupHint()}
            </Text>
          )}
          <View style={styles.pipelineActions}>
            <Pressable
              style={[styles.pipelineButton, styles.pipelineSecondaryButton]}
              onPress={() => {
                void refreshBackendStatus();
              }}
              disabled={isRefreshingBackend || isRunningPipeline}
            >
              <Text style={styles.pipelineSecondaryButtonText}>
                {isRefreshingBackend ? "Refreshing..." : "Refresh Status"}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.pipelineButton, styles.pipelinePrimaryButton]}
              onPress={() => {
                void handleRunSciencePipeline();
              }}
              disabled={isRunningPipeline || isRefreshingBackend}
            >
              <Text style={styles.pipelinePrimaryButtonText}>
                {isRunningPipeline ? "Running..." : "Run Science Pipeline"}
              </Text>
            </Pressable>
          </View>
        </View>

        {handbookCategories.map((category) => {
          const isExpanded = expandedCategory === category.id;

          return (
            <View key={category.id} style={styles.categoryWrapper}>
              <Pressable
                style={[
                  styles.categoryHeader,
                  {
                    backgroundColor: getCategoryBackgroundColor(
                      category.backgroundColorToken,
                    ),
                  },
                ]}
                onPress={() => toggleCategory(category.id)}
              >
                <View style={styles.categoryHeaderContent}>
                  <View
                    style={[
                      styles.categoryIcon,
                      { backgroundColor: theme.colors.white },
                    ]}
                  >
                    <Feather
                      name={category.icon as any}
                      size={20}
                      color={getCategoryBackgroundColor(
                        category.backgroundColorToken,
                      )}
                    />
                  </View>
                  <View style={styles.categoryInfo}>
                    <Text style={styles.categoryTitle}>{category.title}</Text>
                    <Text style={styles.categoryCount}>
                      {category.handbooks.length} handbooks
                    </Text>
                  </View>
                </View>
                <Feather
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={24}
                  color={theme.colors.white}
                />
              </Pressable>

              {isExpanded && (
                <View style={styles.categoryContent}>
                  {category.handbooks.map((handbook, index) => (
                    <Pressable
                      key={handbook.id}
                      style={[
                        styles.handbookItem,
                        index === category.handbooks.length - 1 &&
                          styles.lastHandbookItem,
                      ]}
                      onPress={() => openPDF(handbook.pdfUrl)}
                    >
                      <View style={styles.handbookIconContainer}>
                        <Feather
                          name="file-text"
                          size={24}
                          color={theme.colors.deepBlue}
                        />
                      </View>

                      <View style={styles.handbookDetails}>
                        <Text style={styles.handbookTitle}>
                          {handbook.title}
                        </Text>
                        <Text
                          style={styles.handbookDescription}
                          numberOfLines={2}
                        >
                          {handbook.description}
                        </Text>
                        <View style={styles.handbookMeta}>
                          <Text style={styles.publishDate}>
                            {handbook.publishDate}
                          </Text>
                          <View style={styles.metaDot} />
                          <Text style={styles.fileSize}>
                            {handbook.fileSize}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.downloadButton}>
                        <Feather
                          name="download"
                          size={18}
                          color={theme.colors.white}
                        />
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        <View style={styles.footerNote}>
          <Feather
            name="info"
            size={16}
            color={theme.colors.deepBlue}
            style={styles.infoIcon}
          />
          <Text style={styles.footerText}>
            All handbooks are in PDF format. Tap to download or view in your
            browser.
          </Text>
        </View>
      </View>
    </MainLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: theme.spacing.lg,
  },
  header: {
    marginBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.hero,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
  categoryWrapper: {
    marginBottom: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    overflow: "hidden",
  },
  pipelineCard: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    gap: 4,
  },
  pipelineTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  pipelineMeta: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
  },
  pipelineSummary: {
    marginTop: theme.spacing.xs,
    gap: 4,
  },
  pipelineWarning: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
    lineHeight: 18,
    marginTop: theme.spacing.xs,
  },
  pipelineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  pipelineButton: {
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
  },
  pipelinePrimaryButton: {
    backgroundColor: theme.colors.deepBlue,
  },
  pipelineSecondaryButton: {
    backgroundColor: theme.colors.grayLight,
    borderWidth: 1,
    borderColor: theme.colors.gray,
  },
  pipelinePrimaryButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
  },
  pipelineSecondaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  categoryHeaderContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
    marginRight: theme.spacing.md,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: "600",
    color: theme.colors.white,
  },
  categoryCount: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.white,
    opacity: 0.8,
    marginTop: theme.spacing.xs,
  },
  categoryContent: {
    backgroundColor: theme.colors.grayLight,
    borderTopWidth: 1,
    borderTopColor: theme.colors.gray,
    paddingVertical: theme.spacing.md,
  },
  handbookItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.gray,
  },
  lastHandbookItem: {
    borderBottomWidth: 0,
  },
  handbookIconContainer: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.white,
    justifyContent: "center",
    alignItems: "center",
    marginRight: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.gray,
  },
  handbookDetails: {
    flex: 1,
  },
  handbookTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  handbookDescription: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
    lineHeight: 18,
  },
  handbookMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  publishDate: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: theme.colors.textSecondary,
    marginHorizontal: theme.spacing.xs,
  },
  fileSize: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  downloadButton: {
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.blue,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: theme.spacing.sm,
  },
  footerNote: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.grayLight,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.gray,
  },
  infoIcon: {
    marginRight: theme.spacing.sm,
  },
  footerText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
});
