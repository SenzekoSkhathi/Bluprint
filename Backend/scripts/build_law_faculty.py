"""
Build Law faculty handbook data from 2026 Law Faculty Handbook.
Creates: meta.json, courses/_index.json, majors/*.json, rules/faculty_rules.json, equivalences.json

All course codes, NQF credits, and NQF levels verified against handbook pages 37-66.
Curriculum structures verified against pages 41-44.
Rules verified against pages 40-50.
"""
import json
import os

BASE = os.path.join(os.path.dirname(__file__), '..', 'data', 'handbook', 'faculties', 'law')

def semester_from_suffix(code):
    suffix = code[-1]
    m = {
        'F': 'S1', 'S': 'S2', 'W': 'FY', 'H': 'FY',
        'X': 'varies', 'Z': 'varies', 'M': 'varies',
        'L': 'winter', 'U': 'summer', 'P': 'summer'
    }
    return m.get(suffix, 'varies')

def year_level(code):
    for c in code:
        if c.isdigit():
            return int(c)
    return 0

def extract_prefix(code):
    prefix = ''
    for c in code:
        if c.isalpha():
            prefix += c
        else:
            break
    return prefix

# ============================================================
# META
# ============================================================

meta = {
    "$schema": "handbook-meta-v1",
    "university": "University of Cape Town",
    "faculty": "Faculty of Law",
    "faculty_slug": "law",
    "year": 2026,
    "handbook_title": "Faculty of Law Handbook",
    "handbook_series": "Book 10 in the series of handbooks",
    "contact": {
        "postal_address": "University of Cape Town, Private Bag X3, 7701 Rondebosch",
        "deans_office": "Wilfred and Jules Kramer Building, Middle Campus",
        "office_hours": "Monday to Friday: 08h30 - 16h30",
        "telephones": {
            "deans_office": "(021) 650-3086",
            "faculty_office": "(021) 650-3086",
            "accounts_and_fees": "(021) 650-1704",
            "admissions": "(021) 650-2128"
        },
        "websites": {
            "uct": "http://www.uct.ac.za",
            "law_faculty": "http://www.law.uct.ac.za",
            "dean_email": "lawfaculty@uct.ac.za"
        }
    },
    "qualifications": {
        "undergraduate_degrees": [
            {
                "name": "Bachelor of Laws",
                "abbreviation": "LLB",
                "saqa_id": 10695,
                "nqf_level": 8,
                "streams": [
                    {
                        "name": "Three-year graduate LLB",
                        "programme_code": "LP001",
                        "duration_years": 3,
                        "total_credits": 504,
                        "entry": "Holders of an approved degree"
                    },
                    {
                        "name": "Four-year undergraduate LLB",
                        "programme_code": "LB002",
                        "duration_years": 4,
                        "total_credits": 637,
                        "entry": "Direct from school"
                    },
                    {
                        "name": "Combined LLB",
                        "duration_years": "5-6",
                        "entry": "Via Humanities or Commerce degree with law courses, then graduate stream"
                    }
                ]
            }
        ],
        "postgraduate_qualifications": [
            {"name": "Postgraduate Diploma in Law", "abbreviation": "PGDip(Law)", "saqa_id": 4393},
            {"name": "Master of Laws", "abbreviation": "LLM", "saqa_id": 10701},
            {"name": "Master of Philosophy in Law", "abbreviation": "MPhil(Law)", "saqa_id": 104782},
            {"name": "Doctor of Laws", "abbreviation": "LLD"},
            {"name": "Doctor of Philosophy in Law", "abbreviation": "PhD(Law)"}
        ]
    },
    "course_code_system": {
        "description": "Eight character code AAAnnnnB: AAA=department, nnnn=year level+number, B=suffix.",
        "suffix_codes": {
            "F": {"meaning": "First-semester course", "semester": "S1"},
            "S": {"meaning": "Second-semester course", "semester": "S2"},
            "W": {"meaning": "Whole-year course", "semester": "FY"},
            "H": {"meaning": "Half course taught over whole year", "semester": "FY"},
            "X": {"meaning": "Not classified (e.g. community service)", "semester": "varies"}
        },
        "course_levels": {
            "preliminary": "Foundation law courses (years 1-2 undergrad, year 1 graduate)",
            "intermediate": "Core substantive law courses (year 3 undergrad, year 2 graduate)",
            "final": "Compulsory + elective courses (year 4 undergrad, year 3 graduate)"
        },
        "note": "Half courses (F/S/H) are 18 NQF credits. Full courses (W) are 36 NQF credits. Final Level electives are 9 NQF credits each."
    },
    "departments": [
        "Department of Commercial Law",
        "Department of Private Law",
        "Department of Public Law"
    ],
    "department_prefixes": [
        "CML", "PVL", "PBL", "DOL"
    ],
    "cross_faculty_departments": [
        {"department": "Mathematics & Applied Mathematics", "prefix": "MAM", "home_faculty": "science"},
        {"department": "English Language and Literature", "prefix": "ELL", "home_faculty": "humanities"},
        {"department": "Language Studies", "prefix": "SLL", "home_faculty": "humanities"},
        {"department": "Pathology", "prefix": "PTY", "home_faculty": "health-sciences"}
    ],
    "dean": "Professor M Paleker"
}

# ============================================================
# ALL COURSES — verified against handbook pages 54-66
# Format: (code, title, nqf_credits, nqf_level)
# ============================================================

courses_raw = [
    # ── PRELIMINARY LEVEL (handbook pp. 55-57) ──

    # Private Law
    ("PVL1003W", "Foundations of South African Law", 36, 5),
    ("PVL1004F", "South African Private Law: System and Context", 18, 5),
    ("PVL1008H", "Law of Persons and Family", 18, 5),
    ("PVL2002H", "Law of Property", 18, 6),
    ("PVL2003H", "Law of Succession", 18, 7),

    # Public Law
    ("PBL2000W", "Constitutional Law", 36, 7),

    # ── INTERMEDIATE LEVEL (handbook pp. 57-60) ──

    # Commercial Law
    ("CML3001W", "Corporation Law", 36, 7),

    # Public Law
    ("PBL3001F", "International Law", 18, 7),
    ("PBL3801W", "Criminal Law", 36, 7),

    # Private Law
    ("PVL3003S", "African Customary Law", 18, 7),
    ("PVL3003F", "Law of Delict", 18, 7),
    ("PVL3005W", "Law of Contract", 36, 7),
    ("PVL3006S", "Jurisprudence", 18, 7),

    # Dean of Law
    ("DOL3000X", "Moot Competition", 9, 7),
    ("DOL3001X", "Community Service", 0, 7),
    ("DOL3002X", "Intermediate Year Skills Component", 0, 7),

    # ── FINAL LEVEL — Compulsory (handbook pp. 61-62) ──

    # Commercial Law
    ("CML4004S", "Labour Law", 18, 8),
    ("CML4006W", "Commercial Transactions Law", 36, 8),

    # Public Law
    ("PBL4001W", "Administrative Law", 36, 8),
    ("PBL4801F", "Law of Evidence", 18, 8),
    ("PBL4802F", "Criminal Procedure", 18, 8),

    # Private Law
    ("PVL4008H", "Civil Procedure", 18, 8),

    # Dean of Law
    ("DOL4000H", "Integrative Assessment Moot", 0, 8),

    # ── FINAL LEVEL — Electives (handbook pp. 63-66, all 9cr NQF 8) ──

    # Dean's Office electives
    ("DOL4500F", "Legal Practice", 9, 8),
    ("DOL4500S", "Legal Practice", 9, 8),

    # Commercial Law lecture & exam electives
    ("CML4501S", "Dispute Resolution", 9, 8),
    ("CML4504S", "Trade Marks and Unlawful Competition", 9, 8),
    ("CML4506F", "Fundamental Principles of Tax Law", 9, 8),
    ("CML4507S", "Statutory Tax Law of Entities and Transactions", 9, 8),
    ("CML4510F", "Cyberlaw", 9, 8),
    ("CML4602S", "Competition Law", 9, 8),
    ("CML4603S", "Banking Law", 9, 8),
    ("CML4629S", "Law and Regional Integration in Africa", 9, 8),

    # Commercial Law seminars & research paper electives
    ("CML4401H", "Independent Research Option (Commercial Law)", 9, 8),
    ("CML4606H", "Moot Caput", 9, 8),

    # Private Law lecture & exam electives
    ("PVL4504S", "South African Mineral Law: Theory, Context and Reform", 9, 8),
    ("PVL4505F", "The Law of Cession", 9, 8),
    ("PVL4507F", "Conflict of Laws", 9, 8),
    ("PVL4511F", "Unjustified Enrichment", 9, 8),
    ("PVL4512S", "Advanced Studies in African Customary Law", 9, 8),
    ("PVL4513F", "Advanced Contract Law", 9, 8),

    # Private Law seminars & research paper electives
    ("PVL4401H", "Independent Research Option (Private Law)", 9, 8),
    ("PVL4601S", "Advanced Property Law: Capita Selecta", 9, 8),
    ("PVL4602S", "Civil Justice Reform", 9, 8),
    ("PVL4606F", "Spatial Justice, Ubuntu and the Nomos of Apartheid", 9, 8),
    ("PVL4609H", "Moot Caput", 9, 8),

    # Public Law lecture & exam electives
    ("PBL4111S", "Public Interest Litigation", 9, 8),
    ("PBL4501F", "Criminology: Selected Issues", 9, 8),
    ("PBL4502F", "Environmental Law", 9, 8),
    ("PBL4504F", "International Criminal Law and Africa", 9, 8),
    ("PBL4505S", "International Human Rights Law and the Constitution", 9, 8),
    ("PBL4506F", "Refugee and Immigration Law", 9, 8),

    # Public Law seminars & research paper electives
    ("PBL4401H", "Independent Research Option (Public Law)", 9, 8),
    ("PBL4402H", "Independent Research Option (Criminal Justice)", 9, 8),
    ("PBL4601S", "Constitutional Litigation", 9, 8),
    ("PBL4602F", "Criminal Justice and the Constitution", 9, 8),
    ("PBL4604F", "Social Justice and the Constitution", 9, 8),
    ("PBL4605F", "Women and Law", 9, 8),
    ("PBL4606H", "Moot Caput", 9, 8),

    # ── NON-LAW COURSES used in LLB curricula ──

    # Cross-faculty (appearing in undergraduate LLB Year 1)
    ("MAM1013F", "Law That Counts: Quantitative Literacy for Law", 18, 5),

    # From other departments (Final Level)
    ("PTY4008S", "Medicina Forensis", 9, 8),
]

