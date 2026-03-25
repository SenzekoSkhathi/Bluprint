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
// USER 1 — Skhathi Nduli
// BSc Computer Science | Year 2 | CSC05-Y1-A + CSC05-Y2-A
// SCENARIO: Happy path — on track, all prereqs met
// Y1 earned 141 ✓ | Y2 forecast 249 > 144 ✓
// ─────────────────────────────────────────────────────────────
const bandilePassed: Course[] = [
  // Year 1 — 2024
  {
    code: "CSC1015F",
    title: "Computer Science 1015F",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2024",
    grade: 72,
    passed: true,
  },
  {
    code: "MAM1031F",
    title: "Mathematics 1031F",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2024",
    grade: 65,
    passed: true,
  },
  {
    code: "ACC1021F",
    title: "Accounting for Business I",
    credits: 15,
    nqfLevel: 5,
    semester: "S1 2024",
    grade: 60,
    passed: true,
  },
  {
    code: "FTX1005F",
    title: "Managerial Finance",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2024",
    grade: 58,
    passed: true,
  },
  {
    code: "CSC1016S",
    title: "Computer Science 1016S",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2024",
    grade: 68,
    passed: true,
  },
  {
    code: "MAM1032S",
    title: "Mathematics 1032S",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2024",
    grade: 63,
    passed: true,
  },
  {
    code: "MAM1008S",
    title: "Introduction to Discrete Mathematics",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2024",
    grade: 61,
    passed: true,
  },
  {
    code: "STA1000S",
    title: "Introductory Statistics",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2024",
    grade: 55,
    passed: true,
  },
];
// earned = 141 ✓ (Y1 milestone)
const bandileFailed: Course[] = [];
const bandileInProgress: Course[] = [
  // Year 2 — 2025
  {
    code: "CSC2001F",
    title: "Computer Science 2001F",
    credits: 24,
    nqfLevel: 6,
    semester: "S1 2025",
  },
  {
    code: "MAM2010F",
    title: "Real Analysis 2010F",
    credits: 12,
    nqfLevel: 6,
    semester: "S1 2025",
  },
  {
    code: "CSC2002S",
    title: "Computer Science 2002S",
    credits: 24,
    nqfLevel: 6,
    semester: "S2 2025",
  },
  {
    code: "MAM2011F",
    title: "Linear Algebra 2011F",
    credits: 12,
    nqfLevel: 6,
    semester: "S1 2025",
  },
  {
    code: "CSC2004Z",
    title: "Programming Assessment",
    credits: 0,
    nqfLevel: 6,
    semester: "S1 2025",
  },
  {
    code: "CSC2042S",
    title: "Introduction to AI 2: Machine Learning",
    credits: 24,
    nqfLevel: 6,
    semester: "S2 2025",
  },
  {
    code: "STA2007S",
    title: "Study Design & Data Analysis for Scientists",
    credits: 24,
    nqfLevel: 6,
    semester: "S2 2025",
  },
];
// in-progress = 120 | forecast = 261 > Y2 milestone ✓

