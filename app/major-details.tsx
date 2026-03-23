import MajorsDetails from "@/Pages/MajorsDetails";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";

export default function MajorDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const majorId =
    typeof params.majorId === "string" ? params.majorId : undefined;
  const majorName =
    typeof params.majorName === "string" ? params.majorName : undefined;

  return (
    <MajorsDetails
      majorId={majorId}
      majorName={majorName}
      onBack={() => router.back()}
    />
  );
}