# Not offered in 2026 but in handbook (kept for reference, not included in active index):
# CML4502F Insurance Law, CML4503F Copyright & Patents, CML4505F International Trade and Maritime Law,
# CML4508S Trusts and Estate Planning, CML4509S Ways of Doing Business,
# CML4601F Theory and Practice of Commercial Regulation, CML4604F Current Developments in Company Law,
# CML4605F Law Development Labour and Social Policy,
# DOL4501S Law Democracy and Social Justice,
# PVL4603F Jurisprudence and SA Law, PVL4604S Rhetoric Law and Society,
# PVL4608S SA Law of Delict in Theoretical and Comparative Perspective,
# PBL4503F European Union Law, PBL4508F Local Government Law

# ============================================================
# RICH COURSE DETAILS — verified against handbook pages 54-80
# Each entry maps code → {convener, prerequisites, corequisites,
#   outline, lecture_times, dp_requirements, assessment}
# ============================================================

DEPT_SLUGS = {
    "CML": "commercial-law",
    "PVL": "private-law",
    "PBL": "public-law",
    "DOL": "deans-office-law",
    "MAM": "mathematics-applied-mathematics",
    "PTY": "pathology",
}

course_details = {
    # ── PRELIMINARY LEVEL (pp. 55-57) ──

    "PVL1003W": {
        "convener": "M Baase",
        "prerequisites": {
            "text": "Undergraduate LLB students: concurrent registration with PVL1004F and PVL1008H. Graduate LLB students: concurrent registration with PVL1004F, PVL1008H, PBL2000W, PVL2002H, PVL2003H.",
            "parsed": {
                "type": "concurrent_registration",
                "undergraduate": ["PVL1004F", "PVL1008H"],
                "graduate": ["PVL1004F", "PVL1008H", "PBL2000W", "PVL2002H", "PVL2003H"]
            }
        },
        "corequisites": [],
        "outline": "An introduction to the South African legal system is covered in the first section of the course. This is followed by an introduction to critical post-apartheid jurisprudence, including transformative constitutionalism and decolonisation. An outline of the development of public law culture, viewed through the lens of the rule of law, follows in the second semester. Finally, a section on the rules of interpretation of law and the practical application of those rules concludes the course.",
        "lecture_times": "Three lectures per week.",
        "dp_requirements": "None",
        "assessment": "Coursework 50%, final examination 50%."
    },

    "PVL1004F": {
        "convener": "I Ahmed",
        "prerequisites": {
            "text": "Corequisites — Undergraduate LLB students: PVL1003W and PVL1008H. Graduate LLB students: concurrent registration with PVL1003W, PVL1008H, PBL2000W, PVL2002H, PVL2003H.",
            "parsed": {
                "type": "concurrent_registration",
                "undergraduate": ["PVL1003W", "PVL1008H"],
                "graduate": ["PVL1003W", "PVL1008H", "PBL2000W", "PVL2002H", "PVL2003H"]
            }
        },
        "corequisites": [],
        "outline": "The course serves primarily as an introduction to the common law of property and obligations, although other areas of private law may be covered. Its main aims are, first, to provide both a map of the law and an understanding of the operation of the system of private law rules; and, second, to provide students with an understanding of the development of legal rules in their historical and comparative contexts.",
        "lecture_times": "Three lectures per week.",
        "dp_requirements": "None",
        "assessment": "Coursework 50%, Final Examination 50%."
    },

    "PVL1008H": {
        "convener": "A/Prof A Barratt",
        "prerequisites": {
            "text": "Corequisites — Undergraduate LLB students: concurrent registration with PVL1003W and PVL1004F. Graduate LLB students: concurrent registration with PVL1003W, PVL1004F, PVL2002H, PVL2003H and PBL2000W.",
            "parsed": {
                "type": "concurrent_registration",
                "undergraduate": ["PVL1003W", "PVL1004F"],
                "graduate": ["PVL1003W", "PVL1004F", "PVL2002H", "PVL2003H", "PBL2000W"]
            }
        },
        "corequisites": [],
        "outline": "This is a foundational law course and focuses particularly on developing legal problem-solving skills. The course examines the nature of legal personality; the principles of legal capacity; and the principles of domicile. Most of the course focuses on Family Law and looks particularly at the legal relationships between parents and children; the personal consequences of marriage; the law of marital property; divorce; and the law governing unmarried people who live in long-term domestic partnerships. The course also examines the ways in which South African family law is changing to become compliant with the Constitution and Bill of Rights.",
        "lecture_times": "Thirty-six lectures and three tutorials.",
        "dp_requirements": "None",
        "assessment": "Coursework 50%, Final Examination 50%."
    },

    "PVL2002H": {
        "convener": "Dr G Mathiba",
        "prerequisites": {
            "text": "Undergraduate LLB students: concurrent registration with PBL2000W and PVL2003H. Graduate LLB students: concurrent registration with PVL1003W, PVL1004F, PVL1008H, PBL2000W and PVL2003H.",
            "parsed": {
                "type": "concurrent_registration",
                "undergraduate": ["PBL2000W", "PVL2003H"],
                "graduate": ["PVL1003W", "PVL1004F", "PVL1008H", "PBL2000W", "PVL2003H"]
            }
        },
        "corequisites": [],
        "outline": "The purpose of this course is to introduce students to fundamental concepts and common law principles of the South African Law of Property as regards what is property, how rights in property are acquired or lost and are protected. The law is examined in its current constitutional and socio-political context. In addition to the focus on the content of this area of law, considerable attention is given to development of appropriate analytical and problem-solving skills, independent and active learning as well as appropriate study methodology and techniques.",
        "lecture_times": "Thirty-six lectures.",
        "dp_requirements": "None",
        "assessment": "Coursework 50%, Final Examination 50%."
    },

    "PVL2003H": {
        "convener": "Prof F du Toit",
        "prerequisites": {
            "text": "Undergraduate LLB students: concurrent registration with PBL2000W and PVL2002H. Graduate LLB students: concurrent registration with PVL1003W, PVL1004F, PVL1008H, PBL2000W and PVL2002H.",
            "parsed": {
                "type": "concurrent_registration",
                "undergraduate": ["PBL2000W", "PVL2002H"],
                "graduate": ["PVL1003W", "PVL1004F", "PVL1008H", "PBL2000W", "PVL2002H"]
            }
        },
        "corequisites": [],
        "outline": "The course is concerned with the consequences of death and in particular, the devolution of a person's property on death. The course considers the distinction between testate and intestate succession; the devolution under intestacy law; testamentary capacity; formalities for wills; revocation and revival of wills; capacity to inherit; freedom of testation; vesting and conditional bequests; the different kinds of testamentary vehicles and the content of wills; doctrine of collation; interpretation of wills and succession by contract. The course will also consider legal ethics in the context of the law of Succession.",
        "lecture_times": "Thirty-six lectures.",
        "dp_requirements": "Please refer to course handout.",
        "assessment": "Coursework 50%, Final examination 50%."
    },

    "PBL2000W": {
        "convener": "Prof P de Vos",
        "prerequisites": {
            "text": "Undergraduate LLB students: concurrent registration with PVL2002H. Graduate LLB students: concurrent registration with PVL1003W, PVL1004F, PVL1008H, PVL2002H, PVL2003H.",
            "parsed": {
                "type": "concurrent_registration",
                "undergraduate": ["PVL2002H"],
                "graduate": ["PVL1003W", "PVL1004F", "PVL1008H", "PVL2002H", "PVL2003H"]
            }
        },
        "corequisites": [],
        "outline": "The first part of the course provides an introduction to the history of South African constitutional law and basic concepts such as democracy, legitimacy, constitutionalism, federalism, separation of powers and the rule of law. It then considers the institutional framework provided by the South African Constitution in detail. The second part of the course focuses on the protection of human rights in the Constitution. It examines the operation of the Bill of Rights and, using both SA cases and the jurisprudence of constitutional courts in other jurisdictions as well as the European Court of Human Rights, considers freedom of speech, equality and affirmative action, the protection of property rights and social and economic rights among other issues.",
        "lecture_times": "Whole year course.",
        "dp_requirements": "None",
        "assessment": "November examination (3 hour) 60%; The year mark contributes the remaining 40%."
    },

    # ── INTERMEDIATE LEVEL (pp. 57-60) ──

    "CML3001W": {
        "convener": "Dr T Thabane (semester 1) and A/Prof B Mupangavanhu (semester 2)",
        "prerequisites": {
            "text": "All Preliminary Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary"]}
        },
        "corequisites": [],
        "outline": "The course will provide an overview of the law governing various structures available for the carrying on of business and will then focus on the general principles of Company Law, the provisions of the Companies Act 71 of 2008, corporate governance and corporate law reform.",
        "lecture_times": "Seventy-two lectures and tutorials.",
        "dp_requirements": "Please refer to the course handout and/or the intermediate year schedule.",
        "assessment": "Optional essay/opinion 20%, mid-year test (compulsory) 30% and examination 50% (if no essay/opinion submitted: 40% mid-year test and 60% examination)."
    },

    "PBL3001F": {
        "convener": "A/Prof H Woolaver",
        "prerequisites": {
            "text": "All Preliminary Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary"]}
        },
        "corequisites": [],
        "outline": "The course addresses the following aspects of international law: introduction and sources of law; subjects and objects of international law; the relationship between international and South African law; state responsibility; peaceful settlement of disputes; the use of force; the United Nations and other key international organisations; and international criminal law.",
        "lecture_times": "Half course, first semester.",
        "dp_requirements": "Please refer to the course handout and/or the intermediate year schedule.",
        "assessment": "Optional essay/opinion: 20%; Mid-course assessment: 30%; Final exam: 50% (if essay/opinion) or 70% (if no essay/opinion)."
    },

    "PBL3801W": {
        "convener": "C Willis-Smith",
        "prerequisites": {
            "text": "All Preliminary Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary"]}
        },
        "corequisites": [],
        "outline": "The course covers the general principles of criminal law. Students are introduced to these principles by a brief examination of the nature of criminal law and selected specific offences, the principle of legality and the operation of the Bill of Rights on the rules of criminal law. Analysis of principles: the course focuses on (i) voluntariness of conduct (including the defence of automatism); (ii) causation; (iii) defences excluding unlawfulness (private defence, necessity, impossibility, obedience to orders, public authority and consent); (iv) capacity (including the defences of youth, insanity, intoxication, provocation and emotional stress); (v) fault in the forms of intention and negligence; (vi) common purpose, accomplice and accessory-after-the-fact liability; (vii) attempt, incitement and conspiracy. Selected specific offences: Essential elements of crimes such as murder, culpable homicide, assault, rape, theft, robbery, and fraud are considered.",
        "lecture_times": "Whole year course.",
        "dp_requirements": "Please refer to the course handout and/or the intermediate year schedule.",
        "assessment": "Optional essay/opinion 20%; June test 20%; Assignment/test 10%; November examination (2hour): 50% (if essay/opinion), 70% (if no essay/opinion)."
    },

    "PVL3003S": {
        "convener": "A/Prof F Osman",
        "prerequisites": {
            "text": "All Preliminary Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary"]}
        },
        "corequisites": [],
        "outline": "The course provides an overview of the historical recognition of customary law during the colonial and apartheid periods to demonstrate the effect of these policies on customary law today. It analyses the Constitution's recognition of customary law and impact the Constitution has had on both the application and development of customary law. The course further facilitates an understanding of legal theory with the objective of analysing whether customary law is consistent with modern legal theory. At a substantive level, the course examines the customary law regulating marriage, succession, traditional authority, land and dispute resolution.",
        "lecture_times": "Thirty-six lectures and tutorials.",
        "dp_requirements": "Please refer to the course handout and/or the intermediate year schedule.",
        "assessment": "Coursework 50%, Final Examination 50%."
    },

    "PVL3003F": {
        "convener": "C Le Roith",
        "prerequisites": {
            "text": "All Preliminary Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary"]}
        },
        "corequisites": [],
        "outline": "The course deals with the general principles of the South African law of delict and their application to specific delicts. Among the topics that could be discussed are the following: fault (negligence and intent), wrongfulness, causation, remoteness, damage, contributory negligence and the apportionment of damages, self-defence, necessity, statutory authority, consent, vicarious liability, omissions, pure economic loss, emotional shock, defamation, privacy, wrongful arrest, and insult.",
        "lecture_times": "Thirty-six lectures and tutorials.",
        "dp_requirements": "Please refer to the course handout and/or the intermediate year schedule.",
        "assessment": "Coursework 30%, Examination 70%."
    },

    "PVL3005W": {
        "convener": "Prof T Naudé",
        "prerequisites": {
            "text": "All Preliminary Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary"]}
        },
        "corequisites": [],
        "outline": "The course aims to give students a thorough understanding of the general principles of the law of contract in South Africa - knowledge which is essential for mastery of many other subjects in the LLB curriculum, and for success in legal practice. All aspects of the general principles of the law of contract will be covered, including: the nature and basis of contract; formation and termination of a contract; the contents and operation of contracts; breach of contract and remedies for breach; as well as relevant provisions of the Consumer Protection Act and other legislation bearing on contracts.",
        "lecture_times": "Seventy-two lectures and tutorials.",
        "dp_requirements": "Please refer to the course handout and/or the intermediate year schedule.",
        "assessment": "If essay/opinion: 20% for essay/opinion, 30% coursework, 50% exam. If no essay/opinion: 40% coursework, 60% exam."
    },

    "PVL3006S": {
        "convener": "Prof AJ Barnard-Naudé and Dr K Moshikaro",
        "prerequisites": {
            "text": "All Preliminary Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary"]}
        },
        "corequisites": [],
        "outline": "This course deals with central issues in analytical, normative, and critical and postcolonial jurisprudence. Topics that could be discussed include the following: the nature of law, the nature of adjudication, and the role of morality in each. Authors whose work could be discussed include the following: John Austin, Hans Kelsen, H L A Hart, Joseph Raz, Jules Coleman, Ronald Dworkin, John Finnis, Duncan Kennedy, Kimberlé Crenshaw, Upendra Baxi and Cornel West.",
        "lecture_times": "Thirty-six lectures and tutorials.",
        "dp_requirements": "Please refer to the course handout and/or the intermediate year schedule.",
        "assessment": "Coursework 30%, November examination 70%."
    },

    "DOL3000X": {
        "convener": "TBA",
        "prerequisites": {
            "text": "Intermediate and final year students selected to participate in national or international moot competitions.",
            "parsed": {"type": "selection", "note": "By selection for moot competitions"}
        },
        "corequisites": [],
        "outline": "Intermediate and final year students selected to participate in national or international moot competitions may register for this course. To complete it successfully, students must submit adequate heads of argument and participate in a national or international moot competition presided over by more than one person under the supervision of a Faculty academic member of staff. Students may be credited with 9 NQF credits and may be exempted from a seminars-and-research-paper elective (Moot Caput option) in the Final Level of the LLB.",
        "lecture_times": "Not applicable.",
        "dp_requirements": "None",
        "assessment": "Heads of argument count for 100% unless the supervisor agrees to allocate a percentage of the mark to oral presentation. The percentage of the mark allocated to oral presentation shall be in the supervisor's discretion and may not exceed 50%."
    },

    "DOL3001X": {
        "convener": "A/Prof J Omar",
        "prerequisites": {
            "text": "For students who first register for the course in or after 2020, all Preliminary Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary"]}
        },
        "corequisites": [],
        "outline": "It is a compulsory requirement for the LLB degree that, during the course of the degree, all law students must complete a certain number of hours of community service work. The clinical and/or field work must be legally orientated, must be offered through an approved service provider, and must provide a direct service or benefit to an underprivileged or disadvantaged or vulnerable group or person. Students will also be required to complete 18 hours of unremunerated community service through approved service providers, usually in their final year. Students register only once in their Intermediate Year, and have two years from the date of registration to complete all components.",
        "lecture_times": "Not applicable.",
        "dp_requirements": "None",
        "assessment": "Coursework 100%."
    },

    "DOL3002X": {
        "convener": "TBA",
        "prerequisites": {
            "text": "None",
            "parsed": {"type": "none"}
        },
        "corequisites": [],
        "outline": "In the Intermediate year of the LLB, in addition to fulfilling course-specific requirements such as assignments and tests, every student must write one essay and one opinion and attend all tutorials (or submit written work at the discretion of the course convener). This non-credit bearing course will ensure compliance with the Intermediate year requirements and also ensure that each student benefits from the skills component of the LLB.",
        "lecture_times": "Not applicable.",
        "dp_requirements": "None",
        "assessment": "No formal assessment. Students are required to submit two written assignments (one essay and one opinion), to attend a library training tutorial, a writing and referencing skills workshop, and to attend all core course tutorials."
    },

    # ── FINAL LEVEL — Compulsory (pp. 61-63) ──

    "CML4004S": {
        "convener": "Dr C de Villiers",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": [],
        "outline": "The aims of this course are to develop an understanding of the purpose and function of labour law and the industrial relations framework, and to examine and analyse the role of the common law; basic conditions of employment; unfair dismissal; the institutions of collective bargaining and participative decision-making, statutory and non-statutory dispute resolution as well as discrimination and equity in employment.",
        "lecture_times": "Half course, second semester.",
        "dp_requirements": "Completion of all work required of the class and attendance at all tutorials.",
        "assessment": "Coursework 40%, November examination 60%."
    },

    "CML4006W": {
        "convener": "B Zungu",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": [],
        "outline": "The course covers principles of the law of agency, sale, lease, credit agreements, insurance, secured transactions and insolvency. Aspects of consumer protection, financial inclusion, and financial technology will also be covered. Assessment: One compulsory class test in June, 30%; One optional written assignment, 20%; One November examination, 50% or 70%. The material tested in June will not be examined directly in the final examination but students will be expected to be familiar with that material for the final examination.",
        "lecture_times": "Seventy-two lectures, six small group teaching sessions.",
        "dp_requirements": "None",
        "assessment": "Coursework 30% or 50%, Final Examination 70% or 50%."
    },

    "PBL4001W": {
        "convener": "N Ally",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": [],
        "outline": "This course deals primarily with the legal rules surrounding the exercise of public power, both as they empower and regulate. In particular it deals with the role of courts in controlling the exercise of power, but it also looks at alternatives to judicial review as other important ways of holding public power to account. After a general introduction, an overview of administrative law, the course focuses on the sources, types and extent of administrative power, and the scope of judicial review (both in theory and practice) in a democratic state. The course takes into account the combined effect of the Constitution and legislation on administrative law. The second part of the course deals mainly on the grounds of review which have been developed by the courts, most of which are found in s 6 of the Promotion of Administrative Justice Act.",
        "lecture_times": "Whole year course.",
        "dp_requirements": "None",
        "assessment": "Assessment during the year counts 40%; November examination (3 hour) 60%."
    },

    "PBL4801F": {
        "convener": "S Mesitrie",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": [],
        "outline": "The aim of the course is to equip students with knowledge of the history and sources of the law of evidence; the rules for admissibility in the context of the relevancy requirement, such as character, similar fact and opinion evidence; rules excluding relevant evidence such as privilege and hearsay; detrimental statements such as confessions; kinds of evidence and presentation thereof; witnesses including their competence and compellability and calling of witnesses; proof without evidence; evaluation of evidence; and the standards and burdens of proof.",
        "lecture_times": "Three lectures per week.",
        "dp_requirements": "None",
        "assessment": "Coursework 40%; June examination (2 hour) 60%."
    },

    "PBL4802F": {
        "convener": "A/Prof J Omar",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": [],
        "outline": "Criminal Procedure deals with the practice and procedure of the criminal process, from the police to the courts. Students are given concrete and topical examples in class, tutorials and assignments and are expected to apply their knowledge of general principles in a critical way, having regard to criminal justice and contemporary social justice imperatives. Students are challenged with legal and ethical dilemmas that they would confront in practical situations and are required to provide justiciable answers in conformity with ethics norms often informed by constitutional values. The course draws heavily on principles of criminal law, constitutional law as well as the law of evidence, to illustrate the interaction between adjectival and substantive law.",
        "lecture_times": "Three lectures per week.",
        "dp_requirements": "None",
        "assessment": "Coursework 40%, June examination 60%."
    },

    "PVL4008H": {
        "convener": "Prof M Paleker",
        "prerequisites": {
            "text": "Successful completion of all Preliminary and Intermediate Level courses and in particular, family law, property law, contract law, and the law of delict.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"], "note": "In particular family law, property law, contract law, and law of delict"}
        },
        "corequisites": [],
        "outline": "This aim of this course is to teach the rules and procedures that courts and litigants are obliged to follow when litigating different kinds of civil suits. The course covers the civil procedure of the High Court, the Magistrate's Court and the Small Claims Court. Topics include: Alternative dispute resolution, jurisdiction of the courts; locus standi; parties to proceedings; service of process; applications; actions; provisional sentence; matrimonial proceedings; legal drafting; and ethics. The course also covers broader access to justice issues and the impact of the Constitution on civil justice and civil justice reform.",
        "lecture_times": "Two lectures per week.",
        "dp_requirements": "None",
        "assessment": "Coursework 50%, Examination 50%."
    },

    "DOL4000H": {
        "convener": "TBA",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": [],
        "outline": "The Integrative Assessment Moot ('IAM') is an integrative capstone LLB assessment. Its objectives are to assess students' ability to work collaboratively in pairs to identify the legal issues and apply the relevant law to a complex factual scenario or given case that integrates a variety of areas of law taught as separate compulsory courses in the LLB curriculum; prepare written Heads of Argument; present legal argument orally; and respond to oral questioning in simulated court proceedings. Students will be graded on a Pass/Fail basis by the panel of judges who adjudicated the moot concerned. The best-performing student in the Moot-Off will be awarded the Faculty Moot Prize.",
        "lecture_times": "Takes place in the second semester.",
        "dp_requirements": "Attendance and completion of a library training session in legal research resources.",
        "assessment": "Examination 100%."
    },

    # ── FINAL LEVEL — Electives (pp. 63-80) ──

    "DOL4500F": {
        "convener": "Z Essop",
        "prerequisites": {
            "text": "All preliminary courses must have been completed. Students must submit a registration form during October of their intermediate year at the UCT Law Clinic. Limited to 40 students per semester.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary"], "note": "Application required, limited to 40 students per semester"}
        },
        "corequisites": [],
        "outline": "This course gives students an opportunity of working with live clients under the supervision of attorneys at the Law Clinic. Students attend lectures and clinics. There are two lectures per week on practical aspects of litigation. It is compulsory for students to attend all 3 clinics in the semester. Students will consult with prospective clients, assist with files by consulting with clients, drafting letters, pleadings and notices; conducting research and communicating with clients. Students will also be taught trial advocacy through simulation. Participation in this course automatically earns students community service hours credit.",
        "lecture_times": "Two lectures per week plus three clinics.",
        "dp_requirements": "Compulsory attendance of 3 clinics.",
        "assessment": "Assessment 1: Legal Drafting (15%) and Oral Component (10%); Assessment 2: File Assessment (40%); Assessment 3: Mock Trial (30%); Class Activities: Practical activities conducted during lectures (5%)."
    },

    "DOL4500S": {
        "convener": "Z Essop",
        "prerequisites": {
            "text": "All preliminary courses must have been completed. Students must submit a registration form during October of their intermediate year at the UCT Law Clinic. Limited to 40 students per semester.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary"], "note": "Application required, limited to 40 students per semester"}
        },
        "corequisites": [],
        "outline": "This course gives students an opportunity of working with live clients under the supervision of attorneys at the Law Clinic. Students attend lectures and clinics. There are two lectures per week on practical aspects of litigation. It is compulsory for students to attend all 3 clinics in the semester. Students will consult with prospective clients, assist with files by consulting with clients, drafting letters, pleadings and notices; conducting research and communicating with clients. Students will also be taught trial advocacy through simulation. Participation in this course automatically earns students community service hours credit.",
        "lecture_times": "Two lectures per week plus three clinics.",
        "dp_requirements": "Compulsory attendance of 3 clinics.",
        "assessment": "Assessment 1: Legal Drafting (15%) and Oral Component (10%); Assessment 2: File Assessment (40%); Assessment 3: Mock Trial (30%); Class Activities: Practical activities conducted during lectures (5%)."
    },

    "CML4501S": {
        "convener": "M Carels",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed. Limited to 24 students; application (with motivation) to Monique Carels by 31 October.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"], "note": "Limited to 24 students, application by 31 October"}
        },
        "corequisites": [],
        "outline": "The nature and path of conflict; approaches to managing conflict; positional and interest-based negotiation; defining the process of mediation; the stages of mediation; specialised forms of mediation; comparing adjudication and mediation, arbitration: the forms of arbitration and the defining characteristics and dispute system design.",
        "lecture_times": "Two lectures per week.",
        "dp_requirements": "None",
        "assessment": "Reflective journal: 25%, Class test: 25%, May/June examination: 50%."
    },

    "CML4504S": {
        "convener": "TBA",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": [],
        "outline": "This course provides an introduction to the law of trade marks and unlawful competition in South Africa.",
        "lecture_times": "Two lectures per week.",
        "dp_requirements": "None",
        "assessment": "Refer to course handout."
    },

    "CML4506F": {
        "convener": "B Cronin",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": [],
        "outline": "Every area of the law affects understanding and practical application of tax law. This course introduces the subject of tax law. It seeks to illustrate the interrelation of tax law with other fields of law by focussing on primary themes and structural challenges faced by a tax system. In much of the coursework, the emphasis will be on the South African income tax. A selection of fundamental features of the South African income tax will be considered, mainly through critical evaluation of case law. Key jurisdictional concepts comprising the source and residence basis of income taxation will be considered. The course will analyse the statutory and jurisprudential frameworks for the determination of taxable income, including the notion of income, the distinction between capital and revenue receipts and the deductibility of expenditure and losses.",
        "lecture_times": "Two lectures per week.",
        "dp_requirements": "None",
        "assessment": "Coursework: 20% (optional), Examination: 80%."
    },

    "CML4507S": {
        "convener": "Prof J Hattingh",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": [],
        "outline": "This course builds on Fundamental Principles of Tax Law as a further introductory course for law undergraduates on the subject of tax law. The focus is on legislation as the primary source of tax law. In much of the coursework, the emphasis will be on the South African income tax legislation. A recapitulation of the legal framework for statutory construction is provided. A selection of features of the South African Income Tax Act, 58 of 1962, will be considered. The relevant provisions are categorised into those dealing with the main tenants of the taxation of individuals, companies and other vehicles such as trusts and partnerships. Selected issues affecting the taxation of corporate income will be considered. In addition, the legislation imposing tax on capital gains will be dealt with. The course is concluded by a consideration of the various common law and statutory measures that address tax evasion and tax avoidance.",
        "lecture_times": "Two lectures per week.",
        "dp_requirements": "None",
        "assessment": "Coursework 20%, Examination 80%."
    },

    "CML4510F": {
        "convener": "A/Prof T Schönwetter",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": [],
        "outline": "Given the ubiquitous nature of digital technologies, and the complex legal issues that these technologies raise, this course affects numerous areas of law and addresses the key legal issues related to digital technologies, including: electronic contracting, electronic evidence, cybercrime, data protection, consumer protection online, e-commerce & tax, electronic communications, IP in the digital realm, the liability of internet service providers, and the right to freedom of expression online. While emphasis is on South African law, the multi-jurisdictional dimension of Internet digital technologies requires that some attention is paid to other jurisdictions. The course also includes some computer skills instructions for technology tools that are available to lawyers and legal researchers.",
        "lecture_times": "Two lectures per week.",
        "dp_requirements": "None",
        "assessment": "Coursework 40%, Examination 60%."
    },

    "CML4602S": {
        "convener": "A/Prof B Mupangavanhu and Judge D M Davis",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": ["Class attendance is compulsory. Class participation takes the form of both group-work and individual presentations."],
        "outline": "In this course we examine the regulation of competition under the 'new' Competition Act 89 of 1998. The focus of the course is on the statutory regulation of competition and the underlying policy considerations which the Act aims to address. In particular, we examine the practices that firms are prohibited from engaging in under the Act, and the way in which the Act regulates the merger of firms. The content of the Act has been heavily influenced by European and American Antitrust Law and practice. Since the South African competition authorities have not yet had an opportunity to develop an extensive jurisprudence of their own, we look to comparative sources for guidance as to how the Act might come to be interpreted and applied.",
        "lecture_times": "Two lectures per week. Limited to 25 students.",
        "dp_requirements": "None",
        "assessment": "Research 80% and Test 20%."
    },

    "CML4603S": {
        "convener": "Dr K Motlogeloa",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": [],
        "outline": "In the first half of the course students are introduced to the private law aspect of banking. The course will examine the concepts of money and payments by exploring both the traditional forms of payments to modern methods such as digital finance. The course also examines African banking concepts such as stokvels and credit-rotating associations, and critically analyse the greater need for financial inclusion in South Africa. In the second half students are introduced to the different roles of banks including banks as intermediaries, banks as guarantors, and banks as lenders (domestically and in the international financial markets). This section also focuses on the bank-customer relationship and bank liability arising out of contract, delict or enrichment. The second half of the course examines the regulation of the banking and finance sector by exploring key legislation such as the Banks Act, the Financial Advisory and Intermediary Services Act, the Financial Markets Act amongst many others. Students will also be introduced to key theoretical concepts such as systemic risk and South Africa's reform towards Twin Peaks.",
        "lecture_times": "Two lectures per week. Limited to 25 students.",
        "dp_requirements": "None",
        "assessment": "Research Paper (5000 words) 100%."
    },

    "CML4629S": {
        "convener": "Prof A Ordor",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": [],
        "outline": "This course provides a forum for students to study the ways in which the law has been utilised to shape and direct regional integration processes in Africa. The course starts with a discussion of theories of regional integration, followed by an overview of the historical trajectory of integration on the continent, with a focus on development integration. Its comparative dimension is directed at identifying and analysing strengths, weaknesses and challenges reflected in various regional efforts at integration on the continent, including the AU, SADC, EAC, ECOWAS, AMU, the Tripartite Free Trade Area (TFTA) as well as the proposed African Continental Free Trade Area (AfCFTA). The role of regional institutions such as regional courts is discussed. The course is delivered through a series of weekly seminars, with occasional guest lectures.",
        "lecture_times": "Two lectures per week. Limited to 25 students.",
        "dp_requirements": "None",
        "assessment": "Coursework 20%; final research paper 80%."
    },

    "CML4401H": {
        "convener": "TBA (supervised by a Faculty member)",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": [],
        "outline": "A student may do an Independent Research Paper instead of the seminars and research paper elective. Students prepare their papers by working individually under the supervision of a member of the Faculty. Independent research papers should be about 8000 words in length. The final title of research to be done under individual supervision of a member of staff must be approved by registration day.",
        "lecture_times": "Not applicable — independent research.",
        "dp_requirements": "None",
        "assessment": "As determined by supervisor."
    },

    "CML4606H": {
        "convener": "TBA (Department of Commercial Law)",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": [],
        "outline": "The option of doing a moot is available in each department in the Faculty. Students should identify the department in which they wish to moot and may register for a moot only with the permission of a member of the department concerned. Usually departments will require at least two students before a moot option will be offered. To complete a moot option successfully, students must submit adequate heads of argument and participate in moot proceedings presided over by more than one person, at least one of whom should not be a member of the Faculty.",
        "lecture_times": "Not applicable.",
        "dp_requirements": "None",
        "assessment": "Heads of argument count for 100% unless the supervisor agrees to allocate a percentage of the mark to oral presentation. The percentage of the mark allocated to oral presentation may not exceed 50%."
    },

    "PVL4504S": {
        "convener": "Prof H Mostert",
        "prerequisites": {
            "text": "PVL2002H (Law of Property) at Preliminary B level.",
            "parsed": {"type": "specific", "codes_mentioned": ["PVL2002H"], "note": "At Preliminary B level"}
        },
        "corequisites": ["PBL4001W (Administrative Law)"],
        "outline": "In enabling the study of the theory and practice of mineral law, this course focuses on building understanding of the complexities of South African mineral law in its historical, constitutional and political setting. It introduces the topic by dealing with the origins and historical development of mineral law, and the core concepts thereof. It deals specifically with the nature and content of rights to minerals and the current regulatory framework for these rights. In doing so, it analyses critically the extent of current regulatory controls and / or lack thereof, focusing specifically on provisions dealing with social and environmental responsibility and the recording of rights to minerals. This allows students to gain a critical understanding of the practical context in which mineral law operates, and the need for reform.",
        "lecture_times": "Two lectures per week.",
        "dp_requirements": "None",
        "assessment": "100% continuous assessment."
    },

    "PVL4505F": {
        "convener": "Dr K Moshikaro and Dr R Cupido",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": [],
        "outline": "Law graduates entering legal practice (particularly in a commercial law firm) will find themselves immediately confronted with issues relating to the transfer of personal rights by cession. Most wealth today is held in the form of personal rights or claims against other parties (including banks, employers, investment and insurance companies, pension funds and the like) and much commercial activity concerns the transfer or pledging of such rights. The course aims to familiarise students with all aspects of the law of cession — a complex and challenging subject — to prepare them for commercial legal practice.",
        "lecture_times": "Two lectures per week.",
        "dp_requirements": "None",
        "assessment": "Coursework: Optional assignment 20%; Examination 100% if no optional assignment; 80% if optional assignment completed."
    },

    "PVL4507F": {
        "convener": "A/Prof A Barratt",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": [],
        "outline": "This course introduces the rules and principles governing conflict of laws problems. In this course we examine the general principles governing application of foreign law and focus particularly on conflict of law questions arising in the context of contract, delict, property, succession, marriage, and divorce.",
        "lecture_times": "Two lectures per week.",
        "dp_requirements": "None",
        "assessment": "Coursework 30%, Final examination 70%."
    },

    "PVL4511F": {
        "convener": "I Ahmed",
        "prerequisites": {
            "text": "None",
            "parsed": {"type": "none"}
        },
        "corequisites": [],
        "outline": "Unjustified enrichment constitutes the third part — with contract and delict — of the law of obligations and is thus essential to an integrated understanding of private law. Typically seen as the last resort in the law of obligations, the law of enrichment guards against instances of imbalance where there is an unjustified patrimonial transfer and in this sense, the law of enrichment forms a part of the self-correctional norms of the law. The aim of this course is to give students a good overall knowledge of the South African law of unjustified enrichment and to explore current debates in the law of enrichment — in particular about the proper definition and analysis of the subject itself.",
        "lecture_times": "Two lectures per week.",
        "dp_requirements": "None",
        "assessment": "Assignment: 25%, Class participation: 5%, Final Exam: 70%."
    },

    "PVL4512S": {
        "convener": "A/Prof F Osman and N Luwaya",
        "prerequisites": {
            "text": "PVL3003S.",
            "parsed": {"type": "specific", "codes_mentioned": ["PVL3003S"]}
        },
        "corequisites": [],
        "outline": "The course aims to advance students' understanding of African customary law by equipping them with the skills to ascertain customary law and understand contemporary issues in the subject. The course may engage with the theoretical debates surrounding the recognition of African customary law, practical questions regarding the ascertainment and recordal of customary law, and developments in family law, traditional leadership, dispute resolution, and natural resources.",
        "lecture_times": "Two lectures per week.",
        "dp_requirements": "None",
        "assessment": "Exam 70%, Course work 30%."
    },

    "PVL4513F": {
        "convener": "Prof T Naudé",
        "prerequisites": {
            "text": "Passed Law of Contract PVL3005W (or obtained a credit for an equivalent course if a transferring student).",
            "parsed": {"type": "specific", "codes_mentioned": ["PVL3005W"]}
        },
        "corequisites": ["Registered for Commercial Transactions Law CML4006W (or passed it before)."],
        "outline": "This course covers aspects of the general principles of the law of contract not covered in the core Law of Contract course, PVL3005W. These include termination of obligations, including prescription, supervening impossibility of performance and change of circumstances more generally, compromise and performance. Also included are aspects of breach and remedies for breach of contract, as well as a more in depth study of controlling unfair contract terms. In addition, drafting of contracts in plain and understandable language, and using contract design, including illustrations and graphics will be considered. The course also covers aspects of certain specific contracts not covered in the core Commercial Transactions Law course, CML4006W.",
        "lecture_times": "Two lectures per week.",
        "dp_requirements": "Satisfactory lecture attendance. Obtained 35% average overall in assessments prior to exam (if exempted from one of these assessments, then 35% in the other).",
        "assessment": "Mid-semester test 25%, Oral assessment 25% OR assignment 25%, Exam (May/June) 50%."
    },

    "PVL4401H": {
        "convener": "TBA (supervised by a Faculty member)",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": [],
        "outline": "A student may do an Independent Research Paper instead of the seminars and research paper elective. Students prepare their papers by working individually under the supervision of a member of the Faculty. Independent research papers should be about 8000 words in length. The final title of research to be done under individual supervision of a member of staff must be approved by registration day.",
        "lecture_times": "Not applicable — independent research.",
        "dp_requirements": "None",
        "assessment": "As determined by supervisor."
    },

    "PVL4601S": {
        "convener": "Dr G Mathiba",
        "prerequisites": {
            "text": "PVL2002H (Law of Property) at Preliminary B level. The course is capped at 15 students per year.",
            "parsed": {"type": "specific", "codes_mentioned": ["PVL2002H"], "note": "At Preliminary B level, capped at 15 students"}
        },
        "corequisites": [],
        "outline": "This course aims to deepen LLB students' understanding of key aspects of property law, particularly expropriation law by enabling them to explore and specialise in topical areas of this field of study. The course covers the following: (i) the basic theories underlying expropriation law; (ii) the legislative framework governing expropriations; (iii) the importance and influence of the constitutional property clause in respect of the legislative framework; (iv) the various stakeholders impacted by expropriations; (v) the social and political considerations that inform this area, including land reform; (vi) the procedural requirements to effect a lawful expropriation.",
        "lecture_times": "Two lectures per week.",
        "dp_requirements": "None",
        "assessment": "Coursework: 30%, research paper (5000 words) 70%."
    },

    "PVL4602S": {
        "convener": "Prof M Paleker",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed. Limited to 25 students.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"], "note": "Limited to 25 students"}
        },
        "corequisites": [],
        "outline": "The aim of the course is to consider contemporary debates in civil justice and civil justice reform and to engage with the different methods of civil dispute resolution. The course will consider the theoretical and philosophical debates around access to civil justice, with reference to s 34 of the Constitution. There will be an analysis of the strengths or weaknesses of the South African civil justice system, and how foreign jurisdictions have dealt with challenges in civil justice. Different litigation models will be studied to understand the similarities and differences in adjudication styles between civil law and common law systems.",
        "lecture_times": "Two lectures per week. Limited to 25 students.",
        "dp_requirements": "None",
        "assessment": "Coursework 40%, Research Paper (5000 words) 60%."
    },

    "PVL4606F": {
        "convener": "Prof AJ Barnard-Naudé",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed. Limited to 25 students.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"], "note": "Limited to 25 students"}
        },
        "corequisites": [],
        "outline": "The aim of the course is to introduce students to the spatial dimension of all law. The ancient Greek term for law in its concrete spatiality is 'nomos'. The course will illustrate how land-appropriation has been a fundamental dimension of the history of the nomos of the Earth as a planetary spatial order. Special attention will be given to the nomos of colonization, imperialism and apartheid. In the second part of the course, we focus on the post-apartheid spatial order and consider the continuations of, but also the breaks with, the nomos of apartheid. The Constitution, the National Development Plan and the Spatial Planning and Land Use Management Act will be critically examined. We critically consider the role of Ubuntu (as a juridical ethic) and social justice activism in the promotion and achievement of spatial justice.",
        "lecture_times": "Two lectures per week. Limited to 25 students.",
        "dp_requirements": "None",
        "assessment": "Seminar presentation 40%, An essay of 4000-5000 words 60%."
    },

    "PVL4609H": {
        "convener": "TBA (Department of Private Law)",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": [],
        "outline": "The option of doing a moot is available in each department in the Faculty. Students should identify the department in which they wish to moot and may register for a moot only with the permission of a member of the department concerned. Usually departments will require at least two students before a moot option will be offered. To complete a moot option successfully, students must submit adequate heads of argument and participate in moot proceedings presided over by more than one person, at least one of whom should not be a member of the Faculty.",
        "lecture_times": "Not applicable.",
        "dp_requirements": "None",
        "assessment": "Heads of argument count for 100% unless the supervisor agrees to allocate a percentage of the mark to oral presentation. The percentage of the mark allocated to oral presentation may not exceed 50%."
    },

    "PBL4111S": {
        "convener": "TBA",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": [],
        "outline": "This course examines the theory and practice of public interest litigation in South Africa.",
        "lecture_times": "Two lectures per week.",
        "dp_requirements": "None",
        "assessment": "Refer to course handout."
    },

    "PBL4501F": {
        "convener": "Dr N Palmer",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": [],
        "outline": "The aim of this course is to critically engage with a select number of issues of criminological relevance to the South African society. For each of the substantive areas to be discussed we will organise our discussion around a number of key questions: What are the key features of criminological discourse on issues such as: gangs; corporate crime; environmental crimes; organised crime; state crime; gendered violence; youth violence and crime prevention etc. What are the main strategies (social, legal and administrative) for addressing the particular phenomenon? What is known about the size, shape and content of the phenomenon in South Africa? What are the main features of public/popular debate on the issue in South Africa?",
        "lecture_times": "Two lectures per week.",
        "dp_requirements": "Satisfactory attendance at weekly seminars.",
        "assessment": "Class attendance, participation and hand-ins 30%; Take home exam (6 hours) 70%."
    },

    "PBL4502F": {
        "convener": "A/Prof J Hall",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": [],
        "outline": "The course examines the law applicable to selected environmental problems. The following issues are covered: an introduction to environmental problems; the nature of environmental law; land-use management (environmental impact assessment & other tools); and resource conservation (water, marine living resources, biodiversity, protected areas and mineral resources).",
        "lecture_times": "Two lectures per week.",
        "dp_requirements": "None",
        "assessment": "Coursework 40%; Examination 60%."
    },

    "PBL4504F": {
        "convener": "A/Prof H Woolaver",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": [],
        "outline": "This course provides students with a firm understanding of the key aspects of international criminal law, focusing on the impact and application of this body of law in the African continent. The first section covers the historical development of international criminal law, from its origins in the Nuremberg Tribunal, culminating in the establishment of the International Criminal Court. The second section examines the legal elements of the core international crimes: genocide, crimes against humanity, war crimes, and the crime of aggression. Section three provides an analysis of the modes of liability of international crimes, focusing on liability for the commission of group crimes and superior responsibility. The final section details the procedural aspects of enforcement, including jurisdiction of domestic and international courts and the issue of immunity of senior State officials.",
        "lecture_times": "Two lectures per week.",
        "dp_requirements": "Satisfactory attendance at weekly seminars.",
        "assessment": "Essay (2500 words) 20%; In-class presentation 10%; Final examination 70%."
    },

    "PBL4505S": {
        "convener": "S Lutchman",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": [],
        "outline": "The course aims to examine the relationship between International Human Rights Law and the South African Constitution, particularly how international human rights norms are received and enforced under the Constitution and the extent to which the South African Bill of Rights can and does give effect to international human rights norms. It will provide participants with the opportunity to consider and critically reflect upon the relationship between international and municipal law, the development of international human rights norms and standards, the tension between universal norms and cultural specificity, the content and interpretations of the South African Bill of Rights and the suitability of domestic Bills of Rights as vehicles through which to receive and implement international human rights law.",
        "lecture_times": "Two lectures per week.",
        "dp_requirements": "Satisfactory attendance at weekly seminars.",
        "assessment": "Written assignments and class participation 40%. One written examination (2 hours) 60%."
    },

    "PBL4506F": {
        "convener": "Prof F Khan",
        "prerequisites": {
            "text": "Successful completion of Constitutional and International Law.",
            "parsed": {"type": "specific", "codes_mentioned": ["PBL2000W", "PBL3001F"], "note": "Constitutional and International Law"}
        },
        "corequisites": [],
        "outline": "The course will focus primarily on the basic criteria for the attainment, denial, and withdrawal of refugee status and the rights and treatment of refugees in accordance with the South African Refugees Act (130 of 1998) and other relevant legislation and international instruments. A comprehensive analysis of the South African Refugees Act as well as the relevant sections of the Immigration Act (13 of 2002), will be undertaken. Furthermore, a review of the case-law of international, regional, and national courts will provide an understanding of how refugee law is interpreted and implemented in South Africa as well as in other jurisdictions.",
        "lecture_times": "Two lectures per week.",
        "dp_requirements": "None",
        "assessment": "Two-hour written open-book class test — 40%; A 3000-word written assignment — 50%; Class attendance and participation — 10%."
    },

    "PBL4401H": {
        "convener": "TBA (supervised by a Faculty member)",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": [],
        "outline": "A student may do an Independent Research Paper instead of the seminars and research paper elective. Students prepare their papers by working individually under the supervision of a member of the Faculty. Independent research papers should be about 8000 words in length. The final title of research to be done under individual supervision of a member of staff must be approved by registration day.",
        "lecture_times": "Not applicable — independent research.",
        "dp_requirements": "None",
        "assessment": "As determined by supervisor."
    },

    "PBL4402H": {
        "convener": "TBA (supervised by a Faculty member)",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": [],
        "outline": "A student may do an Independent Research Paper in Criminal Justice instead of the seminars and research paper elective. Students prepare their papers by working individually under the supervision of a member of the Faculty. Independent research papers should be about 8000 words in length. The final title of research to be done under individual supervision of a member of staff must be approved by registration day.",
        "lecture_times": "Not applicable — independent research.",
        "dp_requirements": "None",
        "assessment": "As determined by supervisor."
    },

    "PBL4601S": {
        "convener": "Judge D M Davis",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed. Limited to 25 students.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"], "note": "Limited to 25 students"}
        },
        "corequisites": [],
        "outline": "The object of this course is to gain greater insight into constitutional law by means of learning about litigation. The course focuses on one key area (for example in 1997 abortion was the chosen topic). The course examines key constitutional issues (eg. life, equality, privacy, dignity, bodily integrity) relevant to this issue. A study is also made of the rules of the Constitutional Court. Thereafter students are divided into legal teams and with assistance are required to prepare heads of argument as if the matter is to be heard before the Constitutional Court. The matter is then argued fully. In this way the critical principles of constitutional law and the requirements for constitutional litigation are taught.",
        "lecture_times": "Two lectures per week. Limited to 25 students.",
        "dp_requirements": "None",
        "assessment": "The mark is given for group work (to be negotiated with the class) based on heads of argument and oral argument."
    },

    "PBL4602F": {
        "convener": "A/Prof J Omar",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed. Limited to 25 students.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"], "note": "Limited to 25 students"}
        },
        "corequisites": [],
        "outline": "This course provides students with the opportunity to explore selected advanced issues in criminal justice, punishment and the manner in which the Constitution impacts the criminal justice system in the context of South Africa's socio, politico and economic history and the transition to democracy. Students will use the group discussions to develop research skills, including critical thinking and produce research papers. The course draws on principles of criminal law, constitutional law, the law of evidence and interacts with criminology.",
        "lecture_times": "Two lectures per week. Limited to 25 students.",
        "dp_requirements": "Satisfactory attendance at weekly seminars.",
        "assessment": "Coursework — 20%; Research Paper 80%."
    },

    "PBL4604F": {
        "convener": "Prof P de Vos",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed. Limited to 25 students.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"], "note": "Limited to 25 students"}
        },
        "corequisites": [],
        "outline": "The course is intended to give students an opportunity to engage with a number of discrete constitutional law problems in more detail than is possible in the general introductory Constitutional Law course offered in the preliminary year. The course is aimed at providing a space for contestation, critical discussion and reflection on important constitutional law issues and the manner in which lawyers, judges and legal academics engage with such issues against a broader socio-political background. Aiming to go beyond a black letter law discussion of constitutional law principles and legal precedent (but not ignoring such principles and precedent), the course encourages students to ask questions about the nature of constitutional adjudication; the interaction between law, politics and values; and the various ways in which social and political issues should be dealt with from a constitutional perspective.",
        "lecture_times": "Two lectures per week. Limited to 25 students.",
        "dp_requirements": "None",
        "assessment": "Presentations by individual students in seminars 25%; End of semester essay 75%."
    },

    "PBL4605F": {
        "convener": "Dr N Ramalekana and N Luwaya",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed. Limited to 25 students.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"], "note": "Limited to 25 students"}
        },
        "corequisites": [],
        "outline": "The course aims to introduce students to literature and debates on the relationship between women and the law, allowing them to examine specific aspects of South African law in the light of feminist theory. In the seminars we consider feminist theories of law and the position of women in South African Law. Possible subjects include: feminist and social theory; the constitutional protection of women; family law including divorce, maintenance, adoption and custody, abortion and surrogate motherhood; the law relating to violent crimes against women, including rape and domestic violence; employment law, including sex discrimination, equal pay, maternity benefits, sexual harassment and domestic workers; aspects of customary law; and the law governing censorship and pornography.",
        "lecture_times": "Two lectures per week. Limited to 25 students.",
        "dp_requirements": "None",
        "assessment": "Reflection papers 10%; Presentation at symposium on women and law 10%; Research paper 80%."
    },

    "PBL4606H": {
        "convener": "TBA (Department of Public Law)",
        "prerequisites": {
            "text": "All Preliminary and Intermediate Level courses to have been completed.",
            "parsed": {"type": "level_completion", "levels_required": ["preliminary", "intermediate"]}
        },
        "corequisites": [],
        "outline": "The option of doing a moot is available in each department in the Faculty. Students should identify the department in which they wish to moot and may register for a moot only with the permission of a member of the department concerned. Usually departments will require at least two students before a moot option will be offered. To complete a moot option successfully, students must submit adequate heads of argument and participate in moot proceedings presided over by more than one person, at least one of whom should not be a member of the Faculty.",
        "lecture_times": "Not applicable.",
        "dp_requirements": "None",
        "assessment": "Heads of argument count for 100% unless the supervisor agrees to allocate a percentage of the mark to oral presentation. The percentage of the mark allocated to oral presentation may not exceed 50%."
    },

    # ── CROSS-FACULTY COURSES ──

    "MAM1013F": {
        "convener": "Dr C Felix",
        "prerequisites": {
            "text": "None. Students can be exempted ONLY on the basis of adequate performance in the Quantitative Literacy component of the National Benchmark Test.",
            "parsed": {"type": "none", "note": "Exemption possible via National Benchmark Test"}
        },
        "corequisites": [],
        "outline": "The course is intended to provide Law students with the necessary quantitative literacy to be able to understand, express and interpret appropriate quantitative ideas. The aim of the course is to give students an appreciation and understanding of mathematical and statistical ideas within real life and legal contexts, and generally with a social justice focus. Content covered includes percentages, ratios, interest and finance concepts, interpretation of graphs, manipulation of data, interpretation of statistics and use of spreadsheets.",
        "lecture_times": "Monday - Friday, 4th period.",
        "dp_requirements": "Achieve a class record of 40% and 75% attendance at lectures and tutorials.",
        "assessment": "Two written assessments, one assignment and assessment of computer tutorials contribute to the class record that counts 50% of the final mark. The final assessment consists of a written paper and a computer assessment that together count 50% of the final mark."
    },

    "PTY4008S": {
        "convener": "Doctor Y van der Heyde",
        "prerequisites": {
            "text": "None",
            "parsed": {"type": "none"}
        },
        "corequisites": [],
        "outline": "This course covers the South African legal system and statutory obligations of doctors and healthcare workers; introduction to human anatomy and physiology; introduction to medico-legal concepts of life and death; the changes which occur in the body after death; the mechanisms of injury and death causation; identity and disputed parenthood; sexual offences and violence against women; choice on termination of pregnancy; child abuse and other forensic aspects of paediatric forensic medicine; iatrogenic disorders; alcohol intoxication and drunken driving; drug addiction and poisoning as cause of death; pathology of head injury; anoxic mechanisms as cause of death and domestic violence.",
        "lecture_times": "Monday double lecture from 10h00 to 11h45. Offered by Division of Forensic Medicine and Toxicology in Department of Pathology. Maximum intake is 30 students; 15 lectures.",
        "dp_requirements": "None",
        "assessment": "A two-hour written examination in October/November (100%). A supplementary written examination is offered in January the following year to students who have obtained 45-49%."
    },
}

