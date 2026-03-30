import MajorsDetails from "@/Pages/MajorsDetails";
import type { FacultySlug } from "@/constants/faculty";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";

export default function MajorDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const majorId =
    typeof params.majorId === "string" ? params.majorId : undefined;
  const majorName =
    typeof params.majorName === "string" ? params.majorName : undefined;
  const facultySlug =
    typeof params.facultySlug === "string"
      ? (params.facultySlug as FacultySlug)
      : undefined;

  return (
    <MajorsDetails
      majorId={majorId}
      majorName={majorName}
      facultySlug={facultySlug}
      onBack={() => router.back()}
    />
  );
}
