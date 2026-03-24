// ============================================================
// UCT BSc Mock Users — Academic Progress Data
// Handbook: 2026 Faculty of Science, UCT
//
// Degree credit structure (BSc SB001):
//   Total degree:         360 credits
//   Min NQF Level 7:      120 credits (FB7.2)
//   Min by end of Year 1:  72 credits
//   Min by end of Year 2: 144 credits (all Y1 major courses)
//   Min by end of Year 3: 228 credits (all courses to finish in Y4)
//   Full completion:      360 credits
//
// NQF Levels: 5 = first-year, 6 = second-year, 7 = third-year
//
// Registration & semester logic:
//   Students register ONCE at the start of the academic year for ALL their
//   courses (S1, S2, and FY). Therefore:
//
//   coursesInProgress  = ALL courses belonging to the student's current year
//                        (S1 2025, S2 2025, FY 2025) — regardless of whether
//                        S1 has finished yet
//
//   completedCourses   = courses from ALL previous academic years only,
//                        split into passed / failed sub-arrays
//
//   Exception — within the same year, if it is currently S2:
//     S1 courses from that year move to completedCourses (they are done),
//     while S2/FY courses from that year remain in coursesInProgress.
//     This only applies to Priya (Year 1, currently S2 2025).
// ============================================================

export interface Course {
  code: string;
  title: string;
  credits: number;
  nqfLevel: 5 | 6 | 7;
  semester: string; // e.g. "S1 2024", "S2 2024", "FY 2024"
  grade?: number; // percentage — present on completed courses only
  passed?: boolean; // true if grade >= 50 (or course-specific subminimum)
}

export interface CompletedCourses {
  passed: Course[]; // completed courses with grade >= pass mark
  failed: Course[]; // completed courses with grade < pass mark
}

export interface AcademicProgress {
  // ── Cumulative degree credits ──────────────────────────────
  creditsEarned: number; // credits from passed courses only
  creditsTotal: number; // always 360 (full BSc)
  creditsMilestoneRequired: number; // handbook minimum for current year standing
  creditsMilestoneLabel: string; // e.g. "End of Year 2 minimum"

  // ── Year-band credits ──────────────────────────────────────
  creditsEarnedThisYear: number; // credits passed in the current academic year
  creditsRequiredThisYear: number; // 72 (handbook FB5.1)

  // ── NQF Level 7 credits ────────────────────────────────────
  nqf7CreditsEarned: number; // NQF-7 credits passed so far
  nqf7CreditsRequired: number; // always 120 (handbook FB7.2)

  // ── Forecast versions (include in-progress) ────────────────
  forecastCreditsEarned: number; // creditsEarned + inProgress credits
  forecastCreditsMilestone: number; // same milestone target
  forecastCreditsThisYear: number; // this-year credits inc. in-progress
  forecastNqf7Credits: number; // NQF-7 credits inc. in-progress
}

export interface MockUser {
  name: string;
  studentNumber: string;
  password: string;
  degree: string;
  year: number;
  majors: string[];
  combinationIds: string[]; // which handbook combination(s) the student is on
  completedCourses: CompletedCourses; // finished courses from previous years, split by pass/fail
  coursesInProgress: Course[]; // ALL courses registered for in the current academic year
  academicProgress: AcademicProgress;
}

// ─────────────────────────────────────────────────────────────
// HELPER — compute AcademicProgress from course arrays
// ─────────────────────────────────────────────────────────────

function computeProgress(
  year: number,
  passed: Course[],
  failed: Course[],
  inProgress: Course[],
): AcademicProgress {
  const creditsEarned = passed.reduce((s, c) => s + c.credits, 0);

  // "This year" credits = passed courses from the current academic year only.
  // For most users the current year is 2025. For Priya, her S1 2025 courses
  // are already in completedCourses.passed (she is in S2 2025).
  const creditsEarnedThisYear = passed
    .filter((c) => c.semester.includes("2025"))
    .reduce((s, c) => s + c.credits, 0);

  const nqf7CreditsEarned = passed
    .filter((c) => c.nqfLevel === 7)
    .reduce((s, c) => s + c.credits, 0);

  // Handbook milestones
  const milestones: Record<number, { credits: number; label: string }> = {
    1: { credits: 72, label: "End of Year 1 minimum (72 credits)" },
    2: { credits: 144, label: "End of Year 2 minimum (144 credits)" },
    3: { credits: 228, label: "End of Year 3 minimum (228 credits)" },
    4: { credits: 360, label: "Degree completion (360 credits)" },
  };
  const milestone = milestones[year] ?? milestones[4];

  const inProgressCredits = inProgress.reduce((s, c) => s + c.credits, 0);
  const forecastCreditsEarned = creditsEarned + inProgressCredits;
  const forecastCreditsThisYear = creditsEarnedThisYear + inProgressCredits;
  const forecastNqf7Credits =
    nqf7CreditsEarned +
    inProgress
      .filter((c) => c.nqfLevel === 7)
      .reduce((s, c) => s + c.credits, 0);

  return {
    creditsEarned,
    creditsTotal: 360,
    creditsMilestoneRequired: milestone.credits,
    creditsMilestoneLabel: milestone.label,
    creditsEarnedThisYear,
    creditsRequiredThisYear: 72,
    nqf7CreditsEarned,
    nqf7CreditsRequired: 120,
    forecastCreditsEarned,
    forecastCreditsMilestone: milestone.credits,
    forecastCreditsThisYear,
    forecastNqf7Credits,
  };
}