# Remove duplicates
seen = set()
courses = []
for code, title, credits, nqf in courses_raw:
    if code not in seen:
        seen.add(code)
        courses.append((code, title, credits, nqf))

courses.sort(key=lambda x: x[0])

# Build course index
course_index = {
    "$schema": "handbook-course-index-v1",
    "faculty": "law",
    "year": 2026,
    "total_courses": len(courses),
    "courses": []
}

cross_faculty_prefixes = {
    "MAM": "science", "ELL": "humanities", "SLL": "humanities",
    "PTY": "health-sciences"
}

for code, title, credits, nqf in courses:
    prefix = extract_prefix(code)
    entry = {
        "code": code,
        "title": title,
        "nqf_credits": credits,
        "nqf_level": nqf,
        "semester": semester_from_suffix(code),
        "year_level": year_level(code),
        "department_prefix": prefix
    }
    if prefix in cross_faculty_prefixes:
        entry["is_law_course"] = False
        entry["offered_by_faculty"] = cross_faculty_prefixes[prefix]
    course_index["courses"].append(entry)

# ============================================================
# PROGRAMMES — verified against handbook pages 41-44
# ============================================================

programmes = [
    # ── Graduate LLB (LP001) — 3 years, 504 credits ──
    {
        "id": "llb-graduate",
        "programme_code": "LP001",
        "name": "Bachelor of Laws (Graduate Stream)",
        "abbreviation": "LLB",
        "saqa_id": 10695,
        "nqf_level": 8,
        "department": "Faculty of Law",
        "duration_years": 3,
        "total_credits": 504,
        "stream": "graduate",
        "entry_requirement": "Holders of an approved degree",
        "curriculum": {
            "year_1_preliminary": {
                "label": "Year 1 (Preliminary Level)",
                "core": ["PVL1003W", "PVL1004F", "PVL1008H", "PBL2000W", "PVL2002H", "PVL2003H"],
                "credits": 144
            },
            "year_2_intermediate": {
                "label": "Year 2 (Intermediate Level)",
                "core": ["CML3001W", "PBL3001F", "PBL3801W", "PVL3003S", "PVL3003F", "PVL3005W", "PVL3006S", "DOL3001X", "DOL3002X"],
                "credits": 180
            },
            "year_3_final": {
                "label": "Year 3 (Final Level)",
                "core": ["CML4004S", "CML4006W", "PBL4001W", "PBL4801F", "PBL4802F", "PVL4008H", "DOL4000H"],
                "credits": 180,
                "note": "Plus elective courses and research paper totalling 36 NQF credits. Minimum 36cr from electives (all 9cr each). Must include at least one seminars and research paper elective."
            }
        }
    },
    # ── Four-year undergraduate LLB (LB002) — 4 years, 637 credits ──
    {
        "id": "llb-undergraduate",
        "programme_code": "LB002",
        "name": "Bachelor of Laws (Undergraduate Stream)",
        "abbreviation": "LLB",
        "saqa_id": 10695,
        "nqf_level": 8,
        "department": "Faculty of Law",
        "duration_years": 4,
        "total_credits": 637,
        "stream": "undergraduate",
        "entry_requirement": "Direct from school. Must pass numeracy test or complete MAM1013F.",
        "curriculum": {
            "year_1_preliminary": {
                "label": "Year 1 (Preliminary Level)",
                "core": ["PVL1003W", "PVL1004F", "PVL1008H", "MAM1013F"],
                "credits": 135,
                "note": "Plus one English (ELL) course or SLL1002S Word Power (15cr), plus two semester courses in another faculty (30cr)"
            },
            "year_2_preliminary": {
                "label": "Year 2 (Preliminary Level continued)",
                "core": ["PBL2000W", "PVL2002H", "PVL2003H"],
                "credits": 142,
                "note": "Plus two semester courses in a language or a whole course in a language (30cr), plus two 2000-level semester courses in one discipline in another faculty (40cr)"
            },
            "year_3_intermediate": {
                "label": "Year 3 (Intermediate Level)",
                "core": ["CML3001W", "PBL3001F", "PBL3801W", "PVL3003S", "PVL3003F", "PVL3005W", "PVL3006S", "DOL3001X", "DOL3002X"],
                "credits": 180
            },
            "year_4_final": {
                "label": "Year 4 (Final Level)",
                "core": ["CML4004S", "CML4006W", "PBL4001W", "PBL4801F", "PBL4802F", "PVL4008H", "DOL4000H"],
                "credits": 180,
                "note": "Plus elective courses and research paper totalling 36 NQF credits. Minimum 36cr from electives (all 9cr each). Must include at least one seminars and research paper elective."
            }
        }
    },
    # ── Combined LLB stream ──
    {
        "id": "llb-combined",
        "name": "Bachelor of Laws (Combined Stream)",
        "abbreviation": "LLB",
        "saqa_id": 10695,
        "nqf_level": 8,
        "department": "Faculty of Law",
        "duration_years": "5-6",
        "stream": "combined",
        "entry_requirement": "Complete a BA/BCom/BSocSc including law courses from Humanities or Commerce, then enter graduate LLB stream",
        "curriculum": {
            "note": "Combined stream students complete a first degree in Humanities or Commerce including senior law courses, then follow the graduate LLB curriculum (LP001). Subject to the rules of the Humanities or Commerce Faculty for the first degree."
        }
    }
]

