"""
Build Health Sciences faculty handbook data from 2026 HS Faculty Handbook.
Creates: meta.json, courses/_index.json, majors/*.json, rules/faculty_rules.json, equivalences.json
"""
import json
import os

BASE = os.path.join(os.path.dirname(__file__), '..', 'data', 'handbook', 'faculties', 'health-sciences')

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
    "faculty": "Faculty of Health Sciences",
    "faculty_slug": "health-sciences",
    "year": 2026,
    "handbook_title": "Faculty of Health Sciences Undergraduate Studies",
    "handbook_series": "Book 8a in the series of handbooks",
    "contact": {
        "postal_address": "University of Cape Town, Private Bag X3, 7701 Rondebosch",
        "deans_office": "Barnard Fuller Building, Anzio Road, Observatory",
        "office_hours": "Monday to Friday: 09h00 - 15h00",
        "telephones": {
            "deans_office": "+27 21 650 6346",
            "faculty_office": "+27 21 650 3020",
            "accounts_and_fees": "+27 21 650 1704",
            "admissions": "+27 21 650 2128"
        },
        "websites": {
            "uct": "http://www.uct.ac.za",
            "health_sciences": "https://health.uct.ac.za",
            "dean_email": "dean.hs@uct.ac.za"
        }
    },
    "qualifications": {
        "undergraduate_degrees": [
            {
                "name": "Bachelor of Medicine and Bachelor of Surgery",
                "abbreviation": "MBChB",
                "programme_code": "MB014/MB020",
                "saqa_id": 3195,
                "minimum_duration_years": 6,
                "total_nqf_credits": 1214
            },
            {
                "name": "Bachelor of Science in Medicine",
                "abbreviation": "BSc(Medicine)",
                "programme_code": "MB001",
                "saqa_id": 116296,
                "minimum_duration_years": 1,
                "minimum_credits": 360
            },
            {
                "name": "BSc Audiology",
                "abbreviation": "BSc(Audiology)",
                "programme_code": "MB011/MB019",
                "saqa_id": None,
                "minimum_duration_years": 4,
                "total_nqf_credits": 622
            },
            {
                "name": "BSc Speech-Language Pathology",
                "abbreviation": "BSc(SLP)",
                "programme_code": "MB010/MB018",
                "saqa_id": None,
                "minimum_duration_years": 4,
                "total_nqf_credits": 622
            },
            {
                "name": "BSc Occupational Therapy",
                "abbreviation": "BSc(OT)",
                "programme_code": "MB003/MB016",
                "saqa_id": 3497,
                "minimum_duration_years": 4,
                "total_nqf_credits": 559
            },
            {
                "name": "BSc Physiotherapy",
                "abbreviation": "BSc(Physio)",
                "programme_code": "MB004/MB017",
                "saqa_id": 3345,
                "minimum_duration_years": 4,
                "total_nqf_credits": 588
            }
        ],
        "certificates_and_diplomas": [
            {
                "name": "Advanced Diploma in Cosmetic Formulation Science",
                "programme_code": "MU003",
                "saqa_id": 101885,
                "minimum_duration_years": 1,
                "total_nqf_credits": 120
            },
            {
                "name": "Higher Certificate in Disability Practice",
                "programme_code": "MU002",
                "saqa_id": 93691,
                "minimum_duration_years": 1,
                "total_nqf_credits": 120
            }
        ],
        "special_programmes": [
            {
                "name": "Nelson Mandela Fidel Castro Medical Training Programme",
                "abbreviation": "NMFCMTP",
                "programme_code": "MZ010",
                "minimum_duration_semesters": 3,
                "note": "For SA students studying toward Doctor of Medicine at University of Villa Clara, Cuba"
            },
            {
                "name": "Fundamentals of Health Sciences Semester Programme",
                "programme_codes": ["MB020", "MB019", "MB018", "MB017", "MB016"],
                "note": "Foundation programme for students who need additional support before entering standard curriculum"
            }
        ]
    },
    "course_code_system": {
        "description": "Eight character code AAAnnnnB: AAA=department, nnnn=year level+number, B=suffix.",
        "suffix_codes": {
            "F": {"meaning": "First-semester course", "semester": "S1"},
            "S": {"meaning": "Second-semester course", "semester": "S2"},
            "W": {"meaning": "Whole-year course", "semester": "FY"},
            "H": {"meaning": "Half course taught over whole year", "semester": "FY"},
            "X": {"meaning": "Practical training / clinical", "semester": "varies"},
            "Z": {"meaning": "Other", "semester": "varies"}
        },
        "note": "Health Sciences uses modular block system for MBChB years 4-6. Blocks are 2, 4, or 8 weeks."
    },
    "departments": [
        "Anaesthesia and Perioperative Medicine",
        "Family, Community and Emergency Care (FaCE)",
        "Health and Rehabilitation Sciences",
        "Health Sciences Education",
        "Human Biology",
        "Integrative Biomedical Sciences",
        "Medicine",
        "Obstetrics and Gynaecology",
        "Paediatrics and Child Health",
        "Pathology",
        "Psychiatry and Mental Health",
        "Public Health",
        "Radiation Medicine",
        "Surgery"
    ],
    "department_prefixes": [
        "AAE", "FCE", "AHS", "HSE", "HUB", "IBS", "MDN", "OBS",
        "PED", "PTY", "PRY", "PPH", "RAY", "CHM", "SLL"
    ],
    "cross_faculty_departments": [
        {"department": "Chemistry", "prefix": "CEM", "home_faculty": "science"},
        {"department": "Computer Science", "prefix": "CSC", "home_faculty": "science"},
        {"department": "Mathematics & Applied Mathematics", "prefix": "MAM", "home_faculty": "science"},
        {"department": "Physics", "prefix": "PHY", "home_faculty": "science"},
        {"department": "Statistical Sciences", "prefix": "STA", "home_faculty": "science"},
        {"department": "Psychology", "prefix": "PSY", "home_faculty": "humanities"},
        {"department": "Language Studies", "prefix": "ASL", "home_faculty": "humanities"}
    ]
}

