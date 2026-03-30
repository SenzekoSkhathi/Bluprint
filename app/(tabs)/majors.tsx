import Majors from "@/Pages/Majors";
import type { FacultySlug } from "@/constants/faculty";
import type { ScienceMajorEntry } from "@/services/backend-api";
import { useRouter } from "expo-router";
import React from "react";

export default function MajorsScreen() {
  const router = useRouter();

  const handleMajorSelect = (major: ScienceMajorEntry, facultySlug: FacultySlug) => {
    router.push({
      pathname: "/major-details",
      params: {
        majorId: major.major_code,
        majorName: major.major_name,
        facultySlug,
      },
    });
  };

  return <Majors onMajorSelect={handleMajorSelect} />;
}