# ============================================================
# FACULTY RULES — verified against handbook pages 40-50
# ============================================================

faculty_rules = {
    "$schema": "handbook-rules-v1",
    "faculty": "law",
    "year": 2026,
    "rules": {
        "duration": {
            "FP1": "Four-year undergraduate LLB: 4 years (5-year stream: 5 years for continuing students only).",
            "FP2": "Three-year graduate LLB: 3 years.",
            "FP3": "Two-year graduate LLB: 2 years."
        },
        "curriculum_graduate": {
            "FP4.1": "Graduate LLB stream (LP001): Preliminary, Intermediate, and Final levels as prescribed.",
            "FP4.2": "Research component and Community Service are compulsory. Research component weighted 36 NQF credits.",
            "FP4.3": "Final Level electives are 9 NQF credits each.",
            "FP4.4": "Minimum 36 NQF credits from Final Level electives. Two kinds: lectures-and-examination electives, and seminars-and-research-paper electives.",
            "FP4.5": "Every Final Level student must do at least one seminars and research paper elective, or an Independent Research Paper of 8000 words instead.",
            "FP4.6": "Maximum credits for elective courses in Final Level: 54 NQF credits.",
            "FP4.7": "Intermediate Level students may register for DOL4500F/S Legal Practice if >=65% average in Preliminary Level law courses and admitted by UCT Law Clinic Director."
        },
        "curriculum_undergraduate": {
            "FP5.1": "Four-year undergraduate LLB (LB002) curriculum as prescribed.",
            "FP5.2": "Candidate must pass a numeracy test prescribed by Senate, OR complete MAM1013F Law That Counts. Candidate may not attempt numeracy test a second time.",
            "FP5.3": "Curriculum for undergraduate LLB stream includes non-law courses in first and second year from other faculties.",
            "FP5.3.1": "A candidate who has passed the numeracy test with a score of at least 66% must complete an additional semester course offered in another faculty."
        },
        "skills_component": {
            "FP6.1": "All streams have a skills component at each level. Compulsory.",
            "FP6.2": "Skills include: writing, computer skills, problem solving, analysis, research, oral presentation.",
            "FP6.3": "First year emphasis: writing skills, problem solving, reading skills.",
            "FP6.4": "Second year emphasis: problem solving, analysis including critical analysis, oral presentation.",
            "FP6.5": "Third year: essay, opinion, attend tutorials.",
            "FP6.6": "Fourth year: Integrative Assessment Moot (DOL4000H) — capstone."
        },
        "progress_graduate": {
            "FP7.1": "Only one half course outstanding from Preliminary → may proceed to Intermediate. Only one course (or two half courses) outstanding from Intermediate → may proceed to Final. Senate permission required.",
            "FP7.2": "Failed more than one half course at Preliminary, or more than one course (two half courses) at Intermediate/Final: may not register for full set but may register limited load."
        },
        "progress_undergraduate": {
            "FP8.1": "Only one half course outstanding from first/second year → may proceed. Only one course (two half courses) from third year → may proceed to fourth. Senate permission. Applies to both law and non-law courses.",
            "FP8.2": "Failed more than one half course in first/second year, or more than one course in third year: limited registration."
        },
        "general_progress": {
            "FP10.1": "Maximum courses per year: (i) 9 half courses at Preliminary, (ii) 12 half courses at Intermediate, (iii) 14 half courses at Final.",
            "FP10.2": "Notwithstanding FP10.1, students may take Humanities courses in Summer Term."
        },
        "readmission": {
            "FP11.1": "May be refused re-registration if fails: (i) equivalent of 4 half courses at any level, OR (ii) all courses within prescribed time plus one year.",
            "FP11.2": "Five-year undergraduate: refused if fails equivalent of 3 half courses.",
            "FP12": "Refused students may appeal to Faculty Readmission Appeal Committee. Decision is final."
        },
        "assessment": {
            "FP13.1": "Failure to write exam = failed course for readmission purposes.",
            "FP13.2": "Senate may grant permission to write on different day for medical, religious, or political reasons. Application to Dean within 7 days.",
            "FP14": "Sub-minimum of 45% in every University examination (including research paper component of Final Level electives).",
            "FP15.1": "Final year students may request oral exam if scored 47%+ overall or 45%+ in final exam. Not for seminars/research paper electives.",
            "FP15.2": "Minimum 72 hours notice for oral examination.",
            "FP16.1": "Supplementary exams at Senate discretion if sufficiently high standard in 45-49% range, or if candidate is in final year and able to qualify for graduation."
        },
        "deferred_exams": {
            "FP17.1": "Deferred exams on medical or compassionate grounds.",
            "FP17.2": "Application within 7 days.",
            "FP17.3": "Student who becomes ill during exam must proceed to Student Wellness Service.",
            "FP17.4": "Misreading timetable is not grounds for deferral."
        },
        "distinction": {
            "FP18.1": "Cum laude: (i) complete in minimum time without failing, (ii) average 70% in all law courses at UCT, (iii) First Class pass in at least 6 full law courses.",
            "FP18.2": "Magna cum laude: (i) complete in minimum time without failing, (ii) average 75% in all law courses at UCT, (iii) First Class pass in at least 9 full law courses."
        }
    }
}

