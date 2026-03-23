export type Faculty =
  | "Computer Science & Statistics"
  | "Biology, Earth & Environmental Sciences"
  | "Chemical, Molecular & Cellular Sciences"
  | "Mathematics, Physics & Astronomy"
  | "Extended Degree Programme";

export interface AdvisorProfile {
  id: string;
  name: string;
  title: string;
  faculty: Faculty;
  office: string;
  email: string;
  specialties: string[];
  slots: string[];
}

export const advisorFaculties: Faculty[] = [
  "Computer Science & Statistics",
  "Biology, Earth & Environmental Sciences",
  "Chemical, Molecular & Cellular Sciences",
  "Mathematics, Physics & Astronomy",
  "Extended Degree Programme",
];

// Source: 2026 UCT Science Faculty Handbook, General Information, pp. 7–8
export const advisorProfiles: AdvisorProfile[] = [
  // ── Computer Science & Statistics ─────────────────────────────────────────
  {
    id: "sa-cs-01",
    name: "Assoc Prof P Marais",
    title: "Senior Student Advisor",
    faculty: "Computer Science & Statistics",
    office: "Rm 309 Computer Science Building",
    email: "patrick@cs.uct.ac.za",
    specialties: [
      "Degree planning",
      "CS curriculum structure",
      "Honours entry",
    ],
    slots: ["Mon 09:00", "Wed 11:00", "Fri 10:00"],
  },
  {
    id: "sa-cs-02",
    name: "Mr A Safla",
    title: "Senior Student Advisor",
    faculty: "Computer Science & Statistics",
    office: "Rm 307 Computer Science Building",
    email: "aslam.safla@uct.ac.za",
    specialties: ["Course selection", "Year progression", "Credit loads"],
    slots: ["Tue 10:00", "Thu 14:00"],
  },
  {
    id: "sa-cs-03",
    name: "Dr B Erni",
    title: "Senior Student Advisor",
    faculty: "Computer Science & Statistics",
    office: "Rm 6.64 PD Hahn Building",
    email: "birgit.erni@uct.ac.za",
    specialties: [
      "Statistics pathways",
      "Data science planning",
      "Elective advice",
    ],
    slots: ["Mon 11:00", "Wed 09:30", "Fri 14:00"],
  },
  {
    id: "a-cs-01",
    name: "Assoc Prof M Densmore",
    title: "Student Advisor",
    faculty: "Computer Science & Statistics",
    office: "Rm 316 Computer Science Building",
    email: "mdensmore@cs.uct.ac.za",
    specialties: ["Software engineering tracks", "Research preparation"],
    slots: ["Tue 11:00", "Thu 09:00"],
  },
  {
    id: "a-cs-02",
    name: "Dr J Chavula",
    title: "Student Advisor",
    faculty: "Computer Science & Statistics",
    office: "Rm 305 Computer Science Building",
    email: "josiah.chavula@uct.ac.za",
    specialties: ["Course prerequisites", "Degree progress checks"],
    slots: ["Mon 14:00", "Wed 10:00", "Fri 09:30"],
  },
  {
    id: "a-cs-03",
    name: "Dr Z Mahlaza",
    title: "Student Advisor",
    faculty: "Computer Science & Statistics",
    office: "Rm 306.2 Computer Science Building",
    email: "zmahlaza@cs.uct.ac.za",
    specialties: ["AI pathways", "Elective selection", "Postgraduate entry"],
    slots: ["Tue 13:00", "Thu 11:30"],
  },
  {
    id: "a-cs-04",
    name: "Mr F Meyer",
    title: "Student Advisor",
    faculty: "Computer Science & Statistics",
    office: "Rm 316 Computer Science Building",
    email: "fmeyer@cs.uct.ac.za",
    specialties: ["First-year guidance", "Credit transfer"],
    slots: ["Mon 10:30", "Wed 14:30"],
  },
  {
    id: "a-cs-05",
    name: "Dr S Er",
    title: "Student Advisor",
    faculty: "Computer Science & Statistics",
    office: "Rm 5.55 PD Hahn Building",
    email: "sebnem.er@uct.ac.za",
    specialties: ["Statistical modelling", "Applied statistics electives"],
    slots: ["Tue 09:30", "Thu 13:00", "Fri 11:00"],
  },
  {
    id: "a-cs-06",
    name: "Mr S Salau",
    title: "Student Advisor",
    faculty: "Computer Science & Statistics",
    office: "Rm 5.54 PD Hahn Building",
    email: "sulaiman.salau@uct.ac.za",
    specialties: ["Statistics major planning", "Degree audits"],
    slots: ["Mon 13:00", "Wed 11:30"],
  },
  {
    id: "a-cs-07",
    name: "Mr D Katshunga",
    title: "Student Advisor (Commerce students)",
    faculty: "Computer Science & Statistics",
    office: "Rm 5.49 PD Hahn Building",
    email: "dominique.katshunga@uct.ac.za",
    specialties: ["Commerce/Science joint degrees", "Statistics for BCom"],
    slots: ["Tue 14:00", "Thu 10:30"],
  },
  // ── Biology, Earth & Environmental Sciences ───────────────────────────────
  {
    id: "sa-bee-01",
    name: "Assoc Prof A Sloan",
    title: "Senior Student Advisor",
    faculty: "Biology, Earth & Environmental Sciences",
    office: "Rm 301 Geological Science Building",
    email: "alastair.sloan@uct.ac.za",
    specialties: [
      "Geology pathways",
      "Earth sciences planning",
      "Research tracks",
    ],
    slots: ["Mon 10:00", "Wed 13:00", "Fri 09:00"],
  },
  {
    id: "a-bee-01",
    name: "Assoc Prof J Battersby",
    title: "Student Advisor",
    faculty: "Biology, Earth & Environmental Sciences",
    office: "Rm 6.01 Environmental & Geographical Sciences Building",
    email: "jane.battersby@uct.ac.za",
    specialties: ["Environmental geography", "Urban food systems", "EGS major"],
    slots: ["Tue 10:00", "Thu 09:00"],
  },
  {
    id: "a-bee-02",
    name: "Assoc Prof J Bishop",
    title: "Student Advisor",
    faculty: "Biology, Earth & Environmental Sciences",
    office: "Rm 3.22 HW Pearson Building",
    email: "jacqueline.bishop@uct.ac.za",
    specialties: ["Biological sciences", "Marine biology tracks", "Ecology"],
    slots: ["Mon 11:00", "Wed 09:30", "Fri 13:00"],
  },
  {
    id: "a-bee-03",
    name: "Assoc Prof R Thomson",
    title: "Student Advisor",
    faculty: "Biology, Earth & Environmental Sciences",
    office: "Rm 2.06 John Day Building",
    email: "robert.thomson@uct.ac.za",
    specialties: [
      "Zoology pathways",
      "Evolutionary biology",
      "Course sequencing",
    ],
    slots: ["Tue 13:30", "Thu 11:00"],
  },
  // ── Chemical, Molecular & Cellular Sciences ───────────────────────────────
  {
    id: "sa-cmc-01",
    name: "Dr P Meyers",
    title: "Senior Student Advisor",
    faculty: "Chemical, Molecular & Cellular Sciences",
    office: "Rm 202 Molecular Biology Building",
    email: "paul.meyers@uct.ac.za",
    specialties: [
      "Biochemistry tracks",
      "Postgraduate planning",
      "Research pathways",
    ],
    slots: ["Mon 09:30", "Wed 14:00", "Fri 10:30"],
  },
  {
    id: "a-cmc-01",
    name: "Dr F Dube",
    title: "Student Advisor",
    faculty: "Chemical, Molecular & Cellular Sciences",
    office: "Rm 227B Molecular Biology Building",
    email: "felix.dube@uct.ac.za",
    specialties: ["Immunology", "Microbiology majors", "Lab-based electives"],
    slots: ["Tue 10:30", "Thu 14:00"],
  },
  {
    id: "a-cmc-02",
    name: "Dr R Hurdayal",
    title: "Student Advisor",
    faculty: "Chemical, Molecular & Cellular Sciences",
    office: "Rm 402 Molecular Biology Building",
    email: "ramona.hurdayal@uct.ac.za",
    specialties: ["Cell biology", "Degree audits", "First-year progression"],
    slots: ["Mon 13:00", "Wed 10:00", "Fri 14:30"],
  },
  {
    id: "a-cmc-03",
    name: "Dr S Ngubane",
    title: "Student Advisor",
    faculty: "Chemical, Molecular & Cellular Sciences",
    office: "Rm 6.13 PD Hahn Building",
    email: "siyabonga.ngubane@uct.ac.za",
    specialties: [
      "Chemistry pathways",
      "Honours entry",
      "Course prerequisites",
    ],
    slots: ["Tue 09:00", "Thu 13:30"],
  },
  {
    id: "a-cmc-04",
    name: "Prof G Smith",
    title: "Student Advisor",
    faculty: "Chemical, Molecular & Cellular Sciences",
    office: "Rm 7.08 PD Hahn Building",
    email: "gregory.smith@uct.ac.za",
    specialties: ["Medicinal chemistry", "Research project planning"],
    slots: ["Mon 11:30", "Wed 15:00"],
  },
  // ── Mathematics, Physics & Astronomy ─────────────────────────────────────
  {
    id: "sa-mpa-01",
    name: "Dr S Wheaton",
    title: "Senior Student Advisor",
    faculty: "Mathematics, Physics & Astronomy",
    office: "Rm 4T4 RW James Building",
    email: "spencer.wheaton@uct.ac.za",
    specialties: ["Physics curriculum", "EDP support", "Honours preparation"],
    slots: ["Mon 10:00", "Wed 11:00", "Fri 09:30"],
  },
  {
    id: "a-mpa-01",
    name: "Dr E Fredericks",
    title: "Student Advisor",
    faculty: "Mathematics, Physics & Astronomy",
    office: "Rm M3.10.1 Mathematics Building",
    email: "ebrahim.fredericks@uct.ac.za",
    specialties: ["Mathematics major planning", "Applied maths electives"],
    slots: ["Tue 09:00", "Thu 10:00", "Fri 14:00"],
  },
  {
    id: "a-mpa-02",
    name: "Dr T Salagaram",
    title: "Student Advisor",
    faculty: "Mathematics, Physics & Astronomy",
    office: "Rm 5.11 RW James Building",
    email: "trisha.salagaram@uct.ac.za",
    specialties: ["Physics pathways", "Course load planning"],
    slots: ["Mon 14:00", "Wed 09:00"],
  },
  {
    id: "a-mpa-03",
    name: "Mr T van Heerden",
    title: "Student Advisor",
    faculty: "Mathematics, Physics & Astronomy",
    office: "Rm M1.01.6 Mathematics Building",
    email: "thomas.vanheerden@uct.ac.za",
    specialties: [
      "First-year maths guidance",
      "Credit transfer",
      "Degree audits",
    ],
    slots: ["Tue 11:00", "Thu 12:00", "Fri 10:00"],
  },
  // ── Extended Degree Programme ─────────────────────────────────────────────
  {
    id: "sa-edp-01",
    name: "Dr C Edmonds-Smith",
    title: "Senior Student Advisor",
    faculty: "Extended Degree Programme",
    office: "Rm 6.08 PD Hahn Building",
    email: "c.edmonds-smith@uct.ac.za",
    specialties: [
      "EDP progression planning",
      "Transition to 3-year BSc",
      "Academic load balancing",
      "Readmission guidance",
    ],
    slots: ["Mon 09:00", "Tue 13:00", "Thu 10:00", "Fri 11:30"],
  },
];