// ─────────────────────────────────────────────────────────────
// USER 1 — Bandile Gumede
// BSc Computer Science | Year 2 | CSC05-Y1-A + CSC05-Y2-A
// Completed: Year 1 (2024) — all passed
// In progress: Full Year 2 registration (2025) — S1 only in this stream
// ─────────────────────────────────────────────────────────────
const bandilePassed: Course[] = [
  {
    code: "CSC1015F",
    title: "Computer Science 1015",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2024",
    grade: 72,
    passed: true,
  },
  {
    code: "CSC1016S",
    title: "Computer Science 1016",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2024",
    grade: 68,
    passed: true,
  },
  {
    code: "MAM1000W",
    title: "Mathematics 1000",
    credits: 36,
    nqfLevel: 5,
    semester: "FY 2024",
    grade: 65,
    passed: true,
  },
  {
    code: "MAM1008S",
    title: "Introduction to Discrete Mathematics",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2024",
    grade: 70,
    passed: true,
  },
];
const bandileFailed: Course[] = [];
const bandileInProgress: Course[] = [
  {
    code: "CSC2001F",
    title: "Computer Science 2001",
    credits: 24,
    nqfLevel: 6,
    semester: "S1 2025",
  },
  {
    code: "INF2009F",
    title: "Systems Analysis",
    credits: 18,
    nqfLevel: 6,
    semester: "S1 2025",
  },
];

// ─────────────────────────────────────────────────────────────
// USER 2 — Nikhar Singh
// BSc Biology and Genetics | Year 2 | BIO12-Y1-A + MCB04-Y1-A + BIO12-Y2-B + MCB04-Y2-A
// Completed: Year 1 (2024) — one failure (MAM1004F)
// In progress: Full Year 2 registration (2025) — S1 only in this stream
// ─────────────────────────────────────────────────────────────
const nikharPassed: Course[] = [
  {
    code: "BIO1000F",
    title: "Cell Biology",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2024",
    grade: 58,
    passed: true,
  },
  {
    code: "BIO1004S",
    title: "Biological Diversity",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2024",
    grade: 61,
    passed: true,
  },
  {
    code: "CEM1000W",
    title: "Chemistry 1000",
    credits: 36,
    nqfLevel: 5,
    semester: "FY 2024",
    grade: 55,
    passed: true,
  },
  {
    code: "STA1007S",
    title: "Introductory Statistics for Scientists",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2024",
    grade: 62,
    passed: true,
  },
];
const nikharFailed: Course[] = [
  {
    code: "MAM1004F",
    title: "Mathematics 1004",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2024",
    grade: 44,
    passed: false,
  },
];
const nikharInProgress: Course[] = [
  {
    code: "BIO2014F",
    title: "Principles of Ecology & Evolution",
    credits: 24,
    nqfLevel: 6,
    semester: "S1 2025",
  },
  {
    code: "BIO2015F",
    title: "Vertebrate Diversity & Functional Biology",
    credits: 24,
    nqfLevel: 6,
    semester: "S1 2025",
  },
  {
    code: "MCB2020F",
    title: "Biological Information Transfer",
    credits: 24,
    nqfLevel: 6,
    semester: "S1 2025",
  },
  {
    code: "MCB2021F",
    title: "Molecular Bioscience",
    credits: 24,
    nqfLevel: 6,
    semester: "S1 2025",
  },
];