# ============================================================
# EQUIVALENCES
# ============================================================

equivalences = {
    "$schema": "handbook-equivalences-v1",
    "faculty": "law",
    "year": 2026,
    "equivalences": [
        {
            "type": "stream_equivalence",
            "note": "Graduate LLB (LP001), undergraduate LLB (LB002), and combined LLB all lead to the same LLB qualification. Stream determines entry point and total duration."
        },
        {
            "type": "elective_types",
            "note": "Final Level electives come in two types: (1) lectures-and-examination electives, (2) seminars-and-research-paper electives. Students must take at least one of type (2), or do an Independent Research Paper instead."
        },
        {
            "type": "numeracy_requirement",
            "options": ["Pass numeracy test", "Complete MAM1013F"],
            "note": "Undergraduate LLB students must satisfy numeracy requirement via test OR MAM1013F. Test may not be attempted a second time."
        }
    ]
}

# ============================================================
# WRITE FILES
# ============================================================

def write_json(path, data):
    full = os.path.join(BASE, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"  Written: {path}")

write_json('meta.json', meta)
write_json('courses/_index.json', course_index)
for prog in programmes:
    write_json(f'majors/{prog["id"]}.json', prog)
write_json('rules/faculty_rules.json', faculty_rules)
write_json('equivalences.json', equivalences)

