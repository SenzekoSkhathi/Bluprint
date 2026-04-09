import type { HandbookCategory } from "@/types/handbook";

export const handbookCategoriesSeed: HandbookCategory[] = [
  {
    id: "general",
    title: "General Handbooks",
    icon: "book-open",
    backgroundColorToken: "babyBlue",
    handbooks: [],
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
    handbooks: [],
  },
];