// ─────────────────────────────────────────────────────────────
// USER 3 — Jordan Masencamp
// BSc CS + AI + Mathematics | Year 3 | CSC05-Y1-A + CSC08-Y2-A + MAM02-Y3-A
// Completed: Year 1 (2023) + Year 2 (2024) — all passed
// In progress: Full Year 3 registration (2025) — S1 only in this stream
// ─────────────────────────────────────────────────────────────
const jordanPassed: Course[] = [
  // Year 1 — 2023
  {
    code: "CSC1015F",
    title: "Computer Science 1015",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2023",
    grade: 81,
    passed: true,
  },
  {
    code: "CSC1016S",
    title: "Computer Science 1016",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2023",
    grade: 79,
    passed: true,
  },
  {
    code: "MAM1031F",
    title: "Mathematics 1031",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2023",
    grade: 75,
    passed: true,
  },
  {
    code: "MAM1032S",
    title: "Mathematics 1032",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2023",
    grade: 74,
    passed: true,
  },
  {
    code: "MAM1019H",
    title: "Fundamentals of Mathematics",
    credits: 18,
    nqfLevel: 5,
    semester: "FY 2023",
    grade: 70,
    passed: true,
  },
  // Year 2 — 2024
  {
    code: "CSC2001F",
    title: "Computer Science 2001",
    credits: 24,
    nqfLevel: 6,
    semester: "S1 2024",
    grade: 77,
    passed: true,
  },
  {
    code: "CSC2041F",
    title: "AI 1: Knowledge Representation",
    credits: 24,
    nqfLevel: 6,
    semester: "S1 2024",
    grade: 73,
    passed: true,
  },
  {
    code: "CSC2042S",
    title: "AI 2: Machine Learning",
    credits: 24,
    nqfLevel: 6,
    semester: "S2 2024",
    grade: 80,
    passed: true,
  },
  {
    code: "MAM2010F",
    title: "Advanced Calculus (2AC)",
    credits: 12,
    nqfLevel: 6,
    semester: "S1 2024",
    grade: 69,
    passed: true,
  },
  {
    code: "MAM2011F",
    title: "Linear Algebra (2LA)",
    credits: 12,
    nqfLevel: 6,
    semester: "S2 2024",
    grade: 71,
    passed: true,
  },
  {
    code: "MAM2013S",
    title: "Introductory Algebra (2IA)",
    credits: 12,
    nqfLevel: 6,
    semester: "S2 2024",
    grade: 66,
    passed: true,
  },
  {
    code: "MAM2014S",
    title: "Real Analysis (2RA)",
    credits: 12,
    nqfLevel: 6,
    semester: "S2 2024",
    grade: 62,
    passed: true,
  },
  {
    code: "CSC2002S",
    title: "Computer Science 2002",
    credits: 24,
    nqfLevel: 6,
    semester: "S2 2024",
    grade: 74,
    passed: true,
  },
];
const jordanFailed: Course[] = [];
const jordanInProgress: Course[] = [
  {
    code: "CSC3002F",
    title: "Networks and Operating Systems",
    credits: 36,
    nqfLevel: 7,
    semester: "S1 2025",
  },
  {
    code: "CSC3003S",
    title: "Advanced Programming and Algorithms",
    credits: 36,
    nqfLevel: 7,
    semester: "S2 2025",
  },
  {
    code: "CSC3041F",
    title: "Automated Planning and Control",
    credits: 18,
    nqfLevel: 7,
    semester: "S1 2025",
  },
  {
    code: "CSC3042F",
    title: "Deep Learning",
    credits: 18,
    nqfLevel: 7,
    semester: "S1 2025",
  },
  {
    code: "CSC3043S",
    title: "Reasoning in AI",
    credits: 18,
    nqfLevel: 7,
    semester: "S2 2025",
  },
  {
    code: "CSC3044S",
    title: "AI Systems",
    credits: 18,
    nqfLevel: 7,
    semester: "S2 2025",
  },
  {
    code: "MAM3010F",
    title: "Metric Spaces (3MS)",
    credits: 18,
    nqfLevel: 7,
    semester: "S1 2025",
  },
  {
    code: "MAM3011F",
    title: "Modern Abstract Algebra (3AL)",
    credits: 18,
    nqfLevel: 7,
    semester: "S1 2025",
  },
];

