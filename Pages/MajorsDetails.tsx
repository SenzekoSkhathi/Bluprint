import MainLayout from "@/components/main-layout";
import { getPrimaryFacultySlug } from "@/constants/faculty";
import { theme } from "@/constants/theme";
import {
    getHandbookMajors,
    getScienceMajors,
    type ScienceMajorCourse,
    type ScienceMajorEntry,
    type ScienceMajorYear,
} from "@/services/backend-api";
import React, { useEffect, useState } from "react";
import {
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

interface MajorsDetailsProps {
  majorId?: string;
  majorName?: string;
  onBack?: () => void;
}

function renderCourseList(title: string, courses: ScienceMajorCourse[]) {
  if (courses.length === 0) {
    return null;
  }

  return (
    <View style={styles.detailBlock}>
      <Text style={styles.blockTitle}>{title}</Text>
      {courses.map((course) => (
        <Text key={`${title}-${course.code}`} style={styles.courseLine}>
          {course.code}: {course.title}
        </Text>
      ))}
    </View>
  );
}

function renderYear(year: ScienceMajorYear) {
  return (
    <View key={`${year.year}-${year.label}`} style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>
        {year.label || `Year ${year.year}`}
      </Text>
      {year.combinations.map((combination) => (
        <View
          key={combination.combination_id || combination.description}
          style={styles.combinationCard}
        >
          <Text style={styles.combinationTitle}>
            {combination.description || "Course Combination"}
          </Text>
          {renderCourseList("Courses", combination.courses)}
          {renderCourseList("Required Core", combination.required_core)}
          {renderCourseList("Choose One Of", combination.choose_one_of)}
          {renderCourseList("Choose Two Of", combination.choose_two_of)}
          {renderCourseList("Choose Three Of", combination.choose_three_of)}
          {combination.instruction ? (
            <Text style={styles.instructionText}>
              {combination.instruction}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export default function MajorsDetails({
  majorId,
  majorName,
  onBack,
}: MajorsDetailsProps) {
  const activeFacultySlug = getPrimaryFacultySlug();
  const [major, setMajor] = useState<ScienceMajorEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadMajorDetails = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const majorsPayload = await getHandbookMajors({
          faculty_slug: activeFacultySlug,
        }).catch(() => getScienceMajors());

        if (!isMounted) {
          return;
        }

        const normalizedId = majorId?.trim().toUpperCase();
        const normalizedName = majorName?.trim().toLowerCase();

        const selected = majorsPayload.majors.find(
          (item) =>
            (normalizedId && item.major_code.toUpperCase() === normalizedId) ||
            (normalizedName &&
              item.major_name.toLowerCase() === normalizedName),
        );

        setMajor(selected ?? null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load major details from backend majors catalog.",
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadMajorDetails();

    return () => {
      isMounted = false;
    };
  }, [majorId, majorName, activeFacultySlug]);

  return (
    <MainLayout>
      <View style={styles.header}>
        {onBack ? (
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>Back to Majors</Text>
          </Pressable>
        ) : null}
        <Text style={styles.title}>Major Details</Text>
        <Text style={styles.subtitle}>
          Notes and required courses for the selected major.
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.sectionCard}>
          <Text style={styles.infoText}>Loading major details...</Text>
        </View>
      ) : null}

      {!isLoading && error ? (
        <View style={styles.sectionCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {!isLoading && !error && !major ? (
        <View style={styles.sectionCard}>
          <Text style={styles.errorText}>
            Major not found in backend majors catalog.
          </Text>
        </View>
      ) : null}

      {!isLoading && !error && major ? (
        <ScrollView style={styles.scrollContainer}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{major.major_name}</Text>
            <Text style={styles.majorCode}>{major.major_code}</Text>
            {major.department ? (
              <Text style={styles.blockText}>{major.department}</Text>
            ) : null}
            {major.notes ? (
              <Text style={styles.blockText}>{major.notes}</Text>
            ) : null}
          </View>

          {major.years.map(renderYear)}
        </ScrollView>
      ) : null}
    </MainLayout>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: Platform.OS === "web" ? theme.fontSize.xxl : theme.fontSize.xl,
    fontWeight: "800",
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    color: theme.colors.textLight,
    fontSize: theme.fontSize.md,
  },
  backButton: {
    marginBottom: theme.spacing.sm,
    alignSelf: "flex-start",
  },
  backText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.blue,
    fontWeight: "700",
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
  sectionTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  majorCode: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: "700",
    marginBottom: theme.spacing.sm,
  },
  detailBlock: {
    marginBottom: theme.spacing.md,
  },
  blockTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  blockText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
    lineHeight: 20,
  },
  courseLine: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  combinationCard: {
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  combinationTitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textPrimary,
    fontWeight: "700",
    marginBottom: 4,
  },
  instructionText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
    marginTop: theme.spacing.xs,
  },
  infoText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: "#b91c1c",
  },
});
