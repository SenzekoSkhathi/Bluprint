export interface ExamSession {
  id: string;
  courseCode: string;
  courseName: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  duration: number;
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

const nowIso = new Date().toISOString();

export const mockExamSessions: ExamSession[] = [
  {
    id: "e1",
    courseCode: "COMP2001",
    courseName: "Data Structures and Algorithms",
    date: addDays(nowIso, 3),
    startTime: "09:00",
    endTime: "11:00",
    location: "Exam Hall A",
    duration: 120,
  },
  {
    id: "e2",
    courseCode: "COMP2004",
    courseName: "Database Systems",
    date: addDays(nowIso, 7),
    startTime: "14:00",
    endTime: "16:00",
    location: "Exam Hall B",
    duration: 120,
  },
  {
    id: "e3",
    courseCode: "MATH1102",
    courseName: "Discrete Mathematics",
    date: addDays(nowIso, 10),
    startTime: "10:00",
    endTime: "12:00",
    location: "Exam Hall C",
    duration: 120,
  },
  {
    id: "e4",
    courseCode: "COMP3002",
    courseName: "Software Engineering",
    date: addDays(nowIso, 15),
    startTime: "13:00",
    endTime: "15:30",
    location: "Exam Hall A",
    duration: 150,
  },
];