// ─────────────────────────────────────────────────────────────
// USER 4 — Thandolwenkosi Khoza
// BSc Physics + Astrophysics | Year 3 | PHY01-Y1-A + AST02-Y2-A
// Completed: Year 1 (2023) + Year 2 (2024) — all passed
// In progress: Full Year 3 registration (2025) — FY 2025 + S1 2025
// ─────────────────────────────────────────────────────────────
const thandoPassed: Course[] = [
  // Year 1 — 2023
  {
    code: "MAM1000W",
    title: "Mathematics 1000",
    credits: 36,
    nqfLevel: 5,
    semester: "FY 2023",
    grade: 67,
    passed: true,
  },
  {
    code: "PHY1004W",
    title: "Matter and Interactions",
    credits: 36,
    nqfLevel: 5,
    semester: "FY 2023",
    grade: 63,
    passed: true,
  },
  {
    code: "CSC1015F",
    title: "Computer Science 1015",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2023",
    grade: 54,
    passed: true,
  },
  // Year 2 — 2024
  {
    code: "MAM2010F",
    title: "Advanced Calculus (2AC)",
    credits: 12,
    nqfLevel: 6,
    semester: "S1 2024",
    grade: 58,
    passed: true,
  },
  {
    code: "MAM2011F",
    title: "Linear Algebra (2LA)",
    credits: 12,
    nqfLevel: 6,
    semester: "S2 2024",
    grade: 51,
    passed: true,
  },
  {
    code: "PHY2004W",
    title: "Intermediate Physics",
    credits: 48,
    nqfLevel: 6,
    semester: "FY 2024",
    grade: 60,
    passed: true,
  },
  {
    code: "AST2002H",
    title: "Astrophysics",
    credits: 24,
    nqfLevel: 6,
    semester: "FY 2024",
    grade: 65,
    passed: true,
  },
  {
    code: "AST2003H",
    title: "Astronomical Techniques",
    credits: 24,
    nqfLevel: 6,
    semester: "FY 2024",
    grade: 59,
    passed: true,
  },
  {
    code: "MAM2040F",
    title: "Ordinary Differential Equations (2OD)",
    credits: 12,
    nqfLevel: 6,
    semester: "S1 2024",
    grade: 55,
    passed: true,
  },
  {
    code: "MAM2043S",
    title: "Boundary-Value Problems (2BP)",
    credits: 12,
    nqfLevel: 6,
    semester: "S2 2024",
    grade: 52,
    passed: true,
  },
];
const thandoFailed: Course[] = [];
const thandoInProgress: Course[] = [
  {
    code: "PHY3004W",
    title: "Advanced Physics",
    credits: 72,
    nqfLevel: 7,
    semester: "FY 2025",
  },
  {
    code: "AST3002F",
    title: "Stellar Astrophysics",
    credits: 36,
    nqfLevel: 7,
    semester: "S1 2025",
  },
];

// ─────────────────────────────────────────────────────────────
// USER 5 — Nosihle Sishi
// BSc Applied Statistics | Year 1 | STA01-Y1-B
// Completed: none (first-year student)
// In progress: Full Year 1 registration (2025) — S1 only in this stream
// ─────────────────────────────────────────────────────────────
const nosihlePassed: Course[] = [];
const nosihleFailed: Course[] = [];
const nosihleInProgress: Course[] = [
  {
    code: "MAM1031F",
    title: "Mathematics 1031",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2025",
  },
];

// ─────────────────────────────────────────────────────────────
// USER 6 — Amara Dube
// BSc Mathematical Statistics | Year 3 | STA02-Y1-B + STA02-Y2-A + STA02-Y3-A
// Completed: Year 1 (2023) + Year 2 (2024) — all passed
// In progress: Full Year 3 registration (2025) — S1 2025 + S2 2025
// ─────────────────────────────────────────────────────────────
const amaraPassed: Course[] = [
  // Year 1 — 2023
  {
    code: "MAM1031F",
    title: "Mathematics 1031",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2023",
    grade: 78,
    passed: true,
  },
  {
    code: "MAM1032S",
    title: "Mathematics 1032",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2023",
    grade: 76,
    passed: true,
  },
  {
    code: "STA1006S",
    title: "Mathematical Statistics I",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2023",
    grade: 82,
    passed: true,
  },
  // Year 2 — 2024
  {
    code: "STA2004F",
    title: "Statistical Theory & Inference",
    credits: 24,
    nqfLevel: 6,
    semester: "S1 2024",
    grade: 80,
    passed: true,
  },
  {
    code: "STA2005S",
    title: "Linear Models",
    credits: 24,
    nqfLevel: 6,
    semester: "S2 2024",
    grade: 77,
    passed: true,
  },
  {
    code: "CSC1015F",
    title: "Computer Science 1015",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2024",
    grade: 65,
    passed: true,
  },
];
const amaraFailed: Course[] = [];
const amaraInProgress: Course[] = [
  // S1 2025 + S2 2025 — registered together at year start
  {
    code: "STA3041F",
    title: "Markov Processes & Time Series",
    credits: 36,
    nqfLevel: 7,
    semester: "S1 2025",
  },
  {
    code: "STA3047S",
    title: "Introduction to Machine Learning",
    credits: 6,
    nqfLevel: 7,
    semester: "S2 2025",
  },
  {
    code: "STA3048S",
    title: "Statistical Modelling and Bayesian Analysis",
    credits: 30,
    nqfLevel: 7,
    semester: "S2 2025",
  },
];

