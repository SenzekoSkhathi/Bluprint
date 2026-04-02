import MainLayout from "@/components/main-layout";
import { theme } from "@/constants/theme";
import { useIsMobile } from "@/hooks/use-is-mobile";
import React from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

interface Course {
  id: string;
  code: string;
  title: string;
  group: string;
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

interface CourseDetailsProps {
  course: Course | null;
  onBack?: () => void;
}

const OUTLINE_LABEL_RE = /^(Lecture times:|DP requirements:|Assessment:)(.*)$/i;

function renderOutlineWithBoldLabels(outlineText: string) {
  const lines = outlineText.split("\n");

  return lines.map((line, index) => {
    const match = line.match(OUTLINE_LABEL_RE);
    if (!match) {
      return (
        <React.Fragment key={`line-${index}`}>
          {line}
          {index < lines.length - 1 ? "\n" : ""}
        </React.Fragment>
      );
    }

    const [, label, rest] = match;
    return (
      <React.Fragment key={`line-${index}`}>
        <Text style={styles.inlineBold}>{label}</Text>
        {rest}
        {index < lines.length - 1 ? "\n" : ""}
      </React.Fragment>
    );
  });
}

export default function CourseDetails({ course, onBack }: CourseDetailsProps) {
  const isMobile = useIsMobile();
  if (!course) {
    return (
      <MainLayout>
        <View style={styles.header}>
          <Text style={[styles.title, !isMobile && styles.titleDesktop]}>Course Not Found</Text>
          <Text style={styles.subtitle}>
            The requested course could not be found.
          </Text>
        </View>
        {onBack && (
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>← Back to Courses</Text>
          </Pressable>
        )}
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <View style={styles.header}>
        {onBack && (
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>← Back to Courses</Text>
          </Pressable>
        )}
        <Text style={[styles.title, !isMobile && styles.titleDesktop]}>Course Details</Text>
        <Text style={styles.subtitle}>
          Complete information about this course offering.
        </Text>
      </View>

      <ScrollView style={styles.scrollContainer}>
        <View style={styles.sectionCard}>
          <View style={styles.detailContent}>
            <Text style={styles.detailCode}>{course.code}</Text>
            <Text style={styles.detailTitle}>{course.title}</Text>

            <View style={styles.infoGrid}>
              <View style={styles.infoChip}>
                <Text style={styles.infoLabel}>Level</Text>
                <Text style={styles.infoValue}>{course.group}</Text>
              </View>
              <View style={styles.infoChip}>
                <Text style={styles.infoLabel}>Credits</Text>
                <Text style={styles.infoValue}>{course.credits}</Text>
              </View>
              <View style={styles.infoChip}>
                <Text style={styles.infoLabel}>NQF Level</Text>
                <Text style={styles.infoValue}>{course.nqf_level ?? "?"}</Text>
              </View>
              <View style={styles.infoChip}>
                <Text style={styles.infoLabel}>Semester</Text>
                <Text style={styles.infoValue}>{course.semester}</Text>
              </View>
              <View style={styles.infoChip}>
                <Text style={styles.infoLabel}>Delivery</Text>
                <Text style={styles.infoValue}>{course.delivery}</Text>
              </View>
            </View>

            <View style={styles.detailBlock}>
              <Text style={styles.blockTitle}>Department</Text>
              <Text style={styles.blockText}>{course.department}</Text>
            </View>

            <View style={styles.detailBlock}>
              <Text style={styles.blockTitle}>Course Convener</Text>
              <Text style={styles.blockText}>
                {course.convener_details ?? "Not listed"}
              </Text>
            </View>

            <View style={styles.detailBlock}>
              <Text style={styles.blockTitle}>Course Outline</Text>
              <Text style={styles.blockText}>
                {renderOutlineWithBoldLabels(
                  course.outline_details ?? course.description,
                )}
              </Text>
            </View>

            {course.lecture_times ? (
              <View style={styles.detailBlock}>
                <Text style={styles.blockTitle}>Lecture Times</Text>
                <Text style={styles.blockText}>{course.lecture_times}</Text>
              </View>
            ) : null}

            {course.dp_requirements ? (
              <View style={styles.detailBlock}>
                <Text style={styles.blockTitle}>DP Requirements</Text>
                <Text style={styles.blockText}>{course.dp_requirements}</Text>
              </View>
            ) : null}

            {course.assessment ? (
              <View style={styles.detailBlock}>
                <Text style={styles.blockTitle}>Assessment</Text>
                <Text style={styles.blockText}>{course.assessment}</Text>
              </View>
            ) : null}

            <View style={styles.detailBlock}>
              <Text style={styles.blockTitle}>Prerequisite</Text>
              <Text style={styles.blockText}>
                {course.entry_requirements ?? course.prerequisites}
              </Text>
            </View>

            <View style={styles.detailBlock}>
              <Text style={styles.blockTitle}>Learning Outcomes</Text>
              {course.outcomes.length > 0 ? (
                course.outcomes.map((outcome, index) => (
                  <Text key={index} style={styles.outcomeText}>
                    • {outcome}
                  </Text>
                ))
              ) : (
                <Text style={styles.blockText}>
                  Learning outcomes were not listed for this course.
                </Text>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </MainLayout>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: "800",
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  titleDesktop: {
    fontSize: theme.fontSize.xxl,
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textLight,
  },
  backButton: {
    marginBottom: theme.spacing.sm,
    alignSelf: "flex-start",
  },
  backText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.blue,
    fontWeight: "600",
  },
  scrollContainer: {
    flex: 1,
  },
  sectionCard: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  detailContent: {
    gap: theme.spacing.sm,
  },
  detailCode: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: "700",
  },
  detailTitle: {
    fontSize: theme.fontSize.xl,
    color: theme.colors.textPrimary,
    fontWeight: "800",
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  infoChip: {
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 120,
  },
  infoLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: "600",
  },
  infoValue: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
  },
  detailBlock: {
    gap: 4,
  },
  blockTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: "700",
  },
  blockText: {
    color: theme.colors.textLight,
    fontSize: theme.fontSize.md,
    lineHeight: 22,
  },
  inlineBold: {
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  outcomeText: {
    color: theme.colors.textLight,
    fontSize: theme.fontSize.md,
    lineHeight: 22,
  },
});
