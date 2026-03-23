import MainLayout from "@/components/main-layout";
import { theme } from "@/constants/theme";
import {
    getScienceMajors,
    type ScienceMajorCourse,
    type ScienceMajorEntry,
} from "@/services/backend-api";
import React, { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

interface MajorsProps {
  onMajorSelect?: (major: ScienceMajorEntry) => void;
}

function collectCombinationCourses(combination: {
  courses: ScienceMajorCourse[];
  required_core: ScienceMajorCourse[];
  choose_one_of: ScienceMajorCourse[];
  choose_two_of: ScienceMajorCourse[];
  choose_three_of: ScienceMajorCourse[];
}): ScienceMajorCourse[] {
  return [
    ...combination.courses,
    ...combination.required_core,
    ...combination.choose_one_of,
    ...combination.choose_two_of,
    ...combination.choose_three_of,
  ];
}

function countCoursesForYear(major: ScienceMajorEntry, targetYear: number) {
  const year = major.years.find((entry) => entry.year === targetYear);
  if (!year) {
    return 0;
  }

  const codes = new Set<string>();
  year.combinations.forEach((combination) => {
    collectCombinationCourses(combination).forEach((course) => {
      if (course.code) {
        codes.add(course.code);
      }
    });
  });

  return codes.size;
}

export default function Majors({ onMajorSelect }: MajorsProps) {
  const [majors, setMajors] = useState<ScienceMajorEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadMajors = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const majorsPayload = await getScienceMajors();
        if (!isMounted) {
          return;
        }

        setMajors(majorsPayload.majors);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load majors from backend majors catalog.",
        );
        setMajors([]);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadMajors();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <MainLayout>
      <View style={styles.header}>
        <Text style={styles.title}>Majors</Text>
        <Text style={styles.subtitle}>
          Applied Mathematics through Statistics and Data Science from the
          verified majors catalog.
        </Text>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Available Majors</Text>
        {isLoading ? (
          <Text style={styles.infoText}>Loading majors...</Text>
        ) : null}
        {!isLoading && error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}
        {!isLoading && !error && majors.length === 0 ? (
          <Text style={styles.infoText}>
            No majors found in backend majors catalog.
          </Text>
        ) : null}
        {majors.map((major) => (
          <Pressable
            key={major.major_code || major.major_name}
            style={styles.majorRow}
            onPress={() => onMajorSelect?.(major)}
          >
            <View style={styles.majorHeaderRow}>
              <Text style={styles.majorName}>{major.major_name}</Text>
              <Text style={styles.majorCode}>{major.major_code}</Text>
            </View>
            {major.department ? (
              <Text style={styles.majorDepartment}>{major.department}</Text>
            ) : null}
            <Text style={styles.majorMeta}>
              {`First year: ${countCoursesForYear(major, 1)} | Second year: ${countCoursesForYear(major, 2)} | Third year: ${countCoursesForYear(major, 3)}`}
            </Text>
          </Pressable>
        ))}
      </View>
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
  majorRow: {
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  majorHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
    gap: theme.spacing.sm,
  },
  majorName: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    fontWeight: "700",
  },
  majorCode: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: "700",
  },
  majorMeta: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
  },
  majorDepartment: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  infoText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
    marginBottom: theme.spacing.sm,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: "#b91c1c",
    marginBottom: theme.spacing.sm,
  },
});