// ─────────────────────────────────────────────────────────────
// USER 7 — Keanu Hendricks
// BSc Statistics & Data Science | Year 2 | STA13-Y1-A + STA13-Y2-D
// Completed: Year 1 (2024) — all passed
// In progress: Full Year 2 registration (2025) — S1 2025 + S2 2025
// ─────────────────────────────────────────────────────────────
const keanuPassed: Course[] = [
  {
    code: "CSC1015F",
    title: "Computer Science 1015",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2024",
    grade: 71,
    passed: true,
  },
  {
    code: "CSC1016S",
    title: "Computer Science 1016",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2024",
    grade: 68,
    passed: true,
  },
  {
    code: "MAM1031F",
    title: "Mathematics 1031",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2024",
    grade: 60,
    passed: true,
  },
  {
    code: "MAM1032S",
    title: "Mathematics 1032",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2024",
    grade: 57,
    passed: true,
  },
  {
    code: "STA1007S",
    title: "Introductory Statistics for Scientists",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2024",
    grade: 74,
    passed: true,
  },
];
const keanuFailed: Course[] = [];
const keanuInProgress: Course[] = [
  // S1 2025 + S2 2025 — registered together at year start
  {
    code: "CSC2001F",
    title: "Computer Science 2001",
    credits: 24,
    nqfLevel: 6,
    semester: "S1 2025",
  },
  {
    code: "MAM2010F",
    title: "Advanced Calculus (2AC)",
    credits: 12,
    nqfLevel: 6,
    semester: "S1 2025",
  },
  {
    code: "STA2030S",
    title: "Statistical Theory",
    credits: 24,
    nqfLevel: 6,
    semester: "S2 2025",
  },
];

// ─────────────────────────────────────────────────────────────
// USER 8 — Priya Naidoo
// BSc Computer Science + Artificial Intelligence | Year 1 | CSC05-Y1-C + CSC08-Y1-B
// Special case: currently S2 2025 (second semester of Year 1 already underway)
//   → S1 2025 courses are COMPLETED (semester has passed within the year)
//   → S2 2025 courses are IN PROGRESS
// ─────────────────────────────────────────────────────────────
const priyaPassed: Course[] = [
  {
    code: "CSC1015F",
    title: "Computer Science 1015",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2025",
    grade: 66,
    passed: true,
  },
  {
    code: "MAM1031F",
    title: "Mathematics 1031",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2025",
    grade: 62,
    passed: true,
  },
];
const priyaFailed: Course[] = [];
const priyaInProgress: Course[] = [
  {
    code: "CSC1016S",
    title: "Computer Science 1016",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2025",
  },
  {
    code: "MAM1032S",
    title: "Mathematics 1032",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2025",
  },
  {
    code: "STA1007S",
    title: "Introductory Statistics for Scientists",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2025",
  },
];

// ─────────────────────────────────────────────────────────────
// USER 9 — Sipho Mokoena
// BSc Computer Science | Year 2 | CSC05-Y1-B + CSC05-Y2-B
// Completed: Year 1 (2024) — one failure (CSC1016S)
// In progress: Full Year 2 registration (2025) — retake + new Y2 course, S1 2025
// ─────────────────────────────────────────────────────────────
const siphoPassed: Course[] = [
  {
    code: "CSC1015F",
    title: "Computer Science 1015",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2024",
    grade: 52,
    passed: true,
  },
  {
    code: "MAM1019H",
    title: "Fundamentals of Mathematics",
    credits: 18,
    nqfLevel: 5,
    semester: "FY 2024",
    grade: 53,
    passed: true,
  },
  {
    code: "MAM1004F",
    title: "Mathematics 1004",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2024",
    grade: 50,
    passed: true,
  },
];
const siphoFailed: Course[] = [
  {
    code: "CSC1016S",
    title: "Computer Science 1016",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2024",
    grade: 48,
    passed: false,
  },
];
const siphoInProgress: Course[] = [
  {
    code: "CSC1016S",
    title: "Computer Science 1016 (retake)",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2025",
  },
  {
    code: "CSC2001F",
    title: "Computer Science 2001",
    credits: 24,
    nqfLevel: 6,
    semester: "S1 2025",
  },
];

// ─────────────────────────────────────────────────────────────
// USER 10 — Lerato Molefe
// BSc Applied Statistics | Year 2 | STA01-Y1-A + STA01-Y2-B
// Completed: Year 1 (2024) — all passed
// In progress: Full Year 2 registration (2025) — S1 2025 + S2 2025
// ─────────────────────────────────────────────────────────────
const leratoPassed: Course[] = [
  {
    code: "MAM1000W",
    title: "Mathematics 1000",
    credits: 36,
    nqfLevel: 5,
    semester: "FY 2024",
    grade: 64,
    passed: true,
  },
  {
    code: "STA1007S",
    title: "Introductory Statistics for Scientists",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2024",
    grade: 70,
    passed: true,
  },
];
const leratoFailed: Course[] = [];
const leratoInProgress: Course[] = [
  // S1 2025 + S2 2025 — registered together at year start
  {
    code: "STA2020F",
    title: "Applied Statistics",
    credits: 24,
    nqfLevel: 6,
    semester: "S1 2025",
  },
  {
    code: "STA2030S",
    title: "Statistical Theory",
    credits: 24,
    nqfLevel: 6,
    semester: "S2 2025",
  },
];

