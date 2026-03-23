import Timetable from "@/Pages/Timetable";
import { useLoggedInUser } from "@/hooks/use-logged-in-user";
import React from "react";

export default function TimetableScreen() {
  const { loggedInUser } = useLoggedInUser();

  return <Timetable studentNumber={loggedInUser?.studentNumber} />;
}
