import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/auth-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();

  const [studentNumber, setStudentNumber] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState<
    "student" | "password" | null
  >(null);

  const handleStudentNumberChange = (value: string) => {
    setStudentNumber(value.replace(/\s+/g, "").toUpperCase());
  };

  const handleLogin = async () => {
    setError(null);
    setSubmitting(true);

    try {
      await login(studentNumber, password);
      router.replace("/(tabs)");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to login right now";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.page}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        {/* Brand header above card */}
        <View style={styles.brandSection}>
          <Image
            source={require("../assets/Public/Bluprint favicon.png")}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <View style={styles.brandText}>
            <Text style={styles.brandName}>Bluprint</Text>
            <Text style={styles.brandTagline}>Academic Intelligence</Text>
          </View>
        </View>

        {/* Login card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome to Bluprint</Text>
          <Text style={styles.cardSubtitle}>
            Sign in with your student account
          </Text>

          <View style={styles.fields}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Student Number</Text>
              <View
                style={[
                  styles.inputWrapper,
                  focusedField === "student" && styles.inputWrapperFocused,
                ]}
              >
                <Feather
                  name="hash"
                  size={16}
                  color={
                    focusedField === "student"
                      ? theme.colors.deepBlue
                      : theme.colors.textMuted
                  }
                />
                <TextInput
                  value={studentNumber}
                  onChangeText={handleStudentNumberChange}
                  style={styles.input}
                  placeholder="e.g. XYZABC123"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!submitting}
                  placeholderTextColor={theme.colors.textMuted}
                  underlineColorAndroid="transparent"
                  onFocus={() => setFocusedField("student")}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View
                style={[
                  styles.inputWrapper,
                  focusedField === "password" && styles.inputWrapperFocused,
                ]}
              >
                <Feather
                  name="lock"
                  size={16}
                  color={
                    focusedField === "password"
                      ? theme.colors.deepBlue
                      : theme.colors.textMuted
                  }
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  style={styles.input}
                  placeholder="Enter your password"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!submitting}
                  placeholderTextColor={theme.colors.textMuted}
                  underlineColorAndroid="transparent"
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                />
                <Pressable
                  onPress={() => setShowPassword((current) => !current)}
                  disabled={submitting}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showPassword ? "Hide password" : "Show password"
                  }
                  style={styles.eyeButton}
                >
                  <Feather
                    name={showPassword ? "eye-off" : "eye"}
                    size={18}
                    color={theme.colors.textMuted}
                  />
                </Pressable>
              </View>
            </View>
          </View>

          {error ? (
            <View style={styles.errorBanner}>
              <Feather name="alert-circle" size={14} color="#C62828" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={theme.colors.white} />
            ) : (
              <Text style={styles.buttonText}>Sign in</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#1d6fa7",
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.lg,
  },
  container: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
    gap: theme.spacing.xl,
  },
  brandSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  logoImage: {
    width: 68,
    height: 68,
  },
  brandText: {
    gap: 2,
  },
  brandName: {
    fontSize: theme.fontSize.xxl,
    fontWeight: "800",
    color: theme.colors.white,
    letterSpacing: -0.5,
  },
  brandTagline: {
    fontSize: theme.fontSize.sm,
    color: "rgba(167, 216, 240, 0.75)",
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  card: {
    width: "100%",
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    ...Platform.select({
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.2,
        shadowRadius: 32,
        elevation: 16,
      },
    }),
  },
  cardTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: "800",
    color: theme.colors.textPrimary,
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
    marginTop: -theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  fields: {
    gap: theme.spacing.md,
  },
  inputGroup: {
    gap: theme.spacing.xs,
  },
  label: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textPrimary,
    fontWeight: "600",
  },
  inputWrapper: {
    height: 50,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.grayDark,
    backgroundColor: theme.colors.grayLight,
    paddingHorizontal: theme.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  inputWrapperFocused: {
    borderColor: theme.colors.deepBlue,
    backgroundColor: theme.colors.white,
  },
  input: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    outlineStyle: "none" as any,
  },
  eyeButton: {
    padding: 4,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    backgroundColor: "#FEF2F2",
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: {
    color: "#C62828",
    fontSize: theme.fontSize.sm,
    flex: 1,
  },
  button: {
    marginTop: theme.spacing.xs,
    height: 50,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.deepBlue,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: theme.colors.white,
    fontSize: theme.fontSize.md,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