// ─────────────────────────────────────────────────────────────
// USER 11 — Fatima Hassan
// BSc Physics + Astrophysics | Year 2 | PHY01-Y1-B + AST02-Y1-B + PHY01-Y2-A
// Completed: Year 1 (2024) — all passed
// In progress: Full Year 2 registration (2025) — FY 2025 + S1 2025 + S2 2025
// ─────────────────────────────────────────────────────────────
const fatimaPassed: Course[] = [
  {
    code: "MAM1031F",
    title: "Mathematics 1031",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2024",
    grade: 69,
    passed: true,
  },
  {
    code: "MAM1032S",
    title: "Mathematics 1032",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2024",
    grade: 65,
    passed: true,
  },
  {
    code: "PHY1004W",
    title: "Matter and Interactions",
    credits: 36,
    nqfLevel: 5,
    semester: "FY 2024",
    grade: 67,
    passed: true,
  },
  {
    code: "CSC1015F",
    title: "Computer Science 1015",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2024",
    grade: 58,
    passed: true,
  },
  {
    code: "AST1000S",
    title: "Introduction to Astronomy",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2024",
    grade: 72,
    passed: true,
  },
];
const fatimaFailed: Course[] = [];
const fatimaInProgress: Course[] = [
  // FY 2025 + S1 2025 + S2 2025 — all registered together at year start
  {
    code: "AST2002H",
    title: "Astrophysics",
    credits: 24,
    nqfLevel: 6,
    semester: "FY 2025",
  },
  {
    code: "AST2003H",
    title: "Astronomical Techniques",
    credits: 24,
    nqfLevel: 6,
    semester: "FY 2025",
  },
  {
    code: "MAM2010F",
    title: "Advanced Calculus (2AC)",
    credits: 12,
    nqfLevel: 6,
    semester: "S1 2025",
  },
  {
    code: "MAM2011F",
    title: "Linear Algebra (2LA)",
    credits: 12,
    nqfLevel: 6,
    semester: "S2 2025",
  },
  {
    code: "PHY2004W",
    title: "Intermediate Physics",
    credits: 48,
    nqfLevel: 6,
    semester: "FY 2025",
  },
];

// ─────────────────────────────────────────────────────────────
// USER 12 — Luyanda Mthethwa
// BSc Statistics & Data Science | Year 3 | STA13-Y1-A + STA13-Y2-A + STA13-Y3-D
// Completed: Year 1 (2023) + Year 2 (2024) — all passed
// In progress: Full Year 3 registration (2025) — S1 2025 + S2 2025
// ─────────────────────────────────────────────────────────────
const luyandaPassed: Course[] = [
  // Year 1 — 2023
  {
    code: "CSC1015F",
    title: "Computer Science 1015",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2023",
    grade: 63,
    passed: true,
  },
  {
    code: "CSC1016S",
    title: "Computer Science 1016",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2023",
    grade: 60,
    passed: true,
  },
  {
    code: "MAM1031F",
    title: "Mathematics 1031",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2023",
    grade: 55,
    passed: true,
  },
  {
    code: "MAM1032S",
    title: "Mathematics 1032",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2023",
    grade: 52,
    passed: true,
  },
  {
    code: "STA1000F",
    title: "Introductory Statistics",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2023",
    grade: 68,
    passed: true,
  },
  // Year 2 — 2024
  {
    code: "CSC2001F",
    title: "Computer Science 2001",
    credits: 24,
    nqfLevel: 6,
    semester: "S1 2024",
    grade: 58,
    passed: true,
  },
  {
    code: "CSC2002S",
    title: "Computer Science 2002",
    credits: 24,
    nqfLevel: 6,
    semester: "S2 2024",
    grade: 55,
    passed: true,
  },
  {
    code: "MAM2010F",
    title: "Advanced Calculus (2AC)",
    credits: 12,
    nqfLevel: 6,
    semester: "S1 2024",
    grade: 51,
    passed: true,
  },
  {
    code: "MAM2011F",
    title: "Linear Algebra (2LA)",
    credits: 12,
    nqfLevel: 6,
    semester: "S2 2024",
    grade: 50,
    passed: true,
  },
  {
    code: "STA2004F",
    title: "Statistical Theory & Inference",
    credits: 24,
    nqfLevel: 6,
    semester: "S1 2024",
    grade: 62,
    passed: true,
  },
  {
    code: "STA2005S",
    title: "Linear Models",
    credits: 24,
    nqfLevel: 6,
    semester: "S2 2024",
    grade: 60,
    passed: true,
  },
];
const luyandaFailed: Course[] = [];
const luyandaInProgress: Course[] = [
  // S1 2025 + S2 2025 — registered together at year start
  {
    code: "STA3030F",
    title: "Statistical Inference & Modelling",
    credits: 36,
    nqfLevel: 7,
    semester: "S1 2025",
  },
  {
    code: "STA3022F",
    title: "Applied Multivariate Data Analysis",
    credits: 36,
    nqfLevel: 7,
    semester: "S2 2025",
  },
];

