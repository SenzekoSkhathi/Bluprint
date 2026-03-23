import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/auth-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
    ActivityIndicator,
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
        <View style={styles.card}>
          <Text style={styles.title}>Bluprint</Text>
          <Text style={styles.subtitle}>Sign in with your student account</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Student Number</Text>
            <View style={styles.inputWrapper}>
              <Feather name="hash" size={16} color={theme.colors.textMuted} />
              <TextInput
                value={studentNumber}
                onChangeText={handleStudentNumberChange}
                style={styles.input}
                placeholder="Enter your student number"
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!submitting}
                placeholderTextColor={theme.colors.textMuted}
              />
            </View>
            <Text style={styles.hintText}>Format: XYZABC123</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrapper}>
              <Feather name="lock" size={16} color={theme.colors.textMuted} />
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

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={theme.colors.white} />
            ) : (
              <Text style={styles.buttonText}>Login</Text>
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
    backgroundColor: "#A7D8F0",
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.lg,
  },
  container: {
    width: "100%",
    maxWidth: 440,
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.xxl,
    color: theme.colors.deepBlue,
    fontWeight: "700",
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textLight,
    marginBottom: theme.spacing.sm,
  },
  inputGroup: {
    gap: theme.spacing.sm,
  },
  label: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textPrimary,
    fontWeight: "600",
  },
  inputWrapper: {
    height: 48,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.grayDark,
    backgroundColor: theme.colors.white,
    paddingHorizontal: theme.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  input: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
  },
  eyeButton: {
    padding: 4,
  },
  errorText: {
    color: "#C62828",
    fontSize: theme.fontSize.sm,
  },
  hintText: {
    color: theme.colors.textLight,
    fontSize: theme.fontSize.xs,
  },
  button: {
    marginTop: theme.spacing.sm,
    height: 48,
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
  },
});