# ============================================================
# ALL COURSES
# ============================================================

courses_raw = [
    # MBChB Year 1
    ("PPH1001F", "Becoming a Professional", 15, 5),
    ("PPH1002S", "Becoming a Health Professional", 15, 5),
    ("HUB1006F", "Introduction to Integrated Health Sciences: Part I", 30, 5),
    ("IBS1007S", "Introduction to Integrated Health Sciences: Part II", 35, 5),
    ("CEM1011F", "Chemistry for Medical Students", 18, 5),
    ("PHY1025F", "Physics", 18, 5),
    ("SLL1044S", "Beginners Afrikaans for MBChB", 18, 5),
    ("SLL1041S", "Beginners isiXhosa for MBChB", 18, 5),

    # MBChB Year 2
    ("PTY2000S", "Integrated Health Systems Part IB", 47, 6),
    ("FCE2000W", "Becoming a Doctor Part 1A", 21, 6),
    ("SLL2002H", "Becoming a Doctor Part 1B", 18, 6),
    ("HSE2000W", "Becoming a Doctor Part 1C", 22, 6),
    ("HUB2017H", "Integrated Health Systems Part 1A", 57, 6),

    # MBChB Year 3
    ("FCE3000F", "Becoming a Doctor Part IIA", 10, 7),
    ("MDN3001S", "Introduction to Clinical Practice", 68, 7),
    ("SLL3002F", "Becoming a Doctor (languages) Part IB", 30, 7),
    ("HSE3000F", "Becoming a Doctor Part IIC", 15, 7),
    ("PTY3009F", "Integrated Health Systems Part II", 59, 7),
    ("MDN2001S", "Special Study Modules", 16, 6),

    # MBChB Year 4
    ("SLL3003W", "Clinical Language", 0, 7),
    ("PRY4000W", "Clinical Psychiatry", 30, 8),
    ("AAE4002W", "Anaesthesia Part 1", 20, 8),
    ("OBS4003W", "Obstetrics", 30, 8),
    ("MDN4011W", "Medicine: Ward Care", 40, 8),
    ("MDN4001W", "Medicine: Ambulatory Care", 20, 8),
    ("MDN4015W", "Pharmacology and Applied Therapeutics", 20, 8),
    ("PED4016W", "Neonatology", 10, 8),
    ("PED4049W", "Introduction to Child and Adolescent Health", 10, 8),
    ("PPH4056W", "Health in Context", 40, 8),

    # MBChB Year 5
    ("PED5005W", "Caring for Children: Paediatric Surgery", 10, 8),
    ("PED5006W", "Caring for Children: Paediatric Medicine", 30, 8),
    ("CHM5003W", "Surgery", 40, 8),
    ("MDN5003H", "Pharmacology and Applied Therapeutics", 20, 8),
    ("CHM5004H", "Trauma for External Credit", 10, 8),
    ("OBS5005W", "Gynaecology", 20, 8),
    ("MDN5008W", "Dermatology", 10, 8),
    ("MDN5006W", "Rheumatology", 10, 8),
    ("CHM5007W", "Neurology and Neurosurgery", 20, 8),
    ("CHM5008W", "Ophthalmology", 10, 8),
    ("CHM5009W", "Otorhinolaryngology", 10, 8),
    ("CHM5010W", "Urology", 10, 8),
    ("OBS5000W", "Gynaecology", 4, 8),

    # MBChB Year 6
    ("CHM6000W", "Surgery (including Allied Disciplines)", 41, 8),
    ("MDN6000W", "Medicine (including Allied Disciplines)", 41, 8),
    ("OBS6000W", "Obstetrics", 41, 8),
    ("PED6000W", "Paediatrics and Child Health", 30, 8),
    ("PED6004W", "Neonatal Medicine", 10, 8),
    ("FCE6000W", "Family Medicine and Palliative Care", 21, 8),
    ("PRY6000W", "Psychiatry", 21, 8),
    ("AAE6000W", "Anaesthesia Part II", 10, 8),
    ("FCE6001W", "Long Elective", 19, 8),
    ("FCE6005W", "Short Elective", 10, 8),
    ("PTY6012W", "Forensic Medicine", 10, 8),
    ("PPH6001W", "Long Elective", 6, 8),
    ("HSE6004W", "Exit Examination on Procedural Competence", 0, 8),

    # BSc Audiology & Speech-Language Pathology Year 1
    ("AHS1003F", "Speech and Hearing Science", 18, 5),
    ("PSY1004F", "Introduction to Psychology Part 1", 18, 5),
    ("PSY1005S", "Introduction to Psychology Part 2", 18, 5),
    ("HUB1014S", "Anatomy of Communication Sciences", 20, 5),
    ("AHS1025S", "Early Intervention", 18, 5),
    ("AHS1042F", "Human Communication Development", 18, 5),
    ("ASL1300F", "Introduction to Language Studies", 15, 5),
    ("AHS1045S", "Basis of Hearing and Balance", 18, 5),
    ("ASL1301S", "Introduction to Sociolinguistics", 15, 5),
    ("PSY1006F", "Introduction to Psychology Part 1+", 10, 5),
    ("PSY1007S", "Introduction to Psychology Part 2+", 10, 5),

    # BSc Aud/SLP Year 2
    ("SLL1028H", "Xhosa for Health and Rehabilitation Sciences", 18, 5),
    ("SLL1048H", "Afrikaans for Health and Rehabilitation Sciences", 18, 5),
    ("AHS1054W", "South African Sign Language", 8, 5),
    ("PSY2015F", "Research in Psychology I", 20, 6),
    ("PSY2014S", "Cognitive Neuroscience and Abnormal Psychology", 20, 6),
    ("AHS2047S", "Paediatric Rehabilitative Audiology", 18, 6),
    ("AHS2106F", "Child Language", 21, 6),
    ("AHS2046F", "Diagnostic Audiology", 18, 6),
    ("AHS2110W", "Clinical Audiology I", 24, 6),
    ("AHS2111S", "Diagnostic Audiology in Special Populations", 15, 6),
    ("AHS2107F", "Child Speech", 18, 6),
    ("AHS2108W", "Clinical Speech Therapy I", 24, 6),
    ("AHS2109S", "School-Based Interventions", 21, 6),

    # BSc Aud/SLP Year 3
    ("AHS3078H", "Research Methods and Biostatistics I", 10, 7),
    ("AHS3008W", "Clinical Audiology II", 30, 7),
    ("AHS3062F", "Rehabilitation Technology", 22, 7),
    ("AHS3065S", "Adult Rehabilitative Audiology", 18, 7),
    ("AHS3075F", "OAEs and Electrophysiology", 22, 7),
    ("AHS3104S", "Vestibular Management", 15, 7),
    ("AHS3105F", "Public Health Audiology", 15, 7),
    ("AHS3005W", "Clinical Speech Therapy II", 30, 7),
    ("AHS3071F", "Acquired Neurogenic Language Disorders", 22, 7),
    ("AHS3072S", "Paediatric Motor Speech Disorders & Dysphagia", 22, 7),
    ("AHS3073F", "Adult Dysphagia and Motor Speech", 22, 7),
    ("AHS3102S", "Child Language II", 15, 7),
    ("AHS3103F", "Voice", 15, 7),

    # BSc Aud/SLP Year 4
    ("AHS4000W", "Research Report", 30, 8),
    ("AHS4067S", "Seminars in Communication Sciences", 4, 8),
    ("AHS4008H", "Clinical Audiology IIIA", 45, 8),
    ("AHS4009H", "Clinical Audiology IIIB", 45, 8),
    ("AHS4005H", "Clinical Speech Therapy IIIA", 45, 8),
    ("AHS4006H", "Clinical Speech Therapy IIIB", 45, 8),

    # BSc Occupational Therapy Year 1
    ("HUB1019F", "Anatomy and Physiology 1A", 18, 5),
    ("HUB1020S", "Anatomy and Physiology IB", 18, 5),
    ("AHS1032S", "Occupational Perspectives on Health and Well-being", 20, 5),
    ("AHS1035F", "Human Occupation and Development", 22, 5),

    # BSc OT Year 2
    ("AHS2002W", "Clinical Sciences I", 13, 6),
    ("PRY2002W", "Psychiatry for Occupational Therapists", 14, 6),
    ("PSY2013F", "Social and Developmental Psychology", 20, 6),
    ("HUB2015W", "Anatomy & Physiology II for Health & Rehab Sciences", 36, 6),
    ("AHS2043W", "Occupational Therapy II", 36, 6),

    # BSc OT Year 3
    ("AHS3107W", "Occupational Therapy Theory and Practice in Physical Health", 38, 7),
    ("AHS3108W", "Occupational Therapy Theory and Practice in Mental Health", 38, 7),
    ("AHS3113W", "Foundation Theory for Occupational Therapy Practice I", 26, 7),

    # BSc OT Year 4
    ("AHS4119W", "Occupational Therapy Research and Practice Management", 48, 8),
    ("AHS4120W", "Foundation Theory for Occupational Therapy Practice II", 48, 8),
    ("AHS4121W", "Occupational Therapy Practice and Service Learning", 48, 8),

    # BSc Physiotherapy Year 1
    ("HUB1022F", "Biosciences for Physiotherapy IA", 9, 5),
    ("AHS1033F", "Movement Science I", 18, 5),
    ("AHS1034S", "Introduction to Applied Physiotherapy", 22, 5),
    ("HUB1023S", "Biosciences for Physiotherapy IB", 9, 5),

    # BSc Physio Year 2
    ("AHS2002W", "Clinical Sciences I", 13, 6),
    ("HUB2015W", "Anatomy & Physiology II for Health & Rehab Sciences", 36, 6),
    ("HUB2023W", "Biosciences for Physiotherapy II", 9, 6),
    ("AHS2050H", "Clinical Physiotherapy I", 18, 6),
    ("AHS2052H", "Movement Science II", 38, 6),
    ("AHS2053H", "Applied Physiotherapy I", 32, 6),

    # BSc Physio Year 3
    ("AHS3069W", "Clinical Physiotherapy II", 62, 7),
    ("AHS3070H", "Becoming a Rehabilitation Professional I", 22, 7),
    ("AHS3076H", "Movement Science III", 24, 7),
    ("AHS3077H", "Applied Physiotherapy II", 22, 7),

    # BSc Physio Year 4
    ("AHS4065W", "Clinical Physiotherapy III", 98, 8),
    ("AHS4066F", "Becoming a Rehabilitation Professional II", 4, 8),
    ("AHS4071F", "Applied Physiotherapy III", 20, 8),
    ("AHS4072H", "Research Methods and Biostatistics II", 10, 8),
    ("AHS4184S", "Applied Physiotherapy III", 20, 8),
    ("AHS4185S", "Becoming a Rehabilitation Professional II", 4, 8),

    # BSc Medicine (intercalated)
    ("HUB3006F", "Applied Human Biology", 36, 7),
    ("HUB3007S", "Human Neurosciences", 36, 7),
    ("IBS3020W", "Molecular Medicine", 72, 7),

    # Cosmetic Formulation Science (Advanced Diploma)
    ("MDN3005W", "Scientific Principles of Cosmetic Formulations", 30, 7),
    ("MDN3006W", "Cosmetic Formulation Technology", 30, 7),
    ("MDN3007W", "Hair and Skin Biology for the Cosmetic Formulator", 30, 7),
    ("MDN3008W", "Cosmetics: Claims, Regulation and Ethics", 15, 7),
    ("MDN3009W", "Professional Communication & Project Management for Cosmetic Scientists", 15, 7),
    ("MDN3010W", "Cosmetic Formulation Science Inservice Training", 0, 7),

    # Higher Certificate in Disability Practice
    ("AHS1060F", "Disability Info Management & Communication Systems I", 7, 5),
    ("AHS1061F", "Disability Info Management & Communication Systems II", 8, 5),
    ("AHS1062F", "Promoting Healthy Lifestyles", 10, 5),
    ("AHS1063F", "Health, Wellness and Functional Ability Part I", 15, 5),
    ("AHS1064F", "Health, Wellness and Functional Ability Part II", 15, 5),
    ("AHS1065F", "Inclusive Development and Agency", 15, 5),
    ("AHS1066F", "Work-Integrated Practice Learning Part I", 25, 5),
    ("AHS1067F", "Work-Integrated Practice Learning Part II", 25, 5),
    ("AHS1068W", "Disability Information Management and Communication Systems", 15, 5),
    ("AHS1069W", "Health and Functional Ability", 30, 5),
    ("AHS1070W", "Work Integrated Practice Learning", 50, 5),

    # NMFC Programme
    ("AAE4003W", "Anaesthesia (Part I) for External Credit", 8, 8),
    ("MDN4017W", "Medicine for External Credit", 15, 8),
    ("PED4017W", "Neonatology for External Credit", 7, 8),
    ("OBS4006W", "Obstetrics for External Credit", 15, 8),
    ("PRY4001W", "Psychiatry for External Credit", 15, 8),
    ("AAE5000W", "Anaesthesia (Part II) for External Credit", 10, 8),
    ("PTY5012W", "Forensic Medicine for External Credit", 10, 8),
    ("OBS5006W", "Gynaecology for External Credit", 27, 8),
    ("MDN5000W", "Medicine for External Credit", 24, 8),
    ("OBS5007W", "Obstetrics for External Credit", 41, 8),
    ("CHM5005W", "Orthopaedic Surgery for External Credit", 10, 8),
    ("PED5004W", "General Care of the Child for External Credit", 40, 8),
    ("PRY5001W", "Psychiatry and Mental Health for External Credit", 30, 8),
    ("CHM5011W", "Surgery for External Credit", 19, 8),
    ("CHM5004W", "Trauma for External Credit", 10, 8),
    ("HSE6004W", "Exit Examination on Procedural Competence", 0, 8),

    # Fundamentals of Health Sciences Programme
    ("HSE1001F", "Fundamentals of Health Sciences", 60, 5),

    # Shared first-year courses across health rehab programmes
    ("PPH1002S", "Becoming a Health Professional", 15, 5),
]

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
    "faculty": "health-sciences",
    "year": 2026,
    "total_courses": len(courses),
    "courses": []
}

