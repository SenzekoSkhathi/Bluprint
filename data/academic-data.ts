import type {
    CompletedCourseRecord,
    CourseCatalogEntry,
    CourseGroup,
    DegreeRequirements,
    InProgressCourseRecord,
    PlannedCourse,
    PlannerCourseOption,
    ProgressFeedback,
    ScheduleItem,
    SessionType,
    TodoScope,
} from "@/types/academic";

export const courseGroups: CourseGroup[] = [
  "Year 1",
  "Year 2",
  "Year 3",
  "Postgrad",
];

export const courseCatalog: CourseCatalogEntry[] = [
  {
    id: "y1-1",
    code: "COMP1001",
    title: "Introduction to Programming",
    group: "Year 1",
    credits: 15,
    semester: "Semester 1",
    department: "Computer Science",
    delivery: "Lecture + Lab",
    prerequisites: "None",
    description:
      "Builds foundational coding skills with problem solving, control structures, and functions.",
    outcomes: [
      "Write basic programs using structured logic",
      "Debug common syntax and runtime issues",
      "Apply programming concepts to simple tasks",
    ],
  },
  {
    id: "y1-2",
    code: "MATH1102",
    title: "Discrete Mathematics",
    group: "Year 1",
    credits: 15,
    semester: "Semester 2",
    department: "Mathematics",
    delivery: "Lecture + Tutorial",
    prerequisites: "None",
    description:
      "Introduces logic, sets, relations, combinatorics, and graph concepts used in computing.",
    outcomes: [
      "Reason with formal logic and proofs",
      "Model problems using discrete structures",
      "Solve counting and graph-based problems",
    ],
  },
  {
    id: "y2-1",
    code: "COMP2001",
    title: "Data Structures and Algorithms",
    group: "Year 2",
    credits: 15,
    semester: "Semester 1",
    department: "Computer Science",
    delivery: "Lecture + Lab",
    prerequisites: "COMP1001",
    description:
      "Covers key data structures and algorithmic techniques for efficient software development.",
    outcomes: [
      "Choose suitable data structures for tasks",
      "Analyze time and space complexity",
      "Implement sorting and search strategies",
    ],
  },
  {
    id: "y2-2",
    code: "COMP2004",
    title: "Database Systems",
    group: "Year 2",
    credits: 15,
    semester: "Semester 2",
    department: "Computer Science",
    delivery: "Lecture + Tutorial",
    prerequisites: "COMP1001",
    description:
      "Introduces relational modelling, SQL, normalization, and transaction concepts.",
    outcomes: [
      "Design relational schemas",
      "Write and optimize SQL queries",
      "Apply data integrity constraints",
    ],
  },
  {
    id: "y3-1",
    code: "COMP3002",
    title: "Software Engineering",
    group: "Year 3",
    credits: 15,
    semester: "Semester 1",
    department: "Computer Science",
    delivery: "Lecture + Project",
    prerequisites: "COMP2001",
    description:
      "Focuses on requirements, architecture, teamwork, testing, and software lifecycle practices.",
    outcomes: [
      "Develop software with team-based workflows",
      "Apply testing and quality assurance methods",
      "Document and present software designs",
    ],
  },
  {
    id: "y3-2",
    code: "COMP3010",
    title: "Computer Networks",
    group: "Year 3",
    credits: 15,
    semester: "Semester 2",
    department: "Computer Science",
    delivery: "Lecture + Lab",
    prerequisites: "COMP2001",
    description:
      "Examines network protocols, routing, transport, security basics, and distributed communication.",
    outcomes: [
      "Explain layered network architectures",
      "Diagnose common networking issues",
      "Configure networked applications",
    ],
  },
  {
    id: "pg-1",
    code: "COMP5003",
    title: "Advanced Machine Learning",
    group: "Postgrad",
    credits: 20,
    semester: "Semester 1",
    department: "Computer Science",
    delivery: "Lecture + Seminar",
    prerequisites: "Undergraduate computing degree or equivalent",
    description:
      "Studies modern supervised and unsupervised learning methods, model evaluation, and deployment.",
    outcomes: [
      "Train and evaluate advanced ML models",
      "Compare model tradeoffs and limitations",
      "Communicate ML findings with evidence",
    ],
  },
  {
    id: "pg-2",
    code: "COMP5011",
    title: "Research Methods in Computing",
    group: "Postgrad",
    credits: 20,
    semester: "Semester 2",
    department: "Computer Science",
    delivery: "Seminar",
    prerequisites: "Postgraduate standing",
    description:
      "Develops research design, literature review, ethics, and academic writing in computing contexts.",
    outcomes: [
      "Formulate research questions",
      "Evaluate scholarly sources critically",
      "Prepare a research proposal",
    ],
  },
];

export const plannerSemesters = ["Semester 1", "Semester 2"];

export const plannerYears = ["Year 1", "Year 2", "Year 3", "Year 4"];

