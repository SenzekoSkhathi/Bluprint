import { useAuth } from "@/contexts/auth-context";
import { mockUsers } from "@/mocks/users";
import {
  getStudentPlan,
  getStudentProfile,
  type StudentPlanResponse,
  type StudentProfileResponse,
} from "@/services/backend-api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface LoggedInUser {
  name: string;
  studentNumber: string;
  degree: string;
  year: number;
  majors: string[];
}

export type LoggedInUserSyncStatus =
  | "idle"
  | "loading"
  | "synced"
  | "fallback"
  | "error";

export type GuidanceTrustMode =
  | "live-backend"
  | "fallback-generated"
  | "backend-unavailable"
  | "stale-data";

export interface GuidanceTrustMessage {
  mode: GuidanceTrustMode;
  title: string;
  message: string;
  lastSyncedLabel?: string;
  backendBacked: boolean;
}

interface GuidanceTrustInput {
  syncStatus: LoggedInUserSyncStatus;
  syncError?: string | null;
  lastSyncedAt?: string | null;
  hasSession: boolean;
  hasFallbackData?: boolean;
  staleAfterMinutes?: number;
}

const BACKEND_UNAVAILABLE_MESSAGE =
  "Backend unavailable: live backend guidance could not be reached.";
const FALLBACK_MODE_MESSAGE =
  "Fallback mode: guidance is generated from local fallback data.";
const STALE_DATA_MESSAGE =
  "Stale data: this guidance is based on an older sync snapshot.";

function toLastSyncedLabel(lastSyncedAt?: string | null): string | null {
  if (!lastSyncedAt) {
    return null;
  }

  const parsed = new Date(lastSyncedAt);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleString();
}

export function buildGuidanceTrustMessage({
  syncStatus,
  syncError,
  lastSyncedAt,
  hasSession,
  hasFallbackData = false,
  staleAfterMinutes = 30,
}: GuidanceTrustInput): GuidanceTrustMessage {
  const lastSyncedLabel = toLastSyncedLabel(lastSyncedAt);
  const isStale = Boolean(
    lastSyncedAt &&
    new Date().getTime() - new Date(lastSyncedAt).getTime() >
      staleAfterMinutes * 60 * 1000,
  );

  if (!hasSession) {
    return {
      mode: "fallback-generated",
      title: "Fallback mode active",
      message:
        "Fallback mode: no signed-in student session is active, so guidance is local-only.",
      backendBacked: false,
    };
  }

  if (syncStatus === "loading") {
    return {
      mode: "live-backend",
      title: "Checking backend",
      message:
        "Refreshing from backend now. Guidance will switch to live backend-backed data when sync completes.",
      lastSyncedLabel: lastSyncedLabel ?? undefined,
      backendBacked: true,
    };
  }

  if (syncStatus === "error") {
    return {
      mode: "backend-unavailable",
      title: "Backend unavailable",
      message: `${BACKEND_UNAVAILABLE_MESSAGE} ${syncError ?? "Using local fallback guidance until backend connectivity returns."}`,
      lastSyncedLabel: lastSyncedLabel ?? undefined,
      backendBacked: false,
    };
  }

  if (syncStatus === "fallback" || hasFallbackData) {
    return {
      mode: "fallback-generated",
      title: "Fallback guidance",
      message: `${FALLBACK_MODE_MESSAGE}${syncError ? ` ${syncError}` : ""}${lastSyncedLabel ? ` Last synced: ${lastSyncedLabel}.` : ""}`,
      lastSyncedLabel: lastSyncedLabel ?? undefined,
      backendBacked: false,
    };
  }

  if ((syncStatus === "synced" || syncStatus === "idle") && isStale) {
    return {
      mode: "stale-data",
      title: "Stale backend data",
      message: `${STALE_DATA_MESSAGE}${lastSyncedLabel ? ` Last synced: ${lastSyncedLabel}.` : ""}`,
      lastSyncedLabel: lastSyncedLabel ?? undefined,
      backendBacked: true,
    };
  }

  return {
    mode: "live-backend",
    title: "Live backend guidance",
    message: lastSyncedLabel
      ? `Live backend-backed guidance. Last synced: ${lastSyncedLabel}.`
      : "Live backend-backed guidance.",
    lastSyncedLabel: lastSyncedLabel ?? undefined,
    backendBacked: true,
  };
}

function normalizeMajors(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0),
    ),
  );
}

