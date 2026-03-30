"""
Build Humanities faculty handbook data from 2026 Humanities Faculty Handbook.
Creates: meta.json, courses/_index.json, majors/*.json, rules/faculty_rules.json, equivalences.json

The Humanities faculty is the largest at UCT with 7 degree types, multiple diplomas,
and hundreds of courses across ~20+ departments. This script captures the core programme
curricula; individual department elective courses are referenced by code where they
appear in programme curricula.
"""
import json
import os

BASE = os.path.join(os.path.dirname(__file__), '..', 'data', 'handbook', 'faculties', 'humanities')

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
    "faculty": "Faculty of Humanities",
    "faculty_slug": "humanities",
    "year": 2026,
    "handbook_title": "Faculty of Humanities Undergraduate Studies",
    "handbook_series": "Book 5 in the series of handbooks",
    "contact": {
        "postal_address": "University of Cape Town, Private Bag X3, 7701 Rondebosch",
        "deans_office": "Beattie Building, Upper Campus",
        "office_hours": "Monday to Friday: 08h30 - 16h30",
        "telephones": {
            "deans_office": "(021) 650-2712",
            "faculty_office": "(021) 650-2712",
            "accounts_and_fees": "(021) 650-1704",
            "admissions": "(021) 650-2128"
        },
        "websites": {
            "uct": "http://www.uct.ac.za",
            "humanities_faculty": "http://www.humanities.uct.ac.za",
            "dean_email": "humanities@uct.ac.za"
        }
    },
    "qualifications": {
        "undergraduate_degrees": [
            {
                "name": "Bachelor of Arts",
                "abbreviation": "BA",
                "nqf_level": 7,
                "minimum_duration_years": 3,
                "minimum_credits": 384,
                "note": "General BA with choice of majors from Humanities departments"
            },
            {
                "name": "Bachelor of Social Science",
                "abbreviation": "BSocSc",
                "nqf_level": 7,
                "minimum_duration_years": 3,
                "minimum_credits": 384,
                "note": "Social science focus — majors in Psychology, Sociology, Politics, Economics etc."
            },
            {
                "name": "Bachelor of Social Science in Philosophy, Politics and Economics",
                "abbreviation": "BSocSc(PPE)",
                "programme_code": "HB027",
                "nqf_level": 7,
                "minimum_duration_years": 3,
                "minimum_credits": 413
            },
            {
                "name": "Bachelor of Arts in Fine Art",
                "abbreviation": "BA(Fine Art)",
                "programme_code": "HB008",
                "nqf_level": 8,
                "minimum_duration_years": 4,
                "minimum_credits": 619,
                "note": "Professional 4-year degree, HEQSF exit level 8"
            },
            {
                "name": "Bachelor of Arts in Theatre and Performance",
                "abbreviation": "BA(T&P)",
                "programme_code": "HB014",
                "nqf_level": 8,
                "minimum_duration_years": 4,
                "note": "5 specialisations: Acting, Dance, Performance Making, Applied Performance/Pedagogy, Scenography"
            },
            {
                "name": "Bachelor of Music",
                "abbreviation": "BMus",
                "programme_code": "HB010",
                "nqf_level": 8,
                "minimum_duration_years": 4,
                "note": "7 streams: General, African Music Performance, Classical Performance, Jazz Studies, Opera, Classical Composition, Music Technology"
            },
            {
                "name": "Bachelor of Social Work",
                "abbreviation": "BSW",
                "programme_code": "HB063",
                "nqf_level": 8,
                "minimum_duration_years": 4,
                "minimum_credits": 480,
                "professional_registration": "South African Council for Social Service Professions (SACSSP)"
            }
        ],
        "diplomas": [
            {
                "name": "Diploma in Musical Performance",
                "abbreviation": "DMP",
                "programme_code": "HU021",
                "nqf_level": 6,
                "minimum_duration_years": 3,
                "note": "5 streams: World Music, African Music, Classical, Jazz Studies, Opera"
            },
            {
                "name": "Diploma in Theatre and Performance",
                "programme_code": "HU020",
                "nqf_level": 6,
                "minimum_duration_years": 3
            },
            {
                "name": "Advanced Diploma in Theatre",
                "programme_code": "HU050",
                "nqf_level": 7,
                "minimum_duration_years": 1,
                "note": "Not offered in 2026"
            }
        ],
        "extended_programmes": [
            {
                "name": "BA Extended",
                "programme_code": "HB046",
                "duration_years": 4,
                "note": "4-year version of BA with additional academic development support in year 1"
            },
            {
                "name": "BSocSc Extended",
                "programme_code": "HB047",
                "duration_years": 4,
                "note": "4-year version of BSocSc with academic development support"
            },
            {
                "name": "BA(Fine Art) Extended",
                "programme_code": "HB064",
                "duration_years": 5,
                "minimum_credits": 672,
                "note": "5-year version of BA(Fine Art)"
            },
            {
                "name": "BMus Extended",
                "programme_code": "HB034",
                "duration_years": 5,
                "note": "5-year versions of all 7 BMus streams. Continuing students only, no new intake 2026."
            },
            {
                "name": "DMP Extended",
                "programme_code": "HU034",
                "duration_years": 4,
                "note": "4-year version of DMP. Continuing students only."
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
            "X": {"meaning": "Not classified", "semester": "varies"},
            "Z": {"meaning": "Other", "semester": "varies"}
        }
    },
    "departments": [
        "Academic Development Programme",
        "African Languages and Literatures",
        "Archaeology",
        "Centre for African Studies",
        "Centre for Film and Media Studies",
        "Centre for Rhetoric Studies",
        "Drama (Theatre and Performance)",
        "English Language and Literature",
        "Environmental and Geographical Science",
        "Fine Art (Michaelis School of Fine Art)",
        "Gender Studies",
        "Historical Studies",
        "Knowledge and Information Stewardship",
        "Linguistics",
        "Modern and Classical Languages",
        "Music (South African College of Music)",
        "Philosophy",
        "Political Studies",
        "Psychology",
        "Religious Studies",
        "Social Development (Social Work)",
        "Sociology"
    ],
    "department_prefixes": [
        "DOH", "ASL", "AXL", "AFR", "FAM", "RHT", "TDP",
        "ELL", "EGS", "FIN", "GND", "HST", "LIS", "LIN",
        "MCL", "MUZ", "PHI", "POL", "PSY", "REL", "SWK", "SOC"
    ],
    "cross_faculty_departments": [
        {"department": "Economics", "prefix": "ECO", "home_faculty": "commerce"},
        {"department": "Mathematics & Applied Mathematics", "prefix": "MAM", "home_faculty": "science"},
        {"department": "Statistical Sciences", "prefix": "STA", "home_faculty": "science"},
        {"department": "Computer Science", "prefix": "CSC", "home_faculty": "science"},
        {"department": "Management Studies", "prefix": "BUS", "home_faculty": "commerce"},
        {"department": "Commercial Law", "prefix": "CML", "home_faculty": "law"},
        {"department": "Public Law", "prefix": "PBL", "home_faculty": "law"},
        {"department": "Private Law", "prefix": "PVL", "home_faculty": "law"}
    ]
}

