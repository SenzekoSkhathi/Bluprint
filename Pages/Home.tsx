import MainLayout from "@/components/main-layout";
import NavigationTile from "@/components/navigation-tile";
import ProgressBar from "@/components/progress-bar";
import { theme } from "@/constants/theme";
import { useIsMobile } from "@/hooks/use-is-mobile";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

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
  const isMobile = useIsMobile();
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

  const columns = isMobile ? 2 : 4;
  const tileRows = Array.from(
    { length: Math.ceil(tiles.length / columns) },
    (_, index) => tiles.slice(index * columns, index * columns + columns),
  );

  return (
    <MainLayout>
      {/* Top Section with Baby Blue Background */}
      <View style={[styles.topSection, isMobile && styles.topSectionMobile]}>
        {/* Header Section */}
        <View style={[styles.header, isMobile && styles.headerMobile]}>
          <View style={[styles.headerTop, isMobile && styles.headerTopMobile]}>
            <View
              style={[styles.headerLeft, isMobile && styles.headerLeftMobile]}
            >
              <Text style={[styles.date, isMobile && styles.dateMobile]}>
                {formatDate()}
              </Text>
              <Text
                style={[styles.greeting, isMobile && styles.greetingMobile]}
              >
                {getGreeting()},{" "}
                <Text style={styles.name}>{studentData.firstName}</Text>
              </Text>
            </View>
            <View style={styles.avatarContainer}>
              <View style={[styles.avatar, isMobile && styles.avatarMobile]}>
                <Text
                  style={[
                    styles.avatarText,
                    isMobile && styles.avatarTextMobile,
                  ]}
                >
                  {studentData.firstName.charAt(0)}
                </Text>
              </View>
              <View style={styles.statusDot} />
            </View>
          </View>

          {/* Student Info */}
          <View
            style={[
              styles.infoContainer,
              isMobile && styles.infoContainerMobile,
            ]}
          >
            <Text
              style={[styles.infoText, isMobile && styles.infoTextMobile]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {studentData.degree}
            </Text>
            <View
              style={[styles.infoCompact, isMobile && styles.infoCompactMobile]}
            >
              <Text
                style={[styles.infoLabel, isMobile && styles.infoLabelMobile]}
              >
                {studentData.year}
              </Text>
              <View style={styles.infoDot} />
              <Text
                style={[styles.infoLabel, isMobile && styles.infoLabelMobile]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {studentData.faculty}
              </Text>
            </View>
          </View>
        </View>

        {/* Progress Section */}
        <View
          style={[
            styles.progressSection,
            isMobile && styles.progressSectionMobile,
          ]}
        >
          <ProgressBar
            currentCredits={studentData.currentCredits}
            totalCredits={studentData.totalCredits}
            yearNumber={studentData.yearNumber}
          />
        </View>
      </View>

      {/* Section Label */}
      <View
        style={[styles.sectionHeader, isMobile && styles.sectionHeaderMobile]}
      >
        <Text
          style={[styles.sectionTitle, isMobile && styles.sectionTitleMobile]}
        >
          Quick Access
        </Text>
        <Text
          style={[
            styles.sectionSubtitle,
            isMobile && styles.sectionSubtitleMobile,
          ]}
        >
          Navigate your academic tools
        </Text>
      </View>

      {/* Tile Grid */}
      <View>
        {tileRows.map((row, rowIndex) => (
          <View
            key={`row-${rowIndex}`}
            style={
              isMobile ? styles.columnWrapperMobile : styles.columnWrapperWeb
            }
          >
            {row.map((tile) => (
              <View
                key={tile.id}
                style={
                  isMobile ? styles.tileWrapperMobile : styles.tileWrapperWeb
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
            ))}
            {row.length < columns &&
              Array.from({ length: columns - row.length }).map(
                (_, emptyIndex) => (
                  <View
                    key={`empty-${rowIndex}-${emptyIndex}`}
                    style={
                      isMobile
                        ? styles.tileWrapperMobile
                        : styles.tileWrapperWeb
                    }
                  />
                ),
              )}
          </View>
        ))}
      </View>
    </MainLayout>
  );
};

const styles = StyleSheet.create({
  // --- desktop defaults ---
  topSection: {
    marginBottom: 0,
    paddingTop: theme.spacing.xl,
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.lg,
    backgroundColor: theme.colors.babyBlue,
    borderBottomLeftRadius: theme.borderRadius.xxl,
    borderBottomRightRadius: theme.borderRadius.xxl,
  },
  topSectionMobile: {
    paddingTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  header: {
    marginBottom: theme.spacing.lg,
  },
  headerMobile: {
    marginBottom: theme.spacing.sm,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: theme.spacing.lg,
    marginBottom: 0,
  },
  headerTopMobile: {
    gap: theme.spacing.sm,
    marginBottom: 4,
  },
  headerLeft: {
    flex: 1,
    paddingRight: 0,
  },
  headerLeftMobile: {
    paddingRight: 8,
  },
  date: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textMuted,
    fontWeight: "600",
    marginBottom: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  dateMobile: {
    fontSize: 10,
    marginBottom: 4,
  },
  greeting: {
    fontSize: theme.fontSize.hero,
    color: theme.colors.textPrimary,
    fontWeight: "800",
    marginBottom: 12,
    letterSpacing: -0.5,
    lineHeight: 48,
    flexWrap: "wrap",
  },
  greetingMobile: {
    fontSize: 22,
    marginBottom: 0,
    lineHeight: 32,
  },
  name: {
    color: theme.colors.blue,
    fontWeight: "800",
  },
  avatarContainer: {
    position: "relative",
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: theme.colors.blue,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  avatarMobile: {
    width: 48,
    height: 48,
    borderRadius: 14,
  },
  avatarText: {
    color: theme.colors.white,
    fontSize: theme.fontSize.xl,
    fontWeight: "700",
  },
  avatarTextMobile: {
    fontSize: theme.fontSize.lg,
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
    marginTop: 16,
    gap: 6,
  },
  infoContainerMobile: {
    marginTop: 4,
    gap: 4,
  },
  infoText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textPrimary,
    fontWeight: "600",
    lineHeight: 18,
  },
  infoTextMobile: {
    fontSize: 11,
    lineHeight: 16,
  },
  infoCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  infoCompactMobile: {
    gap: 8,
  },
  infoLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textMuted,
    fontWeight: "500",
  },
  infoLabelMobile: {
    fontSize: 10,
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
    marginTop: 0,
  },
  progressSectionMobile: {
    marginTop: 12,
  },
  sectionHeader: {
    marginBottom: theme.spacing.lg,
    marginTop: 0,
    paddingTop: theme.spacing.xl,
    paddingHorizontal: theme.spacing.xl,
  },
  sectionHeaderMobile: {
    marginBottom: theme.spacing.sm,
    paddingTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  sectionTitleMobile: {
    fontSize: theme.fontSize.md,
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textMuted,
    fontWeight: "500",
  },
  sectionSubtitleMobile: {
    fontSize: 11,
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
