import CourseDetails from "@/Pages/CourseDetails";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";

export default function CourseDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  // Parse course data from params
  const course = params.courseData
    ? JSON.parse(params.courseData as string)
    : null;

  const handleBack = () => {
    router.back();
  };

  return <CourseDetails course={course} onBack={handleBack} />;
}