# ============================================================
# ALL COURSES
# ============================================================

courses_raw = [
    # ── Academic Development Programme (DOH) ──
    ("DOH1005F", "Thinking About: Ideas and Knowledge", 18, 5),
    ("DOH1017S", "Introduction to Business Concepts for Humanities Students", 18, 5),
    ("DOH2024F", "Business Management for Humanities Students", 24, 6),
    ("DOH3003F", "Business Administration for Humanities Students", 24, 7),
    ("DOH3004S", "Business Administration for Humanities Students", 24, 7),

    # ── African Languages and Literatures (ASL) ──
    ("ASL1300F", "Introduction to Language Studies", 15, 5),
    ("ASL1301S", "Introduction to Sociolinguistics", 15, 5),
    ("ASL1305S", "Introduction to Language Studies (Extended)", 15, 5),
    ("ASL2202F", "Applied Sociolinguistics", 24, 6),
    ("ASL2203F", "Applied Sociolinguistics (Extended)", 24, 6),

    # ── Centre for Film and Media Studies (FAM) ──
    ("FAM1000S", "Introduction to Film Studies", 18, 5),
    ("FAM1010S", "Introduction to Film Studies (Extended)", 18, 5),
    ("FAM2004S", "Audiovisual Studies", 24, 6),
    ("FAM2013F", "Screen Production II: Production", 30, 6),
    ("FAM2014S", "Screen Production II: Post-Production", 30, 6),
    ("FAM3003S", "Screen Production III: Post-Production", 48, 7),
    ("FAM3005F", "Screen Production III: Pre-Production", 36, 7),
    ("FAM3016F", "Screen Production III: Production", 48, 7),
    ("FAM3017S", "Screen Production III: Advanced Post-Production", 48, 7),

    # ── Drama / Theatre and Performance (TDP) ──
    ("TDP1017H", "Performance Studies I", 36, 5),
    ("TDP1018H", "Performance Studies I", 36, 5),
    ("TDP1027F", "Voice and Movement I", 18, 5),
    ("TDP1029F", "Voice and Movement I (Extended)", 18, 5),
    ("TDP1045S", "Production I", 18, 5),
    ("TDP1046W", "Performance Making I", 36, 5),
    ("TDP2010F", "Performance Studies II", 36, 6),
    ("TDP2011S", "Performance Studies II", 36, 6),
    ("TDP2013S", "Production II", 18, 6),
    ("TDP2040W", "Performance Making II", 36, 6),
    ("TDP2042F", "Movement II", 18, 6),
    ("TDP3010F", "Performance Studies III", 36, 7),
    ("TDP3018S", "Performance Studies III", 36, 7),
    ("TDP3041W", "Dance III", 60, 7),
    ("TDP3043W", "Acting III", 60, 7),
    ("TDP3047W", "Performance Making III", 60, 7),
    ("TDP3050W", "Applied Performance/Pedagogy III", 60, 7),
    ("TDP3051W", "Scenography III", 60, 7),
    ("TDP3052W", "Theatre and Performance III", 60, 7),
    ("TDP3902W", "Professional Practice", 48, 7),

    # ── English Language and Literature (ELL) ──
    ("ELL1010S", "Introduction to Literature (Extended)", 18, 5),
    ("ELL1016S", "Introduction to Literature", 18, 5),
    ("ELL2000F", "English Studies IIA", 24, 6),
    ("ELL2016F", "English Studies IIA (Extended)", 24, 6),

    # ── Fine Art / Michaelis (FIN) ──
    ("FIN1001W", "Art Practice 1", 72, 5),
    ("FIN1005W", "Visual Culture Studies 1", 36, 5),
    ("FIN1006F", "Theory of Art I", 18, 5),
    ("FIN1008W", "Art Practice 1 (Extended)", 72, 5),
    ("FIN1009S", "Theory of Art I", 18, 5),
    ("FIN2011W", "Drawing 2", 36, 6),
    ("FIN2012W", "Painting 2", 36, 6),
    ("FIN2013W", "Photography 2", 36, 6),
    ("FIN2014W", "Printmaking 2", 36, 6),
    ("FIN2015W", "Sculpture 2", 36, 6),
    ("FIN2016W", "Textiles 2", 36, 6),
    ("FIN2025W", "New Media 2", 36, 6),
    ("FIN2026W", "Visual Culture Studies 2", 36, 6),
    ("FIN2027F", "Theory of Art IIA", 18, 6),
    ("FIN2028S", "Theory of Art IIB", 18, 6),
    ("FIN2029F", "Theory of Art IIA", 18, 6),
    ("FIN3011W", "Drawing 3", 48, 7),
    ("FIN3012W", "Painting 3", 48, 7),
    ("FIN3013W", "Photography 3", 48, 7),
    ("FIN3014W", "Printmaking 3", 48, 7),
    ("FIN3015W", "Sculpture 3", 48, 7),
    ("FIN3016W", "Textiles 3", 48, 7),
    ("FIN3025W", "New Media 3", 48, 7),
    ("FIN3026F", "Theory of Art IIIA", 18, 7),
    ("FIN3027S", "Theory of Art IIIB", 18, 7),
    ("FIN3028F", "Theory of Art IIIA", 18, 7),
    ("FIN3029S", "Theory of Art IIIB", 18, 7),
    ("FIN3030W", "Visual Culture Studies 3", 36, 7),
    ("FIN4012W", "Theory and Practice of Art", 48, 8),
    ("FIN4015W", "Fine Art 4", 108, 8),

    # ── Historical Studies (HST) ──
    ("HST1013F", "Historical Studies I", 18, 5),
    ("HST1015F", "Historical Studies I (Extended)", 18, 5),

    # ── Linguistics (LIN) ──
    # Included via programme references

    # ── Music / South African College of Music (MUZ) ──
    # BMus General (MUZ33) — representative core courses
    ("MUZ1110H", "Foundation Music Skills I", 24, 5),
    ("MUZ1111H", "Foundation Music Skills II", 24, 5),
    ("MUZ1300F", "South African Music Studies I", 12, 5),
    ("MUZ1301S", "South African Music Studies II", 12, 5),
    ("MUZ1500F", "Western Art Music I", 12, 5),
    ("MUZ1501S", "Western Art Music II", 12, 5),
    ("MUZ2110H", "Musicianship III", 18, 6),
    ("MUZ2111H", "Musicianship IV", 18, 6),
    ("MUZ2306F", "Ethnomusicology I", 12, 6),
    ("MUZ2500F", "Western Art Music III", 12, 6),
    ("MUZ2501S", "Western Art Music IV", 12, 6),
    ("MUZ3110H", "Musicianship V", 14, 7),
    ("MUZ3111H", "Musicianship VI", 14, 7),
    ("MUZ3500F", "Western Art Music V", 12, 7),
    ("MUZ3501S", "Western Art Music VI", 12, 7),
    ("MUZ4900W", "Research Report", 48, 8),
    ("MUZ4901W", "Research Report", 48, 8),

    # BMus instrument courses (representative — B1-B4 levels)
    ("MUZ1175H", "Accordion B1", 24, 5),
    ("MUZ2175H", "Accordion B2", 24, 6),
    ("MUZ3175H", "Accordion B3", 24, 7),
    ("MUZ4175H", "Accordion B4", 24, 8),
    ("MUZ1420H", "Piano B1", 24, 5),
    ("MUZ2420H", "Piano B2", 24, 6),
    ("MUZ3420H", "Piano B3", 24, 7),
    ("MUZ4420H", "Piano B4", 24, 8),
    ("MUZ1410H", "Organ B1", 24, 5),
    ("MUZ2410H", "Organ B2", 24, 6),
    ("MUZ3410H", "Organ B3", 24, 7),
    ("MUZ4410H", "Organ B4", 24, 8),
    ("MUZ1440H", "Voice B1", 24, 5),
    ("MUZ2440H", "Voice B2", 24, 6),
    ("MUZ3440H", "Voice B3", 24, 7),
    ("MUZ4440H", "Voice B4", 24, 8),
    ("MUZ1170H", "Guitar B1", 24, 5),
    ("MUZ2170H", "Guitar B2", 24, 6),
    ("MUZ3170H", "Guitar B3", 24, 7),
    ("MUZ4170H", "Guitar B4", 24, 8),
    ("MUZ1165H", "Violin B1", 24, 5),
    ("MUZ2165H", "Violin B2", 24, 6),
    ("MUZ3165H", "Violin B3", 24, 7),
    ("MUZ4165H", "Violin B4", 24, 8),

    # BMus African Music Performance courses
    ("MUZ1306F", "African Music I: Theory", 12, 5),
    ("MUZ1307S", "African Music I: Practice", 12, 5),
    ("MUZ2307F", "African Music II: Theory", 12, 6),
    ("MUZ2308S", "African Music II: Practice", 12, 6),
    ("MUZ3306F", "African Music III: Theory", 12, 7),
    ("MUZ3307S", "African Music III: Practice", 12, 7),
    ("MUZ4306F", "African Music IV: Theory", 12, 8),
    ("MUZ4307S", "African Music IV: Practice", 12, 8),
    ("MUZ1121H", "African Ensemble B1", 12, 5),
    ("MUZ2121H", "African Ensemble B2", 12, 6),
    ("MUZ3121H", "African Ensemble B3", 12, 7),
    ("MUZ4121H", "African Ensemble B4", 12, 8),

    # BMus Jazz courses
    ("MUZ1600F", "Jazz Studies I", 12, 5),
    ("MUZ1601S", "Jazz Studies II", 12, 5),
    ("MUZ2600F", "Jazz Studies III", 12, 6),
    ("MUZ2601S", "Jazz Studies IV", 12, 6),
    ("MUZ3600F", "Jazz Studies V", 12, 7),
    ("MUZ3601S", "Jazz Studies VI", 12, 7),
    ("MUZ4600F", "Jazz Studies VII", 12, 8),
    ("MUZ4601S", "Jazz Studies VIII", 12, 8),
    ("MUZ1131H", "Jazz Ensemble B1", 12, 5),
    ("MUZ2131H", "Jazz Ensemble B2", 12, 6),
    ("MUZ3131H", "Jazz Ensemble B3", 12, 7),
    ("MUZ4131H", "Jazz Ensemble B4", 12, 8),

    # BMus Opera courses
    ("MUZ1700H", "Opera Studies I", 24, 5),
    ("MUZ2700H", "Opera Studies II", 24, 6),
    ("MUZ3700H", "Opera Studies III", 24, 7),
    ("MUZ4700H", "Opera Studies IV", 24, 8),

    # BMus Composition courses
    ("MUZ1800F", "Composition I", 12, 5),
    ("MUZ1801S", "Composition II", 12, 5),
    ("MUZ2800F", "Composition III", 12, 6),
    ("MUZ2801S", "Composition IV", 12, 6),
    ("MUZ3800F", "Composition V", 12, 7),
    ("MUZ3801S", "Composition VI", 12, 7),
    ("MUZ4800W", "Composition VII (Portfolio)", 48, 8),

    # BMus Music Technology courses
    ("MUZ1900F", "Music Technology I", 12, 5),
    ("MUZ1901S", "Music Technology II", 12, 5),
    ("MUZ2900F", "Music Technology III", 12, 6),
    ("MUZ2901S", "Music Technology IV", 12, 6),
    ("MUZ3900F", "Music Technology V", 12, 7),
    ("MUZ3901S", "Music Technology VI", 12, 7),
    ("MUZ4902W", "Music Technology VII (Portfolio)", 48, 8),

    # ── Philosophy (PHI) ──
    ("PHI1010S", "Ethics and Epistemology", 18, 5),
    ("PHI1011S", "Ethics and Epistemology (Extended)", 18, 5),
    ("PHI1024F", "Critical Thinking and Reasoning", 18, 5),
    ("PHI2041S", "Philosophy IIA", 24, 6),
    ("PHI2042F", "Philosophy IIB", 24, 6),

    # ── Political Studies (POL) ──
    ("POL1004F", "Introduction to Politics I", 18, 5),
    ("POL1005S", "Introduction to Politics II", 18, 5),
    ("POL1010S", "Introduction to Politics II (Extended)", 18, 5),
    ("POL2038F", "Political Studies IIA", 24, 6),

    # ── Psychology (PSY) ──
    ("PSY1004F", "Introduction to Psychology Part 1", 18, 5),
    ("PSY1005S", "Introduction to Psychology Part 2", 18, 5),
    ("PSY1006F", "Introduction to Psychology Part 1+", 10, 5),
    ("PSY1007S", "Introduction to Psychology Part 2+", 10, 5),
    ("PSY1009F", "Introduction to Psychology I", 18, 5),
    ("PSY1010S", "Introduction to Psychology II", 18, 5),

    # ── Religious Studies (REL) ──
    ("REL1002F", "Encountering World Religions I", 18, 5),
    ("REL1006S", "Encountering World Religions II", 18, 5),
    ("REL1015F", "Encountering World Religions I (Extended)", 18, 5),
    ("REL1016S", "Encountering World Religions II (Extended)", 18, 5),

    # ── Sociology (SOC) ──
    ("SOC1001F", "Introduction to Sociology I", 18, 5),
    ("SOC1005S", "Introduction to Sociology II", 18, 5),
    ("SOC1006F", "Introduction to Sociology I (Extended)", 18, 5),
    ("SOC1007S", "Introduction to Sociology II (Extended)", 18, 5),

    # ── Social Work (SWK) ──
    ("SWK1005S", "Introduction to Social Development", 12, 5),
    ("SWK1006S", "Introduction to Social Work", 12, 5),
    ("SWK1013F", "Introduction to Social Work Practice", 18, 5),
    ("SWK1014F", "Introduction to Social Work Practice (Extended)", 18, 5),
    ("SWK2001F", "Social Policy", 18, 6),
    ("SWK2060F", "Social Work Practice II: Individuals", 24, 6),
    ("SWK2065S", "Social Work Practice II: Groups", 24, 6),
    ("SWK2070F", "Social Work Practice II: Field Instruction I", 20, 6),
    ("SWK2075S", "Social Work Practice II: Field Instruction II", 20, 6),
    ("SWK3061F", "Social Work Practice III: Communities", 24, 7),
    ("SWK3066S", "Social Work Practice III: Organisations", 24, 7),
    ("SWK3070F", "Social Work Practice III: Field Instruction III", 24, 7),
    ("SWK3075S", "Social Work Practice III: Field Instruction IV", 24, 7),
    ("SWK4015F", "Social Work Practice IV: Research", 24, 8),
    ("SWK4016S", "Social Work Practice IV: Research Report", 24, 8),
    ("SWK4030F", "Social Work Practice IV: Advanced Practice", 24, 8),
    ("SWK4031S", "Social Work Practice IV: Advanced Practice II", 24, 8),
    ("SWK4032S", "Social Work Practice IV: Field Instruction V", 15, 8),
    ("SWK4033F", "Social Work Practice IV: Field Instruction VI", 15, 8),

    # ── Cross-faculty courses used in Humanities programmes ──
    ("ECO1010F", "Microeconomics I", 18, 5),
    ("ECO1011S", "Macroeconomics I", 18, 5),
    ("ECO2003F", "Microeconomics II", 18, 6),
    ("ECO2004S", "Macroeconomics II", 18, 6),
    ("ECO2007S", "Co-operation and Competition", 18, 6),
    ("ECO3025S", "Public Economics", 18, 7),
    ("STA1000S", "Statistics I", 18, 5),
    ("MAM1010F", "Mathematics I", 18, 5),
    ("BUS1007S", "Introduction to Business Management", 18, 5),
    ("BUS2024F", "Business Management II", 24, 6),
    ("BUS3003F", "Business Administration III", 24, 7),
    ("BUS3004S", "Business Administration III", 24, 7),
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
    "faculty": "humanities",
    "year": 2026,
    "total_courses": len(courses),
    "courses": []
}

