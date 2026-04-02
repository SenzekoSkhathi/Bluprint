import { useIsMobile } from "@/hooks/use-is-mobile";
import { theme } from "@/constants/theme";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout = ({ children }: MainLayoutProps) => {
  const isMobile = useIsMobile();

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={isMobile ? styles.scrollContentMobile : styles.scrollContent}
        scrollIndicatorInsets={{ right: 1 }}
      >
        <View style={isMobile ? styles.contentMobile : styles.content}>
          {children}
        </View>
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
  scrollContentMobile: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  content: {
    flex: 1,
    width: "100%",
    maxWidth: 1100,
    marginHorizontal: "auto",
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
  contentMobile: {
    width: "100%",
  },
});

export default MainLayout;