export const plannerCourseOptions: PlannerCourseOption[] = [
  { code: "COMP1001", name: "Introduction to Programming", credits: 15 },
  { code: "COMP1002", name: "Computer Systems", credits: 15 },
  { code: "COMP2001", name: "Data Structures", credits: 15 },
  { code: "COMP2002", name: "Algorithms", credits: 15 },
  { code: "COMP2003", name: "Operating Systems", credits: 15 },
  { code: "COMP2004", name: "Databases", credits: 15 },
  { code: "COMP3001", name: "Software Development", credits: 15 },
  { code: "COMP3002", name: "Software Engineering", credits: 15 },
  { code: "COMP3003", name: "Web Development", credits: 15 },
  { code: "COMP4001", name: "Final Year Project", credits: 30 },
];

export const plannerInitialCourses: PlannedCourse[] = [
  {
    id: "c1",
    code: "COMP2001",
    name: "Data Structures",
    credits: 15,
    year: "Year 2",
    semester: "Semester 1",
    status: "Completed",
  },
  {
    id: "c2",
    code: "COMP2004",
    name: "Databases",
    credits: 15,
    year: "Year 2",
    semester: "Semester 2",
    status: "In Progress",
  },
  {
    id: "c3",
    code: "COMP3002",
    name: "Software Engineering",
    credits: 15,
    year: "Year 3",
    semester: "Semester 1",
    status: "Planned",
  },
];

export const defaultDegreeRequirements: DegreeRequirements = {
  id: "bsc-computing",
  name: "BSc Computing",
  targetCredits: 360,
  minimumYearlyCredits: 90,
  coreCourseCodes: [
    "COMP1001",
    "MATH1102",
    "COMP2001",
    "COMP2004",
    "COMP3002",
    "COMP3010",
  ],
};

export const progressCompletedCourses: CompletedCourseRecord[] = [
  {
    id: "c1",
    code: "COMP1001",
    title: "Introduction to Programming",
    credits: 15,
    grade: "A",
    gpa: 4,
    semester: "Year 1 - Sem 1",
  },
  {
    id: "c2",
    code: "MATH1102",
    title: "Discrete Mathematics",
    credits: 15,
    grade: "A-",
    gpa: 3.7,
    semester: "Year 1 - Sem 2",
  },
  {
    id: "c3",
    code: "COMP2001",
    title: "Data Structures and Algorithms",
    credits: 15,
    grade: "B+",
    gpa: 3.3,
    semester: "Year 2 - Sem 1",
  },
];

export const progressInProgressCourses: InProgressCourseRecord[] = [
  {
    id: "ip1",
    code: "COMP2004",
    title: "Database Systems",
    credits: 15,
    currentGrade: "B",
    status: 65,
    semester: "Year 2 - Sem 2",
  },
  {
    id: "ip2",
    code: "COMP3002",
    title: "Software Engineering",
    credits: 15,
    currentGrade: "A-",
    status: 45,
    semester: "Year 3 - Sem 1",
  },
];

export const progressAiFeedback: ProgressFeedback[] = [
  {
    id: "f1",
    title: "Strong Foundation",
    message:
      "Your performance in foundational courses (Programming, Maths) is excellent. This shows strong grasp of core concepts.",
    type: "positive",
  },
  {
    id: "f2",
    title: "Consistent Achiever",
    message:
      "You maintain consistent grades across semesters. This demonstrates reliable effort and understanding.",
    type: "positive",
  },
  {
    id: "f3",
    title: "Advanced Courses Ahead",
    message:
      "As you progress to advanced courses, focus on deeper problem-solving and research skills. Your current pace suggests good readiness.",
    type: "improvement",
  },
  {
    id: "f4",
    title: "Recommendation",
    message:
      "Consider exploring electives in AI/ML to complement your core CS track. Your current performance level supports this.",
    type: "suggestion",
  },
];

export const scheduleWeekDays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const scheduleSessionTypes: SessionType[] = ["Class", "Tutorial", "Lab"];

export const scheduleTodoScopes: TodoScope[] = [
  "Daily",
  "Weekly",
  "Monthly",
  "Once Off",
];

export const scheduleInitialItems: ScheduleItem[] = [
  {
    id: "s1",
    courseCode: "COMP2004",
    courseName: "Databases",
    type: "Class",
    day: "Monday",
    startTime: "09:00",
    endTime: "10:30",
    location: "Room B201",
  },
  {
    id: "s2",
    courseCode: "COMP2004",
    courseName: "Databases",
    type: "Tutorial",
    day: "Wednesday",
    startTime: "14:00",
    endTime: "15:00",
    location: "Lab L2",
  },
  {
    id: "s3",
    courseCode: "COMP3002",
    courseName: "Software Engineering",
    type: "Class",
    day: "Thursday",
    startTime: "11:00",
    endTime: "12:30",
    location: "Room C110",
  },
];
