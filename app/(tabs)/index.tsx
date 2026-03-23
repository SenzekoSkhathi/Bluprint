import Home from "@/Pages/Home";
import { useLoggedInUser } from "@/hooks/use-logged-in-user";
import { useRouter } from "expo-router";
import React from "react";

export default function HomeScreen() {
  const router = useRouter();
  const { loggedInUser, mockUser } = useLoggedInUser();

  const firstName = loggedInUser?.name.split(" ")[0] ?? "Student";
  const degree = loggedInUser?.degree ?? "BSc Programme";
  const yearNumber = loggedInUser?.year ?? 1;
  const currentCredits = mockUser?.academicProgress.creditsEarned ?? 0;
  const totalCredits = 360;

  const handleNavigate = (page: string) => {
    const routeMap: { [key: string]: any } = {
      BluBot: "/(tabs)/blubot",
      Planner: "/(tabs)/planner",
      Schedule: "/(tabs)/schedule",
      Majors: "/(tabs)/majors",
      Courses: "/(tabs)/courses",
      Advisor: "/(tabs)/advisor",
      Timetable: "/(tabs)/timetable",
      Progress: "/(tabs)/progress",
      Handbooks: "/(tabs)/handbooks",
      Profile: "/(tabs)/profile",
    };

    const route = routeMap[page];
    if (route) {
      router.push(route);
    }
  };

  return (
    <Home
      onNavigate={handleNavigate}
      firstName={firstName}
      degree={degree}
      yearNumber={yearNumber}
      currentCredits={currentCredits}
      totalCredits={totalCredits}
    />
  );
}
