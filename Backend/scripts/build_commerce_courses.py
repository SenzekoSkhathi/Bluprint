"""
Build individual course JSON files for Commerce faculty.
Reads from existing _index.json and generates handbook-course-v1 schema files
with rich detail (convener, outline, prerequisites, assessment, etc.)

All course details verified against 2026 Commerce Faculty Handbook.
Cross-faculty courses (CSC, MAM, STA from Science; CML from Law; PHI from Humanities)
are also described in the Commerce handbook and included here.
"""
import json
import os

BASE = os.path.join(os.path.dirname(__file__), '..', 'data', 'handbook', 'faculties', 'commerce')


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


DEPT_SLUGS = {
    'ACC': 'accounting',
    'BUS': 'management-studies',
    'CML': 'commercial-law',
    'CSC': 'computer-science',
    'ECO': 'economics',
    'FTX': 'finance-and-tax',
    'INF': 'information-systems',
    'MAM': 'mathematics',
    'PHI': 'philosophy',
    'STA': 'statistical-sciences',
}

cross_faculty_prefixes = {
    'CML': 'law',
    'CSC': 'science',
    'MAM': 'science',
    'PHI': 'humanities',
    'STA': 'science',
}

# ============================================================
# COURSE DETAILS — all data from 2026 Commerce Handbook
# ============================================================