// ─────────────────────────────────────────────────────────────
// ASSEMBLE MOCK USERS
// ─────────────────────────────────────────────────────────────
export const mockUsers: MockUser[] = [
  {
    name: "Bandile Gumede",
    studentNumber: "GMDBAN001",
    password: "Bandile@UCT1",
    degree: "BSc Computer Science",
    year: 2,
    majors: ["Computer Science"],
    combinationIds: ["CSC05-Y1-A", "CSC05-Y2-A"],
    completedCourses: { passed: bandilePassed, failed: bandileFailed },
    coursesInProgress: bandileInProgress,
    academicProgress: computeProgress(
      2,
      bandilePassed,
      bandileFailed,
      bandileInProgress,
    ),
  },
  {
    name: "Nikhar Singh",
    studentNumber: "SNGNIK002",
    password: "Nikhar@UCT2",
    degree: "BSc Biology and Genetics",
    year: 2,
    majors: ["Biology", "Genetics"],
    combinationIds: ["BIO12-Y1-A", "MCB04-Y1-A", "BIO12-Y2-B", "MCB04-Y2-A"],
    completedCourses: { passed: nikharPassed, failed: nikharFailed },
    coursesInProgress: nikharInProgress,
    academicProgress: computeProgress(
      2,
      nikharPassed,
      nikharFailed,
      nikharInProgress,
    ),
  },
  {
    name: "Jordan Masencamp",
    studentNumber: "MSNJOR003",
    password: "Jordan@UCT3",
    degree: "BSc Computer Science, Artificial Intelligence, and Mathematics",
    year: 3,
    majors: ["Computer Science", "Artificial Intelligence", "Mathematics"],
    combinationIds: [
      "CSC05-Y1-A",
      "CSC08-Y1-A",
      "MAM02-Y1-B",
      "CSC08-Y2-A",
      "MAM02-Y2-A",
      "CSC05-Y2-B",
      "MAM02-Y3-A",
      "CSC08-Y3-A",
      "CSC05-Y3-A",
    ],
    completedCourses: { passed: jordanPassed, failed: jordanFailed },
    coursesInProgress: jordanInProgress,
    academicProgress: computeProgress(
      3,
      jordanPassed,
      jordanFailed,
      jordanInProgress,
    ),
  },
  {
    name: "Thandolwenkosi Khoza",
    studentNumber: "KHZTHA004",
    password: "Thando@UCT4",
    degree: "BSc Physics and Astrophysics",
    year: 3,
    majors: ["Physics", "Astrophysics"],
    combinationIds: [
      "PHY01-Y1-A",
      "AST02-Y1-A",
      "PHY01-Y2-A",
      "AST02-Y2-A",
      "PHY01-Y3-A",
      "AST02-Y3-A",
    ],
    completedCourses: { passed: thandoPassed, failed: thandoFailed },
    coursesInProgress: thandoInProgress,
    academicProgress: computeProgress(
      3,
      thandoPassed,
      thandoFailed,
      thandoInProgress,
    ),
  },
  {
    name: "Nosihle Sishi",
    studentNumber: "SSHNOS005",
    password: "Nosihle@UCT5",
    degree: "BSc Applied Statistics and Finance",
    year: 1,
    majors: ["Applied Statistics"],
    combinationIds: ["STA01-Y1-B"],
    completedCourses: { passed: nosihlePassed, failed: nosihleFailed },
    coursesInProgress: nosihleInProgress,
    academicProgress: computeProgress(
      1,
      nosihlePassed,
      nosihleFailed,
      nosihleInProgress,
    ),
  },
  {
    name: "Amara Dube",
    studentNumber: "DBXAMA006",
    password: "Amara@UCT6",
    degree: "BSc Mathematical Statistics",
    year: 3,
    majors: ["Mathematical Statistics"],
    combinationIds: ["STA02-Y1-B", "STA02-Y2-A", "STA02-Y3-A"],
    completedCourses: { passed: amaraPassed, failed: amaraFailed },
    coursesInProgress: amaraInProgress,
    academicProgress: computeProgress(
      3,
      amaraPassed,
      amaraFailed,
      amaraInProgress,
    ),
  },
  {
    name: "Keanu Hendricks",
    studentNumber: "HNDKEA007",
    password: "Keanu@UCT7",
    degree: "BSc Statistics and Data Science",
    year: 2,
    majors: ["Statistics & Data Science"],
    combinationIds: ["STA13-Y1-A", "STA13-Y2-D"],
    completedCourses: { passed: keanuPassed, failed: keanuFailed },
    coursesInProgress: keanuInProgress,
    academicProgress: computeProgress(
      2,
      keanuPassed,
      keanuFailed,
      keanuInProgress,
    ),
  },
  {
    name: "Priya Naidoo",
    studentNumber: "NDXPRI008",
    password: "Priya@UCT8",
    degree: "BSc Computer Science and Artificial Intelligence",
    year: 1,
    majors: ["Computer Science", "Artificial Intelligence"],
    combinationIds: ["CSC05-Y1-C", "CSC08-Y1-B"],
    // Special case: currently S2 2025 — S1 2025 courses are completed, S2 2025 are in progress
    completedCourses: { passed: priyaPassed, failed: priyaFailed },
    coursesInProgress: priyaInProgress,
    academicProgress: computeProgress(
      1,
      priyaPassed,
      priyaFailed,
      priyaInProgress,
    ),
  },
  {
    name: "Sipho Mokoena",
    studentNumber: "MKNSIP009",
    password: "Sipho@UCT9",
    degree: "BSc Computer Science",
    year: 2,
    majors: ["Computer Science"],
    combinationIds: ["CSC05-Y1-B", "CSC05-Y2-B"],
    completedCourses: { passed: siphoPassed, failed: siphoFailed },
    coursesInProgress: siphoInProgress,
    academicProgress: computeProgress(
      2,
      siphoPassed,
      siphoFailed,
      siphoInProgress,
    ),
  },
  {
    name: "Lerato Molefe",
    studentNumber: "MLFLER010",
    password: "Lerato@UCT10",
    degree: "BSc Applied Statistics",
    year: 2,
    majors: ["Applied Statistics"],
    combinationIds: ["STA01-Y1-A", "STA01-Y2-B"],
    completedCourses: { passed: leratoPassed, failed: leratoFailed },
    coursesInProgress: leratoInProgress,
    academicProgress: computeProgress(
      2,
      leratoPassed,
      leratoFailed,
      leratoInProgress,
    ),
  },
  {
    name: "Fatima Hassan",
    studentNumber: "HSSFAT011",
    password: "Fatima@UCT11",
    degree: "BSc Physics and Astrophysics",
    year: 2,
    majors: ["Physics", "Astrophysics"],
    combinationIds: ["PHY01-Y1-B", "AST02-Y1-B", "AST02-Y2-A", "PHY01-Y2-A"],
    completedCourses: { passed: fatimaPassed, failed: fatimaFailed },
    coursesInProgress: fatimaInProgress,
    academicProgress: computeProgress(
      2,
      fatimaPassed,
      fatimaFailed,
      fatimaInProgress,
    ),
  },
  {
    name: "Luyanda Mthethwa",
    studentNumber: "MTHLUY012",
    password: "Luyanda@UCT12",
    degree: "BSc Statistics and Data Science",
    year: 3,
    majors: ["Statistics & Data Science"],
    combinationIds: ["STA13-Y1-A", "STA13-Y2-A", "STA13-Y3-D"],
    completedCourses: { passed: luyandaPassed, failed: luyandaFailed },
    coursesInProgress: luyandaInProgress,
    academicProgress: computeProgress(
      3,
      luyandaPassed,
      luyandaFailed,
      luyandaInProgress,
    ),
  },
];

