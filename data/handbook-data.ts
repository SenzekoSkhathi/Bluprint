import type { HandbookCategory } from "@/types/handbook";

export const handbookCategoriesSeed: HandbookCategory[] = [
  {
    id: "general",
    title: "General Handbooks",
    icon: "book-open",
    backgroundColorToken: "babyBlue",
    handbooks: [
      {
        id: "gen-1",
        title: "UCT General Rules and Policies 2025",
        description:
          "General rules governing all students, including admission, registration, examinations, and degree requirements.",
        pdfUrl: "https://www.uct.ac.za/apply/handbooks",
        publishDate: "2025",
        fileSize: "PDF",
        categoryId: "general",
      },
      {
        id: "gen-2",
        title: "Rules for Students 2025",
        description:
          "Student conduct, rights and responsibilities, disciplinary procedures, and institutional policies.",
        pdfUrl: "https://www.uct.ac.za/apply/handbooks",
        publishDate: "2025",
        fileSize: "PDF",
        categoryId: "general",
      },
      {
        id: "gen-3",
        title: "Postgraduate Rules 2025",
        description:
          "Rules applicable to all postgraduate students, including honours, master's, and doctoral degrees.",
        pdfUrl: "https://www.uct.ac.za/apply/handbooks",
        publishDate: "2025",
        fileSize: "PDF",
        categoryId: "general",
      },
    ],
  },
  {
    id: "faculty",
    title: "Faculty Handbooks",
    icon: "layers",
    backgroundColorToken: "blue",
    handbooks: [
      {
        id: "fac-1",
        title: "Faculty of Science 2025",
        description:
          "Programme and course information for the Faculty of Science, including BSc and BSc Honours degrees.",
        pdfUrl: "https://www.uct.ac.za/apply/handbooks",
        publishDate: "2025",
        fileSize: "PDF",
        categoryId: "faculty",
      },
      {
        id: "fac-2",
        title: "Faculty of Commerce 2025",
        description:
          "Programme and course information for the Faculty of Commerce, including BCom and related degrees.",
        pdfUrl: "https://www.uct.ac.za/apply/handbooks",
        publishDate: "2025",
        fileSize: "PDF",
        categoryId: "faculty",
      },
      {
        id: "fac-3",
        title: "Faculty of Humanities 2025",
        description:
          "Programme and course information for the Faculty of Humanities, including BA and related degrees.",
        pdfUrl: "https://www.uct.ac.za/apply/handbooks",
        publishDate: "2025",
        fileSize: "PDF",
        categoryId: "faculty",
      },
      {
        id: "fac-4",
        title: "Faculty of Engineering & the Built Environment 2025",
        description:
          "Programme and course information for EBE, including BSc(Eng), BAS, BSc(Property Studies), and related degrees.",
        pdfUrl: "https://www.uct.ac.za/apply/handbooks",
        publishDate: "2025",
        fileSize: "PDF",
        categoryId: "faculty",
      },
      {
        id: "fac-5",
        title: "Faculty of Health Sciences 2025",
        description:
          "Programme and course information for Health Sciences, including MBChB, BPharm, and allied health degrees.",
        pdfUrl: "https://www.uct.ac.za/apply/handbooks",
        publishDate: "2025",
        fileSize: "PDF",
        categoryId: "faculty",
      },
      {
        id: "fac-6",
        title: "Faculty of Law 2025",
        description:
          "Programme and course information for the Faculty of Law, including LLB and related degrees.",
        pdfUrl: "https://www.uct.ac.za/apply/handbooks",
        publishDate: "2025",
        fileSize: "PDF",
        categoryId: "faculty",
      },
    ],
  },
  {
    id: "fees-funding",
    title: "Fees, Funding and Financial Assistance",
    icon: "dollar-sign",
    backgroundColorToken: "success",
    handbooks: [
      {
        id: "fin-1",
        title: "Fees Handbook 2025",
        description:
          "Tuition fees, residence fees, and other institutional charges for the 2025 academic year.",
        pdfUrl: "https://www.uct.ac.za/apply/handbooks",
        publishDate: "2025",
        fileSize: "PDF",
        categoryId: "fees-funding",
      },
      {
        id: "fin-2",
        title: "Financial Aid and Scholarships 2025",
        description:
          "UCT merit bursaries, need-based financial aid, external scholarships, and application procedures.",
        pdfUrl: "https://www.uct.ac.za/apply/handbooks",
        publishDate: "2025",
        fileSize: "PDF",
        categoryId: "fees-funding",
      },
      {
        id: "fin-3",
        title: "NSFAS Guide 2025",
        description:
          "National Student Financial Aid Scheme eligibility, application process, and funding conditions at UCT.",
        pdfUrl: "https://www.uct.ac.za/apply/handbooks",
        publishDate: "2025",
        fileSize: "PDF",
        categoryId: "fees-funding",
      },
      {
        id: "fin-4",
        title: "Postgraduate Funding Guide 2025",
        description:
          "Postgraduate scholarships, research funding, NRF bursaries, and departmental funding opportunities.",
        pdfUrl: "https://www.uct.ac.za/apply/handbooks",
        publishDate: "2025",
        fileSize: "PDF",
        categoryId: "fees-funding",
      },
    ],
  },
];