course_details = {

    # ── DEPARTMENT OF ACCOUNTING (ACC) ──────────────────────────

    "ACC1006F": {
        "convener": "Associate Professor J Kew",
        "prerequisites": {
            "text": "Registration for a BCom Accounting, BBusSci Finance with Accounting, or Actuarial Science degree.",
            "parsed": {"type": "programme_registration", "programmes": ["BCom Accounting", "BBusSci Finance with Accounting", "Actuarial Science"]}
        },
        "corequisites": [],
        "outline": "Financial Accounting is predominantly an applied discipline that is based on broad conceptual principles. The course develops an understanding of the business cycle and various decisions taken in a business. Particular emphasis is placed on recording financial transactions in accounting records and interpreting financial transactions through the application of definitions and recognition criteria as set out in the conceptual framework. Students will also be required to prepare and present basic financial statements.",
        "lecture_times": "Tuesday, Wednesday, Thursday, Friday 13:00 - 14:00; 14:00 - 15:00",
        "dp_requirements": "Attendance at and submission of a minimum of 70% of tutorials AND a weighted average of 35% for class tests AND an average of 35% for assignments.",
        "assessment": "Coursework 35%; Exam 65%."
    },
    "ACC1011S": {
        "convener": "Associate Professor J Winfield",
        "prerequisites": {
            "text": "ACC1006F. Registration for a BCom Accounting, BBusSci Finance with Accounting, or Actuarial Science degree.",
            "parsed": {"type": "prerequisite", "codes": ["ACC1006F"]}
        },
        "corequisites": [],
        "outline": "Financial Reporting 1 covers the second semester of the first-year accounting syllabus. The standard has been set to the level required for those intending to become Chartered Accountants. Financial reporting is predominantly an applied discipline based on broad conceptual principles introduced in ACC1006. Topics include: companies; property, plant and equipment; statements of cash flows; liabilities; and financial analysis. The course uses a blended learning model.",
        "lecture_times": "Lectures on Fridays at either 13h00-13h45 or 14h00-14h45, plus a double-period tutorial per week. Optional in-person sessions Tues-Thurs.",
        "dp_requirements": "Weighted average of 35% for class tests, having written at least one class test.",
        "assessment": "Coursework 40%; Exam 60%. The coursework component may include participation."
    },
    "ACC1015S": {
        "convener": "Associate Professor J Kew and Associate Professor S Herbert",
        "prerequisites": {
            "text": "Registration for a BCom Accounting or BBusSci Finance with Accounting degree.",
            "parsed": {"type": "programme_registration", "programmes": ["BCom Accounting", "BBusSci Finance with Accounting"]}
        },
        "corequisites": ["ACC1006F", "ACC1011S"],
        "outline": "This course exposes students to real-life businesses in South Africa. The internal and external business environment are explored, equipping students with the ability to evaluate the role of business in society, understanding different types of entities and understanding how to apply integrated thinking to business decisions.",
        "lecture_times": "Monday and Friday 11:00 (S course); F course Monday and Friday 10:00.",
        "dp_requirements": "Participation in group project, 70% attendance at tutorials and 70% submission of weekly hand-ins.",
        "assessment": "Group assignment 30%; Individual assignments 20%; Final Exam 50%. A subminimum of 45% for the final examination."
    },
    "ACC1021F": {
        "convener": "M West",
        "prerequisites": {
            "text": "Admission to degree. NSC level 5 in Mathematics and level 4 in English HL (or level 5 in English FAL).",
            "parsed": {"type": "admission", "codes": []}
        },
        "corequisites": [],
        "outline": "This is an introductory course in accounting aimed at all Commerce students who are not required to complete the specialised accounting courses. The course aims to provide Commerce graduates with the necessary acumen to engage in a managerial context with the accounting function within their organisations. Commerce students are also required to complete ACC1022Z.",
        "lecture_times": "4 lectures a week, Mondays to Thursdays. Tutorials: a double-period tutorial per week.",
        "dp_requirements": "75% course participation and a minimum of 38% for the April test.",
        "assessment": "One class test in April. One final exam as part of the June exam block."
    },
    "ACC1022Z": {
        "convener": "F Jacobs",
        "prerequisites": {
            "text": "ACC1021F.",
            "parsed": {"type": "prerequisite", "codes": ["ACC1021F"]}
        },
        "corequisites": [],
        "outline": "This course continues from ACC1021F and aims to provide Commerce graduates with an overview of cash flows, taxation, and governance principles.",
        "lecture_times": "4 lectures a week, Mondays to Thursdays. Tutorials: a double-period tutorial per week.",
        "dp_requirements": "75% course participation.",
        "assessment": "One final exam before/after the September vacation."
    },
    "ACC2012W": {
        "convener": "JP Du Plessis and M Bardien",
        "prerequisites": {
            "text": "A minimum mark of 60% for ACC1011 within two years of first registration. Concurrent registration or a previous pass in ACC1015, ACC2022, ACC2023 and MAM1010. Registration for BCom Accounting or BBusSci Finance with Accounting degree.",
            "parsed": {"type": "prerequisite", "codes": ["ACC1011S"], "concurrent": ["ACC1015S", "ACC2022H", "ACC2023H", "MAM1010F"]}
        },
        "corequisites": [],
        "outline": "This course integrates knowledge from first year Financial Accounting and Financial Reporting I courses. Students should be able to prepare and present separate and group financial statements within the scope of the Conceptual Framework for Financial Reporting and a set of general purpose financial statements using the International Financial Reporting Standards (IFRS) upon completion of this course.",
        "lecture_times": "Monday to Friday 8:00 for BBusSci and 9:00 for BCom.",
        "dp_requirements": "Attendance at and submission of a minimum of 75% of tutorials in each semester and a weighted average of 40% for class tests and a weighted average of 40% for projects/assignments.",
        "assessment": "Coursework 40%; Exam 60%."
    },
    "ACC2018H": {
        "convener": "M Phaswana",
        "prerequisites": {
            "text": "A pass in INF1002 and concurrent registration or a previous pass in ACC1015 and ACC2012W. Registration for a BCom Accounting or BBusSci Finance with Accounting degree.",
            "parsed": {"type": "prerequisite", "codes": ["INF1002F"], "concurrent": ["ACC1015S", "ACC2012W"]}
        },
        "corequisites": [],
        "outline": "The course builds on the foundations of Financial Accounting and Reporting, Information Systems and Business Acumen. It introduces students to the foundational principles of business cycles (systems) and internal control, where 'Governance' refers to the system by which an entity is directed and controlled and 'Internal Control' refers to the process in place to ensure the entity's objectives with regard to reliability of financial reporting, effectiveness and efficiency of operations, and compliance with applicable laws and regulations.",
        "lecture_times": "Wednesday and Thursday 15:00; Repeat lectures 16:00.",
        "dp_requirements": "Attendance at and submission of a minimum of 75% of tutorials in each semester AND a weighted average of 40% for class tests AND a weighted average of 40% for assignments.",
        "assessment": "Coursework 40%; Exam 60%."
    },
    "ACC2022H": {
        "convener": "J Dean",
        "prerequisites": {
            "text": "ACC1006 or equivalent. Registration for a BCom Accounting, BBusSci Finance with Accounting, or BBusSci Finance degree.",
            "parsed": {"type": "prerequisite", "codes": ["ACC1006F"]}
        },
        "corequisites": [],
        "outline": "An introduction to the discipline of Management Accounting; the analysis of cost systems, cost classification, and cost behaviour; product costing including job costing and process costing; the allocation of costs from service departments; absorption and variable costing; activity based costing; cost-volume-profit relationships, relevant costing and cost benefit analyses; budgeting systems; standard costing and flexible budgeting; financial performance measurement in business segments.",
        "lecture_times": "Monday - Thursday 13:00 (with a repeat at 14:00) every second week.",
        "dp_requirements": "Attendance at and submission of a minimum of 75% of tutorials in each semester AND a weighted average of 40% for class tests AND a weighted average of 40% for assignments.",
        "assessment": "Coursework 50%; Exam 50%. A subminimum of 45% is required for the final exam."
    },
    "ACC2023H": {
        "convener": "S Esack",
        "prerequisites": {
            "text": "ACC1011S and concurrent registration or a previous pass in ACC1015. Registration for a BCom Accounting or BBusSci Finance with Accounting degree.",
            "parsed": {"type": "prerequisite", "codes": ["ACC1011S"], "concurrent": ["ACC1015S"]}
        },
        "corequisites": [],
        "outline": "The primary aim of the course is to provide students with a foundation to the income tax and value-added tax legislation in order to enable them to apply such knowledge in problem-solving situations. The aim in covering these areas is to give students a rounded knowledge of the fiscal tax planning arena.",
        "lecture_times": "Monday - Thursday 13:00 (with a repeat at 14:00) every second week.",
        "dp_requirements": "Attendance at and submission of a minimum of 75% of tutorials and assignments in each semester AND a weighted average of 40% for all class tests AND a weighted average of 40% for the project assignments.",
        "assessment": "Coursework 40%; Exam 60%."
    },
    "ACC3004W": {
        "convener": "S Maqhubela",
        "prerequisites": {
            "text": "A pass in ACC2023H, and concurrent registration or a previous pass in ACC3009W or ACC3020W.",
            "parsed": {"type": "prerequisite", "codes": ["ACC2023H"], "concurrent": ["ACC3009W"]}
        },
        "corequisites": [],
        "outline": "This course builds on the basic principles of taxation taught in Taxation I. The aim of the course is to develop proficiency in the application of tax knowledge, with a focus on understanding and applying relevant taxation legislation, identification of relevant case law and applying these in the context of real-life scenarios.",
        "lecture_times": "Thursday and Friday at 08:00; Repeat Lectures 09:00.",
        "dp_requirements": "Attendance at and submission of a minimum of 75% of tutorials AND a weighted average of 40% for class tests AND a weighted average of 40% for assignments.",
        "assessment": "Coursework 40%; Exam 60%."
    },
    "ACC3009W": {
        "convener": "M Gajewski and S Gwadiso",
        "prerequisites": {
            "text": "Please refer to the 'Entry to CA specific courses' section of the Commerce Handbook.",
            "parsed": {"type": "see_handbook", "codes": []}
        },
        "corequisites": [],
        "outline": "The objective of Financial Reporting III within the CA(SA) qualification process is to ensure that students display competencies related to the recording, recognition, measurement and presentation of financial and non-financial information in accordance with International Financial Reporting Standards (IFRS). It builds on the basic principles of accounting taught in Financial Reporting I and II. Particular emphasis is placed on the application of full IFRS, integration of income taxes and the application of various accounting principles in a group situation.",
        "lecture_times": "Monday, Tuesday, Wednesday, Thursday 11:00; Repeat Lecture 12:00.",
        "dp_requirements": "Attendance at and submission of a minimum of 75% of tutorials AND a weighted average of 40% for class tests.",
        "assessment": "Coursework 40%; Exam 60%."
    },
    "ACC3022W": {
        "convener": "K Williams",
        "prerequisites": {
            "text": "ACC2018H and ACC2012W, concurrent registration or a previous pass in INF2004F.",
            "parsed": {"type": "prerequisite", "codes": ["ACC2018H", "ACC2012W"], "concurrent": ["INF2004F"]}
        },
        "corequisites": [],
        "outline": "This course covers most of the key concepts contained in the auditing, assurance and related services syllabus for the Initial Test of Competence (ITC) for entrance into the accountancy profession. On successful completion of the course a student will have an understanding of the principles and rationale of auditing and the ability to solve basic practical auditing problems.",
        "lecture_times": "Thursday and Friday 08:00; Repeat Lectures 09:00.",
        "dp_requirements": "Attendance at and submission of a minimum of 75% of tutorials AND a weighted average of 40% for class tests.",
        "assessment": "Coursework 40%; Exam 60%."
    },
    "ACC3023W": {
        "convener": "C de Jesus",
        "prerequisites": {
            "text": "ACC2022H; ACC1011S; and FTX2024 or FTX2020.",
            "parsed": {"type": "prerequisite", "codes": ["ACC2022H", "ACC1011S", "FTX2024F"]}
        },
        "corequisites": [],
        "outline": "Management Accounting II focuses on the core pillars of Costing, Decision Making, and Planning and Control. The principles build on the foundations of Management Accounting I and expand on these principles further. The course is designed to enable students to go on with professional courses such as those offered by CIMA, SAICA, and ACCA.",
        "lecture_times": "Tuesday and Wednesday 08:00; Repeat Lectures 09:00.",
        "dp_requirements": "Attendance at and submission of a minimum of 75% of tutorials AND a weighted average of 40% for class tests AND a weighted average of 40% for assignments.",
        "assessment": "Coursework 40%; Exam 60%."
    },

    # ── SCHOOL OF MANAGEMENT STUDIES (BUS) ──────────────────────

    "BUS1003H": {
        "convener": "L Mulaudzi",
        "prerequisites": {
            "text": "Admission to an Actuarial Programme.",
            "parsed": {"type": "programme_registration", "programmes": ["Actuarial Programme"]}
        },
        "corequisites": [],
        "outline": "The aim of the course is to provide an overview of the fields of actuarial science and quantitative finance. The central concept for both disciplines is the measurement and valuation of financial transactions with a component of uncertainty. Topics covered include risk assessment and management, different types of insurance, different types of asset classes. Students are introduced to financial mathematics and life contingency functions which enables them to value assets and insurance products. The course also addresses questions concerning professionalism and what it is to be an actuary/quant.",
        "lecture_times": "To be advised.",
        "dp_requirements": "Attempting all classwork and obtaining an overall average of 40%.",
        "assessment": "Tutorials and Assignments 15%; Tests 35%; Examination 50%."
    },
    "BUS1036F": {
        "convener": "J Rousseau",
        "prerequisites": {
            "text": "Admission as first year Faculty of Commerce students, or by permission of Head of School.",
            "parsed": {"type": "admission", "codes": []}
        },
        "corequisites": [],
        "outline": "This course equips students with crucial intellectual resources for facing the challenges presented by a globalised knowledge-dependent economy. Its focus is on developing critical reasoning skills, in particular competence at, and confidence in, assessing the quality of available evidence; distinguishing disinformation from misinformation, and understanding the influence of social media on shaping judgments and decision-making. Students will learn how to use evidence and sound argumentation to reach well-justified conclusions, and to then efficiently and persuasively communicate those conclusions to relevant stakeholders.",
        "lecture_times": "To be advised.",
        "dp_requirements": "Submission of all coursework assignments. Participation in small group case study discussions as required. Achieving a weighted average of at least 40%.",
        "assessment": "Coursework 75%; Capstone assessment 25%. A sub-minimum of 45% must be achieved in the capstone assessment."
    },
    "BUS1036S": {
        "convener": "J Rousseau",
        "prerequisites": {
            "text": "Admission as first year Faculty of Commerce students, or by permission of Head of School.",
            "parsed": {"type": "admission", "codes": []}
        },
        "corequisites": [],
        "outline": "This course equips students with crucial intellectual resources for facing the challenges presented by a globalised knowledge-dependent economy. Its focus is on developing critical reasoning skills, in particular competence at, and confidence in, assessing the quality of available evidence; distinguishing disinformation from misinformation, and understanding the influence of social media on shaping judgments and decision-making. Students will learn how to use evidence and sound argumentation to reach well-justified conclusions, and to then efficiently and persuasively communicate those conclusions to relevant stakeholders.",
        "lecture_times": "To be advised.",
        "dp_requirements": "Submission of all coursework assignments. Participation in small group case study discussions as required. Achieving a weighted average of at least 40%.",
        "assessment": "Coursework 75%; Capstone assessment 25%. A sub-minimum of 45% must be achieved in the capstone assessment."
    },
    "BUS2010F": {
        "convener": "Associate Professor J Lappeman",
        "prerequisites": {
            "text": "Students should be in their second AYOS or above.",
            "parsed": {"type": "year_status", "codes": []}
        },
        "corequisites": [],
        "outline": "The marketing concept, the marketing environment, consumer markets and industrial markets, buyer behaviour, marketing research, the use and importance of differentiation, market segmentation and target marketing, the marketing mix, product policy, pricing policy, distribution policy, promotion policy, marketing strategy, marketing organisation and implementation, measurement and control of marketing effectiveness including the marketing audit.",
        "lecture_times": "To be advised.",
        "dp_requirements": "40% class mark and the completion of all required assignments.",
        "assessment": "Essays, case studies, project and test 50%; June/October examinations (2 hours) 50%."
    },
    "BUS2010S": {
        "convener": "Associate Professor J Lappeman",
        "prerequisites": {
            "text": "Students should be in their second AYOS or above.",
            "parsed": {"type": "year_status", "codes": []}
        },
        "corequisites": [],
        "outline": "The marketing concept, the marketing environment, consumer markets and industrial markets, buyer behaviour, marketing research, the use and importance of differentiation, market segmentation and target marketing, the marketing mix, product policy, pricing policy, distribution policy, promotion policy, marketing strategy, marketing organisation and implementation, measurement and control of marketing effectiveness including the marketing audit.",
        "lecture_times": "To be advised.",
        "dp_requirements": "40% class mark and the completion of all required assignments.",
        "assessment": "Essays, case studies, project and test 50%; June/October examinations (2 hours) 50%."
    },
    "BUS2016H": {
        "convener": "E Gouws",
        "prerequisites": {
            "text": "See rule FBC3.8, FBD6, FBF3.5, FBG2.5, respectively, given Actuarial Programme of registration.",
            "parsed": {"type": "see_handbook", "codes": []}
        },
        "corequisites": [],
        "outline": "The course aims to provide a grounding in financial mathematics and simple applications related to non-random cash flows. Lectures and tutorials will cover various aspects, including cash flow models for financial transactions, compound interest and discounting, present values and accumulations of streams of payments, nominal and effective rates, equations of value, loan schedules, project appraisal techniques, compound interest problems and index-linked securities, income and capital gains tax on fixed-interest securities, arbitrage pricing and forward contracts, basic types of assets, pricing methods, and the term structure of interest rates.",
        "lecture_times": "To be advised.",
        "dp_requirements": "At least 40% for coursework, 80% total tutorial attendance.",
        "assessment": "Tutorials (groupwork) 10%; Tests 30%; Examination 60% (42% written exam; 18% Excel-based exam)."
    },
    "BUS2033F": {
        "convener": "Dr S Rousseau",
        "prerequisites": {
            "text": "A pass in at least 8 courses towards the degree.",
            "parsed": {"type": "credit_count", "codes": []}
        },
        "corequisites": [],
        "outline": "The course aims to provide students with the ability to design and produce various types of persuasive business and professional documents and deliver business presentations. Students develop skills in planning and producing effective messages through practice in both verbal and visual arguments. They also develop management and communication skills for collaboration through teamwork.",
        "lecture_times": "To be advised.",
        "dp_requirements": "To be advised.",
        "assessment": "Final written examination 40% (with a 35% subminimum). Coursework mark 60%."
    },
    "BUS2033S": {
        "convener": "Dr S Rousseau",
        "prerequisites": {
            "text": "A pass in at least 8 courses towards the degree.",
            "parsed": {"type": "credit_count", "codes": []}
        },
        "corequisites": [],
        "outline": "The course aims to provide students with the ability to design and produce various types of persuasive business and professional documents and deliver business presentations. Students develop skills in planning and producing effective messages through practice in both verbal and visual arguments. They also develop management and communication skills for collaboration through teamwork.",
        "lecture_times": "To be advised.",
        "dp_requirements": "To be advised.",
        "assessment": "Final written examination 40% (with a 35% subminimum). Coursework mark 60%."
    },
    "BUS3018F": {
        "convener": "M Mdlekezi",
        "prerequisites": {
            "text": "BUS2016H, MAM2010F, MAM2011F, MAM2012S, MAM2014S, STA2004F, STA2005S, BUS1003H, unless course taken as part of a postgraduate degree.",
            "parsed": {"type": "prerequisite", "codes": ["BUS2016H", "MAM2010F", "MAM2011F", "MAM2012S", "MAM2014S", "STA2004F", "STA2005S", "BUS1003H"]}
        },
        "corequisites": [],
        "outline": "The course aims to provide students with a solid foundation in stochastic processes and survival models, and their actuarial application. Topics covered include: Principles of actuarial modelling; principles and classification of stochastic processes; definition and application of Markov chains and processes; survival models; estimation of lifetime distributions; multiple states; single and multiple decrements; transition intensities and maximum likelihood estimators; binomial model of mortality; multiple state models; process of graduation; testing crude estimates; standard tables; assurances and annuities.",
        "lecture_times": "To be advised.",
        "dp_requirements": "Completion and timeous submission of tutorial exercises. Writing of all class tests. An overall average of 40% for classwork.",
        "assessment": "Tutorials and tests 40%; Examination 60%."
    },
    "BUS3024S": {
        "convener": "P Botha",
        "prerequisites": {
            "text": "BUS2016H, STA2004F, MAM2010F and MAM2011F.",
            "parsed": {"type": "prerequisite", "codes": ["BUS2016H", "STA2004F", "MAM2010F", "MAM2011F"]}
        },
        "corequisites": [],
        "outline": "The course aims to provide a grounding in the mathematical techniques used to model and value cash flows dependent on death, survival, or other uncertain risks. Topics covered include: simple assurance and annuity contracts; more complex contracts with increasing benefits; derivation of formulae for means and variances of benefit payments; definition of standard actuarial symbols and the relationships, including standard life table functions (ultimate and select); calculation of net premiums and net premium provisions (both prospective and retrospective); calculation of death strain at risk, actual and expected death strains, mortality profit; calculation of gross premiums; functions involving two lives; cash flow models; discounted emerging costs; and practical application using MS Excel.",
        "lecture_times": "To be advised.",
        "dp_requirements": "Completion and timeous submission of tutorial exercises. Writing of all class tests. An overall average of 40% for classwork.",
        "assessment": "Tutorials and tests 40%; Examination 60%."
    },
    "BUS3038S": {
        "convener": "Dr M Hoffman",
        "prerequisites": {
            "text": "Students should be in their 3rd year of a BCom or BBusSc or be registered for a Postgraduate Diploma in Management, or be an approved SSA student.",
            "parsed": {"type": "year_status", "codes": []}
        },
        "corequisites": [],
        "outline": "The key objective of this course is to provide a general introduction to Project Management for Commerce students. Students are introduced to the Project Life Cycle and the project management methodology as outlined in the Project Management Body of Knowledge (PBOK). Students registered for this course will be required to apply the project management process to new product development, with the practical group project focusing on doing a feasibility study for a new product. Particular emphasis is placed on quality.",
        "lecture_times": "To be advised.",
        "dp_requirements": "Completion of all coursework assessments.",
        "assessment": "Coursework 100%."
    },
    "BUS3039F": {
        "convener": "Associate Professor S Savahl",
        "prerequisites": {
            "text": "BUS3039F: Entry restricted to 1.) third year BCom (Management Studies) students who have not taken organisational psychology undergraduate courses, 2.) third year BBusSc students in all fields except for Organisational Psychology, Finance, Finance (CA), and 3.) PG Diploma students in the following areas: Sports Management, Business Communication, Entrepreneurship and Marketing.",
            "parsed": {"type": "restricted_entry", "codes": []}
        },
        "corequisites": [],
        "outline": "This course introduces business science and management students to people management issues (e.g., leadership, teamwork, and diversity) that may arise as they enter the world of work. Students will learn to manage current and emerging South African contextual complexities in managing people from diverse local lived realities. Adopting a collaborative learning approach, the course focuses on building the knowledge and skills necessary for students to be active in leading transformative workplace change and social justice.",
        "lecture_times": "To be advised.",
        "dp_requirements": "None.",
        "assessment": "Coursework 100%."
    },
    "BUS4027W": {
        "convener": "P Botha",
        "prerequisites": {
            "text": "BUS2016H, BUS3018F, BUS3024S, STA3041F, STA3043S and STA3045F.",
            "parsed": {"type": "prerequisite", "codes": ["BUS2016H", "BUS3018F", "BUS3024S", "STA3041F", "STA3045F"]}
        },
        "corequisites": ["BUS4028F"],
        "outline": "The aim of this subject is to instil in successful candidates the ability to apply a wide range of key actuarial concepts in simple traditional and non-traditional situations. It comprises the following topics: How to do a professional job, Stakeholders, Client needs and customer needs and implications for other stakeholders, Managing risks, Marketing, External environment, Investment environment, Meeting investor needs, Capital, Interaction with client, Awareness of risk, Management of provisions for liabilities, Project planning and management, Input validation, Methodology and techniques, Assumption setting, Design, Expenses, Developing the cost and the price, Provisioning, Relationship between assets and liabilities, Maintaining profitability, Determining the expected results, Reporting actual results, Risk management, Asset management, Capital management, Surplus management, Mergers and acquisitions, Insolvency and closure, Options and guarantees, Monitoring, Principal terms.",
        "lecture_times": "To be advised.",
        "dp_requirements": "Completion and timeous submission of tutorial exercises. Sitting all class tests. An overall average of 40% for class work.",
        "assessment": "Tutorials and Tests 50%; End of year examinations (2x 3 hours) 50%."
    },
    "BUS4028F": {
        "convener": "Dr E Maritz",
        "prerequisites": {
            "text": "4th year status in BBusSci (AcSci) or BBusSci (QF) - see programme rules.",
            "parsed": {"type": "year_status", "codes": []}
        },
        "corequisites": [],
        "outline": "The course covers the behaviour of financial markets, measures of investments risk, asset return models, derivative pricing and liability valuation. Topics include: the efficient markets hypothesis, utility theory, behavioural economics, measures of investment risks, mean-variance analysis, the capital asset pricing model, multi-factor models of asset returns, Brownian motion, ito calculus, stochastic models for security prices, models of the term structures of interest rates, simple models for credit risk, valuation of futures and options, ruin theory and run-off triangles.",
        "lecture_times": "To be advised.",
        "dp_requirements": "Completion of tutorials and tests with an average of 40%.",
        "assessment": "Tutorials 8%; Tests 32%; 3h15min written examination 42%; 1h45min computer-based examination 18%."
    },
    "BUS4029H": {
        "convener": "Associate Professor S Mataramvura",
        "prerequisites": {
            "text": "Concurrent registration for BUS4028F (Actuarial Science III: Financial Economics).",
            "parsed": {"type": "concurrent_registration", "codes": ["BUS4028F"]}
        },
        "corequisites": ["BUS4028F"],
        "outline": "The project course aims at equipping students with research skills, to empower students with paper writing skills and to equip students with ability to search for information online using e.g. library resources, Bloomberg and other sources. The project also aims at inculcating a sense of responsibility and discipline among students. The project process consists of a submission of proposal, a literature review, an initial draft of the final paper and the final paper.",
        "lecture_times": "To be advised.",
        "dp_requirements": "Passing the draft proposal by at least 4/10.",
        "assessment": "Course work 20%; Dissertation 80%. Literature Review marked out of 10, draft proposal marked out of 10. Final draft marked out of 100. Overall mark = Literature Review Mark + Draft mark + 0.8 * Final Mark."
    },
    "BUS4034S": {
        "convener": "C Kalil",
        "prerequisites": {
            "text": "BUS2016H, BUS3018F and STA3041F. BUS3024S, STA3043S, STA3045F, BUS4028F.",
            "parsed": {"type": "prerequisite", "codes": ["BUS2016H", "BUS3018F", "STA3041F", "BUS3024S", "STA3045F", "BUS4028F"]}
        },
        "corequisites": [],
        "outline": "The course develops theory and practice related to professional and business communication. It aims to enhance students' ability to: plan and write business and professional document types with a focus on communicating actuarial science topics to various non-specialist audiences; structure and deliver business presentations; design visual support for oral and written message; and work in teams to develop collaborative management and communication skills.",
        "lecture_times": "To be advised.",
        "dp_requirements": "Submission of all assignments and participation in oral presentations; attendance at all compulsory lectures and workshops.",
        "assessment": "PCU component: semester course work and presentations (60%); 3-hour written examination [Paper 1] (40%). Students must achieve a sub-minimum of 40% for each component with an average of 50%. PCU final mark: 70%; N211 Paper 2: 30%."
    },
    "BUS4050H": {
        "convener": "Dr M Hoffman",
        "prerequisites": {
            "text": "Completion of all special field courses up to the end of the third year (e.g. a Finance student must have completed all Finance courses). Students may register for BUS4050W only in the year in which they can potentially graduate.",
            "parsed": {"type": "see_handbook", "codes": []}
        },
        "corequisites": [],
        "outline": "BUS4050W is the capstone course available only to final year Business Science students. The aim is to test and improve students' strategic thinking ability and how they can apply this to business. This future-oriented and outcome-based course develops other types of thinking or competencies which include visionary thinking, contextual thinking, collaborative thinking and creative thinking. The course covers classic Strategic Management, Blue Ocean Strategy, Scenario Planning, and Business Models.",
        "lecture_times": "To be advised.",
        "dp_requirements": "Completion of all coursework assessments.",
        "assessment": "Coursework 100%."
    },
    "BUS4053H": {
        "convener": "Associate Professor S Mataramvura",
        "prerequisites": {
            "text": "Concurrent registration for BUS4028F (Actuarial Science III: Financial Economics).",
            "parsed": {"type": "concurrent_registration", "codes": ["BUS4028F"]}
        },
        "corequisites": ["BUS4028F"],
        "outline": "The project course aims at equipping students with research skills, to empower students with paper writing skills and to equip students with ability to search for information online using e.g. library resources, Bloomberg and other sources. The project also aims at inculcating a sense of responsibility and discipline among students. The project process consists of a submission of proposal, a literature review, an initial draft of the final paper and the final paper.",
        "lecture_times": "To be advised.",
        "dp_requirements": "Passing the draft proposal by at least 4/10.",
        "assessment": "Course work 20%; Dissertation 80%."
    },
    "BUS4087S": {
        "convener": "Associate Professor S Mataramvura",
        "prerequisites": {
            "text": "FTX3044F (60%) and FTX3045S (60%), ECO2003F and ECO2004S.",
            "parsed": {"type": "prerequisite", "codes": ["FTX3044F", "FTX3045S", "ECO2003F", "ECO2004S"]}
        },
        "corequisites": ["BUS4050H"],
        "outline": "This aim of this course is to cover advanced topics in the theory and practice of finance. The course covers the following areas: Asset-liability Management, Quantitative Methods, Behavioural Finance, and Corporate Finance.",
        "lecture_times": "To be advised.",
        "dp_requirements": "An overall average of 40% for class work.",
        "assessment": "Class tests and tutorials 50%; Examination 50%."
    },

    # ── DEPARTMENT OF COMMERCIAL LAW (CML) ──────────────────────

    "CML1001F": {
        "convener": "TBA",
        "prerequisites": {
            "text": "None.",
            "parsed": {"type": "none", "codes": []}
        },
        "corequisites": [],
        "outline": "The purpose of the course is to provide students with a general introduction to the South African legal system, with its main focus the law of contract. The course starts with an overview of the South African court structure and contemporary sources and branches of South African law, and also introduces students to the Constitution and the impact that it continues to have on legal development. The course then provides students with a general but comprehensive introduction to the general principles of contract, focusing on formation of contracts, the content of contracts, breach of contract and remedies for breach. The course also aims to provide students with an introduction to certain specific contracts, most notably contracts of sale, lease and agency.",
        "lecture_times": "The course is an intensive one, with 5 contact periods per week for the full semester.",
        "dp_requirements": "Coursework is compulsory. If the student does not submit hand-ins or write a test the student will receive a mark of 0 for that assessment.",
        "assessment": "Coursework 40%; final examination 60%."
    },
    "CML2001F": {
        "convener": "Dr M Maphiri",
        "prerequisites": {
            "text": "Business Law I and no undergraduate student in his/her first year of study may register for Company Law.",
            "parsed": {"type": "prerequisite", "codes": ["CML1001F"]}
        },
        "corequisites": [],
        "outline": "The course offers an overview of the laws that govern the nature, formation, and management of partnerships, trusts, companies and close corporations with the main focus being on companies. Students are encouraged to apply the analytical abilities acquired in previous law courses and these skills are further developed. After the course students will be able to, amongst others, navigate the Companies Act 71 of 2008 and will be familiar with its core provisions and their practical impact.",
        "lecture_times": "The course is an intensive one with 5 contact periods per week for the full semester.",
        "dp_requirements": "Coursework is compulsory. If the student does not submit hand-ins or write a test the student will receive a mark of 0 for that assessment.",
        "assessment": "Coursework 40%; final examination 60%."
    },
    "CML2010Z": {
        "convener": "TBA",
        "prerequisites": {
            "text": "Business Law I. No undergraduate student in the first year of study may register for Business Law II.",
            "parsed": {"type": "prerequisite", "codes": ["CML1001F"]}
        },
        "corequisites": [],
        "outline": "Business Law 2 is designed to give students an understanding of commercial transactions, how they are financed, and the risks involved. The course covers insolvency, credit agreements, stokvels and the various forms of security that can be used to finance commercial transactions. By the end of the course, students should have an appreciation of the types of legal issues that commonly arise in financing transactions - how creditors can best secure themselves in the event of non-payment and ultimately the risk of insolvency and how debtors are protected under the National Credit Act. The course also covers public sector financial management.",
        "lecture_times": "The course is an intensive one with 5 contact periods per week for 8 weeks in Semester 2.",
        "dp_requirements": "Writing the test is compulsory. If a student does not write the test and does not get an exemption then the student will be marked absent and awarded 0 for the test.",
        "assessment": "Coursework 30% and final examination 70%."
    },

    # ── DEPARTMENT OF COMPUTER SCIENCE (CSC) ─────────────────────

    "CSC1015F": {
        "convener": "K Prag",
        "prerequisites": {
            "text": "At least 70% for NSC Mathematics.",
            "parsed": {"type": "nsc_requirement", "codes": []}
        },
        "corequisites": [],
        "outline": "This course is an introduction to problem solving, algorithm development and programming in the Python language. It includes fundamental programming constructs and abstractions, sorting and searching techniques, and machine representations of data. The practical component covers input/output, conditionals, loops, strings, functions, arrays, lists, dictionaries, recursion, text files and exceptions in Python. Students are taught testing and debugging, as well as sorting and searching algorithms, algorithm complexity and equivalence classes. Number systems, binary arithmetic, boolean algebra and logic gates are also introduced.",
        "lecture_times": "4th or 5th period once per week. Tutorials: One per week, replacing one lecture. Practicals: One per week, Monday to Friday, 14h00 - 16h00 or 16h00 - 18h00.",
        "dp_requirements": "Minimum of 45% aggregate in practical work.",
        "assessment": "Theory tests 15%; practical tests and practical assignments 25%; one 2-hour examination written in June 60%. Subminima: 45% for practicals, 45% on weighted average of theory tests and examination."
    },
    "CSC1016S": {
        "convener": "A Safla",
        "prerequisites": {
            "text": "CSC1015F (or at least 60% for CSC1017S).",
            "parsed": {"type": "prerequisite", "codes": ["CSC1015F"]}
        },
        "corequisites": [],
        "outline": "This course builds on the foundation of CSC1015F/CSC1010H, with a focus on object-oriented design and programming in Java, as well as introducing important considerations relating to Human Computer Interaction and interface design. The Java component of the course covers object-oriented design techniques and UML diagrams, as well as elementary data structures such as lists, stacks and queues. The practical component includes use of inheritance, polymorphism, interfaces, generics and GUI programming in Java.",
        "lecture_times": "4th or 5th period daily. Tutorials: One per week, replacing one lecture. Practicals: One per week, Monday, Tuesday or Wednesday, 14h00 - 16h00 or 16h00 - 18h00.",
        "dp_requirements": "Minimum of 45% aggregate in practical work.",
        "assessment": "Theory tests 15%; practical tests and practical assignments 25%; one 2-hour exam written in November 60%. Subminima: 45% for practicals, 45% on weighted average of theory tests and examination."
    },
    "CSC2001F": {
        "convener": "Dr F Meyer",
        "prerequisites": {
            "text": "(CSC1015F/S and CSC1016S) or (CSC1010H and CSC1011H).",
            "parsed": {"type": "prerequisite", "codes": ["CSC1015F", "CSC1016S"]}
        },
        "corequisites": [],
        "outline": "This course builds on the first year Computer Science foundation with an emphasis on data storage and manipulation. The course covers abstract data types and assertions, recursive algorithms, tree structures such as AVL and B-trees, graph traversals, minimum spanning trees, sets, hashing and priority queues. An introduction to conceptual modelling, database design and relational database manipulation is included. Practical programming in Java in a Unix environment is an important part of the course.",
        "lecture_times": "Monday - Friday, 2nd period. Four or five lectures per week. Practicals: One 4-hour practical per week, Monday - Friday, 14h00 - 18h00.",
        "dp_requirements": "Minimum of 45% aggregate in practical work.",
        "assessment": "Tests 20%; practicals and practical test 30%; exam 50%. Subminima: 45% on weighted average of theory tests and examination."
    },
    "CSC2002S": {
        "convener": "Emeritus Associate Professor S Berman",
        "prerequisites": {
            "text": "CSC2001F (At least 45% for CSC2001F).",
            "parsed": {"type": "prerequisite", "codes": ["CSC2001F"]}
        },
        "corequisites": [],
        "outline": "The aim of this course is to build on the foundational concepts covered in CSC2001F, with further necessary core topics of an undergraduate Computer Science curriculum. These topics comprise: concurrent and parallel computing (including practical work in Java); computer architecture; an introduction to Society, Ethics, and the Profession; and Theory of Computing (including Turing Machines and the limits of computation).",
        "lecture_times": "Monday - Friday, 2nd period. Four lectures per week. Practicals: One 4-hour practical per week, Monday - Friday, 14h00 - 18h00.",
        "dp_requirements": "Minimum of 45% aggregate in practical work.",
        "assessment": "Tests 20%; practicals and practical test 30%; exam 50%. Subminima: 45% on weighted average of theory tests and examination."
    },
    "CSC2004Z": {
        "convener": "Emeritus Associate Professor S Berman",
        "prerequisites": {
            "text": "(CSC1015F/S and CSC1016S) or (CSC1010H and CSC1011H).",
            "parsed": {"type": "prerequisite", "codes": ["CSC1015F", "CSC1016S"]}
        },
        "corequisites": [],
        "outline": "This is a required course for all students majoring in Computer Science and/or who wish to continue to any third year courses in Computer Science. It should be taken in the second year of study and will demonstrate competency in programming, which is assumed in all third year courses. It is a compulsory course in the Computer Science major CSC05. The aim is to assess and confirm mastery in fundamental programming skills before students can proceed to advanced courses.",
        "lecture_times": "None.",
        "dp_requirements": "None.",
        "assessment": "Practical programming examination counts for 100%."
    },
    "CSC3002F": {
        "convener": "Associate Professor P Marais",
        "prerequisites": {
            "text": "CSC2001F, CSC2002S, CSC2004Z and ((MAM1004F+MAM1008S) or (MAM1000W) or (MAM1031F or equivalent)).",
            "parsed": {"type": "prerequisite", "codes": ["CSC2001F", "CSC2002S", "CSC2004Z"]}
        },
        "corequisites": [],
        "outline": "The course provides an introduction to both computer networks, including various logical layers of the ISO OSI layers and network security, and the structure and function of modern operating systems.",
        "lecture_times": "Monday - Friday, 2nd period. Practicals: Two 4-hour practicals per week, Monday - Friday, 14h00 - 18h00.",
        "dp_requirements": "Minimum of 45% aggregate in practical work.",
        "assessment": "Tests 20%; 15% for practicals, 15% for practical tests; exams 50%. Subminima: 45% for practicals; 45% on weighted average of theory tests and examinations."
    },
    "CSC3003S": {
        "convener": "Associate Professor P Marais",
        "prerequisites": {
            "text": "CSC2001F, CSC2002S, CSC2004Z and ((MAM1004F+MAM1008S) or (MAM1000W) or (MAM1031F or equivalent)).",
            "parsed": {"type": "prerequisite", "codes": ["CSC2001F", "CSC2002S", "CSC2004Z"]}
        },
        "corequisites": [],
        "outline": "This course covers three topics in advanced programming: software development, functional programming and the theory of algorithms (how algorithms are categorised, interesting algorithms in each category and how to analyse their complexity).",
        "lecture_times": "Monday - Friday, 2nd period. Practicals: Two 4-hour practicals per week, Monday - Friday, 14h00 - 18h00.",
        "dp_requirements": "Minimum of 45% aggregate in practical work.",
        "assessment": "Tests 20%; practical work and practical tests 30%; exams 50%. Subminima: 45% on weighted average of theory tests and examinations; 35% for the advanced computing module."
    },
    "CSC4002W": {
        "convener": "To be advised",
        "prerequisites": {
            "text": "Admission to the Honours programme in Computer Science.",
            "parsed": {"type": "programme_registration", "programmes": ["Honours in Computer Science"]}
        },
        "corequisites": [],
        "outline": "Honours project in Computer Science. Students undertake a research project under supervision, culminating in a written report and presentation.",
        "lecture_times": "Full year course, by arrangement with supervisor.",
        "dp_requirements": "To be advised.",
        "assessment": "Project report and presentation."
    },
    "CSC4019Z": {
        "convener": "F Meyer",
        "prerequisites": {
            "text": "Admission to the Honours programme in Computer Science.",
            "parsed": {"type": "programme_registration", "programmes": ["Honours in Computer Science"]}
        },
        "corequisites": [],
        "outline": "Research and Innovation in Computer Science. This course develops research skills and introduces students to current topics in computer science research.",
        "lecture_times": "By arrangement.",
        "dp_requirements": "To be advised.",
        "assessment": "Coursework and project-based assessment."
    },
    "CSC4020Z": {
        "convener": "Associate Professor G Nitschke",
        "prerequisites": {
            "text": "Admission to the Honours programme in Computer Science.",
            "parsed": {"type": "programme_registration", "programmes": ["Honours in Computer Science"]}
        },
        "corequisites": [],
        "outline": "This course covers functional programming paradigms and techniques, including higher-order functions, lambda calculus, type systems, and applications.",
        "lecture_times": "By arrangement.",
        "dp_requirements": "To be advised.",
        "assessment": "Coursework and examination."
    },
    "CSC4021Z": {
        "convener": "G Stewart",
        "prerequisites": {
            "text": "Admission to the Honours programme in Computer Science.",
            "parsed": {"type": "programme_registration", "programmes": ["Honours in Computer Science"]}
        },
        "corequisites": [],
        "outline": "An introduction to compiler design and implementation, covering lexical analysis, parsing, semantic analysis, code generation, and optimization techniques.",
        "lecture_times": "By arrangement.",
        "dp_requirements": "To be advised.",
        "assessment": "Coursework and examination."
    },

    # ── SCHOOL OF ECONOMICS (ECO) ───────────────────────────────

    "ECO1010F": {
        "convener": "R Chetty",
        "prerequisites": {
            "text": "Admission to degree and a pass (5) in National Senior Certificate: Mathematics.",
            "parsed": {"type": "nsc_requirement", "codes": []}
        },
        "corequisites": [],
        "outline": "This is an introductory course in microeconomics, which aims to expose students to a wide variety of microeconomic concepts and theories, as well as certain practical applications of these concepts. The course starts with a short introduction of economic history, the importance of the Industrial Revolution on the development of capitalism, and the characteristics of different economic systems. Fundamental concepts in microeconomics are taught in a structured and logical way: the production possibilities frontier; gains from trade; demand, supply and equilibrium; elasticity; utility theory in the cardinal and ordinal framework; and production and cost theory. This is followed by the theory of the firm, where the focus is on pure competition, monopoly and monopolistic competition. The course finishes with an introduction to game theory.",
        "lecture_times": "ECO1010F: Tuesday, Wednesday, Thursday & Friday 09h00 - 10h00; 10h00 - 11h00; 11h00 - 12h00; 12h00 - 13h00. Students are advised to reserve a Monday slot for tutorial sessions.",
        "dp_requirements": "All tests/assignments/essays/projects/tutorial attendance/submissions to be completed for DP purposes. If your year mark is below 40% you will not be permitted to write the final examination.",
        "assessment": "Coursework 50%; Exam 50%."
    },
    "ECO1011S": {
        "convener": "Y Sibda",
        "prerequisites": {
            "text": "A minimum mark of 50% for ECO1010F/S or ECO1110F/S. ECO1010F/S may be taken concurrently with ECO1011F/S if ECO1010F/S has been previously attempted.",
            "parsed": {"type": "prerequisite", "codes": ["ECO1010F"]}
        },
        "corequisites": [],
        "outline": "This course is an introductory level course in macroeconomic theory and policy. Macroeconomics studies the aggregate behaviour of the economy. The list of topics covered include gross domestic product, economic growth, unemployment, inflation, exchange rates, balance of payments, business cycles, fiscal and monetary policy tools and objectives. The course will build on macroeconomic relationships to develop basic models explaining various interactions within the economy, providing students with a framework for understanding and interrogating the workings of the economy. The course emphasizes relevant and current issues in the context of South African economic history. South Africa's relationship with the rest of the world is also explored.",
        "lecture_times": "ECO1011S: 09h00 - 10h00 Tuesday, Wednesday, Thursday & Friday. 10h00 - 11h00 Tuesday, Wednesday, Thursday & Friday. Students are advised to reserve a Monday slot for tutorial sessions.",
        "dp_requirements": "All tests/assignments/essays/projects/tutorial attendance/submissions to be completed for DP purposes. If your year mark is below 40% you will not be permitted to write the final examination.",
        "assessment": "Coursework 50%; Exam 50%."
    },
    "ECO2003F": {
        "convener": "L Edwards",
        "prerequisites": {
            "text": "ECO1010 and MAM1010 (or an equivalent) or MAM1031F or MAM1032S.",
            "parsed": {"type": "prerequisite", "codes": ["ECO1010F", "MAM1010F"]}
        },
        "corequisites": [],
        "outline": "The course studies the role of institutions and power in influencing the outcomes of economic exchange. The course introduces the concept of institutions and how they influence the balance of power in economic interactions, and affect the fairness and efficiency of the allocations that result. The course then applies these concepts to a study of economic inequality, focusing on its trends, sources and policy options for more equal societies. The course then considers firms and the role that market structure plays in the setting of prices. Finally, the course studies market failures with application to environmental policy, and innovation and the networked economy. The course makes use of mathematical techniques to complement the graphical and discursive representation of the theory. All sections of the course incorporate real world applications.",
        "lecture_times": "Lecture/Workshop times: 09h00 - 10h00 Monday, Tuesday, Wednesday, Thursday. 12h00 - 13h00 Monday, Tuesday, Wednesday, Thursday. 13h00 - 14h00 Monday, Tuesday, Wednesday, Thursday.",
        "dp_requirements": "None.",
        "assessment": "Coursework 50%; Exam 50%."
    },
    "ECO2004S": {
        "convener": "Dr T Mpofu",
        "prerequisites": {
            "text": "ECO1010, ECO1011 and MAM1010 (or an equivalent) or MAM1031F or MAM1032S. A student will be permitted to take ECO2004S without having passed ECO2003F, although it is desirable to pass ECO2003F prior to taking ECO2004S.",
            "parsed": {"type": "prerequisite", "codes": ["ECO1010F", "ECO1011S", "MAM1010F"]}
        },
        "corequisites": [],
        "outline": "The course builds upon ECO1011S and aims to provide students with the analytical tools and formal models to explain the behaviour of output, inflation, employment, interest rates, and other economic aggregates. These tools are used to understand current economic issues, forecast the behaviour of the economy, and assess the impact of policy choices. The course allows students to understand the behaviour of households, firms, governments and Central Banks. It starts with analysing the short run behaviour of the economy and then moves on to explore the open economy and exchange rates. Finally, it looks at the long run and assesses the role of technology and population growth on aggregate economic growth using the Solow growth model.",
        "lecture_times": "Lecture/Workshop times: 09h00 - 10h00 Monday, Tuesday, Wednesday, Thursday. 12h00 - 13h00 Monday, Tuesday, Wednesday, Thursday. 13h00 - 14h00 Monday, Tuesday, Wednesday, Thursday.",
        "dp_requirements": "None.",
        "assessment": "Coursework 50%; Exam 50%."
    },
    "ECO2007S": {
        "convener": "Associate Professor M Keswell",
        "prerequisites": {
            "text": "ECO1010 or MAM1010 (or equivalent).",
            "parsed": {"type": "prerequisite", "codes": ["ECO1010F"]}
        },
        "corequisites": [],
        "outline": "This is an introductory course in game theory, the framework for analysing strategic interaction. Game theory is (among other things), the basic technology for understanding most phenomena in microeconomics, along with many processes in macroeconomics, law, evolutionary biology, and the science of animal behaviour (ethology). In this course we will study the basic structure of the theory. All mathematics will be either self-contained within the course, or will be familiar from STA1000 or MAM1010.",
        "lecture_times": "09h00 - 10h00 and 11h00 - 12h00; Monday, Tuesday, Wednesday, Thursday.",
        "dp_requirements": "None.",
        "assessment": "Coursework 50%; Exam 50%."
    },
    "ECO3020F": {
        "convener": "Associate Professor A Kerr",
        "prerequisites": {
            "text": "MAM1010 (or equivalent) or MAM1031F or MAM1032S, ECO2003 and ECO2004.",
            "parsed": {"type": "prerequisite", "codes": ["MAM1010F", "ECO2003F", "ECO2004S"]}
        },
        "corequisites": [],
        "outline": "This course has two, equally weighted components: the microeconomics component and the macroeconomics component. The first 6 weeks of the course will focus on Microeconomics. This section of the course will focus on the dynamic interplay of behaviour and institutions, and the outcomes produced through their interaction. The macroeconomics component follows Stephen Williamson's Macroeconomics and employs his graphical and sectoral approach, which employs a micro foundations approach to macroeconomics. It starts by developing a basic closed economy monetary model and expands it to a full open economy monetary model.",
        "lecture_times": "09h00 - 10h00 Monday, Tuesday, Wednesday, Thursday, Friday; 10h00 - 11h00 Monday, Tuesday, Wednesday, Thursday, Friday.",
        "dp_requirements": "None.",
        "assessment": "Coursework 50%; Exam 50%."
    },
    "ECO3021S": {
        "convener": "Professor E Muchapondwa",
        "prerequisites": {
            "text": "Students must have completed MAM1010 (or an equivalent), STA1000, ECO2003 and ECO2004.",
            "parsed": {"type": "prerequisite", "codes": ["MAM1010F", "STA1000S", "ECO2003F", "ECO2004S"]}
        },
        "corequisites": [],
        "outline": "The emphasis in this course is to introduce students to new tools and techniques for quantitative analysis in the social and behavioural sciences. In this respect, it is aimed at students wishing to pursue postgraduate studies in economics. The course covers two inter-related modules: Module one: cross sectional econometrics using Stata. Module two: time series econometrics using R.",
        "lecture_times": "09h00 - 10h00 Tuesday, Wednesday, Thursday, Friday.",
        "dp_requirements": "None.",
        "assessment": "Exam 40%; Coursework 60%. In some years a bonus 5% may be achievable for a Stata Assignment."
    },
    "ECO4006F": {
        "convener": "Dr C Makanza",
        "prerequisites": {
            "text": "ECO4112F.",
            "parsed": {"type": "prerequisite", "codes": ["ECO4112F"]}
        },
        "corequisites": [],
        "outline": "The course studies the principal macroeconomic approaches towards understanding short-run fluctuations in aggregate output and the longer-term determinants of macroeconomic performance. Business cycles are investigated from a traditional Keynesian and New Keynesian perspective, complemented by a discussion on monetary and fiscal policy options. For understanding economic growth, the course reviews the exogenous growth model as well as new growth theories and alternative perspectives.",
        "lecture_times": "To be announced.",
        "dp_requirements": "None.",
        "assessment": "Coursework 40% and examination 60%. A supplementary exam will only be offered for ECO4006F during the mid-year vacation."
    },
    "ECO4007F": {
        "convener": "Dr C Makanza",
        "prerequisites": {
            "text": "ECO4112F.",
            "parsed": {"type": "prerequisite", "codes": ["ECO4112F"]}
        },
        "corequisites": [],
        "outline": "This course covers topics in microeconomics that are fundamental to modelling the behaviour of economic agents, markets, and strategic interactions. The course starts with the analysis of individual decision making (decision theory). It then covers individual interactions in 'markets', prior to focussing on game theory, which is the natural extension of decision theory to strategic interactions between economic agents. The course concludes by focussing on applications of game theory.",
        "lecture_times": "To be announced.",
        "dp_requirements": "None.",
        "assessment": "Coursework 50%, Examination 50%. A supplementary exam will only be offered for ECO4007F during the mid-year vacation."
    },
    "ECO4016F": {
        "convener": "Dr C Makanza",
        "prerequisites": {
            "text": "ECO4112F.",
            "parsed": {"type": "prerequisite", "codes": ["ECO4112F"]}
        },
        "corequisites": [],
        "outline": "This course is an introduction to econometric theory and practice. It provides the tools with which to test hypotheses and generate predictions of economic activity. The main focus is on causal inference with non-experimental data. The course has a strong lab-based component in which students work with the statistical computing package Stata. The topics covered include omitted variable bias and measurement error in regression models; panel data methods; limited dependent variables and sample selection corrections; and basic regression analysis with time series data.",
        "lecture_times": "To be announced.",
        "dp_requirements": "None.",
        "assessment": "Coursework 60%; examination 40%. A supplementary exam will only be offered for ECO4016F during the mid-year vacation."
    },
    "ECO4021W": {
        "convener": "Dr C Makanza",
        "prerequisites": {
            "text": "See entrance requirements for Honours in Economics. At least 50% for ECO4112F. If students do not pass ECO4006F, ECO4007F, and ECO4016F, they will have to deregister from ECO4021W.",
            "parsed": {"type": "prerequisite", "codes": ["ECO4112F", "ECO4006F", "ECO4007F", "ECO4016F"]}
        },
        "corequisites": [],
        "outline": "The long paper is to take the form of an article intended for submission to the South African Journal of Economics. A student must follow their referencing style. Given that it is to take the form of an article, the long paper should be divided into sections rather than chapters, and a maximum of 8 000 words has been imposed. It must be written in an appropriate academic style.",
        "lecture_times": "None.",
        "dp_requirements": "None.",
        "assessment": "100% written work. Students that receive a subminimum of 40% for their research paper will be given one opportunity to revise and resubmit. The revised research paper will be eligible for a maximum grade of 50%."
    },
    "ECO4112F": {
        "convener": "Dr C Makanza",
        "prerequisites": {
            "text": "See entrance requirements for Honours in Economics.",
            "parsed": {"type": "see_handbook", "codes": []}
        },
        "corequisites": [],
        "outline": "This course covers the basic tools and applications in order to prepare the student for the study of Macroeconomics, Microeconomics and Econometrics at an intermediate and advanced level. Material covered includes linear algebra, comparative statics, optimisation, integration and differential difference equations.",
        "lecture_times": "To be announced.",
        "dp_requirements": "None.",
        "assessment": "Coursework consisting of 3 tests (15% each); 45%; examination 55%. Students who obtain less than 50% for ECO4112F will not be allowed to continue with the programme."
    },

    # ── DEPARTMENT OF FINANCE AND TAX (FTX) ─────────────────────

    "FTX2020F": {
        "convener": "N Jwara",
        "prerequisites": {
            "text": "A pass in MAM1010F/S (or an equivalent course), DP for STA1000F/S (or an equivalent course), and a prior pass or concurrent registration in ACC1021F/ACC1006F.",
            "parsed": {"type": "prerequisite", "codes": ["MAM1010F", "STA1000S"], "concurrent": ["ACC1021F"]}
        },
        "corequisites": [],
        "outline": "Business Finance introduces the fundamental concepts of corporate finance. The course begins with essential tools and techniques for financial management and progresses to the principles guiding investment and financing decisions in publicly listed corporations. Additionally, the course incorporates an entrepreneurial focus, equipping prospective entrepreneurs with some of the key quantitative decision-making tools for a successful business venture. NOTE: This course is NOT for students intending to major in Finance in a Commerce degree and is not a substitute for FTX2024F/S as a course entry requirement for further studies in Finance.",
        "lecture_times": "Tuesday, Wednesday, Thursday and Friday: 15h00 - 15h45.",
        "dp_requirements": "Minimum 40% for coursework. This includes completion of all required submissions, tests and attendance at 9 out of 10 tutorials.",
        "assessment": "Students will be required to write two tests during the semester, each with a weight of 20%, and a final exam of 60%."
    },
    "FTX2024F": {
        "convener": "A Abdulla",
        "prerequisites": {
            "text": "A pass in MAM1010F/S (or an equivalent course), a pass in STA1000F/S (or an equivalent course), a pass in ACC1011S or ACC1022Z.",
            "parsed": {"type": "prerequisite", "codes": ["MAM1010F", "STA1000S", "ACC1011S"]}
        },
        "corequisites": [],
        "outline": "This course introduces financial management in a corporate environment, with two primary objectives. First, it introduces students to the financial aspects of businesses, financial markets, and the broader environment in which firms operate. Second, it equips students with the decision-making skills essential for modern financial managers.",
        "lecture_times": "Monday to Friday: FTX2024F: 08h00 - 08h45; FTX2024S: 11h00 - 11h45 or 12h00 - 12h45.",
        "dp_requirements": "A sub-minimum for coursework of 40% average for class tests and a minimum of 80% for tutorial submissions and tutorial attendances. These requirements will be strictly enforced.",
        "assessment": "Tests and assignments 40%; final examination 60%."
    },
    "FTX2024S": {
        "convener": "A Abdulla",
        "prerequisites": {
            "text": "A pass in MAM1010F/S (or an equivalent course), a pass in STA1000F/S (or an equivalent course), a pass in ACC1011S or ACC1022Z.",
            "parsed": {"type": "prerequisite", "codes": ["MAM1010F", "STA1000S", "ACC1011S"]}
        },
        "corequisites": [],
        "outline": "This course introduces financial management in a corporate environment, with two primary objectives. First, it introduces students to the financial aspects of businesses, financial markets, and the broader environment in which firms operate. Second, it equips students with the decision-making skills essential for modern financial managers.",
        "lecture_times": "Monday to Friday: FTX2024S: 11h00 - 11h45 or 12h00 - 12h45.",
        "dp_requirements": "A sub-minimum for coursework of 40% average for class tests and a minimum of 80% for tutorial submissions and tutorial attendances. These requirements will be strictly enforced.",
        "assessment": "Tests and assignments 40%; final examination 60%."
    },
    "FTX3044F": {
        "convener": "Professor A Charteris",
        "prerequisites": {
            "text": "A pass in FTX2024F/S and passes in ACC1011S/ACC1020H/ACC1022Z, ECO1010F/S or ECO1110F/S, and ECO1011F/S.",
            "parsed": {"type": "prerequisite", "codes": ["FTX2024F", "ACC1011S", "ECO1010F", "ECO1011S"]}
        },
        "corequisites": ["STA2020F"],
        "outline": "The course seeks to provide students with a solid foundation in investment theory. The course is split into three modules namely, equities, portfolio theory and investment ethics. The equities module gives students a practical understanding of issues in the valuation and trading of equities and covers basic equity valuations and analysis. The portfolio theory module focuses on the investment decision-making framework, the notions of risk and return, and the theories of efficiency. Investment ethics exposes students to some of the ethical dilemmas of the investment profession and provides a set of guidelines within which these ethical issues can be considered.",
        "lecture_times": "Monday, Wednesday and Friday: 11h00 - 11h45 or 12h00 - 12h45.",
        "dp_requirements": "A minimum weighted average of 40% for all coursework and attendance at 80% of tutorials.",
        "assessment": "Coursework (including tests and assignments) 50%; final examination 50%."
    },
    "FTX3045S": {
        "convener": "Dr F Peerbhai",
        "prerequisites": {
            "text": "A pass in FTX2024F/S and passes in ACC1011S/ACC1022Z/ACC1020H, ECO1010F/S or ECO1110F/S, and ECO1011F/S.",
            "parsed": {"type": "prerequisite", "codes": ["FTX2024F", "ACC1011S", "ECO1010F", "ECO1011S"]}
        },
        "corequisites": ["STA2020F"],
        "outline": "The course is divided into three modules that seek to provide students with a solid foundation of investment theory and its practical application. The modules covered include Fixed Income Securities, Derivatives and Financial Risk Management, and Behavioural Finance. The Fixed Income Securities module is intended to provide a practical introduction to the valuation, analysis and management of fixed income securities. The Derivatives and Financial Risk Management module focuses on providing students with an overview in practical application of the valuation of derivative securities. The Behavioural Finance module explores the psychological biases and decision making processes that influence the investor behaviour and impacts financial markets.",
        "lecture_times": "Monday, Wednesday and Friday: 11h00 - 11h45 or 12h00 - 12h45.",
        "dp_requirements": "Satisfactory completion of all required assignments and tests. Sub-minimum for coursework of 40% and attendance at 80% of the tutorials.",
        "assessment": "Coursework (including tests and assignments) 50%; final examination 50%."
    },
    "FTX4051H": {
        "convener": "Associate Professor A Sayed",
        "prerequisites": {
            "text": "A combined average of at least 60% for FTX3044F and FTX3045S with a minimum of 50% for each, and a pass in both ECO2003F and ECO2004S.",
            "parsed": {"type": "prerequisite", "codes": ["FTX3044F", "FTX3045S", "ECO2003F", "ECO2004S"]}
        },
        "corequisites": ["STA3022F"],
        "outline": "Lectures are held to impart basic knowledge and skills in order to embark on a finance-related research project. Concurrently, students are required to form a group of specified size, agree on a research topic with a supervisor, and submit a proposal. Once a proposal is accepted, the student-groups apply relevant finance research techniques to solve their finance research problem. During the course of the year, the student-groups are expected to submit a literature review and a final submission of their report. The report is expected to be in the format of a journal manuscript.",
        "lecture_times": "Wednesday: 15h00 - 16h45.",
        "dp_requirements": "Progress to the supervisor's satisfaction, lecture attendance and 40% average of graded submissions.",
        "assessment": "Assessment will be based on the research project. Literature review submission 10% - 20%, final submission 80% - 90%. Exact allocation in course outline."
    },
    "FTX4056S": {
        "convener": "Dr A Majoni",
        "prerequisites": {
            "text": "A combined average of at least 60% for FTX3044F and FTX3045S with a minimum of 50% for each of these courses, and ECO2003F and ECO2004S (or) registration for the Bachelor of Commerce Honours specialising in Finance [CH001FTX05].",
            "parsed": {"type": "prerequisite", "codes": ["FTX3044F", "FTX3045S", "ECO2003F", "ECO2004S"]}
        },
        "corequisites": [],
        "outline": "In this course students are exposed to advanced issues in investment finance from both a practical and theoretical perspective. Students are required to understand and be able to deal with substantial uncertainty when making investment decisions, and to report on a range of practical problems which are currently encountered by finance professionals.",
        "lecture_times": "2 lectures per week, Monday and Thursday, both 7th and 8th periods.",
        "dp_requirements": "A minimum weighted average of at least 40% for tests and assignments as well as 100% workshop attendance.",
        "assessment": "Coursework (including tests and assignments) 50%; final examination 50%."
    },
    "FTX4057F": {
        "convener": "To be advised",
        "prerequisites": {
            "text": "A combined average of at least 60% for FTX3044F and FTX3045S with a minimum of 50% for each of these courses, and ECO2003F and ECO2004S (or) registration for the Bachelor of Commerce Honours specialising in Finance [CH001FTX05].",
            "parsed": {"type": "prerequisite", "codes": ["FTX3044F", "FTX3045S", "ECO2003F", "ECO2004S"]}
        },
        "corequisites": [],
        "outline": "This course exposes students to advanced topics in corporate finance. Topics covered include capital structure theory, dividend policy, mergers and acquisitions, corporate governance, and real options analysis. The course emphasizes both theoretical frameworks and practical applications.",
        "lecture_times": "To be advised.",
        "dp_requirements": "To be advised.",
        "assessment": "Coursework 40%; final examination 60%."
    },
    "FTX4086F": {
        "convener": "Associate Professor F Toerien",
        "prerequisites": {
            "text": "A combined average of at least 60% for FTX3044F and FTX3045S with a minimum of 50% for each of these courses, and ECO2003F and ECO2004S (or) registration for the Bachelor of Commerce Honours specialising in Finance [CH001FTX05].",
            "parsed": {"type": "prerequisite", "codes": ["FTX3044F", "FTX3045S", "ECO2003F", "ECO2004S"]}
        },
        "corequisites": [],
        "outline": "The so-called 'alternative investments' are becoming increasingly important as an investment class. This course deals with a number of specialised areas of investment finance which are not typically covered in other parts of the finance undergraduate curriculum, such as real estate investments, hedge funds, commodities and private equity. Each investment class covered in the course will be discussed as a separate module, and students will be exposed to both the theoretical and practical aspects of each. In addition to lectures, this course also includes workshops intended to make concepts and the practical application of alternative investments clearer.",
        "lecture_times": "2 lectures per week, Tuesday, Friday, both 6th & 7th periods.",
        "dp_requirements": "None.",
        "assessment": "Coursework including tests and projects 40%; Final examination 60%."
    },
    "FTX4087S": {
        "convener": "Associate Professor R Kruger",
        "prerequisites": {
            "text": "A combined average of at least 60% for FTX3044F and FTX3045S with a minimum of 50% for each of these courses, and ECO2003F and ECO2004S (or) registration for the Bachelor of Commerce Honours specialising in Finance [CH001FTX05].",
            "parsed": {"type": "prerequisite", "codes": ["FTX3044F", "FTX3045S", "ECO2003F", "ECO2004S"]}
        },
        "corequisites": [],
        "outline": "Treasury management is an essential function within every corporation and has as its goal the management of the firm's liquidity, operational and financial risk. This course exposes students to these topics with a focus not only on understanding the theory underpinning these crucial functions, but also the challenges companies face in achieving these aims and practical tools they may use to mitigate these risks. In addition to this, students are introduced to the treasury management function within banking institutions and how they support their clients' corporate treasury management functions.",
        "lecture_times": "Tuesday and Friday: 15h00 - 16h45.",
        "dp_requirements": "None.",
        "assessment": "Coursework including test and project (40%); final examination 60%."
    },

    # ── DEPARTMENT OF INFORMATION SYSTEMS (INF) ─────────────────

    "INF1002F": {
        "convener": "Dr L Tekeni",
        "prerequisites": {
            "text": "Admission may be restricted for students other than those in Commerce. Entrance requirements include either 70% for NBT QL or at least 50% for Maths (NSC) or MAM1014F or NBT QL or MAM1022F.",
            "parsed": {"type": "nsc_requirement", "codes": []}
        },
        "corequisites": [],
        "outline": "The course provides a foundation to the use and impact of Information systems in business and society. Fundamental knowledge of information systems, their functioning and how they contribute to globalisation will be discussed. Particular focus is for students to understand the value of information, its collection, processing, storage and transmission through use of information systems in businesses, suppliers and customers. Practical exposure (linked to the theoretical themes) to data analysis tools, programming and systems development in organisations is provided.",
        "lecture_times": "Monday, 6th OR 7th period. Tuesday 5th - 7th OR Wednesday 3rd to 7th in Alumni Labs.",
        "dp_requirements": "Year mark greater than or equal to 45% (based on all assessments prior to the final exam). 80% participation for all practicals (tutorials and workshops).",
        "assessment": "Coursework 65%; Final Examination 35%. Sub-minimum of 40% for the final exam."
    },
    "INF2003F": {
        "convener": "Professor S Kabanda",
        "prerequisites": {
            "text": "At least 65% for INF1002F/S/N or equivalent (or at least 70% for CSC1017F).",
            "parsed": {"type": "prerequisite", "codes": ["INF1002F"]}
        },
        "corequisites": [],
        "outline": "The course focuses on integrating good programming practices through planning and developing software programs using C#. The course is practically-orientated and students should be prepared to spend time after hours to do programming exercises. Theory lectures are used to communicate course content, which includes: Data Types and Expressions, Methods and Behaviours, Creating Your Own Classes, Making Decisions, Repeating Instructions, Arrays, Introduction to Windows Programming, Advanced Object-Oriented Programming Features, and Debugging and Handling Exceptions.",
        "lecture_times": "Monday and Tuesday and Thursday, 8th and 9th period.",
        "dp_requirements": "Submission of 80% of quizzes and workshops. A minimum year mark of 45%.",
        "assessment": "Coursework 80%; Summative Assessment 20%. Subminimum 40% for the summative assessment."
    },
    "INF2004F": {
        "convener": "Dr T Chimboza",
        "prerequisites": {
            "text": "Successful completion of INF1002F/S and ACC1006F or equivalents.",
            "parsed": {"type": "prerequisite", "codes": ["INF1002F", "ACC1006F"]}
        },
        "corequisites": [],
        "outline": "Information Technology in Business (INF2004F) is offered to Accounting and Finance students in order to prepare them for a range of roles within the business environment. The course prepares students for a range of IT-related roles such as users, manager, designers, project managers and evaluators of information systems. The course covers the conceptual foundations, control, applications, and system development process of Accounting Information Systems. The course has been developed to be in line with South African Institute of Chartered Accountants (SAICA) competency requirements.",
        "lecture_times": "Monday and Tuesday either 15h00-15h45 or 16h00-16:45. Tutorials/Practicals: Thursday 1st-7th period and Friday 3rd-7th period.",
        "dp_requirements": "Year mark greater than or equal to 45% (based on all continuous assessment prior to the final exam) and 80% participation for all practicals (tutorials and workshops).",
        "assessment": "Coursework 60%, Final Examination 40% with a Sub-minimum of 40% for the final exam."
    },
    "INF2006F": {
        "convener": "G Oosterwyk",
        "prerequisites": {
            "text": "INF1002F/S or equivalent.",
            "parsed": {"type": "prerequisite", "codes": ["INF1002F"]}
        },
        "corequisites": [],
        "outline": "The course introduces students to the main features of business intelligence and business analytics, including data warehousing and data marts, decision support systems, OLAP, data mining and analytics, corporate performance management, data visualisation, real-time BI, pervasive BI, mobile BI and big data analytics. Case studies and management approaches for implementation are covered and a hands-on project requires students to produce a management report after analysing data using commercial BI software.",
        "lecture_times": "Course runs only for 3 weeks: Monday to Wednesday, 5th period, Friday 4th and 5th period.",
        "dp_requirements": "80% Class attendance.",
        "assessment": "Note: Assessment requirements for both INF2006F and INF2007F need to be met in order to pass INF2008F."
    },
    "INF2007F": {
        "convener": "Z Ruhwanya",
        "prerequisites": {
            "text": "INF2003F or equivalent, or INF2003F as co-requisite. Students cannot be credited for this course and CSC2001F.",
            "parsed": {"type": "prerequisite", "codes": ["INF2003F"]}
        },
        "corequisites": [],
        "outline": "The course introduces students to database concepts, advanced database design and implementation and new developments in the database field. These are core skills which I.S. professionals require throughout their careers. There is a strong practical component to the course, where students will be taught the practical aspects of designing, implementing and using databases. This course explores different database architectures and design approaches, data modelling techniques, data dictionaries, database implementation, database security and administration.",
        "lecture_times": "Monday to Wednesday 12h00 - 12h45.",
        "dp_requirements": "80% attendance at workshops, completion of all course deliverables and year mark of 45%.",
        "assessment": "Coursework 60%; Final Exam 40%. Sub-minimum 45% for the final exam."
    },
    "INF2009F": {
        "convener": "Dr A Pekane",
        "prerequisites": {
            "text": "INF2003F or equivalent or INF2003F as co-requisite. INF2009F is a half course designed for students intending to major in Information Systems for the BCom, BBusSci or BSc degrees.",
            "parsed": {"type": "prerequisite", "codes": ["INF2003F"]}
        },
        "corequisites": [],
        "outline": "This course explores the role of the Systems Analyst in business, different approaches used in the development of information systems, and the various tools and techniques used in the specification of system requirements. It is intended to provide students with an in-depth knowledge of the systems development process, with a particular emphasis on the analysis stage of the life cycle. There is a strong practical component to the course, where students will be taught to understand and use the common tools of object-oriented systems analysis, with a particular focus on UML models.",
        "lecture_times": "Monday to Wednesday, 4th period, Thursday: Practical workshops: Thursday 3rd & 4th periods OR 4th & 5th OR 8th & 9th.",
        "dp_requirements": "Submitted at least 80% of the coursework (80% of individual deliverables and 80% of group work). Subminimum of 45% course year-mark.",
        "assessment": "The final grade is derived from results of the Coursework (Formative Assessment: 40% + Summative Assessment 20%) and the Final Examination (40%). Sub-minimum of 40% for the final examination."
    },
    "INF2010S": {
        "convener": "G Oosterwyk",
        "prerequisites": {
            "text": "Minimum 45% final mark for INF2003F or equivalent. Students cannot be credited for this course and CSC2002S.",
            "parsed": {"type": "prerequisite", "codes": ["INF2003F"]}
        },
        "corequisites": [],
        "outline": "This course is intended to provide students with an in-depth knowledge of hardware, software, data communications and networking theory. This course is designed to build the skills required for the management and building of distributed systems and commercial networks. This course provides the hardware and software technology background for understanding various computer architectures for single and multiple users. The analysis and design of networked applications is covered, including telecommunication devices, media, network hardware and software, network configuration and applications, network architectures, topologies and protocols, LAN and WAN networks, intranets and the Internet. The underlying architecture of modern computer hardware and operating systems, mobile computing, the cloud and basic computer security is also covered.",
        "lecture_times": "Monday to Wednesday 12h00 - 12h45.",
        "dp_requirements": "Completing 80% of deliverables including quizzes, assignments (including the IT technical report) and semester test. Year mark of 45%.",
        "assessment": "The final grade is derived from the results of quizzes, assignments (including IT technical report) and the semester test which counts 60%; the Final Exam (40%) - sub-minimum of 45% for the final examination."
    },
    "INF2011S": {
        "convener": "Dr D Snyman",
        "prerequisites": {
            "text": "Minimum 45% final mark for [INF2007 or INF2008 or CSC2001 or equivalent] and INF2009 and [INF2003 or CSC1016 or equivalent].",
            "parsed": {"type": "prerequisite", "codes": ["INF2007F", "INF2009F", "INF2003F"]}
        },
        "corequisites": [],
        "outline": "This course is intended to provide students with an in-depth knowledge of the systems development process with particular emphasis on the design and implementation stages of the life cycle. There is a strong practical component to the course, where students will use object-oriented tools to design and construct a working system. The course is designed to build on the skills acquired in INF2009F Systems Analysis.",
        "lecture_times": "Monday, Tuesday and Wednesday, 4th period, Thursday: Weekly workshop sessions 3rd to 4th OR 4th to 5th periods. Friday: Practical workshops 5th - 7th.",
        "dp_requirements": "Submit 80% of workshops and quizzes. Year-mark of 45%. Submitted all project work.",
        "assessment": "The final grade is derived from the following deliverables: Coursework: 60%; Exam 40%. Subminimum 45% for the final exam."
    },
    "INF3003W": {
        "convener": "Dr W Uys",
        "prerequisites": {
            "text": "A pass in all second year Information Systems courses.",
            "parsed": {"type": "prerequisite", "codes": ["INF2003F", "INF2009F", "INF2010S", "INF2011S"]}
        },
        "corequisites": [],
        "outline": "This whole year course is for students majoring in Information Systems (IS) to gain an understanding of the issues that are influencing ICT projects and experience the development and implementation of such a project. This course combines the theoretical elements of project management with the practical implementation of these concepts through the completion of a systems development team project, integrating practical and theoretical elements obtained and developed during other undergraduate IS courses.",
        "lecture_times": "First semester: 10h00-10h45 Monday and Tuesday, and 10h00-11h45 Wednesday and Friday, and 10h00-12h45 Thursday. Second semester: 12h00-12h45 Thursday.",
        "dp_requirements": "Students will be considered to have duly performed the course work if they have obtained a minimum of 45% for their year mark.",
        "assessment": "Coursework 60%. (Weekly coding workshops and tutorials, as well as continuous assignments for the team project culminating in a formal presentation and code presentation). Teamwork makes up 40% of the course mark. Exam 40%. Sub-minimum of 40% for the examination (both Project Management and Code)."
    },
    "INF3012S": {
        "convener": "P Tsibolane",
        "prerequisites": {
            "text": "A pass in INF2003F, INF2009F and INF2011S.",
            "parsed": {"type": "prerequisite", "codes": ["INF2003F", "INF2009F", "INF2011S"]}
        },
        "corequisites": [],
        "outline": "This course examines the role, relationship and effect IT Applications have on businesses and vice versa. It has a heavy emphasis on ERP systems, business processes and Business Process Management (BPM). Students will be exposed to methodologies and techniques to identify, model, measure and improve processes. Students will be introduced to technologies that can be used as part of process improvement initiatives as well as technologies such as ERP that impact business processes. A group project will allow students to apply their analytical skills to improving an existing process. Students will be introduced to S/4 HANA and will acquire a basic working knowledge of the Application.",
        "lecture_times": "11h00-11h45 Tuesday-Friday and 10h00-10h45 Thursday and Friday.",
        "dp_requirements": "Acceptable participation in group project, 45% for the year mark and completion and submission of 80% of workshops.",
        "assessment": "Classwork 65% (workshops, class exercises, test and a group project), final examination 35%. Sub-minimum of 40% for the final examination."
    },
    "INF3014F": {
        "convener": "G Mwalemba",
        "prerequisites": {
            "text": "INF2003F, INF2009F and at least 45% for INF2011S.",
            "parsed": {"type": "prerequisite", "codes": ["INF2003F", "INF2009F", "INF2011S"]}
        },
        "corequisites": [],
        "outline": "INF3014F is a course for students majoring in Information Systems (IS) as well as any other student that wish to gain an understanding of electronic commerce (e-Commerce) technologies and their usage in society. The course covers both theoretical e-Commerce issues as well as the practical skills required to develop a basic e-Commerce system. The course plays a role in facilitating students' ability to constructively develop integrated knowledge on e-Commerce, including understanding of and the ability to apply and critically evaluate the key concepts, techniques and practices that form part of e-Commerce systems design, development, implementation and usage. The practical component will culminate in a project that involves developing an e-Commerce application that addresses a real business or social need.",
        "lecture_times": "12h00-13h45 Tuesday and Wednesday and either 13h00-14h45 or 14h00-15h45 Friday.",
        "dp_requirements": "Submission of tutorials, seminar, and project work as well as a subminimum of 45% for the year mark prior to writing the final examination.",
        "assessment": "Coursework 70%. Exam 30%. Subminimum of 40% for the final examination."
    },
    "INF4024W": {
        "convener": "Professor S Kabanda",
        "prerequisites": {
            "text": "This course is restricted to students admitted into the 4th year BBusSci, the honours programmes in Information Systems and the honours programme in Management Information Systems.",
            "parsed": {"type": "programme_registration", "programmes": ["BBusSci 4th year", "Honours in IS"]}
        },
        "corequisites": [],
        "outline": "The course provides a first research exposure leading to the completion of a research project. Candidates will be expected to develop critical reading, analysis and research design skills, as well as to demonstrate good writing skills. The course commences with taught sessions in research techniques. Thereafter students will select research areas and prepare research proposals. Students will be assigned to mentors, who will assist and guide them through the research process.",
        "lecture_times": "This course runs in 2 block sessions: One in the beginning of the 1st semester, and the second block runs in the middle of the 1st semester.",
        "dp_requirements": "To be advised.",
        "assessment": "Students will be evaluated as follows: Interim deliverables 40%; Empirical report 60%. An overall mark of at least 50% is required to pass the programme and a minimum of 50% must be obtained for the Empirical Report."
    },
    "INF4025S": {
        "convener": "Professor M Tanner",
        "prerequisites": {
            "text": "Students should meet the entrance requirements to the 4th year BBusSci or IS Honours programme.",
            "parsed": {"type": "programme_registration", "programmes": ["BBusSci 4th year", "IS Honours"]}
        },
        "corequisites": [],
        "outline": "The course covers IS Management topics, which are selected based on current research from academia and industry. Students are required to research a topic, and firstly produce a seminar paper in collaboration with an academic. Once the seminar paper has been approved by the academic, students have to develop and present a seminar on the topic, and facilitate a question and answer session. Guests from industry are often invited to present their experience on the topic after the students.",
        "lecture_times": "Monday and Thursday, 6th & 7th period.",
        "dp_requirements": "75% attendance and participation in seminars, a minimum of 50% for seminar management, and a sub-minimum of 45% in the final examination.",
        "assessment": "Seminar and classwork deliverables 60%; Final Assessment 40%."
    },
    "INF4026F": {
        "convener": "Professor S Kabanda",
        "prerequisites": {
            "text": "Students should meet the entrance requirements to the 4th year BBusSci or IS Honours programme.",
            "parsed": {"type": "programme_registration", "programmes": ["BBusSci 4th year", "IS Honours"]}
        },
        "corequisites": [],
        "outline": "The course covers twelve IS application and technical development topics, which are selected based on current research from academia and industry. Students are required to research a topic, and firstly produce a seminar paper in collaboration with an academic. Once the seminar paper has been approved by the academic, students have to develop and present a seminar on the topic, and facilitate a question and answer session. Guests from industry are often invited to present their experience on the topic after the students.",
        "lecture_times": "Monday and Thursday, 6th to 7th period.",
        "dp_requirements": "75% attendance and participation in seminars, a minimum of 50% for seminar management, and a sub-minimum of 45% in the final examination.",
        "assessment": "Seminar and classwork deliverables 60%; Final Assessment 40%."
    },
    "INF4027W": {
        "convener": "Professor S Kabanda (1st semester) and Professor M Tanner (2nd semester)",
        "prerequisites": {
            "text": "Students should meet the entrance requirements to the 4th year BBusSci or IS Honours programme and may be required to write an entrance exam.",
            "parsed": {"type": "programme_registration", "programmes": ["BBusSci 4th year", "IS Honours"]}
        },
        "corequisites": [],
        "outline": "For the Systems Development Project II course, teams of students are required to identify and analyse a real-world IS problem, then design, develop and test a fully-functioning Information System that meets current and future requirements. The software projects are formulated by Industry Sponsors and relate to real-life business problems that need to be solved to bring business value. Students are required to use agile methodologies (Scrum/Kanban) to manage their projects. The course combines theoretical elements of agile project management and software development methodologies with the practical implementation of these concepts through the completion of the team projects.",
        "lecture_times": "To be advised.",
        "dp_requirements": "To be advised.",
        "assessment": "Assessment will be based on compulsory deliverables within the following categories: Programming Test, Vision Presentation, BA & Innovation Document, Iterations Assessments (Documentation & Presentation) and the individual portfolio of evidence of each student."
    },

    # ── DEPARTMENT OF MATHEMATICS & APPLIED MATHEMATICS (MAM) ───

    "MAM1008S": {
        "convener": "Dr I Allie",
        "prerequisites": {
            "text": "None.",
            "parsed": {"type": "none", "codes": []}
        },
        "corequisites": ["MAM1004S", "MAM1005H", "MAM1004F", "MAM1031F"],
        "outline": "To introduce students to the language and methods of the area of Discrete Mathematics, and to show students how discrete mathematics can be used in modern computer science (with the focus on algorithmic applications). Topics include: sets, relations and functions; basic logic, propositional logic, truth tables, propositional inference rules and predicate logic; proof techniques; basics of counting, including counting arguments, the pigeonhole principle, permutations and combinations, solving recurrence relation; graphs and trees; discrete probability, including finite probability space, axioms of probability, conditional probability; and linear algebra, including vectors, matrices and their applications.",
        "lecture_times": "No face-to-face lectures. The course content is delivered online.",
        "dp_requirements": "Class Record of at least 30% and attendance at 10 or more (out of 12) tutorials.",
        "assessment": "Class Record counts 50% and Exam counts 50%."
    },
    "MAM1010F": {
        "convener": "Dr R Moolman",
        "prerequisites": {
            "text": "At least 60% in NSC Mathematics. Students who do not meet the 60% NSC requirement may instead complete MAM1014F/MAM1022F followed by MAM1015S.",
            "parsed": {"type": "nsc_requirement", "codes": []}
        },
        "corequisites": [],
        "outline": "The aim of this course is to introduce topics in mathematics that are of interest to Commerce students, with applications to economics. Introductory financial mathematics including compound interest and annuities, functions, limits, differential calculus and applications of the derivative including graph sketching and Newton's Method, introduction to integral calculus and techniques of integration.",
        "lecture_times": "Monday - Friday, 1st, 3rd, or 4th period.",
        "dp_requirements": "Minimum of 30% in class tests and full attendance at workshops.",
        "assessment": "Semester mark up to 40%. June examination 1 x 2 hour paper."
    },
    "MAM1012S": {
        "convener": "Dr R Moolman",
        "prerequisites": {
            "text": "Pass in MAM1010F/S or MAM1110F or equivalent.",
            "parsed": {"type": "prerequisite", "codes": ["MAM1010F"]}
        },
        "corequisites": [],
        "outline": "The aim of this course is to continue the study of topics in mathematics that are of interest to Commerce students begun in MAM1010. Integral calculus, including numerical integration, introduction to ordinary differential equations, matrices and elementary linear algebra, Markov Systems, Taylor Maclaurin, and Binomial series, functions of several variables, three-dimensional space, partial derivatives and applications to optimization problems, the Simplex Method.",
        "lecture_times": "Monday - Friday, 1st, 3rd, or 4th period.",
        "dp_requirements": "Minimum of 30% in class tests and full attendance at workshops.",
        "assessment": "Semester mark up to 40%. November examination 1 x 2 hour paper."
    },
    "MAM1031F": {
        "convener": "Dr H Wiggins",
        "prerequisites": {
            "text": "At least 70% in NSC Mathematics.",
            "parsed": {"type": "nsc_requirement", "codes": []}
        },
        "corequisites": [],
        "outline": "The aim of this course is to introduce students to the fundamental ideas in differential calculus covering functions of one variable, limits, continuity and differentiation with applications, as well as formal proof methods. This course (or equivalent), along with MAM1032S (or equivalent), is necessary for entry into second year mathematics.",
        "lecture_times": "Five lectures per week, Monday - Friday, 1st or 3rd period.",
        "dp_requirements": "Minimum of 30% for class tests, minimum 30% for weekly online tests, and 80% attendance at tutorial sessions.",
        "assessment": "Semester mark counts 33.3% and end-of-semester exam counts 66.6%."
    },
    "MAM1032S": {
        "convener": "Dr H Wiggins",
        "prerequisites": {
            "text": "MAM1031F or MAM1033F or MAM1004F (with 65% or higher).",
            "parsed": {"type": "prerequisite", "codes": ["MAM1031F"]}
        },
        "corequisites": [],
        "outline": "The aim of this course is to continue from the work in MAM1031F and introduce students to integral calculus, taylor polynomials, complex numbers, vector geometry, linear algebra and differential equations. This course, along with MAM1031F, is necessary for entry into second year mathematics.",
        "lecture_times": "Five lectures per week, Monday - Friday, 1st or 3rd period.",
        "dp_requirements": "Minimum of 30% for class tests, minimum 30% for weekly online tests, and 80% attendance at tutorial sessions.",
        "assessment": "Semester mark counts 33.3% and end-of-semester exam counts 66.6%."
    },
    "MAM2010F": {
        "convener": "Dr F Ebobisse-Bille",
        "prerequisites": {
            "text": "MAM1031F and MAM1032S or equivalent. With permission from the convener, students with 70% for both MAM1010F and MAM1012S may register for MAM2010F.",
            "parsed": {"type": "prerequisite", "codes": ["MAM1031F", "MAM1032S"]}
        },
        "corequisites": [],
        "outline": "Students will study the fundamentals of multivariable calculus, including: Curves and surfaces in three dimensions, change of coordinates; Line integrals, surface integrals; Stoke's, Green's and divergence theorems. Please note that lectures alternate during the week so that students can take MAM2010F and MAM2011F concurrently.",
        "lecture_times": "Tuesdays, Fridays and some Wednesdays in 5th period.",
        "dp_requirements": "To be advised.",
        "assessment": "To be advised."
    },
    "MAM2011F": {
        "convener": "Dr H Spakowski",
        "prerequisites": {
            "text": "MAM1031F and MAM1032S or equivalent. With permission from the convener, students with 70% for both MAM1010F and MAM1012S may register for MAM2011F.",
            "parsed": {"type": "prerequisite", "codes": ["MAM1031F", "MAM1032S"]}
        },
        "corequisites": [],
        "outline": "Students will study the fundamentals of linear algebra, including: Vector spaces, linear independence, spans, bases, row space, column space, null space; Linear maps; Eigenvectors and eigenvalues; Inner product spaces, orthogonality. Please note that lectures alternate during the week so that students can take MAM2010F and MAM2011F concurrently.",
        "lecture_times": "Mondays, Thursdays and some Wednesdays in 5th period.",
        "dp_requirements": "To be advised.",
        "assessment": "To be advised."
    },
    "MAM2012S": {
        "convener": "T C Van Heerden",
        "prerequisites": {
            "text": "MAM1031F and MAM1032S or equivalent, MAM2010F and MAM2011F.",
            "parsed": {"type": "prerequisite", "codes": ["MAM1031F", "MAM1032S", "MAM2010F", "MAM2011F"]}
        },
        "corequisites": [],
        "outline": "Students will study the fundamentals of differential equations, including topics from: First and second-order difference equations; Linear differential equations, constant coefficients; Laplace transforms; Nonlinear equations, phase plane analysis; Parabolic partial differential equations, separation of variables, boundary value problems; Black-Scholes equation; Stochastic differential equations. Please note that lectures alternate during the week so that students can take any of MAM2012S, MAM2013S and MAM2014S concurrently.",
        "lecture_times": "Tuesdays, Fridays and some Wednesdays in 4th period.",
        "dp_requirements": "To be advised.",
        "assessment": "To be advised."
    },
    "MAM2014S": {
        "convener": "M Vandeyar",
        "prerequisites": {
            "text": "MAM1031F and MAM1032S or equivalent.",
            "parsed": {"type": "prerequisite", "codes": ["MAM1031F", "MAM1032S"]}
        },
        "corequisites": [],
        "outline": "Students will study the fundamentals of real analysis, including: Axioms of the real numbers, supremum and infimum; Countable sets; Sequences and series; Open and closed sets, compactness; Limits, continuity, differentiability; Sequences and series of functions, uniform convergence, power series; Integration. Please note that lectures alternate during the week so that students can take any of MAM2012S, MAM2013S and MAM2014S concurrently.",
        "lecture_times": "Mondays, Thursdays and some Wednesdays in 4th and 5th period.",
        "dp_requirements": "To be advised.",
        "assessment": "To be advised."
    },

    # ── DEPARTMENT OF PHILOSOPHY (PHI) ──────────────────────────

    "PHI2043S": {
        "convener": "G E T James",
        "prerequisites": {
            "text": "At least second year status or be registered for an ACC04/ACC08 programme.",
            "parsed": {"type": "year_status", "codes": []}
        },
        "corequisites": [],
        "outline": "Ethical choices are unavoidable in business. This course aims to help students to articulate their options when confronted with an ethical dilemma in business, and to make well-informed judgements about the right thing to do. The course will consider a range of problems, from issues that could arise in a student's first job to questions of business regulation that they may one day face as a leader in commerce or government. In each case, the course will challenge students to recognise ethical problems in practical situations, understand the possible solutions, and make reasoned decisions. Please note that this course DOES NOT count towards the Philosophy major.",
        "lecture_times": "Monday, Tuesday, Wednesday 3rd or 4th period.",
        "dp_requirements": "Regular attendance at lectures and tutorials; completion of all tests, submission of all essays and assignments by due dates, and an average mark of at least 35% for the coursework.",
        "assessment": "Coursework counts 40%; one 3-hour examination in June or October/November counts 60%."
    },

    # ── DEPARTMENT OF STATISTICAL SCIENCES (STA) ────────────────

    "STA1000S": {
        "convener": "N Watson",
        "prerequisites": {
            "text": "A pass in any of MAM1004F/S or MAM1005H or MAM1031F or MAM1033F or MAM1020F/S or MAM1010F/S or MAM1110F/H.",
            "parsed": {"type": "prerequisite", "codes": ["MAM1010F"]}
        },
        "corequisites": [],
        "outline": "This is an introductory statistics course aimed at exposing students to principles and tools to support appropriate quantitative analysis. We introduce students to statistical modelling and also cover exploratory data analysis. Appropriate tools for display, analysis and interpretation of data are discussed. This course is offered predominantly, but not exclusively, to Commerce students. Topics covered include: exploratory data analysis and summary statistics; probability theory; random variables; probability mass and density functions; Binomial, Poisson, Exponential, Normal and Uniform distributions; sampling distributions; confidence intervals; introduction to hypothesis testing; determining sample sizes; simple linear regression and measures of correlation.",
        "lecture_times": "One lecture per week, one workshop per week, and one tutorial per week.",
        "dp_requirements": "Satisfactory attendance of tests and completion of assignments and/or exercises as set out in course outline. Class record of at least 35%.",
        "assessment": "Class record 40% and a 2-hour exam counting 60%. Weights will be adjusted in the case of missed assessments."
    },
    "STA1006S": {
        "convener": "S Salau",
        "prerequisites": {
            "text": "At least 60% in MAM1005H or MAM1020F/S or at least 70% in MAM1010F/S and concurrent registration for MAM1006H or MAM1012F/S or MAM1021S.",
            "parsed": {"type": "prerequisite", "codes": ["MAM1010F"]}
        },
        "corequisites": ["MAM1012S"],
        "outline": "This is an introduction to statistics: the study of collecting, analysing, and interpreting data. It is the key entry-point into a mathematical statistics major and hence it is compulsory for students intending to major in Mathematical Statistics. This course provides foundation knowledge in statistical theory. Topics covered include: Types of data variables; Exploratory data analysis; Grouping and graphing of data; Set theory and Counting rules; Probability; conditional probabilities, independence; Bayes theorem; Random variables and values, probability mass and density functions, cumulative distribution functions; Population models and parameters; Sampling distributions; Point and interval estimation; Sample size estimation; Hypotheses testing.",
        "lecture_times": "Monday - Friday, 2nd period and a two-hour compulsory tutorial on Monday afternoons.",
        "dp_requirements": "Satisfactory attendance of lectures, tutorials, practicals and tests and completion of assignments and/or class exercises as set out in course outline. Class record of at least 35%.",
        "assessment": "Class record 30% and a 3-hour exam counting 70%. Weights will be adjusted in the case of missed assessments. Students write the same class tests and examination as students registered for STA1006S."
    },
    "STA2004F": {
        "convener": "M Mavuso",
        "prerequisites": {
            "text": "A pass in (MAM1000W or MAM1032S or MAM1034S or MAM1012S or MAM1006H) and (STA1006S or STA1106H).",
            "parsed": {"type": "prerequisite", "codes": ["MAM1032S", "STA1006S"]}
        },
        "corequisites": [],
        "outline": "STA2004F is a rigorous introduction to the foundation of the mathematical statistics and aims to provide students with a deeper understanding of the statistical concepts covered in STA1006S. The course is divided into two broad sections: (1) Distribution theory and (2) Statistical Inference. During the first part, students will learn to derive the distributions of random variables and their transformations, and explore the limiting behaviour of sequences of random variables. The last part covers the estimation of population parameters and hypothesis testing based on a sample of data.",
        "lecture_times": "Five lectures per week, Monday to Friday, 1st period.",
        "dp_requirements": "Satisfactory attendance of lectures, tutorials, practicals and tests and completion of assignments and/or class exercises as set out in course outline. Class record of at least 35%.",
        "assessment": "Class record 30% and a 3-hour exam counting 70%. Weights will be adjusted in the case of missed assessments."
    },
    "STA2005S": {
        "convener": "Dr B Erni",
        "prerequisites": {
            "text": "A pass in STA2004F. MAM2011F - Linear Algebra (2LA) is strongly recommended.",
            "parsed": {"type": "prerequisite", "codes": ["STA2004F"]}
        },
        "corequisites": [],
        "outline": "This course gives an introduction to statistical modelling and the theory of linear statistical models. The course has two sections: Regression and Design and analysis of experiments. Regression covers the multivariate normal distribution; quadratic forms; the linear model; maximum likelihood; estimates of parameters in the linear model; the Gauss-Markov theorem; variable selection procedures; analysis of residuals, bootstrapping; principal component analysis for dimension reduction and for regression. Design and analysis of experiments covers introduction to the basic design principles, basic experimental designs, factorial experiments, analysis of variance, introduction to random effects and repeated measures, permutation/randomization tests, nonparametric tests, bootstrapping.",
        "lecture_times": "Five lectures per week, Monday - Friday, 1st period.",
        "dp_requirements": "Satisfactory attendance of lectures and lab practicals and the completion of class tests, mini practical lab tests, and practical tests as set out in course outline. Class record of at least 35% and at least 35% for Practical test.",
        "assessment": "Class record 40% and a 3-hour exam counting 60%. Weights will be adjusted in the case of missed assessments."
    },
    "STA2020F": {
        "convener": "N Watson",
        "prerequisites": {
            "text": "A pass in STA1000F/S/P/L or STA1006S or STA1106H or STA1100S or STA1007S or STA1008F/S and MAM1000W or MAM1031F or MAM1033F or MAM1004F/S or MAM1010F/S or MAM1020F/S or MAM1110F/H or MAM1005H.",
            "parsed": {"type": "prerequisite", "codes": ["STA1000S", "MAM1010F"]}
        },
        "corequisites": [],
        "outline": "This course is designed to extend the student's basic knowledge acquired in STA1000F/S/P/L. The emphasis of the course is on applying statistical methods and modelling techniques to data rather than focusing on the mathematical rigour underpinning these methods. Topics covered include: Analysis of variance and experimental design; revision and extension of simple linear regression; multiple regression; logistic regression; model building; time series analysis; and non-parametric statistics. Students will analyse data using R.",
        "lecture_times": "Monday - Thursday, 1st or 5th period.",
        "dp_requirements": "Satisfactory attendance of lectures and lab practicals and the completion of class tests, mini practical lab tests, and practical tests as set out in course outline. Class record of at least 35% and at least 35% for Practical test.",
        "assessment": "Class record 40% and a 3-hour exam counting 60%. Weights will be adjusted in the case of missed assessments."
    },
    "STA2020S": {
        "convener": "N Watson",
        "prerequisites": {
            "text": "A pass in STA1000F/S/P/L or STA1006S or STA1106H or STA1100S or STA1007S or STA1008F/S and MAM1000W or MAM1031F or MAM1033F or MAM1004F/S or MAM1010F/S or MAM1020F/S or MAM1110F/H or MAM1005H.",
            "parsed": {"type": "prerequisite", "codes": ["STA1000S", "MAM1010F"]}
        },
        "corequisites": [],
        "outline": "This course is designed to extend the student's basic knowledge acquired in STA1000F/S/P/L. The emphasis of the course is on applying statistical methods and modelling techniques to data rather than focusing on the mathematical rigour underpinning these methods. Topics covered include: Analysis of variance and experimental design; revision and extension of simple linear regression; multiple regression; logistic regression; model building; time series analysis; and non-parametric statistics. Students will analyse data using R.",
        "lecture_times": "Monday - Thursday, 1st or 5th period.",
        "dp_requirements": "Satisfactory attendance of lectures and lab practicals and the completion of class tests, mini practical lab tests, and practical tests as set out in course outline. Class record of at least 35% and at least 35% for Practical test.",
        "assessment": "Class record 40% and a 3-hour exam counting 60%. Weights will be adjusted in the case of missed assessments."
    },
    "STA2030S": {
        "convener": "S Britz",
        "prerequisites": {
            "text": "At least 45% for STA2020F/S or STA2007F/S/H or STA2005S or (DP mark for STA2004F with concurrent registration for STA2020S/STA2007S).",
            "parsed": {"type": "prerequisite", "codes": ["STA2020F"]}
        },
        "corequisites": ["MAM1032S", "MAM1034S", "MAM1012S", "MAM1021S"],
        "outline": "This course introduces students to Statistical Theory and Inference. It explores aspects of probability theory that are particularly relevant to statistics, including the notions of random variables, joint probability distributions, expected values and moment generating functions. The course content includes univariate distributions and moments of univariate distributions, moments of bivariate distributions, distributions of sample statistics and parameter estimation and inference.",
        "lecture_times": "Monday - Thursday, 1st period.",
        "dp_requirements": "Satisfactory attendance of lectures, tutorials, practicals and tests and completion of assignments and/or class exercises as set out in course outline. Class record of at least 35%.",
        "assessment": "Class record 40% and a 3-hour exam counting 60%. Weights will be adjusted in the case of missed assessments."
    },
    "STA3022F": {
        "convener": "Dr S Er",
        "prerequisites": {
            "text": "STA2020F/S or STA2007F/S/H, or at least 45% for STA2005S.",
            "parsed": {"type": "prerequisite", "codes": ["STA2020F"]}
        },
        "corequisites": [],
        "outline": "The aim of the course is to create a practical working familiarity with the analysis of data, focusing on multivariate methods as applied in areas such as marketing, the social science and the sciences. Topics covered include item reliability analysis, multidimensional scaling, correspondence analysis, principal component and factor analysis, cluster analysis, discriminant analysis, classification trees and structural equation modelling.",
        "lecture_times": "Monday - Thursday, 4th period.",
        "dp_requirements": "Satisfactory attendance of lectures, tutorials, practicals and tests and completion of assignments and/or class exercises as set out in course outline. Class record of at least 35%.",
        "assessment": "Class record 30% and a 3-hour exam counting 70%. Weights will be adjusted in the case of missed assessments."
    },
    "STA3030F": {
        "convener": "Associate Professor G Distiller",
        "prerequisites": {
            "text": "(STA2030S or STA2004F) AND (STA2020F/S / STA2007F/S or 45% STA2005S) AND (MAM1032 or MAM1034S or MAM1006S or MAM1012F/S or MAM1021F/S or MAM1112S).",
            "parsed": {"type": "prerequisite", "codes": ["STA2030S", "STA2020F"]}
        },
        "corequisites": [],
        "outline": "This course forms part of the third-year major in Applied Statistics. The aim of the course is to provide students with the main intellectual and practical skills required in the use of inferential statistics and statistical modelling. The course consists of 4 modules: The simulation module introduces students to the use of computer simulation and data re-sampling techniques (bootstrap). The generalized linear models module introduces students to the exponential family of distributions and extends linear regression models to models for non-normal response variables, including logistic regression. The machine learning module covers a basic introduction to statistical learning paradigms, applications of regression and classification trees, and a primer on feedforward neural networks and backpropagation. The Bayesian module introduces students to decision theory and Bayesian inference. Students will use the R programming language.",
        "lecture_times": "Monday - Thursday, 1st period.",
        "dp_requirements": "Class record of at least 35%.",
        "assessment": "Class record 30% and a 3-hour exam counting 70%. Weights will be adjusted in the case of missed assessments."
    },
    "STA3036S": {
        "convener": "Dr R G Rakotonirainy",
        "prerequisites": {
            "text": "STA2020F/S or STA2005S or STA2007F/S AND MAM1032S (or equivalent). Note that students must be in their third academic year to take the course. All pre-requisite courses must be passed prior to taking the STA3036S course (and not done concurrently).",
            "parsed": {"type": "prerequisite", "codes": ["STA2020F", "MAM1032S"]}
        },
        "corequisites": [],
        "outline": "This course forms part of the third year major in Applied Statistics. It is an introduction to the study of Operational Research (OR) and explores fundamental quantitative techniques in the OR armamentarium with a strong focus on computer-based application. The course is intended for students in the applied statistics stream but may be taken as an elective by students in the mathematical statistics stream. Topics covered include linear and non-linear programming where students will learn to find optimal solutions by characterising problems in terms of objectives, decision variables and constraints, decision making under uncertainty through decision trees, decision rules and scenario planning, Queueing Theory simulation through modelling the operation of real world systems as they evolve over time.",
        "lecture_times": "Monday - Thursday, 3rd period.",
        "dp_requirements": "Satisfactory attendance of lectures, tutorials, practicals and tests and completion of assignments and/or class exercises as set out in course outline. Class record of at least 35%.",
        "assessment": "Class record 30% and a 3-hour exam counting 70%. Weights will be adjusted in the case of missed assessments."
    },
    "STA3041F": {
        "convener": "D Katshunga",
        "prerequisites": {
            "text": "STA2004F and STA2005S; MAM2000W or MAM2004H is strongly recommended. Recommended MAM2000W modules: MAM2011F - Linear Algebra (2LA), MAM2010F - Advanced Calculus (2AC), MAM2012S - Differential Equations (2DE) and MAM2014S - Real Analysis (2RA).",
            "parsed": {"type": "prerequisite", "codes": ["STA2004F", "STA2005S"]}
        },
        "corequisites": [],
        "outline": "This course forms part of the third-year major in Mathematical Statistics. It consists of two modules namely Stochastic Processes and Time Series Analysis. The Stochastic Processes module is aimed at providing introductory theory and basic applications of stochastic processes in financial modelling whilst the Time Series module introduces students to the foundations of the Box-Jenkins methodology with the intention of applying the methodology using statistical software. Details of the module content: Stochastic processes covers the general theory underlying stochastic processes and their classifications, definitions and applications of discrete Markov chains. Branching processes are examined with an emphasis on analysing probability of extinction/survival. The module also covers both discrete and continuous time counting processes. Time series analysis covers various topics including global and local models of dependence, stationary ARMA processes, unit root processes as well as a brief introduction to univariate Volatility models as well as cointegration.",
        "lecture_times": "Five lectures per week, Monday - Friday, 1st period.",
        "dp_requirements": "Satisfactory attendance of lectures, tutorials, practicals and tests and completion of assignments and/or class exercises as set out in course outline. Class record of at least 35%.",
        "assessment": "Class record 30% and a 3-hour exam counting 70%. Weights will be adjusted in the case of missed assessments."
    },
    "STA3045F": {
        "convener": "Associate Professor T Gebbie",
        "prerequisites": {
            "text": "STA2004F, STA2005S, MAM2000W and concurrent registration for STA3041F. Recommended MAM2000W modules: MAM2011F, MAM2010F, MAM2012S and MAM2014S. Note: A student may not register concurrently for STA3045F and CSC2001F.",
            "parsed": {"type": "prerequisite", "codes": ["STA2004F", "STA2005S"], "concurrent": ["STA3041F"]}
        },
        "corequisites": [],
        "outline": "This is a third year module for students studying Actuarial Science or Mathematical Statistics, though not a requirement for a major in Mathematical Statistics. The course begins by giving a brief introduction to copulas and extreme value theory, together with some applications to risk management. The rest of the course gives a theoretical overview of stochastic processes, with the models covered spanning both discrete and continuous time as well as discrete and continuous state-space. Topics covered: copulas, extreme value theory, homogeneous and non-homogeneous continuous-time Markov chains, random walks, probability theory, martingales, Brownian motion, ito calculus, and diffusion processes.",
        "lecture_times": "Five lectures per week, Monday - Friday, 2nd period.",
        "dp_requirements": "Satisfactory attendance of lectures, tutorials, practicals and tests and completion of assignments and/or class exercises as set out in course outline. Class record of at least 35%.",
        "assessment": "Class record 30% and a 3-hour exam counting 70%. Weights will be adjusted in the case of missed assessments."
    },
    "STA3047S": {
        "convener": "Dr E Pienaar",
        "prerequisites": {
            "text": "STA2004F & STA2005S and MAM2000W (or equivalent) strongly recommended. Recommended MAM2000W (or equivalent) modules: 2LA - LINEAR ALGEBRA, 2AC - ADVANCED CALCULUS, 2DE - DIFFERENTIAL EQUATIONS, 2RA - REAL ANALYSIS.",
            "parsed": {"type": "prerequisite", "codes": ["STA2004F", "STA2005S"]}
        },
        "corequisites": ["STA3048S"],
        "outline": "Machine learning: Topics covered include: A basic introduction to statistical learning paradigms, applications of regression and classification trees, and a primer on feedforward neural networks and backpropagation.",
        "lecture_times": "To be advised.",
        "dp_requirements": "Satisfactory attendance of lectures, tutorials, practicals and tests and completion of assignments and/or class exercises as set out in course outline.",
        "assessment": "A computer based exam."
    },
    "STA3048S": {
        "convener": "Dr E Pienaar",
        "prerequisites": {
            "text": "STA2004F & STA2005S and MAM2000W (or equivalent) strongly recommended. Recommended MAM2000W (or equivalent) modules: 2LA, 2AC, 2DE, 2RA.",
            "parsed": {"type": "prerequisite", "codes": ["STA2004F", "STA2005S"]}
        },
        "corequisites": ["STA3047S"],
        "outline": "This course forms part of the third-year major in Mathematical Statistics. It consists of three modules: The first, Generalised Linear Models, introduces students to the theory and application of fitting linear models to various types of response variables with different underlying distributions. Subsequently, elementary concepts and methods in machine learning within the framework of statistical learning are explored. Finally, the Introduction to Bayesian Analysis module is dedicated to the Bayesian paradigm of statistical inference, analysis, and risk theory. Topics include: Generalized linear models (the exponential family, the GLM formulation, estimation and inference, models for continuous responses with skew distributions, logistic regression, log-linear models and Poisson regression); Introduction to Bayesian Analysis (use of Bayes' theorem; Bayesian statistical analysis for Bernoulli and normal sampling; empirical Bayes and credibility theory; loss and extreme value distributions; Monte Carlo methods).",
        "lecture_times": "To be advised.",
        "dp_requirements": "Satisfactory attendance of lectures, tutorials, practicals and tests and completion of assignments and/or class exercises as set out in course outline. Class record of at least 35%.",
        "assessment": "Class record 30% and a 3-hour exam counting 70%. Weights will be adjusted in the case of missed assessments."
    },
    "STA4010W": {
        "convener": "To be advised",
        "prerequisites": {
            "text": "Admission to Honours programme in Statistics or Operational Research.",
            "parsed": {"type": "programme_registration", "programmes": ["Honours in Statistics", "Honours in Operational Research"]}
        },
        "corequisites": [],
        "outline": "This is the honours wrapper course for Topics in Statistics and Operational Research. The course consists of selected topics in mathematical statistics, applied statistics, and operational research, along with a research project. Students select modules from the available offerings in consultation with the department.",
        "lecture_times": "Full year course. To be advised.",
        "dp_requirements": "To be advised.",
        "assessment": "Combination of coursework, examinations and research project as specified by the department."
    },
}


# ============================================================
# GENERATE INDIVIDUAL COURSE FILES
# ============================================================

def write_json(path, data):
    full = os.path.join(BASE, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"  Written: {path}")


# Read existing _index.json
idx_path = os.path.join(BASE, 'courses', '_index.json')
with open(idx_path, 'r', encoding='utf-8') as f:
    idx = json.load(f)

print(f"\nRead {len(idx['courses'])} courses from _index.json")
print("Generating individual course files...")

generated = 0
missing_details = []

for entry in idx['courses']:
    code = entry['code']
    title = entry['title']
    credits = entry['nqf_credits']
    nqf = entry['nqf_level']
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
        "is_commerce_course": not is_cross,
    }

    if is_cross:
        course_file["offered_by_faculty"] = cross_faculty_prefixes[prefix]

    write_json(f'courses/{code}.json', course_file)
    generated += 1

if missing_details:
    print(f"\n  WARNING: No detail found for {len(missing_details)} courses: {missing_details}")

print(f"\nDone! Generated {generated} individual course files from {len(idx['courses'])} courses in _index.json")
