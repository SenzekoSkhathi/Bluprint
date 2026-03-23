import { theme } from "@/constants/theme";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";

interface ProgressBarProps {
  currentCredits: number;
  totalCredits: number;
  yearNumber: number;
}

const ProgressBar = ({
  currentCredits,
  totalCredits,
  yearNumber,
}: ProgressBarProps) => {
  const overallPercentage = Math.round((currentCredits / totalCredits) * 100);
  const remaining = totalCredits - currentCredits;

  // Year milestones: 72 for year 1, 144 for year 2, etc.
  const yearTarget = yearNumber * 72;
  const yearPercentage = Math.round((currentCredits / yearTarget) * 100);
  const clampedOverallPercentage = Math.min(
    Math.max(overallPercentage, 0),
    100,
  );
  const clampedYearPercentage = Math.min(Math.max(yearPercentage, 0), 100);

  const overallAnim = useSharedValue(0);

  const [activeView, setActiveView] = useState<"degree" | "year">("degree");
  const isDegreeView = activeView === "degree";

  useEffect(() => {
    const targetPercentage = isDegreeView
      ? clampedOverallPercentage
      : clampedYearPercentage;
    overallAnim.value = withTiming(targetPercentage, { duration: 1200 });
  }, [clampedOverallPercentage, clampedYearPercentage, isDegreeView]);

  const animatedOverallBarStyle = useAnimatedStyle(() => ({
    width: `${overallAnim.value}%`,
  }));

  const isOnTrack = currentCredits >= yearTarget;
  const yearTargetPercentagePosition = (yearTarget / totalCredits) * 100;
  const yearCreditsRemaining = Math.max(yearTarget - currentCredits, 0);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.mainTitle}>Academic Progress</Text>
        <View style={styles.badgeGroup}>
          <Pressable
            onPress={() => setActiveView("degree")}
            style={[
              styles.badge,
              isDegreeView ? styles.badgeActive : styles.badgeInactive,
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                !isDegreeView && styles.badgeTextInactive,
              ]}
            >
              To Graduate
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveView("year")}
            style={[
              styles.badge,
              !isDegreeView
                ? isOnTrack
                  ? styles.badgeActive
                  : styles.badgeWarning
                : styles.badgeInactive,
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                isDegreeView && styles.badgeTextInactive,
              ]}
            >
              Y{yearNumber}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Unified Progress Bar with Year Target Marker */}
      <View style={styles.barWrapper}>
        <View style={styles.barContainer}>
          {/* Year target indicator line */}
          {isDegreeView && (
            <View
              style={[
                styles.yearMarker,
                { left: `${yearTargetPercentagePosition}%` },
              ]}
            >
              <View style={styles.yearMarkerLine} />
            </View>
          )}
          {/* Actual progress bar */}
          <Animated.View
            style={[
              styles.bar,
              isDegreeView
                ? styles.barPrimary
                : isOnTrack
                  ? styles.barSuccess
                  : styles.barWarning,
              animatedOverallBarStyle,
            ]}
          />
        </View>
      </View>

      {/* Compact Stats - Dynamic based on view */}
      <View style={styles.statsRow}>
        {isDegreeView ? (
          <>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{currentCredits}</Text>
              <Text style={styles.statLabel}>Earned</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{remaining}</Text>
              <Text style={styles.statLabel}>Remaining</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{totalCredits}</Text>
              <Text style={styles.statLabel}>Required</Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{currentCredits}</Text>
              <Text style={styles.statLabel}>Earned</Text>
            </View>
            <View style={styles.stat}>
              <Text
                style={[styles.statValue, !isOnTrack && styles.statWarning]}
              >
                {yearCreditsRemaining}
              </Text>
              <Text style={styles.statLabel}>Needed</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{yearTarget}</Text>
              <Text style={styles.statLabel}>Target</Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  mainTitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textPrimary,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  badgeGroup: {
    flexDirection: "row",
    gap: 6,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: theme.borderRadius.round,
  },
  badgeActive: {
    backgroundColor: theme.colors.blue,
  },
  badgeInactive: {
    backgroundColor: "rgba(0, 0, 0, 0.06)",
  },
  badgePrimary: {
    backgroundColor: theme.colors.blue,
  },
  badgeSuccess: {
    backgroundColor: theme.colors.success,
  },
  badgeWarning: {
    backgroundColor: "#FF9500",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.colors.white,
    letterSpacing: 0.02,
  },
  badgeTextInactive: {
    color: theme.colors.textMuted,
  },
  barWrapper: {
    position: "relative",
  },
  barContainer: {
    width: "100%",
    height: 8,
    backgroundColor: theme.colors.grayLight,
    borderRadius: theme.borderRadius.round,
    overflow: "visible",
    position: "relative",
  },
  bar: {
    height: "100%",
    backgroundColor: theme.colors.blue,
    borderRadius: theme.borderRadius.round,
  },
  barPrimary: {
    backgroundColor: theme.colors.blue,
  },
  barSuccess: {
    backgroundColor: theme.colors.success,
  },
  barWarning: {
    backgroundColor: "#FF9500",
  },
  yearMarker: {
    position: "absolute",
    top: -2,
    bottom: -2,
    width: 2,
    zIndex: 1,
  },
  yearMarkerLine: {
    width: 2,
    height: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: 1,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  stat: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  statWarning: {
    color: "#FF9500",
  },
  statLabel: {
    fontSize: 9,
    fontWeight: "500",
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
});

export default ProgressBar;
