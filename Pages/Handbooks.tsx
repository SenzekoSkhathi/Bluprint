import MainLayout from "@/components/main-layout";
import { theme } from "@/constants/theme";
import { academicRepository } from "@/services/academic-repository";
import {
    listFacultyHandbookFiles,
    type FacultyHandbookFileResponse,
} from "@/services/backend-api";
import type { HandbookCategory } from "@/types/handbook";
import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";

const handbookCategories: HandbookCategory[] =
  academicRepository.listHandbookCategories();

const FACULTY_FOLDERS = [
  { slug: "commerce",       label: "Commerce" },
  { slug: "science",        label: "Science" },
  { slug: "humanities",     label: "Humanities" },
  { slug: "health-sciences",label: "Health Sciences" },
  { slug: "engineering",    label: "Engineering and Built Environment" },
  { slug: "law",            label: "Law" },
] as const;

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

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Handbooks() {
  const isMobile = useIsMobile();
  const [expandedCategory, setExpandedCategory] = useState<string | null>(
    "general",
  );
  const [expandedFaculty, setExpandedFaculty] = useState<string | null>(null);
  const [facultyFiles, setFacultyFiles] = useState<
    Record<string, FacultyHandbookFileResponse[]>
  >({});
  const [facultyLoading, setFacultyLoading] = useState<Record<string, boolean>>({});
  const [facultyError, setFacultyError] = useState<Record<string, string>>({});
  const toggleCategory = (categoryId: string) => {
    setExpandedCategory(expandedCategory === categoryId ? null : categoryId);
  };

  const toggleFaculty = async (slug: string) => {
    if (expandedFaculty === slug) {
      setExpandedFaculty(null);
      return;
    }
    setExpandedFaculty(slug);
    if (facultyFiles[slug] !== undefined || facultyLoading[slug]) return;
    setFacultyLoading((prev) => ({ ...prev, [slug]: true }));
    setFacultyError((prev) => { const n = { ...prev }; delete n[slug]; return n; });
    try {
      const result = await listFacultyHandbookFiles(slug);
      setFacultyFiles((prev) => ({ ...prev, [slug]: result.files }));
    } catch (err) {
      setFacultyError((prev) => ({
        ...prev,
        [slug]: err instanceof Error ? err.message : "Failed to load files.",
      }));
    } finally {
      setFacultyLoading((prev) => ({ ...prev, [slug]: false }));
    }
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

  return (
    <MainLayout>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Handbooks</Text>
          {!isMobile && (
            <Text style={styles.subtitle}>
              Access institutional handbooks and guides
            </Text>
          )}
        </View>

        {handbookCategories.map((category) => {
          const isExpanded = expandedCategory === category.id;
          const bgColor = getCategoryBackgroundColor(category.backgroundColorToken);

          return (
            <View key={category.id} style={styles.categoryWrapper}>
              <Pressable
                style={[styles.categoryHeader, { backgroundColor: bgColor }]}
                onPress={() => toggleCategory(category.id)}
              >
                <View style={styles.categoryHeaderContent}>
                  <View style={[styles.categoryIcon, { backgroundColor: theme.colors.white }]}>
                    <Feather name={category.icon as any} size={20} color={bgColor} />
                  </View>
                  <View style={styles.categoryInfo}>
                    <Text style={styles.categoryTitle}>{category.title}</Text>
                    <Text style={styles.categoryCount}>
                      {category.id === "faculty"
                        ? `${FACULTY_FOLDERS.length} faculties`
                        : `${category.handbooks.length} handbooks`}
                    </Text>
                  </View>
                </View>
                <Feather
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={24}
                  color={theme.colors.white}
                />
              </Pressable>

              {isExpanded && category.id === "faculty" && (
                <View style={styles.categoryContent}>
                  {FACULTY_FOLDERS.map((fac, index) => {
                    const isFacExpanded = expandedFaculty === fac.slug;
                    const files = facultyFiles[fac.slug];
                    const loading = facultyLoading[fac.slug];
                    const error = facultyError[fac.slug];
                    const isLast = index === FACULTY_FOLDERS.length - 1;

                    return (
                      <View
                        key={fac.slug}
                        style={[styles.facultyFolder, isLast && styles.lastFacultyFolder]}
                      >
                        <Pressable
                          style={styles.facultyFolderHeader}
                          onPress={() => void toggleFaculty(fac.slug)}
                        >
                          <Feather
                            name="folder"
                            size={20}
                            color={theme.colors.blue}
                            style={styles.folderIcon}
                          />
                          <Text style={styles.facultyFolderLabel}>{fac.label}</Text>
                          <Feather
                            name={isFacExpanded ? "chevron-up" : "chevron-down"}
                            size={18}
                            color={theme.colors.textSecondary}
                          />
                        </Pressable>

                        {isFacExpanded && (
                          <View style={styles.facultyFileList}>
                            {loading && (
                              <View style={styles.facultyState}>
                                <ActivityIndicator size="small" color={theme.colors.blue} />
                                <Text style={styles.facultyStateText}>Loading…</Text>
                              </View>
                            )}
                            {error && !loading && (
                              <View style={styles.facultyState}>
                                <Feather name="alert-circle" size={16} color={theme.colors.deepBlue} />
                                <Text style={[styles.facultyStateText, { color: theme.colors.deepBlue }]}>
                                  {error}
                                </Text>
                              </View>
                            )}
                            {!loading && !error && files?.length === 0 && (
                              <View style={styles.facultyState}>
                                <Text style={styles.facultyStateText}>No files found in this folder.</Text>
                              </View>
                            )}
                            {!loading && files?.map((file, fi) => (
                              <View
                                key={file.key}
                                style={[
                                  styles.fileRow,
                                  fi === files.length - 1 && styles.lastFileRow,
                                ]}
                              >
                                <Feather
                                  name="file-text"
                                  size={18}
                                  color={theme.colors.deepBlue}
                                  style={styles.fileIcon}
                                />
                                <Pressable
                                  style={styles.fileNameLink}
                                  onPress={() => void openPDF(file.view_url)}
                                >
                                  <Text style={styles.fileName} numberOfLines={2}>
                                    {file.filename.replace(/\.pdf$/i, "")}
                                  </Text>
                                </Pressable>
                                <Text style={styles.fileSize}>
                                  {formatFileSize(file.size_bytes)}
                                </Text>
                                <Pressable
                                  style={[styles.fileActionBtn, styles.fileDownloadBtn]}
                                  onPress={() => void openPDF(file.download_url)}
                                >
                                  <Feather name="download" size={15} color={theme.colors.white} />
                                </Pressable>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              {isExpanded && category.id !== "faculty" && (
                <View style={styles.categoryContent}>
                  {category.handbooks.map((handbook, index) => (
                    <Pressable
                      key={handbook.id}
                      style={[
                        styles.handbookItem,
                        index === category.handbooks.length - 1 && styles.lastHandbookItem,
                      ]}
                      onPress={() => void openPDF(handbook.pdfUrl)}
                    >
                      <View style={styles.handbookIconContainer}>
                        <Feather name="file-text" size={24} color={theme.colors.deepBlue} />
                      </View>
                      <View style={styles.handbookDetails}>
                        <Text style={styles.handbookTitle}>{handbook.title}</Text>
                        <Text style={styles.handbookDescription} numberOfLines={2}>
                          {handbook.description}
                        </Text>
                        <View style={styles.handbookMeta}>
                          <Text style={styles.publishDate}>{handbook.publishDate}</Text>
                          <View style={styles.metaDot} />
                          <Text style={styles.fileSize}>{handbook.fileSize}</Text>
                        </View>
                      </View>
                      <View style={styles.downloadButton}>
                        <Feather name="download" size={18} color={theme.colors.white} />
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
  facultyFolder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.gray,
  },
  lastFacultyFolder: {
    borderBottomWidth: 0,
  },
  facultyFolderHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  folderIcon: {
    marginRight: theme.spacing.sm,
  },
  facultyFolderLabel: {
    flex: 1,
    fontSize: theme.fontSize.md,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  facultyFileList: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  facultyState: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  facultyStateText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.gray,
    gap: theme.spacing.xs,
  },
  lastFileRow: {
    borderBottomWidth: 0,
  },
  fileIcon: {
    marginRight: theme.spacing.xs,
  },
  fileNameLink: {
    flex: 1,
  },
  fileName: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.blue,
    textDecorationLine: "underline",
  },
  fileActionBtn: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.blue,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: theme.spacing.xs,
  },
  fileDownloadBtn: {
    backgroundColor: theme.colors.deepBlue,
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
