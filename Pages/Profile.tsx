// ...existing code...
import MainLayout from "@/components/main-layout";
import { theme } from "@/constants/theme";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { updateStudentProfile } from "@/services/backend-api";
import React, { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

// ─── Types ────────────────────────────────────────────────────────────────────
interface StudentProfile {
  id: string;
  firstName: string;
  lastName: string;
  studentId: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  enrollmentDate: string;
  program: string;
  faculty: string;
  year: string;
  status: string;
  gpa: number;
  creditsCompleted: number;
  creditsRequired: number;
  expectedGraduation: string;
}

export interface LoggedInUserProfile {
  name: string;
  studentNumber: string;
  degree: string;
  year: number;
  majors?: string[];
  creditsCompleted?: number;
  gpa?: number;
}

interface ProfileProps {
  onLogout?: () => Promise<void> | void;
  loggedInUser?: LoggedInUserProfile;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────
const defaultStudentProfile: StudentProfile = {
  id: "S123456789",
  firstName: "Alex",
  lastName: "Johnson",
  studentId: "S123456789",
  email: "alex.johnson@myuct.ac.za",
  phone: "+27 21 555 1234",
  dateOfBirth: "15 Jan 2004",
  enrollmentDate: "February 2022",
  program: "Computer Science (Honours)",
  faculty: "Faculty of Science",
  year: "Year 2",
  status: "Full-time",
  gpa: 0,
  creditsCompleted: 90,
  creditsRequired: 360,
  expectedGraduation: "November 2026",
};

function buildProfileFromLoggedInUser(
  loggedInUser?: LoggedInUserProfile,
): StudentProfile {
  if (!loggedInUser) return defaultStudentProfile;

  const nameParts = loggedInUser.name.trim().split(/\s+/);
  const firstName = nameParts[0] || "Student";
  const lastName = nameParts.slice(1).join(" ") || "User";
  const emailLocal = `${firstName}.${lastName}`
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, "");

  return {
    id: loggedInUser.studentNumber,
    firstName,
    lastName,
    studentId: loggedInUser.studentNumber,
    email: `${emailLocal}@myuct.ac.za`,
    phone: "",
    dateOfBirth: "",
    enrollmentDate: "",
    program: loggedInUser.degree,
    faculty: "Faculty of Science",
    year: `Year ${loggedInUser.year}`,
    status: "Full-time",
    gpa: loggedInUser.gpa ?? 0,
    creditsCompleted: loggedInUser.creditsCompleted ?? 0,
    creditsRequired: 360,
    expectedGraduation: "",
  };
}

function getInitials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Profile({ onLogout, loggedInUser }: ProfileProps) {
  const isMobile = useIsMobile();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const [profile, setProfile] = useState<StudentProfile>(() =>
    buildProfileFromLoggedInUser(loggedInUser),
  );
  const [editedProfile, setEditedProfile] = useState<StudentProfile>(() =>
    buildProfileFromLoggedInUser(loggedInUser),
  );

  useEffect(() => {
    const nextProfile = buildProfileFromLoggedInUser(loggedInUser);
    setProfile(nextProfile);
    setEditedProfile(nextProfile);
    setIsEditing(false);
    setSaveError(null);
    setSaveNotice(null);
  }, [loggedInUser]);

  const handleEdit = () => {
    setIsEditing(true);
    setEditedProfile(profile);
    setSaveError(null);
    setSaveNotice(null);
  };

  const handleCancel = () => {
    setEditedProfile(profile);
    setIsEditing(false);
    setSaveError(null);
    setSaveNotice(null);
  };

  const handleSave = async () => {
    const studentNumber = (
      loggedInUser?.studentNumber || editedProfile.studentId
    )
      .trim()
      .toUpperCase();

    if (!studentNumber) {
      setSaveError("Missing student number for profile update.");
      return;
    }

    const joinedName =
      `${editedProfile.firstName} ${editedProfile.lastName}`.trim();
    const yearMatch = editedProfile.year.match(/\d+/);
    const parsedYear = yearMatch ? Number.parseInt(yearMatch[0], 10) : NaN;

    setIsSaving(true);
    setSaveError(null);
    setSaveNotice(null);

    try {
      const updated = await updateStudentProfile({
        student_number: studentNumber,
        name: joinedName || (loggedInUser?.name ?? "Bluprint Student"),
        degree:
          editedProfile.program.trim() ||
          (loggedInUser?.degree ?? "BSc Programme"),
        year:
          Number.isFinite(parsedYear) && parsedYear > 0
            ? parsedYear
            : (loggedInUser?.year ?? 1),
        majors: loggedInUser?.majors ?? [],
      });

      const nextProfile = buildProfileFromLoggedInUser({
        name: updated.name,
        studentNumber: updated.student_number,
        degree: updated.degree,
        year: updated.year,
        creditsCompleted: profile.creditsCompleted,
      });

      nextProfile.email = editedProfile.email;
      nextProfile.phone = editedProfile.phone;
      nextProfile.dateOfBirth = editedProfile.dateOfBirth;
      nextProfile.enrollmentDate = editedProfile.enrollmentDate;
      nextProfile.expectedGraduation = editedProfile.expectedGraduation;

      setProfile(nextProfile);
      setEditedProfile(nextProfile);
      setIsEditing(false);
      setSaveNotice("Profile saved.");
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Failed to save profile.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const updateField = (field: keyof StudentProfile, value: string) => {
    setEditedProfile((prev) => ({ ...prev, [field]: value }));
  };

  const progressPercent = Math.min(
    100,
    Math.round((profile.creditsCompleted / profile.creditsRequired) * 100),
  );

  const displayProfile = isEditing ? editedProfile : profile;

  // ─── Render helpers ─────────────────────────────────────────────────────
  const renderEditableField = (
    label: string,
    field: keyof StudentProfile,
    editable: boolean = true,
  ) => {
    const value = String(displayProfile[field]);
    return (
      <View key={field} style={styles.fieldRow}>
        <Text style={[styles.fieldLabel, !isMobile && styles.fieldLabelDesktop]}>{label}</Text>
        {isEditing && editable ? (
          <TextInput
            style={styles.fieldInput}
            value={value}
            onChangeText={(text) => updateField(field, text)}
            placeholderTextColor={theme.colors.textMuted}
          />
        ) : editable ? (
          <Text style={styles.fieldValue}>{value}</Text>
        ) : (
          <Text style={styles.fieldReadOnly}>{value}</Text>
        )}
      </View>
    );
  };

  const renderSettingRow = (
    label: string,
    onPress?: () => void,
    danger = false,
    isLast = false,
  ) => (
    <Pressable
      key={label}
      onPress={onPress}
      style={[styles.settingRow, isLast && styles.settingRowLast]}
    >
      <Text style={[styles.settingText, danger && styles.settingTextDanger]}>
        {label}
      </Text>
      <Text style={[styles.chevron, danger && styles.chevronDanger]}>›</Text>
    </Pressable>
  );

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <MainLayout>
      {/* ── Top nav with Edit / Save in the header row ── */}
      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderLeft}>
          <Text style={[styles.title, !isMobile && styles.titleDesktop]}>Profile</Text>
        </View>
        <View style={styles.pageHeaderRight}>
          {isEditing ? (
            <>
              <Pressable onPress={handleCancel} style={styles.headerCancelBtn}>
                <Text style={styles.headerCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleSave()}
                disabled={isSaving}
                style={[
                  styles.headerSaveBtn,
                  isSaving && styles.headerSaveBtnDisabled,
                ]}
              >
                <Text style={styles.headerSaveText}>
                  {isSaving ? "Saving…" : "Save"}
                </Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={handleEdit} style={styles.headerEditBtn}>
              <Text style={styles.headerEditText}>Edit</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Status banners */}
      {saveError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{saveError}</Text>
        </View>
      ) : null}
      {!saveError && saveNotice ? (
        <View style={styles.noticeBanner}>
          <Text style={styles.noticeBannerText}>{saveNotice}</Text>
        </View>
      ) : null}

      {/* ── Identity card ── */}
      <View style={[styles.idCard, !isMobile && styles.idCardDesktop]}>
        {/* Avatar */}
        <View style={[styles.avatar, !isMobile && styles.avatarDesktop]}>
          <Text style={[styles.avatarText, !isMobile && styles.avatarTextDesktop]}>
            {getInitials(displayProfile.firstName, displayProfile.lastName)}
          </Text>
        </View>

        {/* Name + tags */}
        <View style={[styles.idBody, !isMobile && styles.idBodyDesktop]}>
          <Text style={[styles.idName, !isMobile && styles.idNameDesktop]}>
            {displayProfile.firstName} {displayProfile.lastName}
          </Text>
          <Text style={[styles.idNumber, !isMobile && styles.idNumberDesktop]}>{profile.studentId} · myuct.ac.za</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.idTagsRow}
          >
            <View style={[styles.idTag, styles.idTagStatus]}>
              <View style={styles.statusDot} />
              <Text style={[styles.idTagText, styles.idTagStatusText]}>
                {profile.status}
              </Text>
            </View>
            <View style={styles.idTag}>
              <Text style={styles.idTagText}>{profile.year}</Text>
            </View>
            <View style={styles.idTag}>
              <Text style={styles.idTagText}>{profile.faculty}</Text>
            </View>
            {loggedInUser?.majors?.map((major) => (
              <View key={major} style={styles.idTag}>
                <Text style={styles.idTagText}>{major}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* ── Quick stats ── */}
      <View style={styles.statGrid}>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, !isMobile && styles.statValueDesktop]}>{profile.gpa.toFixed(1)}</Text>
          <Text style={styles.statLabel}>GPA / 100</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, !isMobile && styles.statValueDesktop]}>
            {!isMobile
              ? profile.year
              : `Y${profile.year.replace(/\D/g, "")}`}
          </Text>
          <Text style={styles.statLabel}>
            {!isMobile ? "Current year" : "Year"}
          </Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, !isMobile && styles.statValueDesktop]}>{progressPercent}%</Text>
          <Text style={styles.statLabel}>
            {!isMobile ? "Completed" : "Done"}
          </Text>
        </View>
      </View>

      {/* ── Degree progress ── */}
      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Degree progress</Text>
          <Text style={styles.progressValue}>
            {profile.creditsCompleted} / {profile.creditsRequired} cr
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${progressPercent}%` as any },
            ]}
          />
        </View>
        <Text style={styles.progressSub}>
          Expected graduation: {profile.expectedGraduation}
        </Text>
      </View>

      {/* ── Personal information ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Personal information</Text>
        {renderEditableField("First name", "firstName")}
        {renderEditableField("Last name", "lastName")}
        {renderEditableField("Date of birth", "dateOfBirth")}
        {renderEditableField("Email", "email")}
        {renderEditableField("Phone", "phone")}
      </View>

      {/* Cancel button below personal info on mobile — full width, easy tap target */}
      {isEditing && isMobile ? (
        <Pressable onPress={handleCancel} style={styles.cancelBarBtn}>
          <Text style={styles.cancelBarText}>Cancel editing</Text>
        </Pressable>
      ) : null}

      {/* ── Academic information (read-only) ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Academic information</Text>
        {renderEditableField("Student number", "studentId", false)}
        {renderEditableField("Programme", "program", false)}
        {renderEditableField("Faculty", "faculty", false)}
        {renderEditableField("Enrolled", "enrollmentDate", false)}
        {renderEditableField("Graduation", "expectedGraduation", false)}
      </View>

      {/* ── Account settings ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account settings</Text>
        {renderSettingRow("Change password")}
        {renderSettingRow("Notification preferences")}
        {renderSettingRow("Privacy & security")}
        {renderSettingRow(
          "Sign out",
          onLogout ? () => void onLogout() : undefined,
          true,
          true,
        )}
      </View>
    </MainLayout>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Page header
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  pageHeaderLeft: {
    flex: 1,
  },
  pageHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  titleDesktop: {
    fontSize: theme.fontSize.xxl,
  },

  // Header buttons
  headerEditBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    backgroundColor: theme.colors.card,
  },
  headerEditText: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  headerSaveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: theme.borderRadius.md,
    backgroundColor: "#185FA5",
  },
  headerSaveBtnDisabled: {
    opacity: 0.6,
  },
  headerSaveText: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: "#fff",
  },
  headerCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    backgroundColor: theme.colors.card,
  },
  headerCancelText: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },

  // Banners
  noticeBanner: {
    backgroundColor: "#E1F5EE",
    borderWidth: 1,
    borderColor: "#9FE1CB",
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    marginBottom: theme.spacing.md,
  },
  noticeBannerText: {
    fontSize: theme.fontSize.sm,
    color: "#085041",
    fontWeight: "600",
  },
  errorBanner: {
    backgroundColor: "#FCEBEB",
    borderWidth: 1,
    borderColor: "#F7C1C1",
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    marginBottom: theme.spacing.md,
  },
  errorBannerText: {
    fontSize: theme.fontSize.sm,
    color: "#B3261E",
    fontWeight: "600",
  },

  // Identity card
  idCard: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    alignItems: "center",
    flexDirection: "column",
    gap: 10,
  },
  idCardDesktop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 16,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 99,
    backgroundColor: "#185FA5",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarDesktop: {
    width: 64,
    height: 64,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: "500",
    color: "#fff",
  },
  avatarTextDesktop: {
    fontSize: 22,
  },
  idBody: {
    flex: undefined,
    alignItems: "center",
    gap: 4,
    minWidth: 0,
  },
  idBodyDesktop: {
    flex: 1,
    alignItems: "flex-start",
  },
  idName: {
    fontSize: 16,
    fontWeight: "500",
    color: theme.colors.textPrimary,
    textAlign: "center",
  },
  idNameDesktop: {
    fontSize: 18,
    textAlign: "left",
  },
  idNumber: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  idNumberDesktop: {
    textAlign: "left",
  },
  idTagsRow: {
    gap: 5,
    paddingTop: 4,
    flexDirection: "row",
    alignItems: "center",
  },
  idTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    backgroundColor: theme.colors.grayLight,
  },
  idTagStatus: {
    backgroundColor: "#E1F5EE",
    borderColor: "#9FE1CB",
  },
  idTagText: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    fontWeight: "500",
  },
  idTagStatusText: {
    color: "#085041",
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 99,
    backgroundColor: "#1D9E75",
  },

  // Stats
  statGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: theme.spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "500",
    color: theme.colors.textPrimary,
  },
  statValueDesktop: {
    fontSize: 20,
  },
  statLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },

  // Progress
  progressSection: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    gap: 6,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  progressLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  progressValue: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  progressTrack: {
    height: 6,
    borderRadius: 99,
    backgroundColor: theme.colors.grayLight,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 99,
    backgroundColor: "#085041",
  },
  progressSub: {
    fontSize: 10,
    color: theme.colors.textLight,
    textAlign: "right",
  },

  // Section wrapper
  section: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    borderRadius: theme.borderRadius.lg,
    overflow: "hidden",
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    paddingHorizontal: theme.spacing.md,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.glassBorder,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },

  // Field rows
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.glassBorder,
    gap: 8,
  },
  fieldLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    width: 106,
    flexShrink: 0,
  },
  fieldLabelDesktop: {
    width: 150,
  },
  fieldValue: {
    fontSize: 13,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  fieldInput: {
    fontSize: 13,
    color: theme.colors.textPrimary,
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.blue,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: theme.colors.grayLight,
  },
  fieldReadOnly: {
    fontSize: 13,
    color: theme.colors.textLight,
    flex: 1,
  },

  // Mobile cancel bar
  cancelBarBtn: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  cancelBarText: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },

  // Setting rows
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.glassBorder,
  },
  settingRowLast: {
    borderBottomWidth: 0,
  },
  settingText: {
    fontSize: 13,
    color: theme.colors.textPrimary,
  },
  settingTextDanger: {
    color: "#B3261E",
  },
  chevron: {
    fontSize: 18,
    color: theme.colors.textLight,
    lineHeight: 20,
  },
  chevronDanger: {
    color: "#B3261E",
  },
});