// ─────────────────────────────────────────────────────────────
// USER 2 — Nikhar Singh
// BSc Biology and Genetics | Year 2 | BIO12-Y1-A + MCB04-Y1-A + BIO12-Y2-B
// SCENARIO: Failed CEM1000W → MCB2020F prereq broken + below Y1 milestone
// Y1 earned 54 < 72 (FB5.1 alert!) | prereq violation on MCB2020F
// forecast 126 < 144 (Y2 milestone alert)
// ─────────────────────────────────────────────────────────────
const nikharPassed: Course[] = [
  // Year 1 — 2024
  {
    code: "BIO1000F",
    title: "Cell Biology 1000F",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2024",
    grade: 58,
    passed: true,
  },
  {
    code: "BIO1004S",
    title: "Biological Diversity 1004S",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2024",
    grade: 61,
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
// earned = 54 < 72 (below Y1 milestone — FB5.1 alert)
const nikharFailed: Course[] = [
  {
    code: "CEM1000W",
    title: "Chemistry 1000W",
    credits: 36,
    nqfLevel: 5,
    semester: "FY 2024",
    grade: 42,
    passed: false,
  },
];
const nikharInProgress: Course[] = [
  // Year 2 — 2025 | S1: 48 credits, S2: 24 credits — within FB3
  // MCB2020F requires CEM1000W (which was failed) → PREREQ VIOLATION
  {
    code: "BIO2014F",
    title: "Principles of Ecology and Evolution",
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
    code: "BIO2016S",
    title: "Vertebrate Physiology and Anatomy",
    credits: 24,
    nqfLevel: 6,
    semester: "S2 2025",
  },
];
// in-progress = 72 | forecast = 126 < 144 (Y2 milestone alert)

// ─────────────────────────────────────────────────────────────
// USER 3 — Jordan Masencamp
// BSc Computer Science, AI, and Mathematics | Year 3
// SCENARIO: Triple major, high achiever — NQF7 forecast 126 ≥ 120 ✓
// Y1 earned 72 ✓ | Y2 earned 132 → total 204 > 144 ✓
// Y3 forecast 330 > 228 ✓ | NQF7 forecast 126 ✓ | Needs Y4 for 360
// ─────────────────────────────────────────────────────────────
const jordanPassed: Course[] = [
  // Year 1 — 2023
  {
    code: "CSC1015F",
    title: "Computer Science 1015F",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2023",
    grade: 81,
    passed: true,
  },
  {
    code: "MAM1031F",
    title: "Mathematics 1031F",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2023",
    grade: 75,
    passed: true,
  },
  {
    code: "CSC1016S",
    title: "Computer Science 1016S",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2023",
    grade: 79,
    passed: true,
  },
  {
    code: "MAM1032S",
    title: "Mathematics 1032S",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2023",
    grade: 74,
    passed: true,
  },
  // Year 2 — 2024 | S1: 60 credits, S2: 72 credits — within FB3
  {
    code: "CSC2001F",
    title: "Computer Science 2001F",
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
    code: "MAM2010F",
    title: "Real Analysis 2010F",
    credits: 12,
    nqfLevel: 6,
    semester: "S1 2024",
    grade: 69,
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
    code: "CSC2002S",
    title: "Computer Science 2002S",
    credits: 24,
    nqfLevel: 6,
    semester: "S2 2024",
    grade: 74,
    passed: true,
  },
  {
    code: "MAM2011F",
    title: "Linear Algebra 2011F",
    credits: 12,
    nqfLevel: 6,
    semester: "S1 2024",
    grade: 71,
    passed: true,
  },
  {
    code: "MAM2013S",
    title: "Introductory Algebra 2013S",
    credits: 12,
    nqfLevel: 6,
    semester: "S2 2024",
    grade: 66,
    passed: true,
  },
];
// earned = 204 (Y1:72 + Y2:132) > 144 ✓
const jordanFailed: Course[] = [];
const jordanInProgress: Course[] = [
  // Year 3 — 2025 | S1: 54 credits, S2: 72 credits — within FB3
  {
    code: "CSC3002F",
    title: "Networks and Operating Systems",
    credits: 36,
    nqfLevel: 7,
    semester: "S1 2025",
  },
  {
    code: "CSC3041F",
    title: "Automated Planning and Control",
    credits: 18,
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
    code: "CSC3043S",
    title: "Reasoning in AI",
    credits: 18,
    nqfLevel: 7,
    semester: "S2 2025",
  },
  {
    code: "MAM3010F",
    title: "Metric Spaces 3010F",
    credits: 18,
    nqfLevel: 7,
    semester: "S2 2025",
  },
];
// in-progress = 126 NQF7 | forecast = 330 > 228 ✓ | NQF7 forecast = 126 ✓

// ─────────────────────────────────────────────────────────────
// USER 4 — Thandolwenkosi Khoza
// BSc Physics and Astrophysics | Year 3
// SCENARIO: NQF7 shortfall — only 84 NQF7 credits in forecast (< 120)
// Y1 earned 72 ✓ | Y2 earned 96 → total 168 > 144 ✓
// Y3 forecast 252 > 228 ✓ | NQF7 forecast 84 < 120 (FB7.2 ALERT!)
// ─────────────────────────────────────────────────────────────
const thandoPassed: Course[] = [
  // Year 1 — 2023
  {
    code: "MAM1000W",
    title: "Mathematics 1000W",
    credits: 36,
    nqfLevel: 5,
    semester: "FY 2023",
    grade: 67,
    passed: true,
  },
  {
    code: "PHY1004W",
    title: "Physics 1004W",
    credits: 36,
    nqfLevel: 5,
    semester: "FY 2023",
    grade: 63,
    passed: true,
  },
  // Year 2 — 2024 | FY effective S1: ~60 credits, S2: ~48 credits — within FB3
  {
    code: "PHY2004W",
    title: "Intermediate Physics 2004W",
    credits: 48,
    nqfLevel: 6,
    semester: "FY 2024",
    grade: 60,
    passed: true,
  },
  {
    code: "AST2002H",
    title: "Astrophysics 2002H",
    credits: 24,
    nqfLevel: 6,
    semester: "FY 2024",
    grade: 65,
    passed: true,
  },
  {
    code: "MAM2010F",
    title: "Real Analysis 2010F",
    credits: 12,
    nqfLevel: 6,
    semester: "S1 2024",
    grade: 58,
    passed: true,
  },
  {
    code: "MAM2040F",
    title: "Ordinary Differential Equations 2040F",
    credits: 12,
    nqfLevel: 6,
    semester: "S1 2024",
    grade: 55,
    passed: true,
  },
];
// earned = 168 (Y1:72 + Y2:96) > 144 ✓ | NQF7 earned = 0
const thandoFailed: Course[] = [];
const thandoInProgress: Course[] = [
  // Year 3 — 2025 | FY effective S1: ~42, S2: ~42 — within FB3
  // NQF7 in-progress = 84 → forecast NQF7 = 84 < 120 (SHORTFALL!)
  {
    code: "PHY3004W",
    title: "Advanced Physics 3004W",
    credits: 48,
    nqfLevel: 7,
    semester: "FY 2025",
  },
  {
    code: "AST3002F",
    title: "Stellar Astrophysics 3002F",
    credits: 18,
    nqfLevel: 7,
    semester: "S1 2025",
  },
  {
    code: "AST3003S",
    title: "Cosmology 3003S",
    credits: 18,
    nqfLevel: 7,
    semester: "S2 2025",
  },
];
// in-progress = 84 NQF7 | forecast = 252 > 228 ✓ | NQF7 forecast = 84 < 120 ALERT

// ─────────────────────────────────────────────────────────────
// USER 5 — Nosihle Sishi
// BSc Applied Statistics | Year 1 | STA01-Y1-B
// SCENARIO: Brand new student — all Y1 courses in progress, no history
// forecast = 72 = Y1 milestone ✓ | Clean onboarding baseline
// ─────────────────────────────────────────────────────────────
const nosihlePassed: Course[] = [];
const nosihleFailed: Course[] = [];
const nosihleInProgress: Course[] = [
  // Year 1 — 2025 | S1: 36 credits, S2: 36 credits — within FB3
  {
    code: "MAM1031F",
    title: "Mathematics 1031F",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2025",
  },
  {
    code: "STA1000F",
    title: "Introductory Statistics 1000F",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2025",
  },
  {
    code: "MAM1032S",
    title: "Mathematics 1032S",
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
// in-progress = 72 | forecast = 72 = Y1 milestone ✓

// ─────────────────────────────────────────────────────────────
// USER 6 — Amara Dube
// BSc Mathematical Statistics | Year 4 | STA02-Y1-B + STA02-Y2-A + STA02-Y3-A + STA02-Y4-A
// SCENARIO: Graduation eligible — forecast = 360 exactly, NQF7 forecast = 162 ✓
// Y1 earned 90 ✓ | Y2 earned 108 → total 198 > 144 ✓
// Y3 earned 126 → total 324 > 228 ✓ | Y4 forecast 360 = degree completion ✓
// ─────────────────────────────────────────────────────────────
const amaraPassed: Course[] = [
  // Year 1 — 2022 | S1: 54 credits, S2: 36 credits — within FB3
  {
    code: "MAM1031F",
    title: "Mathematics 1031F",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2022",
    grade: 78,
    passed: true,
  },
  {
    code: "STA1000F",
    title: "Introductory Statistics 1000F",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2022",
    grade: 82,
    passed: true,
  },
  {
    code: "CSC1015F",
    title: "Computer Science 1015F",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2022",
    grade: 73,
    passed: true,
  },
  {
    code: "MAM1032S",
    title: "Mathematics 1032S",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2022",
    grade: 76,
    passed: true,
  },
  {
    code: "STA1006S",
    title: "Mathematical Statistics I",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2022",
    grade: 80,
    passed: true,
  },
  // Year 2 — 2023 | S1: 60 credits, S2: 48 credits — within FB3
  {
    code: "STA2004F",
    title: "Statistical Theory and Inference",
    credits: 24,
    nqfLevel: 6,
    semester: "S1 2023",
    grade: 80,
    passed: true,
  },
  {
    code: "MAM2010F",
    title: "Real Analysis 2010F",
    credits: 12,
    nqfLevel: 6,
    semester: "S1 2023",
    grade: 75,
    passed: true,
  },
  {
    code: "CSC2001F",
    title: "Computer Science 2001F",
    credits: 24,
    nqfLevel: 6,
    semester: "S1 2023",
    grade: 71,
    passed: true,
  },
  {
    code: "STA2005S",
    title: "Linear Models 2005S",
    credits: 24,
    nqfLevel: 6,
    semester: "S2 2023",
    grade: 77,
    passed: true,
  },
  {
    code: "MAM2011F",
    title: "Linear Algebra 2011F",
    credits: 12,
    nqfLevel: 6,
    semester: "S1 2023",
    grade: 72,
    passed: true,
  },
  {
    code: "MAM2013S",
    title: "Introductory Algebra 2013S",
    credits: 12,
    nqfLevel: 6,
    semester: "S2 2023",
    grade: 70,
    passed: true,
  },
  // Year 3 — 2024 | S1: 54 credits, S2: 72 credits — within FB3 | All NQF7
  {
    code: "STA3041F",
    title: "Markov Processes and Time Series",
    credits: 36,
    nqfLevel: 7,
    semester: "S1 2024",
    grade: 74,
    passed: true,
  },
  {
    code: "MAM3010F",
    title: "Metric Spaces 3010F",
    credits: 18,
    nqfLevel: 7,
    semester: "S1 2024",
    grade: 71,
    passed: true,
  },
  {
    code: "STA3022F",
    title: "Applied Multivariate Analysis 3022F",
    credits: 36,
    nqfLevel: 7,
    semester: "S2 2024",
    grade: 68,
    passed: true,
  },
  {
    code: "STA3047S",
    title: "Introduction to Machine Learning",
    credits: 6,
    nqfLevel: 7,
    semester: "S2 2024",
    grade: 79,
    passed: true,
  },
  {
    code: "STA3048S",
    title: "Statistical Modelling and Bayesian Analysis",
    credits: 30,
    nqfLevel: 7,
    semester: "S2 2024",
    grade: 76,
    passed: true,
  },
];
// earned = 324 (Y1:90 + Y2:108 + Y3:126) > 228 ✓ | NQF7 earned = 126
const amaraFailed: Course[] = [];
const amaraInProgress: Course[] = [
  // Year 4 — 2025 | S1: 24, S2: 12 — within FB3
  // NQF7 in-progress = 36 → forecast total = 360 (graduation eligible!) ✓
  // 300-level courses only (400+ = postgrad, not allowed in undergrad)
  {
    code: "STA3030F",
    title: "Statistical Inference and Modelling 3030F",
    credits: 24,
    nqfLevel: 7,
    semester: "S1 2025",
  },
  {
    code: "STA3051S",
    title: "Experimental Design and Analysis 3051S",
    credits: 12,
    nqfLevel: 7,
    semester: "S2 2025",
  },
];
// in-progress = 36 NQF7 | forecast = 360 ✓ | NQF7 forecast = 162 ✓

// ─────────────────────────────────────────────────────────────
// USER 7 — Keanu Hendricks
// BSc Statistics and Data Science | Year 2 | STA13-Y1-A + STA13-Y2-D
// SCENARIO: Failed STA1000F in Y1, now retaking alongside Y2 courses
// Y1 earned 72 ✓ (despite failure, passed enough) | Y2 forecast 150 > 144 ✓
// Retake + new courses: S1 load 42, S2 load 36 — within FB3
// ─────────────────────────────────────────────────────────────
const keanuPassed: Course[] = [
  // Year 1 — 2024
  {
    code: "CSC1015F",
    title: "Computer Science 1015F",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2024",
    grade: 71,
    passed: true,
  },
  {
    code: "MAM1031F",
    title: "Mathematics 1031F",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2024",
    grade: 60,
    passed: true,
  },
  {
    code: "CSC1016S",
    title: "Computer Science 1016S",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2024",
    grade: 68,
    passed: true,
  },
  {
    code: "MAM1032S",
    title: "Mathematics 1032S",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2024",
    grade: 57,
    passed: true,
  },
];
// earned = 72 ✓ (Y1 milestone met despite STA1000F failure)
const keanuFailed: Course[] = [
  {
    code: "STA1000F",
    title: "Introductory Statistics 1000F",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2024",
    grade: 46,
    passed: false,
  },
];
const keanuInProgress: Course[] = [
  // Year 2 — 2025 | S1: 42 credits, S2: 36 credits — within FB3
  // Retaking STA1000F (prereq for STA2004F) alongside Y2 courses
  {
    code: "STA1000F",
    title: "Introductory Statistics 1000F (retake)",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2025",
  },
  {
    code: "CSC2001F",
    title: "Computer Science 2001F",
    credits: 24,
    nqfLevel: 6,
    semester: "S1 2025",
  },
  {
    code: "MAM2010F",
    title: "Real Analysis 2010F",
    credits: 12,
    nqfLevel: 6,
    semester: "S2 2025",
  },
  {
    code: "STA2004F",
    title: "Statistical Theory and Inference",
    credits: 24,
    nqfLevel: 6,
    semester: "S2 2025",
  },
];
// in-progress = 78 | forecast = 150 > 144 ✓ | Note: STA2004F requires STA1000F pass first

// ─────────────────────────────────────────────────────────────
// USER 8 — Priya Naidoo
// BSc Computer Science and Artificial Intelligence | Year 1
// SCENARIO: Special case — currently S2 2025; S1 2025 courses already completed
// S1 earned 36 | S2 in-progress 54 | forecast = 90 > 72 ✓
// ─────────────────────────────────────────────────────────────
const priyaPassed: Course[] = [
  // S1 2025 — completed (she is now in S2 2025)
  {
    code: "CSC1015F",
    title: "Computer Science 1015F",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2025",
    grade: 66,
    passed: true,
  },
  {
    code: "MAM1031F",
    title: "Mathematics 1031F",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2025",
    grade: 62,
    passed: true,
  },
];
// creditsEarnedThisYear = 36 (filter "2025" in passed) | earned = 36
const priyaFailed: Course[] = [];
const priyaInProgress: Course[] = [
  // S2 2025 — currently in progress | S2 load: 54 ≤ 72 ✓
  {
    code: "CSC1016S",
    title: "Computer Science 1016S",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2025",
  },
  {
    code: "MAM1032S",
    title: "Mathematics 1032S",
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
// in-progress = 54 | forecast = 90 > 72 ✓

// ─────────────────────────────────────────────────────────────
// USER 9 — Sipho Mokoena
// BSc Computer Science | Year 2 | CSC05-Y1-B + CSC05-Y2-B
// SCENARIO: Multiple alerts — below Y1 milestone + S1 overload (FB3 VIOLATION)
// Y1 earned 54 < 72 (FB5.1 ALERT!) | Failed CSC1016S
// S1 in-progress = 78 > 72 (FB3 VIOLATION!) | forecast 132 < 144 (Y2 ALERT!)
// ─────────────────────────────────────────────────────────────
const siphoPassed: Course[] = [
  // Year 1 — 2024
  {
    code: "CSC1015F",
    title: "Computer Science 1015F",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2024",
    grade: 52,
    passed: true,
  },
  {
    code: "MAM1000W",
    title: "Mathematics 1000W",
    credits: 36,
    nqfLevel: 5,
    semester: "FY 2024",
    grade: 53,
    passed: true,
  },
];
// earned = 54 < 72 (below Y1 milestone — FB5.1 alert)
const siphoFailed: Course[] = [
  {
    code: "CSC1016S",
    title: "Computer Science 1016S",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2024",
    grade: 46,
    passed: false,
  },
];
const siphoInProgress: Course[] = [
  // Year 2 — 2025 S1 | S1 load = 78 > 72 → FB3 VIOLATION
  // (No S2 courses registered — pending academic review)
  {
    code: "CSC1016S",
    title: "Computer Science 1016S (retake)",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2025",
  },
  {
    code: "CSC2001F",
    title: "Computer Science 2001F",
    credits: 24,
    nqfLevel: 6,
    semester: "S1 2025",
  },
  {
    code: "MAM2010F",
    title: "Real Analysis 2010F",
    credits: 12,
    nqfLevel: 6,
    semester: "S1 2025",
  },
  {
    code: "INF2009F",
    title: "Systems Analysis 2009F",
    credits: 24,
    nqfLevel: 6,
    semester: "S1 2025",
  },
];
// S1 in-progress = 78 > 72 (FB3 VIOLATION!) | forecast = 132 < 144 (Y2 ALERT!)

// ─────────────────────────────────────────────────────────────
// USER 10 — Lerato Molefe
// BSc Applied Statistics | Year 2 | STA01-Y1-A + STA01-Y2-B
// SCENARIO: Light load — Y2 milestone at risk (forecast 132 < 144)
// Y1 earned 72 ✓ | Only 3 courses in Y2 — under-enrolled
// S1: 36, S2: 24 — well within FB3 but insufficient for milestone
// ─────────────────────────────────────────────────────────────
const leratoPassed: Course[] = [
  // Year 1 — 2024
  {
    code: "MAM1000W",
    title: "Mathematics 1000W",
    credits: 36,
    nqfLevel: 5,
    semester: "FY 2024",
    grade: 64,
    passed: true,
  },
  {
    code: "STA1000F",
    title: "Introductory Statistics 1000F",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2024",
    grade: 61,
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
// earned = 72 ✓ (exactly meets Y1 milestone)
const leratoFailed: Course[] = [];
const leratoInProgress: Course[] = [
  // Year 2 — 2025 | S1: 36, S2: 24 — under-enrolled (should be ~72/year)
  {
    code: "STA2020F",
    title: "Applied Statistics 2020F",
    credits: 24,
    nqfLevel: 6,
    semester: "S1 2025",
  },
  {
    code: "MAM2010F",
    title: "Real Analysis 2010F",
    credits: 12,
    nqfLevel: 6,
    semester: "S1 2025",
  },
  {
    code: "STA2030S",
    title: "Statistical Theory 2030S",
    credits: 24,
    nqfLevel: 6,
    semester: "S2 2025",
  },
];
// in-progress = 60 | forecast = 132 < 144 (Y2 MILESTONE AT RISK!)

// ─────────────────────────────────────────────────────────────
// USER 11 — Fatima Hassan
// BSc Physics and Astrophysics | Year 2
// SCENARIO: Serious readmission risk — failed PHY1004W (36 cr), Y1 only 36 credits
// Y1 earned 36 << 72 (FB5.1 CRITICAL!) | Retaking PHY1004W in Y2
// forecast 102 << 144 (Y2 ALERT!) | On academic probation
// ─────────────────────────────────────────────────────────────
const fatimaPassed: Course[] = [
  // Year 1 — 2024
  {
    code: "MAM1031F",
    title: "Mathematics 1031F",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2024",
    grade: 69,
    passed: true,
  },
  {
    code: "MAM1032S",
    title: "Mathematics 1032S",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2024",
    grade: 65,
    passed: true,
  },
];
// earned = 36 << 72 (critical — well below Y1 milestone)
const fatimaFailed: Course[] = [
  {
    code: "PHY1004W",
    title: "Physics 1004W",
    credits: 36,
    nqfLevel: 5,
    semester: "FY 2024",
    grade: 43,
    passed: false,
  },
];
const fatimaInProgress: Course[] = [
  // Year 2 — 2025 | Retaking PHY1004W + catching up | FY effective S1:30, S2:36 ✓
  {
    code: "PHY1004W",
    title: "Physics 1004W (retake)",
    credits: 36,
    nqfLevel: 5,
    semester: "FY 2025",
  },
  {
    code: "MAM2010F",
    title: "Real Analysis 2010F",
    credits: 12,
    nqfLevel: 6,
    semester: "S1 2025",
  },
  {
    code: "AST1000S",
    title: "Introduction to Astronomy",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2025",
  },
];
// in-progress = 66 | forecast = 102 << 144 (READMISSION RISK — CRITICAL ALERT!)

// ─────────────────────────────────────────────────────────────
// USER 12 — Luyanda Mthethwa
// BSc Statistics and Data Science | Year 3 | STA13-Y1-A + STA13-Y2-A + STA13-Y3-D
// SCENARIO: Needs extra year — forecast 258, NQF7 shortfall 48 < 120
// Y1 earned 90 ✓ | Y2 earned 120 → total 210 > 144 ✓
// Y3 forecast 258 > 228 ✓ | NQF7 forecast 48 < 120 (FB7.2 ALERT!)
// ─────────────────────────────────────────────────────────────
const luyandaPassed: Course[] = [
  // Year 1 — 2023 | S1: 54, S2: 36 — within FB3
  {
    code: "CSC1015F",
    title: "Computer Science 1015F",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2023",
    grade: 63,
    passed: true,
  },
  {
    code: "MAM1031F",
    title: "Mathematics 1031F",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2023",
    grade: 55,
    passed: true,
  },
  {
    code: "STA1000F",
    title: "Introductory Statistics 1000F",
    credits: 18,
    nqfLevel: 5,
    semester: "S1 2023",
    grade: 68,
    passed: true,
  },
  {
    code: "CSC1016S",
    title: "Computer Science 1016S",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2023",
    grade: 60,
    passed: true,
  },
  {
    code: "MAM1032S",
    title: "Mathematics 1032S",
    credits: 18,
    nqfLevel: 5,
    semester: "S2 2023",
    grade: 52,
    passed: true,
  },
  // Year 2 — 2024 | S1: 60, S2: 60 — within FB3
  {
    code: "CSC2001F",
    title: "Computer Science 2001F",
    credits: 24,
    nqfLevel: 6,
    semester: "S1 2024",
    grade: 58,
    passed: true,
  },
  {
    code: "STA2004F",
    title: "Statistical Theory and Inference",
    credits: 24,
    nqfLevel: 6,
    semester: "S1 2024",
    grade: 62,
    passed: true,
  },
  {
    code: "MAM2010F",
    title: "Real Analysis 2010F",
    credits: 12,
    nqfLevel: 6,
    semester: "S1 2024",
    grade: 51,
    passed: true,
  },
  {
    code: "CSC2002S",
    title: "Computer Science 2002S",
    credits: 24,
    nqfLevel: 6,
    semester: "S2 2024",
    grade: 55,
    passed: true,
  },
  {
    code: "STA2005S",
    title: "Linear Models 2005S",
    credits: 24,
    nqfLevel: 6,
    semester: "S2 2024",
    grade: 60,
    passed: true,
  },
  {
    code: "MAM2011F",
    title: "Linear Algebra 2011F",
    credits: 12,
    nqfLevel: 6,
    semester: "S1 2024",
    grade: 50,
    passed: true,
  },
];
// earned = 210 (Y1:90 + Y2:120) > 144 ✓ | NQF7 earned = 0
const luyandaFailed: Course[] = [];
const luyandaInProgress: Course[] = [
  // Year 3 — 2025 | S1: 24, S2: 24 — under-loaded for Y3
  // NQF7 in-progress = 48 → forecast NQF7 = 48 < 120 (SHORTFALL!)
  {
    code: "STA3030F",
    title: "Statistical Inference and Modelling 3030F",
    credits: 24,
    nqfLevel: 7,
    semester: "S1 2025",
  },
  {
    code: "STA3022F",
    title: "Applied Multivariate Analysis 3022F",
    credits: 24,
    nqfLevel: 7,
    semester: "S2 2025",
  },
];
// in-progress = 48 NQF7 | forecast = 258 < 360 (needs Y4) | NQF7 forecast = 48 < 120 ALERT

// ─────────────────────────────────────────────────────────────
// ASSEMBLE MOCK USERS
// ─────────────────────────────────────────────────────────────
export const mockUsers: MockUser[] = [
  {
    name: "Skhathi Nduli",
    studentNumber: "NDLSEN014",
    password: "Skhathi@UCT1",
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
    combinationIds: ["BIO12-Y1-A", "MCB04-Y1-A", "BIO12-Y2-B"],
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
      "CSC05-Y2-B",
      "CSC08-Y2-A",
      "MAM02-Y2-A",
      "CSC05-Y3-A",
      "CSC08-Y3-A",
      "MAM02-Y3-A",
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
    degree: "BSc Applied Statistics",
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
    year: 4,
    majors: ["Mathematical Statistics"],
    combinationIds: ["STA02-Y1-B", "STA02-Y2-A", "STA02-Y3-A", "STA02-Y4-A"],
    completedCourses: { passed: amaraPassed, failed: amaraFailed },
    coursesInProgress: amaraInProgress,
    academicProgress: computeProgress(
      4,
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
    // Special case: currently S2 2025 — S1 2025 courses are completed, S2 2025 in progress
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
    combinationIds: ["PHY01-Y1-B", "AST02-Y1-B", "PHY01-Y2-A", "AST02-Y2-A"],
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
// User       | Yr | Alerts triggered                                    | Test purpose
// ───────────┼────┼─────────────────────────────────────────────────────┼──────────────────────────────────────
// Skhathi    |  2 | None                                                | Happy path — baseline, all green
// Nikhar     |  2 | Y1 milestone fail + prereq violation (MCB2020F)    | Broken prereq chain + credit deficit
// Jordan     |  3 | None (high achiever, NQF7 ✓)                       | Triple major, complex load validation
// Thando     |  3 | NQF7 shortfall (forecast 84 < 120)                 | FB7.2 NQF-level requirement check
// Nosihle    |  1 | None (forecast = milestone exactly)                 | New student onboarding, zero history
// Amara      |  4 | None (graduation eligible, forecast = 360)          | Degree completion + NQF7 satisfied
// Keanu      |  2 | Retake in-progress (STA1000F)                      | Failed course retake workflow
// Priya      |  1 | None (S1 done, mid-year S2 state)                  | S2-only in-progress exception logic
// Sipho      |  2 | Y1 milestone fail + S1 overload 78 > 72 (FB3!)     | FB3 credit cap violation detection
// Lerato     |  2 | Y2 forecast 132 < 144 (milestone at risk)          | Under-enrolled, milestone warning
// Fatima     |  2 | Y1 earned 36 << 72 + forecast 102 << 144 (CRIT)   | Readmission risk, worst-case scenario
// Luyanda    |  3 | NQF7 shortfall (forecast 48 < 120) + needs Y4      | NQF7 deficit + graduation delay
//
// Credit math verification:
//   Skhathi  | earned 141 | in-progress 120 | forecast 261 | NQF7 forecast   0
//   Nikhar   | earned  54 | in-progress  72 | forecast 126 | NQF7 forecast   0
//   Jordan   | earned 204 | in-progress 126 | forecast 330 | NQF7 forecast 126
//   Thando   | earned 168 | in-progress  84 | forecast 252 | NQF7 forecast  84
//   Nosihle  | earned   0 | in-progress  72 | forecast  72 | NQF7 forecast   0
//   Amara    | earned 324 | in-progress  36 | forecast 360 | NQF7 forecast 162
//   Keanu    | earned  72 | in-progress  78 | forecast 150 | NQF7 forecast   0
//   Priya    | earned  36 | in-progress  54 | forecast  90 | NQF7 forecast   0
//   Sipho    | earned  54 | in-progress  78 | forecast 132 | NQF7 forecast   0
//   Lerato   | earned  72 | in-progress  60 | forecast 132 | NQF7 forecast   0
//   Fatima   | earned  36 | in-progress  66 | forecast 102 | NQF7 forecast   0
//   Luyanda  | earned 210 | in-progress  48 | forecast 258 | NQF7 forecast  48
// ─────────────────────────────────────────────────────────────
