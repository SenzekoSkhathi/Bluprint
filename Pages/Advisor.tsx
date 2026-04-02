// ...existing code...
import MainLayout from "@/components/main-layout";
import { theme } from "@/constants/theme";
import {
  getScienceAdvisors,
  type ScienceAdvisorEntry,
} from "@/services/backend-api";
import { useIsMobile } from "@/hooks/use-is-mobile";
import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";

// ─── Types ────────────────────────────────────────────────────────────────────
type MeetingType = "in-person" | "phone" | "video";

interface BookingState {
  advisor: ScienceAdvisorEntry;
  meetingType: MeetingType;
  selectedDate: string | null;
  selectedTime: string | null;
  reason: string;
}

type BookingStep = "selecting" | "confirmed";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getInitials(name: string): string {
  const cleaned = name.replace(/^(Dr|Prof\.|Mr|Ms)\s/i, "").trim();
  const parts = cleaned.split(" ");
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function getUpcomingWeekdays(count: number): Date[] {
  const days: Date[] = [];
  const today = new Date();
  let offset = 1;
  while (days.length < count) {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    offset++;
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      days.push(d);
    }
  }
  return days;
}

function formatDateShort(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatDateLong(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  "in-person": "In person",
  phone: "Phone call",
  video: "Video call",
};

const MEETING_TYPE_EMOJI: Record<MeetingType, string> = {
  "in-person": "🏢",
  phone: "📞",
  video: "💻",
};

// Mock booked slots — in production these would come from the advisor's calendar API
const BOOKED_SLOTS = new Set(["08:30", "10:00", "11:30", "15:30"]);

const ALL_SLOTS = [
  "08:30",
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Component ────────────────────────────────────────────────────────────────
export default function Advisor() {
  const isMobile = useIsMobile();
  const [advisors, setAdvisors] = useState<ScienceAdvisorEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedArea, setSelectedArea] = useState<string>("All");

  // Booking state
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingStep, setBookingStep] = useState<BookingStep>("selecting");
  const [booking, setBooking] = useState<BookingState | null>(null);

  const weekdays = useMemo(() => getUpcomingWeekdays(5), []);

  useEffect(() => {
    getScienceAdvisors()
      .then((response) => {
        setAdvisors(response.advisors);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to load advisors.",
        );
        setLoading(false);
      });
  }, []);

  const areas = useMemo(() => {
    const unique = Array.from(new Set(advisors.map((a) => a.area))).sort();
    return ["All", ...unique];
  }, [advisors]);

  const filteredAdvisors = useMemo(() => {
    if (selectedArea === "All") return advisors;
    return advisors.filter((a) => a.area === selectedArea);
  }, [advisors, selectedArea]);

  // ─── Booking handlers ──────────────────────────────────────────────────────
  const openBooking = (advisor: ScienceAdvisorEntry) => {
    setBooking({
      advisor,
      meetingType: "in-person",
      selectedDate: null,
      selectedTime: null,
      reason: "",
    });
    setBookingStep("selecting");
    setBookingOpen(true);
  };

  const closeBooking = () => {
    setBookingOpen(false);
    setBooking(null);
  };

  const updateBooking = (patch: Partial<BookingState>) => {
    setBooking((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const confirmBooking = () => {
    if (!booking?.selectedDate || !booking?.selectedTime) return;
    setBookingStep("confirmed");
  };

  const canConfirm =
    Boolean(booking?.selectedDate) && Boolean(booking?.selectedTime);

  const confirmLabel = useMemo(() => {
    if (!booking?.selectedDate || !booking?.selectedTime) {
      return "Select a date and time to continue";
    }
    return `Confirm — ${formatDateLong(booking.selectedDate)} at ${booking.selectedTime}`;
  }, [booking?.selectedDate, booking?.selectedTime]);

  // ─── Render helpers ────────────────────────────────────────────────────────
  const renderAdvisorCard = (advisor: ScienceAdvisorEntry, index: number) => {
    const isSenior = advisor.tier === "senior";
    return (
      <View
        key={`${advisor.email}-${index}`}
        style={[styles.advisorCard, isSenior && styles.advisorCardSenior]}
      >
        <View style={[styles.cardMain, !isMobile && styles.cardMainDesktop]}>
          {/* Avatar */}
          <View style={[styles.avatar, !isMobile && styles.avatarDesktop]}>
            <Text style={[styles.avatarText, !isMobile && styles.avatarTextDesktop]}>{getInitials(advisor.name)}</Text>
          </View>

          {/* Info */}
          <View style={styles.advisorInfo}>
            <View style={styles.advisorTop}>
              <Text style={[styles.advisorName, !isMobile && styles.advisorNameDesktop]} numberOfLines={1}>
                {advisor.name}
              </Text>
              <View
                style={[
                  styles.tierBadge,
                  isSenior ? styles.tierBadgeSenior : styles.tierBadgeStandard,
                ]}
              >
                <Text
                  style={[
                    styles.tierBadgeText,
                    isSenior
                      ? styles.tierBadgeTextSenior
                      : styles.tierBadgeTextStandard,
                  ]}
                >
                  {isSenior ? "Senior" : "Advisor"}
                </Text>
              </View>
            </View>

            <Text style={styles.advisorArea}>{advisor.area}</Text>

            <View style={styles.metaGroup}>
              <Text style={[styles.metaText, !isMobile && styles.metaTextDesktop]}>📍 {advisor.room}</Text>
              <Text style={[styles.metaText, !isMobile && styles.metaTextDesktop]}>✉ {advisor.email}</Text>
            </View>

            {advisor.note ? (
              <Text style={[styles.advisorNote, !isMobile && styles.advisorNoteDesktop]}>{advisor.note}</Text>
            ) : null}
          </View>
        </View>

        {/* Book button */}
        <View style={[styles.cardFooter, !isMobile && styles.cardFooterDesktop]}>
          <Pressable
            onPress={() => openBooking(advisor)}
            style={[styles.bookBtn, !isMobile && styles.bookBtnDesktop]}
          >
            <Text style={[styles.bookBtnText, !isMobile && styles.bookBtnTextDesktop]}>Book meeting</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderBookingSheet = () => {
    if (!booking) return null;

    return (
      <Modal
        visible={bookingOpen}
        transparent
        animationType="slide"
        onRequestClose={closeBooking}
      >
        <TouchableWithoutFeedback onPress={closeBooking}>
          <View style={[styles.sheetBackdrop, !isMobile && styles.sheetBackdropDesktop]}>
            <TouchableWithoutFeedback>
              <View style={[styles.sheet, !isMobile && styles.sheetDesktop]}>
                {/* Handle */}
                <View style={styles.sheetHandle} />

                {/* Header */}
                <View style={styles.sheetHeader}>
                  <View style={styles.sheetHeaderLeft}>
                    <Text style={styles.sheetTitle}>
                      Book with {booking.advisor.name.split(" ").slice(-1)[0]}
                    </Text>
                    <Text style={styles.sheetSub}>
                      {booking.advisor.area} · choose type, date &amp; time
                    </Text>
                  </View>
                  <Pressable
                    onPress={closeBooking}
                    style={styles.sheetClose}
                    hitSlop={8}
                  >
                    <Text style={styles.sheetCloseText}>✕</Text>
                  </Pressable>
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.sheetScrollContent}
                >
                  {bookingStep === "confirmed" ? (
                    // ── Success state ──
                    <View style={styles.successBox}>
                      <View style={styles.successIcon}>
                        <Text style={styles.successIconText}>✓</Text>
                      </View>
                      <Text style={styles.successTitle}>Meeting booked!</Text>
                      <Text style={styles.successDetail}>
                        {booking.advisor.name}
                        {"\n"}
                        {formatDateLong(booking.selectedDate!)} at{" "}
                        {booking.selectedTime}
                        {"\n"}
                        {MEETING_TYPE_LABELS[booking.meetingType]}
                      </Text>
                      <Text style={styles.successSub}>
                        A confirmation has been sent to your UCT email address.
                      </Text>
                      <Pressable onPress={closeBooking} style={styles.doneBtn}>
                        <Text style={styles.doneBtnText}>Done</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <>
                      {/* Meeting type */}
                      <View style={styles.bookingSection}>
                        <Text style={styles.sectionLabel}>Meeting type</Text>
                        <View style={styles.typeRow}>
                          {(
                            ["in-person", "phone", "video"] as MeetingType[]
                          ).map((type) => (
                            <Pressable
                              key={type}
                              onPress={() =>
                                updateBooking({ meetingType: type })
                              }
                              style={[
                                styles.typePill,
                                booking.meetingType === type &&
                                  styles.typePillActive,
                              ]}
                            >
                              <Text style={styles.typePillEmoji}>
                                {MEETING_TYPE_EMOJI[type]}
                              </Text>
                              <Text
                                style={[
                                  styles.typePillLabel,
                                  booking.meetingType === type &&
                                    styles.typePillLabelActive,
                                ]}
                              >
                                {!isMobile
                                  ? MEETING_TYPE_LABELS[type]
                                  : type === "in-person"
                                    ? "In person"
                                    : type === "phone"
                                      ? "Phone"
                                      : "Video"}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>

                      {/* Date */}
                      <View style={styles.bookingSection}>
                        <Text style={styles.sectionLabel}>Date</Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.dateStripContent}
                        >
                          {weekdays.map((date) => {
                            const dateStr = date.toISOString().slice(0, 10);
                            const isActive = booking.selectedDate === dateStr;
                            return (
                              <Pressable
                                key={dateStr}
                                onPress={() =>
                                  updateBooking({ selectedDate: dateStr })
                                }
                                style={[
                                  styles.dateBtn,
                                  isActive && styles.dateBtnActive,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.dateBtnDay,
                                    isActive && styles.dateBtnDayActive,
                                  ]}
                                >
                                  {WEEKDAYS[date.getDay()]}
                                </Text>
                                <Text
                                  style={[
                                    styles.dateBtnNum,
                                    isActive && styles.dateBtnNumActive,
                                  ]}
                                >
                                  {date.getDate()}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                      </View>

                      {/* Time slots */}
                      <View style={styles.bookingSection}>
                        <Text style={styles.sectionLabel}>Available slots</Text>
                        <View style={styles.timeGrid}>
                          {ALL_SLOTS.map((slot) => {
                            const isBooked = BOOKED_SLOTS.has(slot);
                            const isActive = booking.selectedTime === slot;
                            return (
                              <Pressable
                                key={slot}
                                onPress={() =>
                                  !isBooked &&
                                  updateBooking({ selectedTime: slot })
                                }
                                style={[
                                  styles.timeSlot,
                                  !isMobile && styles.timeSlotDesktop,
                                  isActive && styles.timeSlotActive,
                                  isBooked && styles.timeSlotBooked,
                                ]}
                                disabled={isBooked}
                              >
                                <Text
                                  style={[
                                    styles.timeSlotText,
                                    isActive && styles.timeSlotTextActive,
                                    isBooked && styles.timeSlotTextBooked,
                                  ]}
                                >
                                  {slot}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>

                      {/* Reason */}
                      <View style={styles.bookingSection}>
                        <Text style={styles.sectionLabel}>
                          Reason{" "}
                          <Text style={styles.sectionLabelOptional}>
                            (optional)
                          </Text>
                        </Text>
                        <TextInput
                          style={styles.reasonInput}
                          value={booking.reason}
                          onChangeText={(text) =>
                            updateBooking({ reason: text })
                          }
                          placeholder="e.g. Year 3 course selection, major requirements…"
                          placeholderTextColor={theme.colors.textMuted}
                          multiline
                          numberOfLines={2}
                        />
                      </View>

                      {/* Confirm button */}
                      <Pressable
                        onPress={confirmBooking}
                        disabled={!canConfirm}
                        style={[
                          styles.confirmBtn,
                          !canConfirm && styles.confirmBtnDisabled,
                        ]}
                      >
                        <Text
                          style={[
                            styles.confirmBtnText,
                            !canConfirm && styles.confirmBtnTextDisabled,
                          ]}
                        >
                          {confirmLabel}
                        </Text>
                      </Pressable>
                    </>
                  )}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <MainLayout>
      {/* Page header */}
      <View style={styles.pageHeader}>
        <Text style={[styles.title, !isMobile && styles.titleDesktop]}>Student advisors</Text>
        <Text style={styles.subtitle}>
          Book a meeting with a Science Faculty advisor for academic guidance.
        </Text>
      </View>

      {/* Info banner */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoBannerIcon}>ℹ</Text>
        <Text style={styles.infoBannerText}>
          Save your Bluprint plan first — advisors review it before your meeting
          for a more productive session.
        </Text>
      </View>

      {loading ? (
        <Text style={styles.stateText}>Loading advisors…</Text>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <>
          {/* Area filter */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
            contentContainerStyle={styles.filterContent}
          >
            {areas.map((area) => {
              const isActive = selectedArea === area;
              // Shorten long names on mobile
              const label =
                isMobile && area === "Computer Science"
                  ? "CS"
                  : isMobile && area === "Mathematics"
                    ? "Maths"
                    : area;
              return (
                <Pressable
                  key={area}
                  onPress={() => setSelectedArea(area)}
                  style={[
                    styles.filterPill,
                    !isMobile && styles.filterPillDesktop,
                    isActive && styles.filterPillActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      !isMobile && styles.filterPillTextDesktop,
                      isActive && styles.filterPillTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Advisor list */}
          {filteredAdvisors.length === 0 ? (
            <Text style={styles.stateText}>
              No advisors found for this area.
            </Text>
          ) : (
            <View style={styles.advisorList}>
              {filteredAdvisors.map(renderAdvisorCard)}
            </View>
          )}
        </>
      )}

      {/* Booking sheet / modal */}
      {renderBookingSheet()}
    </MainLayout>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Page header
  pageHeader: {
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: 3,
  },
  titleDesktop: {
    fontSize: theme.fontSize.xxl,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
    lineHeight: 20,
  },

  // Info banner
  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#E6F1FB",
    borderWidth: 1,
    borderColor: "#B5D4F4",
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    marginBottom: theme.spacing.md,
  },
  infoBannerIcon: {
    fontSize: 14,
    color: "#185FA5",
    marginTop: 1,
    flexShrink: 0,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 12,
    color: "#0C447C",
    lineHeight: 18,
  },

  // State text
  stateText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.sm,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: "#B3261E",
    marginTop: theme.spacing.sm,
  },

  // Filter
  filterScroll: {
    marginBottom: theme.spacing.md,
  },
  filterContent: {
    gap: 5,
    paddingRight: theme.spacing.sm,
    alignItems: "center",
  },
  filterPill: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    backgroundColor: theme.colors.card,
    justifyContent: "center",
  },
  filterPillDesktop: {
    height: 36,
    paddingHorizontal: 16,
  },
  filterPillActive: {
    backgroundColor: "#E6F1FB",
    borderColor: "#B5D4F4",
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  filterPillTextDesktop: {
    fontSize: 13,
  },
  filterPillTextActive: {
    color: "#0C447C",
  },

  // Advisor list
  advisorList: {
    gap: 8,
  },

  // Advisor card
  advisorCard: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    borderRadius: theme.borderRadius.lg,
    overflow: "hidden",
  },
  advisorCardSenior: {
    borderLeftWidth: 3,
    borderLeftColor: "#185FA5",
  },
  cardMain: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
  },
  cardMainDesktop: {
    gap: 14,
    padding: 16,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 99,
    backgroundColor: "#E6F1FB",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarDesktop: {
    width: 44,
    height: 44,
  },
  avatarText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#0C447C",
  },
  avatarTextDesktop: {
    fontSize: 14,
  },
  advisorInfo: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  advisorTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 6,
  },
  advisorName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.textPrimary,
  },
  advisorNameDesktop: {
    fontSize: 14,
  },
  tierBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 99,
    flexShrink: 0,
  },
  tierBadgeSenior: {
    backgroundColor: "#E6F1FB",
  },
  tierBadgeStandard: {
    backgroundColor: theme.colors.grayLight,
  },
  tierBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  tierBadgeTextSenior: {
    color: "#0C447C",
  },
  tierBadgeTextStandard: {
    color: theme.colors.textSecondary,
  },
  advisorArea: {
    fontSize: 12,
    fontWeight: "600",
    color: "#185FA5",
  },
  metaGroup: {
    gap: 2,
    marginTop: 2,
  },
  metaText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  metaTextDesktop: {
    fontSize: 12,
  },
  advisorNote: {
    fontSize: 10,
    color: theme.colors.textLight,
    fontStyle: "italic",
    marginTop: 3,
  },
  advisorNoteDesktop: {
    fontSize: 12,
  },
  cardFooter: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    alignItems: "flex-end",
  },
  cardFooterDesktop: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  bookBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: "#B5D4F4",
    backgroundColor: "#E6F1FB",
  },
  bookBtnDesktop: {
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  bookBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0C447C",
  },
  bookBtnTextDesktop: {
    fontSize: 13,
  },

  // ── Booking sheet / modal ─────────────────────────────────────────────────
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
    alignItems: "stretch",
  },
  sheetBackdropDesktop: {
    justifyContent: "center",
    alignItems: "center",
  },
  sheet: {
    backgroundColor: theme.colors.white,
    borderRadius: 20,
    paddingHorizontal: theme.spacing.md,
    paddingTop: 12,
    paddingBottom: 32,
    maxHeight: "88%",
    width: "100%",
  },
  sheetDesktop: {
    borderRadius: theme.borderRadius.lg,
    paddingBottom: 24,
    maxHeight: "90%",
    width: 480,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 99,
    backgroundColor: theme.colors.gray,
    alignSelf: "center",
    marginBottom: 12,
  },
  sheetScrollContent: {
    gap: 16,
    paddingBottom: 8,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  sheetHeaderLeft: {
    flex: 1,
    gap: 2,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: theme.colors.textPrimary,
  },
  sheetSub: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  sheetClose: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    backgroundColor: theme.colors.grayLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sheetCloseText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },

  // Booking sections
  bookingSection: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  sectionLabelOptional: {
    fontSize: 11,
    color: theme.colors.textLight,
    fontWeight: "400",
    textTransform: "none",
    letterSpacing: 0,
  },

  // Meeting type
  typeRow: {
    flexDirection: "row",
    gap: 6,
  },
  typePill: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    backgroundColor: theme.colors.grayLight,
    alignItems: "center",
    gap: 3,
  },
  typePillActive: {
    backgroundColor: "#E6F1FB",
    borderColor: "#B5D4F4",
  },
  typePillEmoji: {
    fontSize: 16,
  },
  typePillLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  typePillLabelActive: {
    color: "#0C447C",
  },

  // Date strip
  dateStripContent: {
    gap: 5,
    paddingRight: theme.spacing.sm,
  },
  dateBtn: {
    alignItems: "center",
    gap: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    backgroundColor: theme.colors.grayLight,
    minWidth: 46,
  },
  dateBtnActive: {
    backgroundColor: "#E6F1FB",
    borderColor: "#B5D4F4",
  },
  dateBtnDay: {
    fontSize: 10,
    fontWeight: "500",
    color: theme.colors.textSecondary,
  },
  dateBtnDayActive: {
    color: "#0C447C",
  },
  dateBtnNum: {
    fontSize: 17,
    fontWeight: "500",
    color: theme.colors.textPrimary,
  },
  dateBtnNumActive: {
    color: "#0C447C",
  },

  // Time slots
  timeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  timeSlot: {
    width: "30%",
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    backgroundColor: theme.colors.grayLight,
    alignItems: "center",
  },
  timeSlotDesktop: {
    flex: 0,
    minWidth: 80,
  },
  timeSlotActive: {
    backgroundColor: "#E6F1FB",
    borderColor: "#B5D4F4",
  },
  timeSlotBooked: {
    opacity: 0.3,
  },
  timeSlotText: {
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.textPrimary,
  },
  timeSlotTextActive: {
    color: "#0C447C",
  },
  timeSlotTextBooked: {
    textDecorationLine: "line-through",
    color: theme.colors.textLight,
  },

  // Reason input
  reasonInput: {
    fontSize: 13,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: theme.colors.grayLight,
    lineHeight: 20,
    minHeight: 60,
    textAlignVertical: "top",
  },

  // Confirm button
  confirmBtn: {
    backgroundColor: "#185FA5",
    borderRadius: theme.borderRadius.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  confirmBtnDisabled: {
    backgroundColor: theme.colors.grayLight,
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  confirmBtnTextDisabled: {
    color: theme.colors.textLight,
  },

  // Success state
  successBox: {
    alignItems: "center",
    gap: 10,
    paddingVertical: theme.spacing.md,
    backgroundColor: "#E1F5EE",
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: "#9FE1CB",
    padding: theme.spacing.md,
  },
  successIcon: {
    width: 40,
    height: 40,
    borderRadius: 99,
    backgroundColor: "#1D9E75",
    alignItems: "center",
    justifyContent: "center",
  },
  successIconText: {
    fontSize: 18,
    color: "#fff",
    fontWeight: "600",
  },
  successTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#085041",
  },
  successDetail: {
    fontSize: 13,
    color: "#0F6E56",
    textAlign: "center",
    lineHeight: 20,
  },
  successSub: {
    fontSize: 11,
    color: "#1D9E75",
    textAlign: "center",
    lineHeight: 16,
  },
  doneBtn: {
    marginTop: 4,
    paddingVertical: 9,
    paddingHorizontal: 32,
    borderRadius: theme.borderRadius.md,
    backgroundColor: "#1D9E75",
  },
  doneBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
});