function buildFallbackProfile(
  studentNumber: string,
  mockUser: (typeof mockUsers)[number] | null,
): StudentProfileResponse {
  if (mockUser) {
    return {
      name: mockUser.name,
      student_number: mockUser.studentNumber,
      degree: mockUser.degree,
      year: mockUser.year,
      majors: [...mockUser.majors],
    };
  }

  return {
    name: "Bluprint Student",
    student_number: studentNumber,
    degree: "BSc Programme",
    year: 1,
    majors: [],
  };
}

export function useLoggedInUser() {
  const { session } = useAuth();
  const requestSequenceRef = useRef(0);
  const [profile, setProfile] = useState<StudentProfileResponse | null>(null);
  const [savedPlan, setSavedPlan] = useState<StudentPlanResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<LoggedInUserSyncStatus>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const mockUser = useMemo(() => {
    if (!session) {
      return null;
    }

    return (
      mockUsers.find((user) => user.studentNumber === session.studentNumber) ??
      null
    );
  }, [session]);

  const refresh = useCallback(() => {
    if (!session) {
      setProfile(null);
      setSavedPlan(null);
      setIsLoading(false);
      setSyncStatus("idle");
      setSyncError(null);
      setLastSyncedAt(null);
      return Promise.resolve();
    }

    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;

    setIsLoading(true);
    setSyncStatus("loading");
    setSyncError(null);

    return Promise.allSettled([
      getStudentProfile({ student_number: session.studentNumber }),
      getStudentPlan({ student_number: session.studentNumber }),
    ]).then((results) => {
      if (requestSequenceRef.current !== requestId) {
        return;
      }

      const [profileResult, planResult] = results;
      const nextErrorMessages: string[] = [];
      let successfulFetchCount = 0;

      if (profileResult.status === "fulfilled") {
        setProfile(profileResult.value);
        successfulFetchCount += 1;
      } else {
        setProfile(null);
        nextErrorMessages.push(
          profileResult.reason instanceof Error
            ? profileResult.reason.message
            : "Could not load student profile.",
        );
      }

      if (planResult.status === "fulfilled") {
        setSavedPlan(planResult.value);
        successfulFetchCount += 1;
      } else {
        setSavedPlan(null);
        nextErrorMessages.push(
          planResult.reason instanceof Error
            ? planResult.reason.message
            : "Could not load saved plan.",
        );
      }

      setIsLoading(false);

      if (successfulFetchCount === 2) {
        setSyncStatus("synced");
        setSyncError(null);
        setLastSyncedAt(new Date().toISOString());
        return;
      }

      if (successfulFetchCount > 0 || mockUser) {
        setSyncStatus("fallback");
        setSyncError(nextErrorMessages.join(" "));
        if (successfulFetchCount > 0) {
          setLastSyncedAt(new Date().toISOString());
        }
        return;
      }

      setSyncStatus("error");
      setSyncError(nextErrorMessages.join(" "));
    });
  }, [mockUser, session]);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      setSavedPlan(null);
      setIsLoading(false);
      setSyncStatus("idle");
      setSyncError(null);
      setLastSyncedAt(null);
      return;
    }

    void refresh();
  }, [refresh, session]);

  const resolvedProfile = useMemo<StudentProfileResponse | undefined>(() => {
    if (!session) {
      return undefined;
    }

    return profile ?? buildFallbackProfile(session.studentNumber, mockUser);
  }, [mockUser, profile, session]);

  const loggedInUser = useMemo<LoggedInUser | undefined>(() => {
    if (!resolvedProfile) {
      return undefined;
    }

    return {
      name: resolvedProfile.name?.trim() || "Bluprint Student",
      studentNumber:
        resolvedProfile.student_number?.trim().toUpperCase() ||
        session?.studentNumber ||
        "",
      degree: resolvedProfile.degree?.trim() || "BSc Programme",
      year:
        Number.isFinite(resolvedProfile.year) && resolvedProfile.year > 0
          ? resolvedProfile.year
          : 1,
      majors: normalizeMajors(resolvedProfile.majors),
    };
  }, [resolvedProfile, session]);

  const resolvedPlan = useMemo<StudentPlanResponse | undefined>(() => {
    if (!session) {
      return undefined;
    }

    return savedPlan ?? undefined;
  }, [savedPlan, session]);

  const trustMessage = useMemo(
    () =>
      buildGuidanceTrustMessage({
        syncStatus,
        syncError,
        lastSyncedAt,
        hasSession: Boolean(session),
        hasFallbackData: Boolean(mockUser),
      }),
    [lastSyncedAt, mockUser, session, syncError, syncStatus],
  );

  return {
    loggedInUser,
    mockUser,
    profile: resolvedProfile,
    savedPlan: resolvedPlan,
    isLoading,
    syncStatus,
    syncError,
    lastSyncedAt,
    trustMessage,
    refresh,
  };
}
