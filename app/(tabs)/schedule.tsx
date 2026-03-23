import Schedule from "@/Pages/Schedule";
import { useLoggedInUser } from "@/hooks/use-logged-in-user";
import React from "react";

export default function ScheduleScreen() {
  const { loggedInUser } = useLoggedInUser();
  return <Schedule studentNumber={loggedInUser?.studentNumber} />;
}
