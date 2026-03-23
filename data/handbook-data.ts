import type { HandbookCategory } from "@/types/handbook";

export const handbookCategoriesSeed: HandbookCategory[] = [
  {
    id: "general",
    title: "General Handbooks",
    icon: "book-open",
    backgroundColorToken: "babyBlue",
    handbooks: [
      {
        id: "h1",
        title: "Student Handbook",
        description:
          "Complete guide to student life, policies, and expectations at the institution",
        pdfUrl: "https://example.com/student-handbook.pdf",
        publishDate: "Sep 2025",
        fileSize: "4.2 MB",
        categoryId: "general",
      },
      {
        id: "h2",
        title: "Campus Guide",
        description: "Maps, facilities, dining options, and campus navigation",
        pdfUrl: "https://example.com/campus-guide.pdf",
        publishDate: "Aug 2025",
        fileSize: "8.5 MB",
        categoryId: "general",
      },
      {
        id: "h3",
        title: "Code of Conduct",
        description:
          "Student conduct standards, disciplinary procedures, and rights",
        pdfUrl: "https://example.com/code-of-conduct.pdf",
        publishDate: "Jul 2025",
        fileSize: "2.1 MB",
        categoryId: "general",
      },
    ],
  },
  {
    id: "academic",
    title: "Academic Handbooks",
    icon: "graduation-cap",
    backgroundColorToken: "blue",
    handbooks: [
      {
        id: "h4",
        title: "Course Catalog 2025-2026",
        description:
          "Complete course listings for all programs and departments",
        pdfUrl: "https://example.com/course-catalog.pdf",
        publishDate: "Jun 2025",
        fileSize: "12.3 MB",
        categoryId: "academic",
      },
      {
        id: "h5",
        title: "Academic Policies",
        description:
          "Grading, attendance, academic integrity, and degree requirements",
        pdfUrl: "https://example.com/academic-policies.pdf",
        publishDate: "May 2025",
        fileSize: "3.5 MB",
        categoryId: "academic",
      },
      {
        id: "h6",
        title: "Degree Requirements",
        description:
          "Detailed requirements for each undergraduate and graduate degree",
        pdfUrl: "https://example.com/degree-requirements.pdf",
        publishDate: "Apr 2025",
        fileSize: "5.8 MB",
        categoryId: "academic",
      },
      {
        id: "h7",
        title: "Exam Schedule Policy",
        description:
          "Examination scheduling, deferrals, and supplemental exams",
        pdfUrl: "https://example.com/exam-policy.pdf",
        publishDate: "Mar 2025",
        fileSize: "1.9 MB",
        categoryId: "academic",
      },
    ],
  },
  {
    id: "financial",
    title: "Financial Handbooks",
    icon: "dollar-sign",
    backgroundColorToken: "success",
    handbooks: [
      {
        id: "h8",
        title: "Tuition & Fees",
        description: "Tuition costs, fee structures, and payment schedules",
        pdfUrl: "https://example.com/tuition-fees.pdf",
        publishDate: "Feb 2025",
        fileSize: "2.7 MB",
        categoryId: "financial",
      },
      {
        id: "h9",
        title: "Financial Aid Guide",
        description:
          "Student loans, grants, OSAP, and financial aid application",
        pdfUrl: "https://example.com/financial-aid.pdf",
        publishDate: "Jan 2025",
        fileSize: "6.1 MB",
        categoryId: "financial",
      },
      {
        id: "h10",
        title: "Scholarships & Awards",
        description:
          "Available scholarships, awards, and competitive funding opportunities",
        pdfUrl: "https://example.com/scholarships.pdf",
        publishDate: "Dec 2024",
        fileSize: "7.4 MB",
        categoryId: "financial",
      },
      {
        id: "h11",
        title: "Student Financing Options",
        description:
          "Private loans, payment plans, and financial planning resources",
        pdfUrl: "https://example.com/financing-options.pdf",
        publishDate: "Nov 2024",
        fileSize: "3.3 MB",
        categoryId: "financial",
      },
    ],
  },
  {
    id: "resources",
    title: "Student Resources",
    icon: "help-circle",
    backgroundColorToken: "deepBlue",
    handbooks: [
      {
        id: "h12",
        title: "Library Services",
        description: "Library hours, research databases, and citation guides",
        pdfUrl: "https://example.com/library-guide.pdf",
        publishDate: "Oct 2025",
        fileSize: "4.9 MB",
        categoryId: "resources",
      },
      {
        id: "h13",
        title: "IT Services & Support",
        description: "Tech support, software access, network, and IT help desk",
        pdfUrl: "https://example.com/it-services.pdf",
        publishDate: "Sep 2025",
        fileSize: "2.2 MB",
        categoryId: "resources",
      },
      {
        id: "h14",
        title: "Student Support Services",
        description:
          "Counseling, academic advising, accessibility, and wellness services",
        pdfUrl: "https://example.com/support-services.pdf",
        publishDate: "Aug 2025",
        fileSize: "5.6 MB",
        categoryId: "resources",
      },
      {
        id: "h15",
        title: "Career Services",
        description:
          "Resume help, career counseling, internships, and job boards",
        pdfUrl: "https://example.com/career-services.pdf",
        publishDate: "Jul 2025",
        fileSize: "3.8 MB",
        categoryId: "resources",
      },
    ],
  },
];
