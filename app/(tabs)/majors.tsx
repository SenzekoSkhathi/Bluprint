import Majors from "@/Pages/Majors";
import type { ScienceMajorEntry } from "@/services/backend-api";
import { useRouter } from "expo-router";
import React from "react";

export default function MajorsScreen() {
  const router = useRouter();

  const handleMajorSelect = (major: ScienceMajorEntry) => {
    router.push({
      pathname: "/major-details",
      params: {
        majorId: major.major_code,
        majorName: major.major_name,
      },
    });
  };

  return <Majors onMajorSelect={handleMajorSelect} />;
}