cross_faculty_prefixes = {
    "ECO": "commerce", "STA": "science", "MAM": "science",
    "CSC": "science", "BUS": "commerce", "CML": "law",
    "PBL": "law", "PVL": "law"
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
        entry["is_humanities_course"] = False
        entry["offered_by_faculty"] = cross_faculty_prefixes[prefix]
    course_index["courses"].append(entry)

# ============================================================
# PROGRAMMES
# ============================================================

programmes = [
    # ── BA (General) ──
    {
        "id": "ba",
        "name": "Bachelor of Arts",
        "abbreviation": "BA",
        "nqf_level": 7,
        "department": "Faculty of Humanities",
        "duration_years": 3,
        "minimum_credits": 384,
        "curriculum": {
            "structure": "Flexible: choose 2 majors from Humanities departments. Must include courses at 1000, 2000, and 3000 levels.",
            "year_1": {
                "credits": 120,
                "note": "4-5 first-year courses across chosen major and elective departments"
            },
            "year_2": {
                "credits": 120,
                "note": "Continue major sequences at 2000-level, plus electives"
            },
            "year_3": {
                "credits": 144,
                "note": "Complete major sequences at 3000-level"
            }
        }
    },
    # ── BSocSc (General) ──
    {
        "id": "bsocsc",
        "name": "Bachelor of Social Science",
        "abbreviation": "BSocSc",
        "nqf_level": 7,
        "department": "Faculty of Humanities",
        "duration_years": 3,
        "minimum_credits": 384,
        "curriculum": {
            "structure": "Choose 2 majors from social science disciplines (Psychology, Sociology, Political Studies, Economics, etc.). Must include courses at 1000, 2000, and 3000 levels.",
            "year_1": {
                "credits": 120,
                "note": "4-5 first-year courses in chosen social science disciplines"
            },
            "year_2": {
                "credits": 120,
                "note": "Continue major sequences at 2000-level"
            },
            "year_3": {
                "credits": 144,
                "note": "Complete major sequences at 3000-level"
            }
        }
    },
    # ── BSocSc(PPE) ──
    {
        "id": "bsocsc-ppe",
        "programme_code": "HB027",
        "name": "Bachelor of Social Science in Philosophy, Politics and Economics",
        "abbreviation": "BSocSc(PPE)",
        "nqf_level": 7,
        "department": "Faculty of Humanities",
        "duration_years": 3,
        "minimum_credits": 413,
        "curriculum": {
            "year_1": {
                "core": ["ECO1010F", "ECO1011S", "PHI1010S", "PHI1024F", "POL1004F", "POL1005S", "STA1000S", "MAM1010F"],
                "credits": 132
            },
            "year_2": {
                "core": ["ECO2003F", "ECO2004S", "ECO2007S", "PHI2041S", "PHI2042F", "POL2038F"],
                "credits_range": "149-154",
                "note": "Plus options from POL/ECO/PHI at 2000-level"
            },
            "year_3": {
                "core": ["ECO3025S"],
                "credits_range": "132-168",
                "note": "Plus options from POL/ECO at 3000-level"
            }
        }
    },
    # ── BA Screen Production ──
    {
        "id": "ba-screen-production",
        "programme_code": "HB067",
        "name": "Bachelor of Arts in Screen Production",
        "abbreviation": "BA(Screen Production)",
        "nqf_level": 7,
        "department": "Centre for Film and Media Studies",
        "duration_years": 3,
        "minimum_credits": 375,
        "curriculum": {
            "year_1": {
                "core": ["FAM1000S"],
                "credits": 120,
                "note": "Plus 7 other 1000-level courses from Humanities departments"
            },
            "year_2": {
                "core": ["FAM2013F", "FAM2014S", "FAM2004S"],
                "credits_range": "105-120",
                "note": "Plus 3 electives"
            },
            "year_3": {
                "core": ["FAM3016F", "FAM3017S", "FAM3005F", "FAM3003S"],
                "credits_range": "150-180",
                "note": "Plus 1 elective"
            }
        }
    },
    # ── BA(Fine Art) Regular ──
    {
        "id": "ba-fine-art",
        "programme_code": "HB008",
        "name": "Bachelor of Arts in Fine Art",
        "abbreviation": "BA(Fine Art)",
        "nqf_level": 8,
        "department": "Michaelis School of Fine Art",
        "duration_years": 4,
        "minimum_credits": 619,
        "curriculum": {
            "year_1": {
                "core": ["FIN1001W", "FIN1005W", "FIN1006F", "FIN1009S"],
                "credits": 153,
                "note": "Plus 1 humanities elective"
            },
            "year_2": {
                "core": ["FIN2026W", "FIN2027F", "FIN2028S"],
                "studiowork_choices": ["FIN2011W", "FIN2012W", "FIN2013W", "FIN2014W", "FIN2015W", "FIN2016W", "FIN2025W"],
                "studiowork_required": 2,
                "credits_range": "154-164",
                "note": "Choose 2 studiowork courses; plus 2 humanities electives. FIN2029F alternative to FIN2027F."
            },
            "year_3": {
                "core": ["FIN3030W", "FIN3026F", "FIN3027S"],
                "studiowork_choices": ["FIN3011W", "FIN3012W", "FIN3013W", "FIN3014W", "FIN3015W", "FIN3016W", "FIN3025W"],
                "studiowork_required": 1,
                "credits": 156,
                "note": "Choose 1 studiowork course; plus humanities electives. FIN3028F/FIN3029S alternatives."
            },
            "year_4": {
                "core": ["FIN4015W", "FIN4012W"],
                "credits": 156
            }
        }
    },
    # ── BA(Fine Art) Extended ──
    {
        "id": "ba-fine-art-extended",
        "programme_code": "HB064",
        "name": "Bachelor of Arts in Fine Art (Extended)",
        "abbreviation": "BA(Fine Art) Extended",
        "nqf_level": 8,
        "department": "Michaelis School of Fine Art",
        "duration_years": 5,
        "minimum_credits": 672,
        "curriculum": {
            "year_1": {
                "core": ["FIN1001W", "FIN1008W", "DOH1005F"],
                "credits": 136,
                "note": "Extended first year with academic development support"
            },
            "note": "Years 2-5 follow the regular BA(Fine Art) curriculum spread over 4 years"
        }
    },
    # ── BSW ──
    {
        "id": "bsw",
        "programme_code": "HB063",
        "name": "Bachelor of Social Work",
        "abbreviation": "BSW",
        "nqf_level": 8,
        "department": "Social Development (Social Work)",
        "duration_years": 4,
        "minimum_credits": 480,
        "professional_registration": "South African Council for Social Service Professions (SACSSP)",
        "curriculum": {
            "year_1": {
                "core": ["PSY1009F", "PSY1010S", "SOC1001F", "SOC1005S", "SWK1006S", "SWK1005S", "SWK1013F"],
                "credits": 98
            },
            "year_2": {
                "core": ["SWK2001F", "SWK2060F", "SWK2065S", "SWK2070F", "SWK2075S"],
                "credits": 124,
                "note": "Plus PSY/SOC electives"
            },
            "year_3": {
                "core": ["SWK3061F", "SWK3066S", "SWK3070F", "SWK3075S"],
                "credits": 132,
                "note": "Plus PSY/SOC senior courses"
            },
            "year_4": {
                "core": ["SWK4015F", "SWK4016S", "SWK4030F", "SWK4031S", "SWK4032S", "SWK4033F"],
                "credits": 126
            }
        }
    },
    # ── BMus General ──
    {
        "id": "bmus-general",
        "programme_code": "HB010",
        "stream_code": "MUZ33",
        "name": "Bachelor of Music (General)",
        "abbreviation": "BMus",
        "nqf_level": 8,
        "department": "South African College of Music",
        "duration_years": 4,
        "credits_range": "582-679",
        "curriculum": {
            "year_1": {
                "core": ["MUZ1110H", "MUZ1111H", "MUZ1300F", "MUZ1301S", "MUZ1500F", "MUZ1501S"],
                "note": "Plus instrument B1 course and ensemble"
            },
            "year_2": {
                "core": ["MUZ2110H", "MUZ2111H", "MUZ2306F", "MUZ2500F", "MUZ2501S"],
                "note": "Plus instrument B2 course and ensemble"
            },
            "year_3": {
                "core": ["MUZ3110H", "MUZ3111H", "MUZ3500F", "MUZ3501S"],
                "note": "Plus instrument B3 course and ensemble"
            },
            "year_4": {
                "core": ["MUZ4900W"],
                "note": "Research report plus instrument B4, ensemble, and electives"
            }
        }
    },
    # ── BMus African Music Performance ──
    {
        "id": "bmus-african-music",
        "programme_code": "HB010",
        "stream_code": "MUZ44",
        "name": "Bachelor of Music (African Music Performance)",
        "abbreviation": "BMus",
        "nqf_level": 8,
        "department": "South African College of Music",
        "duration_years": 4,
        "minimum_credits": 630,
        "curriculum": {
            "year_1": {
                "core": ["MUZ1110H", "MUZ1111H", "MUZ1306F", "MUZ1307S", "MUZ1121H"],
                "note": "Plus instrument B1"
            },
            "year_2": {
                "core": ["MUZ2110H", "MUZ2111H", "MUZ2307F", "MUZ2308S", "MUZ2121H"],
                "note": "Plus instrument B2"
            },
            "year_3": {
                "core": ["MUZ3110H", "MUZ3111H", "MUZ3306F", "MUZ3307S", "MUZ3121H"],
                "note": "Plus instrument B3"
            },
            "year_4": {
                "core": ["MUZ4900W", "MUZ4306F", "MUZ4307S", "MUZ4121H"],
                "note": "Plus instrument B4"
            }
        }
    },
    # ── BMus Classical Performance ──
    {
        "id": "bmus-classical",
        "programme_code": "HB010",
        "stream_code": "MUZ42",
        "name": "Bachelor of Music (Classical Performance)",
        "abbreviation": "BMus",
        "nqf_level": 8,
        "department": "South African College of Music",
        "duration_years": 4,
        "credits_range": "513-546",
        "curriculum": {
            "year_1": {
                "core": ["MUZ1110H", "MUZ1111H", "MUZ1500F", "MUZ1501S"],
                "note": "Plus instrument B1 and ensemble"
            },
            "year_2": {
                "core": ["MUZ2110H", "MUZ2111H", "MUZ2500F", "MUZ2501S"],
                "note": "Plus instrument B2 and ensemble"
            },
            "year_3": {
                "core": ["MUZ3110H", "MUZ3111H", "MUZ3500F", "MUZ3501S"],
                "note": "Plus instrument B3 and ensemble"
            },
            "year_4": {
                "core": ["MUZ4900W"],
                "note": "Research report plus instrument B4 recital"
            }
        }
    },
    # ── BMus Jazz Studies ──
    {
        "id": "bmus-jazz",
        "programme_code": "HB010",
        "stream_code": "MUZ07",
        "name": "Bachelor of Music (Jazz Studies)",
        "abbreviation": "BMus",
        "nqf_level": 8,
        "department": "South African College of Music",
        "duration_years": 4,
        "credits_range": "618-720",
        "curriculum": {
            "year_1": {
                "core": ["MUZ1110H", "MUZ1111H", "MUZ1600F", "MUZ1601S", "MUZ1131H"],
                "note": "Plus instrument B1"
            },
            "year_2": {
                "core": ["MUZ2110H", "MUZ2111H", "MUZ2600F", "MUZ2601S", "MUZ2131H"],
                "note": "Plus instrument B2"
            },
            "year_3": {
                "core": ["MUZ3110H", "MUZ3111H", "MUZ3600F", "MUZ3601S", "MUZ3131H"],
                "note": "Plus instrument B3"
            },
            "year_4": {
                "core": ["MUZ4900W", "MUZ4600F", "MUZ4601S", "MUZ4131H"],
                "note": "Plus instrument B4"
            }
        }
    },
    # ── BMus Opera ──
    {
        "id": "bmus-opera",
        "programme_code": "HB010",
        "stream_code": "MUZ23",
        "name": "Bachelor of Music (Opera)",
        "abbreviation": "BMus",
        "nqf_level": 8,
        "department": "South African College of Music",
        "duration_years": 4,
        "credits_range": "498-501",
        "curriculum": {
            "year_1": {
                "core": ["MUZ1110H", "MUZ1111H", "MUZ1500F", "MUZ1501S", "MUZ1700H", "MUZ1440H"]
            },
            "year_2": {
                "core": ["MUZ2110H", "MUZ2111H", "MUZ2500F", "MUZ2501S", "MUZ2700H", "MUZ2440H"]
            },
            "year_3": {
                "core": ["MUZ3110H", "MUZ3111H", "MUZ3500F", "MUZ3501S", "MUZ3700H", "MUZ3440H"]
            },
            "year_4": {
                "core": ["MUZ4900W", "MUZ4700H", "MUZ4440H"]
            }
        }
    },
    # ── BMus Classical Composition ──
    {
        "id": "bmus-composition",
        "programme_code": "HB010",
        "stream_code": "MUZ45",
        "name": "Bachelor of Music (Classical Composition)",
        "abbreviation": "BMus",
        "nqf_level": 8,
        "department": "South African College of Music",
        "duration_years": 4,
        "credits_range": "489-510",
        "curriculum": {
            "year_1": {
                "core": ["MUZ1110H", "MUZ1111H", "MUZ1500F", "MUZ1501S", "MUZ1800F", "MUZ1801S"],
                "note": "Plus instrument B1"
            },
            "year_2": {
                "core": ["MUZ2110H", "MUZ2111H", "MUZ2500F", "MUZ2501S", "MUZ2800F", "MUZ2801S"],
                "note": "Plus instrument B2"
            },
            "year_3": {
                "core": ["MUZ3110H", "MUZ3111H", "MUZ3500F", "MUZ3501S", "MUZ3800F", "MUZ3801S"],
                "note": "Plus instrument B3"
            },
            "year_4": {
                "core": ["MUZ4800W"],
                "note": "Composition portfolio"
            }
        }
    },
    # ── BMus Music Technology ──
    {
        "id": "bmus-music-technology",
        "programme_code": "HB010",
        "stream_code": "MUZ41",
        "name": "Bachelor of Music (Music Technology)",
        "abbreviation": "BMus",
        "nqf_level": 8,
        "department": "South African College of Music",
        "duration_years": 4,
        "credits_range": "486-594",
        "curriculum": {
            "year_1": {
                "core": ["MUZ1110H", "MUZ1111H", "MUZ1500F", "MUZ1501S", "MUZ1900F", "MUZ1901S"],
                "note": "Plus instrument B1"
            },
            "year_2": {
                "core": ["MUZ2110H", "MUZ2111H", "MUZ2500F", "MUZ2501S", "MUZ2900F", "MUZ2901S"],
                "note": "Plus instrument B2"
            },
            "year_3": {
                "core": ["MUZ3110H", "MUZ3111H", "MUZ3900F", "MUZ3901S"],
                "note": "Plus instrument B3"
            },
            "year_4": {
                "core": ["MUZ4902W"],
                "note": "Music technology portfolio"
            }
        }
    },
    # ── Diploma in Musical Performance (DMP) — representative streams ──
    {
        "id": "dmp-classical",
        "programme_code": "HU021",
        "stream_code": "MUZ27",
        "name": "Diploma in Musical Performance (Classical)",
        "abbreviation": "DMP",
        "nqf_level": 6,
        "department": "South African College of Music",
        "duration_years": 3,
        "credits_range": "534-538",
        "curriculum": {
            "year_1": {
                "core": ["MUZ1110H", "MUZ1111H", "MUZ1500F", "MUZ1501S"],
                "note": "Plus instrument B1 and ensemble"
            },
            "year_2": {
                "core": ["MUZ2110H", "MUZ2111H", "MUZ2500F", "MUZ2501S"],
                "note": "Plus instrument B2 and ensemble"
            },
            "year_3": {
                "core": ["MUZ3110H", "MUZ3111H", "MUZ3500F", "MUZ3501S"],
                "note": "Plus instrument B3 recital"
            }
        }
    },
    {
        "id": "dmp-jazz",
        "programme_code": "HU021",
        "stream_code": "MUZ07",
        "name": "Diploma in Musical Performance (Jazz Studies)",
        "abbreviation": "DMP",
        "nqf_level": 6,
        "department": "South African College of Music",
        "duration_years": 3,
        "credits_range": "423-514",
        "curriculum": {
            "year_1": {
                "core": ["MUZ1110H", "MUZ1111H", "MUZ1600F", "MUZ1601S", "MUZ1131H"],
                "note": "Plus instrument B1"
            },
            "year_2": {
                "core": ["MUZ2110H", "MUZ2111H", "MUZ2600F", "MUZ2601S", "MUZ2131H"],
                "note": "Plus instrument B2"
            },
            "year_3": {
                "core": ["MUZ3110H", "MUZ3111H", "MUZ3600F", "MUZ3601S", "MUZ3131H"],
                "note": "Plus instrument B3"
            }
        }
    },
    {
        "id": "dmp-african",
        "programme_code": "HU021",
        "stream_code": "MUZ02",
        "name": "Diploma in Musical Performance (African Music)",
        "abbreviation": "DMP",
        "nqf_level": 6,
        "department": "South African College of Music",
        "duration_years": 3,
        "credits_range": "414-442",
        "curriculum": {
            "year_1": {
                "core": ["MUZ1110H", "MUZ1111H", "MUZ1306F", "MUZ1307S", "MUZ1121H"],
                "note": "Plus instrument B1"
            },
            "year_2": {
                "core": ["MUZ2110H", "MUZ2111H", "MUZ2307F", "MUZ2308S", "MUZ2121H"],
                "note": "Plus instrument B2"
            },
            "year_3": {
                "core": ["MUZ3110H", "MUZ3111H", "MUZ3306F", "MUZ3307S", "MUZ3121H"],
                "note": "Plus instrument B3"
            }
        }
    },
    {
        "id": "dmp-opera",
        "programme_code": "HU021",
        "stream_code": "MUZ23",
        "name": "Diploma in Musical Performance (Opera)",
        "abbreviation": "DMP",
        "nqf_level": 6,
        "department": "South African College of Music",
        "duration_years": 3,
        "credits_range": "470-474",
        "curriculum": {
            "year_1": {
                "core": ["MUZ1110H", "MUZ1111H", "MUZ1500F", "MUZ1501S", "MUZ1700H", "MUZ1440H"]
            },
            "year_2": {
                "core": ["MUZ2110H", "MUZ2111H", "MUZ2500F", "MUZ2501S", "MUZ2700H", "MUZ2440H"]
            },
            "year_3": {
                "core": ["MUZ3110H", "MUZ3111H", "MUZ3500F", "MUZ3501S", "MUZ3700H", "MUZ3440H"]
            }
        }
    },
    {
        "id": "dmp-world-music",
        "programme_code": "HU021",
        "stream_code": "MUZ14",
        "name": "Diploma in Musical Performance (World Music)",
        "abbreviation": "DMP",
        "nqf_level": 6,
        "department": "South African College of Music",
        "duration_years": 3,
        "credits_range": "413-452",
        "curriculum": {
            "year_1": {
                "core": ["MUZ1110H", "MUZ1111H", "MUZ1300F", "MUZ1301S"],
                "note": "Plus instrument B1 and ensemble"
            },
            "year_2": {
                "core": ["MUZ2110H", "MUZ2111H", "MUZ2306F"],
                "note": "Plus instrument B2 and ensemble"
            },
            "year_3": {
                "core": ["MUZ3110H", "MUZ3111H"],
                "note": "Plus instrument B3 recital"
            }
        }
    },
    # ── Diploma in Theatre and Performance ──
    {
        "id": "diploma-theatre",
        "programme_code": "HU020",
        "name": "Diploma in Theatre and Performance",
        "nqf_level": 6,
        "department": "Drama (Theatre and Performance)",
        "duration_years": 3,
        "minimum_credits": 424,
        "curriculum": {
            "year_1": {
                "core": ["TDP1046W", "TDP1017H", "TDP1027F", "TDP1045S", "TDP1029F", "DOH1005F"],
                "credits": 140
            },
            "year_2": {
                "core": ["TDP2010F", "TDP2011S", "TDP2042F", "TDP2013S", "TDP1018H", "TDP2040W"],
                "credits": 154
            },
            "year_3": {
                "core": ["TDP3052W"],
                "specialisation_choices": ["TDP3043W", "TDP3047W", "TDP3041W", "TDP3050W", "TDP3051W"],
                "specialisation_required": 1,
                "credits": 120,
                "note": "Choose 1 specialisation: Acting, Performance Making, Dance, Applied Performance/Pedagogy, or Scenography"
            }
        }
    },
    # ── BA(Theatre & Performance) ──
    {
        "id": "ba-theatre-performance",
        "programme_code": "HB014",
        "name": "Bachelor of Arts in Theatre and Performance",
        "abbreviation": "BA(T&P)",
        "nqf_level": 8,
        "department": "Drama (Theatre and Performance)",
        "duration_years": 4,
        "specialisations": [
            {"code": "TDP01", "name": "Acting"},
            {"code": "TDP04", "name": "Dance"},
            {"code": "TDP05", "name": "Performance Making"},
            {"code": "TDP06", "name": "Applied Performance/Pedagogy"},
            {"code": "TDP07", "name": "Scenography"}
        ],
        "curriculum": {
            "year_1": {
                "core": ["TDP1046W", "TDP1017H", "TDP1027F", "TDP1045S"],
                "note": "Plus humanities electives"
            },
            "year_2": {
                "core": ["TDP2010F", "TDP2011S", "TDP2042F", "TDP2013S", "TDP2040W"],
                "note": "Plus humanities electives"
            },
            "year_3": {
                "core": ["TDP3010F", "TDP3018S", "TDP3052W"],
                "note": "Plus specialisation course at 3000-level"
            },
            "year_4": {
                "note": "Advanced specialisation, professional practice, and research"
            }
        }
    }
]

# ============================================================
# FACULTY RULES
# ============================================================

faculty_rules = {
    "$schema": "handbook-rules-v1",
    "faculty": "humanities",
    "year": 2026,
    "rules": {
        "general": {
            "FB1": "Students must complete minimum credits per year as specified for their programme.",
            "FB2": "Major sequences must be completed through 1000, 2000, and 3000 levels.",
            "FB3": "Students may not register for courses at a higher level without completing prerequisites.",
            "FB4": "Extended programme students follow augmented first-year curriculum with additional academic development courses."
        },
        "music_rules": {
            "FS1": "BMus students must maintain instrument studies throughout all 4 years.",
            "FS2": "Ensemble participation compulsory for all BMus and DMP students.",
            "FS3": "BMus Year 4 research report (MUZ4900W or MUZ4901W) compulsory for all streams.",
            "FS4": "Performance examinations held at end of each year for all instrument courses.",
            "FS5": "Students must pass instrument course to proceed to next year level.",
            "FS6": "BMus General stream requires breadth across Western Art Music, Ethnomusicology, and South African Music.",
            "FS7": "DMP is a 3-year diploma; does not lead directly to Honours without bridging.",
            "FS8": "BMus Extended (HB034): 5-year version, continuing students only — no new intake 2026.",
            "FS9": "DMP Extended (HU034): 4-year version, continuing students only.",
            "FS10": "Instrument allocation subject to availability and audition results.",
            "FS11": "All BMus/DMP students attend weekly masterclasses.",
            "FS12": "Repertoire requirements specified per instrument and year level."
        },
        "fine_art_rules": {
            "FBN1": "BA(Fine Art) Year 1: Art Practice 1 (FIN1001W) and Visual Culture Studies 1 (FIN1005W) compulsory.",
            "FBN2": "Year 2: choose 2 studiowork courses from available media.",
            "FBN3": "Year 3: choose 1 studiowork specialisation.",
            "FBN4": "Year 4: Fine Art 4 (FIN4015W, 108 credits) is the capstone studio project.",
            "FBN5": "Theory of Art courses compulsory in years 1-3.",
            "FBN6": "Humanities electives required in years 1-3 (minimum 1 per year).",
            "FBN7": "Extended programme (HB064): 5-year version with DOH1005F in Year 1.",
            "FBN8": "Portfolio review required for progression from Year 2 to Year 3.",
            "FBN9": "Exhibition at end of Year 4 is part of assessment."
        },
        "social_work_rules": {
            "FBW1": "BSW students must complete all field instruction placements (SWK*070*, SWK*075*, SWK*032*, SWK*033*).",
            "FBW2": "Professional registration with SACSSP required upon graduation.",
            "FBW3": "PSY and SOC courses compulsory as supporting disciplines in years 1-3."
        },
        "screen_production_rules": {
            "FB11": "BA Screen Production (HB067): FAM1000S compulsory in Year 1.",
            "FB12": "Screen Production courses (FAM2013F, FAM2014S, FAM3016F, FAM3017S) are sequential.",
            "FB13": "Portfolio submission required for admission to Screen Production programme."
        },
        "ppe_rules": {
            "FB14": "BSocSc(PPE): ECO, PHI, POL all compulsory — cannot drop any of the three disciplines.",
            "FB15": "STA1000S and MAM1010F compulsory in Year 1 as quantitative foundations."
        },
        "theatre_rules": {
            "FGT1": "Diploma in Theatre: 3-year programme with Year 3 specialisation choice.",
            "FGT2": "BA(T&P): 4-year degree with 5 specialisations, HEQSF exit level 8.",
            "FGT3": "Performance assessment at end of each year.",
            "FGT4": "Production participation compulsory.",
            "FGT5": "TDP1027F (Voice and Movement I) compulsory for all theatre students.",
            "FGT6": "Year 3 specialisation: choose one from Acting, Dance, Performance Making, Applied Performance/Pedagogy, Scenography.",
            "FGT7": "Advanced Diploma in Theatre (HU050): not offered in 2026.",
            "FGT8": "DOH1005F compulsory for Diploma in Theatre Year 1."
        },
        "extended_programme": {
            "DOH_augmenting": "Extended programme students take augmenting versions of courses paired with standard equivalents.",
            "pairs_note": "Standard and extended course pairs exist at 1000, 2000, and 3000 levels across multiple departments."
        }
    }
}

# ============================================================
# EQUIVALENCES
# ============================================================

equivalences = {
    "$schema": "handbook-equivalences-v1",
    "faculty": "humanities",
    "year": 2026,
    "equivalences": [
        {
            "type": "extended_pairs",
            "description": "Standard and extended (augmented) course pairs for BA/BSocSc extended programmes",
            "pairs": [
                {"standard": "ASL1301S", "extended": "ASL1305S", "title": "Introduction to Sociolinguistics / Language Studies"},
                {"standard": "BUS1007S", "extended": "DOH1017S", "title": "Business concepts"},
                {"standard": "ELL1016S", "extended": "ELL1010S", "title": "Introduction to Literature"},
                {"standard": "FAM1000S", "extended": "FAM1010S", "title": "Introduction to Film Studies"},
                {"standard": "HST1013F", "extended": "HST1015F", "title": "Historical Studies I"},
                {"standard": "PHI1010S", "extended": "PHI1011S", "title": "Ethics and Epistemology"},
                {"standard": "POL1005S", "extended": "POL1010S", "title": "Introduction to Politics II"},
                {"standard": "PSY1009F", "extended": "PSY1006F", "title": "Introduction to Psychology I"},
                {"standard": "PSY1010S", "extended": "PSY1007S", "title": "Introduction to Psychology II"},
                {"standard": "REL1002F", "extended": "REL1015F", "title": "Encountering World Religions I"},
                {"standard": "REL1006S", "extended": "REL1016S", "title": "Encountering World Religions II"},
                {"standard": "SOC1001F", "extended": "SOC1006F", "title": "Introduction to Sociology I"},
                {"standard": "SOC1005S", "extended": "SOC1007S", "title": "Introduction to Sociology II"},
                {"standard": "SWK1013F", "extended": "SWK1014F", "title": "Introduction to Social Work Practice"},
                {"standard": "TDP1027F", "extended": "TDP1029F", "title": "Voice and Movement I"},
                {"standard": "BUS2024F", "extended": "DOH2024F", "title": "Business Management II"},
                {"standard": "ASL2202F", "extended": "ASL2203F", "title": "Applied Sociolinguistics"},
                {"standard": "ELL2000F", "extended": "ELL2016F", "title": "English Studies IIA"},
                {"standard": "BUS3003F", "extended": "DOH3003F", "title": "Business Administration III"},
                {"standard": "BUS3004S", "extended": "DOH3004S", "title": "Business Administration III"}
            ]
        },
        {
            "type": "fine_art_theory_alternatives",
            "pairs": [
                {"option_a": "FIN2027F", "option_b": "FIN2029F", "title": "Theory of Art IIA"},
                {"option_a": "FIN3026F", "option_b": "FIN3028F", "title": "Theory of Art IIIA"},
                {"option_a": "FIN3027S", "option_b": "FIN3029S", "title": "Theory of Art IIIB"}
            ]
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
