import { theme } from "@/constants/theme";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface NavigationTileProps {
  title: string;
  icon: string;
  onClick: () => void;
  isActive: boolean;
  color?: string;
  iconTextColor?: string;
  iconBackgroundColor?: string;
}

const NavigationTile = ({
  title,
  icon,
  onClick,
  isActive,
  color,
  iconTextColor,
  iconBackgroundColor,
}: NavigationTileProps) => {
  const [isPressed, setIsPressed] = useState(false);

  const backgroundColor = isActive
    ? theme.colors.blue
    : isPressed
      ? theme.colors.cardHover
      : theme.colors.card;

  const styles = StyleSheet.create({
    tile: {
      padding: 12,
      backgroundColor,
      borderRadius: theme.borderRadius.lg,
      borderWidth: 1,
      borderColor:
        isPressed || isActive
          ? "rgba(93, 177, 230, 0.3)"
          : theme.colors.glassBorder,
      minHeight: 120,
      aspectRatio: 1,
      justifyContent: "center",
      alignItems: "center",
      gap: 8,
    },
    iconContainer: {
      width: 48,
      height: 48,
      borderRadius: theme.borderRadius.md,
      backgroundColor: isActive
        ? "rgba(255, 255, 255, 0.2)"
        : iconBackgroundColor || `${color || theme.colors.babyBlue}22`,
      justifyContent: "center",
      alignItems: "center",
    },
    icon: {
      fontSize: 24,
      color: iconTextColor || theme.colors.textPrimary,
      fontWeight: "700",
    },
    title: {
      fontSize: 12,
      color: isActive ? theme.colors.white : theme.colors.textPrimary,
      fontWeight: "600",
      letterSpacing: -0.2,
      textAlign: "center",
    },
    dot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: isActive
        ? "rgba(255,255,255,0.6)"
        : color || theme.colors.blue,
      opacity: isPressed || isActive ? 1 : 0,
    },
  });

  return (
    <Pressable
      onPress={onClick}
      onPressIn={() => setIsPressed(true)}
      onPressOut={() => setIsPressed(false)}
      style={styles.tile}
    >
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
        {title}
      </Text>
      <View style={styles.dot} />
    </Pressable>
  );
};

export default NavigationTile;
