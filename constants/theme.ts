
import { Platform } from "react-native";

const tintColorLight = "#0a7ea4";
const tintColorDark = "#fff";

export const Colors = {
  light: {
    text: "#11181C",
    background: "#fff",
    tint: tintColorLight,
    icon: "#687076",
    tabIconDefault: "#687076",
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: "#ECEDEE",
    background: "#151718",
    tint: tintColorDark,
    icon: "#9BA1A6",
    tabIconDefault: "#9BA1A6",
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

export const theme = {
  colors: {
    background: "#F0F4FA",
    backgroundGradientStart: "#E8F0FE",
    backgroundGradientEnd: "#F8FAFF",
    babyBlue: "#A7D8F0",
    blue: "#5DB1E6",
    darkBlue: "#3A8BC2",
    deepBlue: "#1E5F8C",
    accentBlue: "#4A9FD9",
    textPrimary: "#1A2A44",
    textSecondary: "#5DB1E6",
    textLight: "#7A8BA3",
    textMuted: "#9EAFC2",
    white: "#FFFFFF",
    black: "#000000",
    gray: "#E8EDF2",
    grayLight: "#F5F7FA",
    grayDark: "#C8D1DC",
    card: "rgba(255, 255, 255, 0.85)",
    cardHover: "rgba(255, 255, 255, 0.95)",
    glassBorder: "rgba(255, 255, 255, 0.6)",
    shadow: "rgba(26, 42, 68, 0.08)",
    shadowHover: "rgba(93, 177, 230, 0.2)",
    progressGlow: "rgba(93, 177, 230, 0.4)",
    success: "#4CAF50",
    successLight: "#E8F5E9",
    overlay: "rgba(30, 95, 140, 0.05)",
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
    xxxl: 64,
  },
  borderRadius: {
    sm: 6,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 28,
    round: 999,
  },
  fontSize: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 22,
    xxl: 30,
    xxxl: 38,
    hero: 44,
  },
  shadows: {
    sm: "0 2px 8px rgba(26, 42, 68, 0.06)",
    md: "0 4px 16px rgba(26, 42, 68, 0.08)",
    lg: "0 8px 32px rgba(26, 42, 68, 0.1)",
    xl: "0 12px 48px rgba(26, 42, 68, 0.12)",
    glow: "0 4px 24px rgba(93, 177, 230, 0.25)",
    tileHover: "0 12px 40px rgba(93, 177, 230, 0.18)",
  },
};