// ─────────────────────────────────────────────────────────────
// SCENARIO COVERAGE SUMMARY
// ─────────────────────────────────────────────────────────────
//
// User           | Year | In-progress courses            | Notes
// ───────────────┼──────┼────────────────────────────────┼───────────────────────────────────────────
// Bandile        |  2   | S1 2025 (Y2 stream)            | Steady progress, on track
// Nikhar         |  2   | S1 2025 (Y2 dual stream)       | One Y1 failure, heavy load
// Jordan         |  3   | S1 2025 (Y3 stream)            | Triple major, high achiever
// Thandolwenkosi |  3   | FY 2025 + S1 2025 (Y3 stream)  | Near-fail Y2, final year
// Nosihle        |  1   | S1 2025 (Y1 stream)            | First year, no completed courses
// Amara          |  3   | S1 2025 + S2 2025 (Y3 stream)  | Distinction-track, NQF-7 milestone
// Keanu          |  2   | S1 2025 + S2 2025 (Y2 stream)  | ML-stream, split semesters
// Priya          |  1   | S2 2025 only (S1 done)         | Exception: currently S2; S1 in completed
// Sipho          |  2   | S1 2025 (retake + Y2 course)   | At-risk, retaking failed course
// Lerato         |  2   | S1 2025 + S2 2025 (Y2 stream)  | Alternate Y2 path (STA2020)
// Fatima         |  2   | FY+S1+S2 2025 (Y2 stream)      | High-load dual major, PHY2004W=48cr
// Luyanda        |  3   | S1 2025 + S2 2025 (Y3 stream)  | NQF-7 credits near minimum
//
// Key model change:
//   coursesTaken (flat array)  → completedCourses: { passed: Course[], failed: Course[] }
//   coursesInProgress          → ALL current-year courses (S1 + S2 + FY), not just S1
//   forecastCourses removed    → all forecast arrays were empty; removed from model
// ─────────────────────────────────────────────────────────────
