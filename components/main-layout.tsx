import { theme } from "@/constants/theme";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout = ({ children }: MainLayoutProps) => {
  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        scrollIndicatorInsets={{ right: 1 }}
      >
        <View style={styles.content}>{children}</View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundGradientStart,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    width: "100%",
    maxWidth: 1100,
    marginHorizontal: "auto",
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
});

export default MainLayout;