cross_faculty_prefixes = {
    "CEM": "science", "CSC": "science", "MAM": "science",
    "PHY": "science", "STA": "science", "GEO": "science",
    "PSY": "humanities", "ASL": "humanities", "SLL": "humanities"
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
        entry["is_hs_course"] = False
        entry["offered_by_faculty"] = cross_faculty_prefixes[prefix]
    course_index["courses"].append(entry)

# ============================================================
# PROGRAMMES
# ============================================================

programmes = [
    {
        "id": "mbchb",
        "programme_code": "MB014/MB020",
        "name": "Bachelor of Medicine and Bachelor of Surgery",
        "abbreviation": "MBChB",
        "saqa_id": 3195,
        "department": "Medicine",
        "duration_years": 6,
        "total_nqf_credits": 1214,
        "professional_registration": "Health Professions Council of South Africa (HPCSA)",
        "post_qualification": "Two years internship and one year community service required",
        "curriculum": {
            "year_1": {
                "core": ["PPH1001F", "PPH1002S", "HUB1006F", "IBS1007S", "CEM1011F", "PHY1025F", "SLL1044S", "SLL1041S"],
                "credits": 167,
                "note": "Language courses: Afrikaans OR isiXhosa required"
            },
            "year_2": {
                "core": ["HUB2017H", "PTY2000S", "FCE2000W", "SLL2002H", "HSE2000W"],
                "credits": 165
            },
            "year_3": {
                "core": ["PTY3009F", "FCE3000F", "HSE3000F", "SLL3002F", "MDN3001S", "MDN2001S"],
                "credits": 198,
                "note": "Special Study Module (SSM) assigned in third year"
            },
            "year_4": {
                "core": ["SLL3003W", "PRY4000W", "AAE4002W", "OBS4003W", "MDN4011W", "MDN4001W", "MDN4015W", "PED4016W", "PED4049W", "PPH4056W"],
                "credits": 220,
                "note": "Modular block system begins"
            },
            "year_5": {
                "core": ["PED5005W", "PED5006W", "CHM5003W", "MDN5003H", "CHM5004H", "OBS5005W", "MDN5008W", "MDN5006W", "CHM5007W", "CHM5008W", "CHM5009W", "CHM5010W"],
                "credits": 210
            },
            "year_6": {
                "core": ["CHM6000W", "MDN6000W", "OBS6000W", "PED6000W", "PED6004W", "FCE6000W", "PRY6000W", "AAE6000W", "FCE6001W", "FCE6005W", "PTY6012W", "HSE6004W"],
                "credits": 254
            }
        },
        "distinction_rules": {
            "basic_sciences": "Cumulative GPA >= 80% for years 1-3",
            "clinical_sciences": "Cumulative GPA >= 75% for years 4-6",
            "honours": "Overall GPA >= 75% for years 1-6",
            "first_class_honours": "Overall GPA >= 85% for years 1-6"
        }
    },
    {
        "id": "bsc-audiology",
        "programme_code": "MB011/MB019",
        "name": "BSc Audiology",
        "abbreviation": "BSc(Audiology)",
        "department": "Health and Rehabilitation Sciences",
        "duration_years": 4,
        "total_nqf_credits": 622,
        "professional_registration": "HPCSA",
        "curriculum": {
            "year_1": {
                "core": ["PPH1001F", "PPH1002S", "AHS1003F", "PSY1004F", "PSY1005S", "HUB1014S", "AHS1025S", "AHS1042F", "ASL1300F", "AHS1045S"],
                "credits": 176
            },
            "year_2": {
                "core": ["SLL1028H", "AHS1054W", "PSY2015F", "PSY2014S", "AHS2047S", "AHS2106F", "AHS2046F", "AHS2110W", "AHS2111S"],
                "credits": 168
            },
            "year_3": {
                "core": ["AHS3078H", "AHS3008W", "AHS3062F", "AHS3065S", "AHS3075F", "AHS3104S", "AHS3105F"],
                "credits": 144
            },
            "year_4": {
                "core": ["AHS4000W", "AHS4067S", "AHS4008H", "AHS4009H"],
                "credits": 124
            }
        }
    },
    {
        "id": "bsc-speech-language-pathology",
        "programme_code": "MB010/MB018",
        "name": "BSc Speech-Language Pathology",
        "abbreviation": "BSc(SLP)",
        "department": "Health and Rehabilitation Sciences",
        "duration_years": 4,
        "total_nqf_credits": 622,
        "professional_registration": "HPCSA",
        "curriculum": {
            "year_1": {
                "core": ["PPH1001F", "PPH1002S", "AHS1003F", "PSY1004F", "PSY1005S", "HUB1014S", "AHS1025S", "AHS1042F", "ASL1300F", "ASL1301S"],
                "credits": 176
            },
            "year_2": {
                "core": ["SLL1028H", "AHS1054W", "PSY2015F", "PSY2014S", "AHS2047S", "AHS2106F", "AHS2107F", "AHS2108W", "AHS2109S"],
                "credits": 168
            },
            "year_3": {
                "core": ["AHS3078H", "AHS3005W", "AHS3071F", "AHS3072S", "AHS3073F", "AHS3102S", "AHS3103F"],
                "credits": 144
            },
            "year_4": {
                "core": ["AHS4000W", "AHS4067S", "AHS4005H", "AHS4006H"],
                "credits": 124
            }
        }
    },
    {
        "id": "bsc-occupational-therapy",
        "programme_code": "MB003/MB016",
        "name": "BSc Occupational Therapy",
        "abbreviation": "BSc(OT)",
        "saqa_id": 3497,
        "department": "Health and Rehabilitation Sciences",
        "duration_years": 4,
        "total_nqf_credits": 559,
        "professional_registration": "HPCSA",
        "curriculum": {
            "year_1": {
                "core": ["PPH1001F", "PPH1002S", "PSY1004F", "PSY1005S", "HUB1019F", "HUB1020S", "AHS1032S", "AHS1035F"],
                "credits": 144
            },
            "year_2": {
                "core": ["AHS2002W", "PRY2002W", "PSY2013F", "HUB2015W", "AHS2043W"],
                "credits": 123
            },
            "year_3": {
                "core": ["SLL1028H", "AHS3078H", "AHS3107W", "AHS3108W", "AHS3113W"],
                "credits": 148
            },
            "year_4": {
                "core": ["AHS4119W", "AHS4120W", "AHS4121W"],
                "credits": 144
            }
        }
    },
    {
        "id": "bsc-physiotherapy",
        "programme_code": "MB004/MB017",
        "name": "BSc Physiotherapy",
        "abbreviation": "BSc(Physio)",
        "saqa_id": 3345,
        "department": "Health and Rehabilitation Sciences",
        "duration_years": 4,
        "total_nqf_credits": 588,
        "professional_registration": "HPCSA",
        "curriculum": {
            "year_1": {
                "core": ["PPH1001F", "PSY1004F", "HUB1019F", "HUB1022F", "AHS1033F", "PPH1002S", "HUB1020S", "HUB1023S", "AHS1034S"],
                "credits": 142
            },
            "year_2": {
                "core": ["SLL1028H", "AHS2002W", "HUB2015W", "HUB2023W", "AHS2050H", "AHS2052H", "AHS2053H"],
                "credits": 164
            },
            "year_3": {
                "core": ["AHS3069W", "AHS3070H", "AHS3076H", "AHS3077H", "AHS3078H"],
                "credits": 150
            },
            "year_4": {
                "core": ["AHS4065W", "AHS4066F", "AHS4071F", "AHS4072H"],
                "credits": 132
            }
        }
    },
    {
        "id": "bsc-medicine",
        "programme_code": "MB001",
        "name": "Bachelor of Science in Medicine",
        "abbreviation": "BSc(Medicine)",
        "saqa_id": 116296,
        "department": "Medicine",
        "duration_years": 1,
        "minimum_credits": 360,
        "eligibility": "MBChB students who have completed at least second year",
        "curriculum": {
            "year_1": {
                "credits_from_mbchb": ["HUB1006F", "IBS1007S", "PHY1025F", "PTY2000S", "HUB2017H", "MDN2001S", "FCE2000W", "SLL2002H", "PTY3009F"],
                "additional_courses": ["HUB3006F", "HUB3007S", "IBS3020W", "AHS3078H"],
                "note": "Credit given for MBChB courses plus additional FHS courses"
            }
        }
    }
]

# ============================================================
# FACULTY RULES
# ============================================================

faculty_rules = {
    "$schema": "handbook-rules-v1",
    "faculty": "health-sciences",
    "year": 2026,
    "rules": {
        "admission": {
            "FGU1.1": "Faculty welcomes applicants with special needs but reserves right to assess disability impact on curriculum requirements.",
            "FGU1.2": "First-year students with conditional Matriculation Board exemption must submit proof before registering for second year."
        },
        "registration": {
            "FGU2.1": "All first-year students must attend all academic orientation activities.",
            "FGU2.2": "All students must renew registration formally each year. No retrospective registration.",
            "FGU2.3": "Late registration incurs penalty fine."
        },
        "hepatitis_b": {
            "FGU3": "Compulsory Hepatitis B immunisation by end of July of first year. Cannot register for second year without proof."
        },
        "professional_registration": {
            "FGU5": "All undergraduates must register with Health Professions Council of South Africa (HPCSA)."
        },
        "assessment": {
            "FGU8.1": "Continuous assessment in all prescribed courses.",
            "FGU8.2": "Supplementary examinations at Faculty Examinations Committee discretion. Not offered if mark < 45%, failed sub-component < 48% (MBChB years 4-6), failed more than one component, or poor throughout."
        },
        "progression": {
            "FGU9.3": "Student who fails courses may be required to repeat not only failed course but also other courses already passed.",
            "FGU9.6": "Cannot register for next academic year without completing all courses of preceding year."
        },
        "distinction": {
            "MBChB_basic_sciences": "Cumulative GPA >= 80% for years 1-3",
            "MBChB_clinical_sciences": "Cumulative GPA >= 75% for years 4-6",
            "MBChB_honours": "Overall GPA >= 75% for years 1-6",
            "MBChB_first_class_honours": "Overall GPA >= 85% for years 1-6",
            "BSc_Audiology_SLP": "Cumulative GPA >= 75% throughout all four years",
            "BSc_OT": "Cumulative GPA >= 75% throughout all four years",
            "BSc_Physio": "Cumulative GPA >= 75% throughout all four years"
        }
    }
}

# ============================================================
# EQUIVALENCES
# ============================================================

equivalences = {
    "$schema": "handbook-equivalences-v1",
    "faculty": "health-sciences",
    "year": 2026,
    "equivalences": [
        {
            "type": "foundation",
            "standard_entry": "Year 1 of standard curriculum",
            "foundation": "HSE1001F/S",
            "note": "Fundamentals of Health Sciences Semester Programme — students complete this before entering standard Year 1"
        },
        {
            "type": "language_choice",
            "options": ["SLL1044S", "SLL1041S"],
            "note": "MBChB Year 1: Beginners Afrikaans OR Beginners isiXhosa"
        },
        {
            "type": "language_choice",
            "options": ["SLL1028H", "SLL1048H"],
            "note": "Health & Rehab Sciences Year 2/3: Xhosa OR Afrikaans for Health Sciences"
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

print(f"\nDone! Created {len(courses)} courses, {len(programmes)} programmes")
