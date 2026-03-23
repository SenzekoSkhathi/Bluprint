import {
    loginStudent,
    logoutAuthSession,
    validateAuthSession,
} from "@/services/backend-api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";

const AUTH_STORAGE_KEY = "bluprint.auth.session.v1";
const STUDENT_NUMBER_PATTERN = /^[A-Z]{6}\d{3}$/;

function normalizeStudentNumber(value: string) {
  return value.trim().toUpperCase();
}

interface AuthSession {
  studentNumber: string;
  accessToken: string;
  expiresAtIso: string;
  loggedInAt: string;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isReady: boolean;
  session: AuthSession | null;
  login: (studentNumber: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);

  const persistSession = useCallback(async (nextSession: AuthSession) => {
    const serializedSession = JSON.stringify(nextSession);

    try {
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, serializedSession);
      return;
    } catch (error) {
      console.warn("AsyncStorage unavailable, trying SecureStore:", error);
    }

    try {
      await SecureStore.setItemAsync(AUTH_STORAGE_KEY, serializedSession);
    } catch (error) {
      console.warn("Auth session persistence unavailable:", error);
    }
  }, []);

  const clearPersistedSession = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // Ignore and still try SecureStore cleanup below.
    }

    try {
      await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
    } catch (error) {
      console.warn("Auth session cleanup unavailable:", error);
    }
  }, []);

  useEffect(() => {
    const hydrate = async () => {
      let raw: string | null = null;

      try {
        raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      } catch {
        raw = null;
      }

      if (!raw) {
        try {
          raw = await SecureStore.getItemAsync(AUTH_STORAGE_KEY);
        } catch {
          raw = null;
        }
      }

      if (raw) {
        try {
          const parsed = JSON.parse(raw) as AuthSession;
          if (
            parsed?.studentNumber &&
            parsed?.accessToken &&
            parsed?.expiresAtIso
          ) {
            try {
              const validated = await validateAuthSession({
                access_token: parsed.accessToken,
              });

              const nextSession: AuthSession = {
                studentNumber: validated.student_number,
                accessToken: validated.access_token,
                expiresAtIso: validated.expires_at_iso,
                loggedInAt: parsed.loggedInAt || new Date().toISOString(),
              };

              setSession(nextSession);
              await persistSession(nextSession);
            } catch {
              await clearPersistedSession();
              setSession(null);
            }
          } else {
            setSession(null);
          }
        } catch {
          setSession(null);
        }
      }

      setIsReady(true);
    };

    hydrate();
  }, [clearPersistedSession, persistSession]);

  const login = useCallback(
    async (studentNumber: string, password: string) => {
      const normalizedStudentNumber = normalizeStudentNumber(studentNumber);

      if (!normalizedStudentNumber || !password.trim()) {
        throw new Error("Student number and password are required");
      }

      if (!STUDENT_NUMBER_PATTERN.test(normalizedStudentNumber)) {
        throw new Error("Student number must match format XYZABC123");
      }

      const authResult = await loginStudent({
        student_number: normalizedStudentNumber,
        password,
      });

      const nextSession: AuthSession = {
        studentNumber: authResult.student_number,
        accessToken: authResult.access_token,
        expiresAtIso: authResult.expires_at_iso,
        loggedInAt: new Date().toISOString(),
      };

      await persistSession(nextSession);
      setSession(nextSession);
    },
    [persistSession],
  );

  const logout = useCallback(async () => {
    if (session?.accessToken) {
      try {
        await logoutAuthSession({ access_token: session.accessToken });
      } catch {
        // Keep local logout resilient even if server logout fails.
      }
    }
    await clearPersistedSession();
    setSession(null);
  }, [clearPersistedSession, session]);

  const value = useMemo(
    () => ({
      isAuthenticated: Boolean(session),
      isReady,
      session,
      login,
      logout,
    }),
    [session, isReady, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