# ── Individual course files (handbook-course-v1 schema) ──
print("\nGenerating individual course files...")
generated = 0
missing_details = []

for code, title, credits, nqf in courses:
    prefix = extract_prefix(code)
    dept_slug = DEPT_SLUGS.get(prefix, prefix.lower())
    suffix = code[-1]
    is_cross = prefix in cross_faculty_prefixes

    detail = course_details.get(code, None)
    if detail is None:
        missing_details.append(code)
        continue

    course_file = {
        "$schema": "handbook-course-v1",
        "code": code,
        "title": title,
        "department": dept_slug,
        "credits": credits,
        "nqf_level": nqf,
        "year_level": year_level(code),
        "semester": semester_from_suffix(code),
        "semester_code": suffix,
        "convener": detail["convener"],
        "prerequisites": detail["prerequisites"],
        "corequisites": detail["corequisites"],
        "outline": detail["outline"],
        "lecture_times": detail.get("lecture_times", ""),
        "dp_requirements": detail.get("dp_requirements", "None"),
        "assessment": detail["assessment"],
        "is_law_course": not is_cross,
    }

    if is_cross:
        course_file["offered_by_faculty"] = cross_faculty_prefixes[prefix]

    write_json(f'courses/{code}.json', course_file)
    generated += 1

if missing_details:
    print(f"  WARNING: No detail found for {len(missing_details)} courses: {missing_details}")

print(f"\nDone! Created {len(courses)} courses in _index.json, {generated} individual course files, {len(programmes)} programmes")
