import MainLayout from "@/components/main-layout";
import NavigationTile from "@/components/navigation-tile";
import ProgressBar from "@/components/progress-bar";
import { theme } from "@/constants/theme";
import React, { useEffect, useState } from "react";
import { FlatList, Platform, StyleSheet, Text, View } from "react-native";

interface HomeProps {
  onNavigate?: (page: string) => void;
  firstName?: string;
  degree?: string;
  yearNumber?: number;
  currentCredits?: number;
  totalCredits?: number;
}

const Home = ({
  onNavigate,
  firstName = "Student",
  degree = "BSc Programme",
  yearNumber = 1,
  currentCredits = 0,
  totalCredits = 360,
}: HomeProps) => {
  const [activePage, setActivePage] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };

  const formatDate = () => {
    return currentTime.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatAcademicYear = (year: number) => {
    const safeYear = Math.max(1, Math.floor(year));
    const suffix =
      safeYear % 10 === 1 && safeYear % 100 !== 11
        ? "st"
        : safeYear % 10 === 2 && safeYear % 100 !== 12
          ? "nd"
          : safeYear % 10 === 3 && safeYear % 100 !== 13
            ? "rd"
            : "th";
    return `${safeYear}${suffix} Year`;
  };

  const studentData = {
    firstName,
    degree,
    year: formatAcademicYear(yearNumber),
    yearNumber,
    faculty: "Faculty of Science",
    currentCredits,
    totalCredits,
  };

  const tiles = [
    {
      id: "blubot",
      title: "BluBot",
      icon: "B",
      page: "BluBot",
      color: "#6C63FF",
      iconTextColor: theme.colors.white,
      iconBackgroundColor: theme.colors.babyBlue,
    },
    {
      id: "planner",
      title: "Planner",
      icon: "✎",
      page: "Planner",
      color: "#FF6B6B",
    },
    {
      id: "schedule",
      title: "Schedule",
      icon: "🗓",
      page: "Schedule",
      color: "#4ECDC4",
    },
    {
      id: "majors",
      title: "Majors",
      icon: "🏅",
      page: "Majors",
      color: "#45B7D1",
    },
    {
      id: "courses",
      title: "Courses",
      icon: "☰",
      page: "Courses",
      color: "#45B7D1",
    },
    {
      id: "advisor",
      title: "Advisor",
      icon: "🧑‍💼",
      page: "Advisor",
      color: "#96CEB4",
    },
    {
      id: "timetable",
      title: "Exam Timetable",
      icon: "⏲️",
      page: "Timetable",
      color: "#FFEAA7",
    },
    {
      id: "progress",
      title: "Progress",
      icon: "📊",
      page: "Progress",
      color: "#DDA0DD",
    },
    {
      id: "handbooks",
      title: "Handbooks",
      icon: "📕",
      page: "Handbooks",
      color: "#98D8C8",
    },
    {
      id: "profile",
      title: "Profile",
      icon: "☺︎",
      page: "Profile",
      color: "#F7DC6F",
    },
  ];

  const handleTileClick = (page: string) => {
    setActivePage(page);
    onNavigate?.(page);
  };

  return (
    <MainLayout>
      {/* Top Section with Baby Blue Background */}
      <View style={styles.topSection}>
        {/* Header Section */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <Text style={styles.date}>{formatDate()}</Text>
              <Text style={styles.greeting}>
                {getGreeting()},{" "}
                <Text style={styles.name}>{studentData.firstName}</Text>
              </Text>
            </View>
            <View style={styles.avatarContainer}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {studentData.firstName.charAt(0)}
                </Text>
              </View>
              <View style={styles.statusDot} />
            </View>
          </View>

          {/* Student Info */}
          <View style={styles.infoContainer}>
            <Text
              style={styles.infoText}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {studentData.degree}
            </Text>
            <View style={styles.infoCompact}>
              <Text style={styles.infoLabel}>{studentData.year}</Text>
              <View style={styles.infoDot} />
              <Text
                style={styles.infoLabel}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {studentData.faculty}
              </Text>
            </View>
          </View>
        </View>

        {/* Progress Section */}
        <View style={styles.progressSection}>
          <ProgressBar
            currentCredits={studentData.currentCredits}
            totalCredits={studentData.totalCredits}
            yearNumber={studentData.yearNumber}
          />
        </View>
      </View>

      {/* Section Label */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Quick Access</Text>
        <Text style={styles.sectionSubtitle}>Navigate your academic tools</Text>
      </View>

      {/* Tile Grid */}
      <FlatList
        data={tiles}
        keyExtractor={(item) => item.id}
        numColumns={Platform.OS === "web" ? 4 : 2}
        columnWrapperStyle={
          Platform.OS === "web"
            ? styles.columnWrapperWeb
            : styles.columnWrapperMobile
        }
        scrollEnabled={false}
        renderItem={({ item: tile }) => (
          <View
            style={
              Platform.OS === "web"
                ? styles.tileWrapperWeb
                : styles.tileWrapperMobile
            }
          >
            <NavigationTile
              title={tile.title}
              icon={tile.icon}
              color={tile.color}
              iconTextColor={tile.iconTextColor}
              iconBackgroundColor={tile.iconBackgroundColor}
              onClick={() => handleTileClick(tile.page)}
              isActive={activePage === tile.page}
            />
          </View>
        )}
      />
    </MainLayout>
  );
};

const styles = StyleSheet.create({
  topSection: {
    marginBottom: 0,
    paddingTop: Platform.OS === "web" ? theme.spacing.xl : theme.spacing.md,
    paddingHorizontal:
      Platform.OS === "web" ? theme.spacing.xl : theme.spacing.md,
    paddingBottom: Platform.OS === "web" ? theme.spacing.lg : theme.spacing.md,
    backgroundColor: theme.colors.babyBlue,
    borderBottomLeftRadius: theme.borderRadius.xxl,
    borderBottomRightRadius: theme.borderRadius.xxl,
  },
  header: {
    marginBottom: Platform.OS === "web" ? theme.spacing.lg : theme.spacing.sm,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: Platform.OS === "web" ? theme.spacing.lg : theme.spacing.sm,
    marginBottom: Platform.OS === "web" ? 0 : 4,
  },
  headerLeft: {
    flex: 1,
    paddingRight: Platform.OS === "web" ? 0 : 8,
  },
  date: {
    fontSize: Platform.OS === "web" ? theme.fontSize.sm : 10,
    color: theme.colors.textMuted,
    fontWeight: "600",
    marginBottom: Platform.OS === "web" ? 12 : 4,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  greeting: {
    fontSize: Platform.OS === "web" ? theme.fontSize.hero : 22,
    color: theme.colors.textPrimary,
    fontWeight: "800",
    marginBottom: Platform.OS === "web" ? 12 : 0,
    letterSpacing: -0.5,
    lineHeight: Platform.OS === "web" ? 48 : 32,
    flexWrap: "wrap",
  },
  name: {
    color: theme.colors.blue,
    fontWeight: "800",
  },
  avatarContainer: {
    position: "relative",
  },
  avatar: {
    width: Platform.OS === "web" ? 64 : 48,
    height: Platform.OS === "web" ? 64 : 48,
    borderRadius: Platform.OS === "web" ? 20 : 14,
    backgroundColor: theme.colors.blue,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  avatarText: {
    color: theme.colors.white,
    fontSize: Platform.OS === "web" ? theme.fontSize.xl : theme.fontSize.lg,
    fontWeight: "700",
  },
  statusDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: theme.colors.success,
    borderWidth: 2,
    borderColor: theme.colors.babyBlue,
  },
  infoContainer: {
    marginTop: Platform.OS === "web" ? 16 : 4,
    gap: Platform.OS === "web" ? 6 : 4,
  },
  infoText: {
    fontSize: Platform.OS === "web" ? theme.fontSize.sm : 11,
    color: theme.colors.textPrimary,
    fontWeight: "600",
    lineHeight: Platform.OS === "web" ? 18 : 16,
  },
  infoCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: Platform.OS === "web" ? 10 : 8,
    flexWrap: "wrap",
  },
  infoLabel: {
    fontSize: Platform.OS === "web" ? theme.fontSize.xs : 10,
    color: theme.colors.textMuted,
    fontWeight: "500",
  },
  infoDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: theme.colors.textMuted,
    opacity: 0.5,
  },
  progressSection: {
    marginBottom: 0,
    marginTop: Platform.OS === "web" ? 0 : 12,
  },
  sectionHeader: {
    marginBottom: Platform.OS === "web" ? theme.spacing.lg : theme.spacing.sm,
    marginTop: 0,
    paddingTop: Platform.OS === "web" ? theme.spacing.xl : theme.spacing.md,
    paddingHorizontal:
      Platform.OS === "web" ? theme.spacing.xl : theme.spacing.md,
  },
  sectionTitle: {
    fontSize: Platform.OS === "web" ? theme.fontSize.xl : theme.fontSize.md,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: Platform.OS === "web" ? 4 : 2,
    letterSpacing: -0.5,
  },
  sectionSubtitle: {
    fontSize: Platform.OS === "web" ? theme.fontSize.sm : 11,
    color: theme.colors.textMuted,
    fontWeight: "500",
  },
  columnWrapperWeb: {
    gap: 12,
    paddingHorizontal: 32,
    marginBottom: 24,
  },
  columnWrapperMobile: {
    gap: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  tileWrapperWeb: {
    width: "25%",
    paddingHorizontal: 12,
    marginBottom: 24,
  },
  tileWrapperMobile: {
    width: "50%",
    paddingHorizontal: 4,
    marginBottom: 8,
  },
});

export default Home;
