import Courses from "@/Pages/Courses";
import { useRouter } from "expo-router";
import React from "react";

export default function CoursesScreen() {
  const router = useRouter();

  const handleCourseSelect = (course: any) => {
    router.push({
      pathname: "/course-details",
      params: {
        courseData: JSON.stringify(course),
      },
    });
  };

  return <Courses onCourseSelect={handleCourseSelect} />;
}
