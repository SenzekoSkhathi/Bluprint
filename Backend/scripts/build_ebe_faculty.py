"""
Build Engineering & Built Environment faculty handbook data from 2026 EBE Handbook.
Creates: courses/_index.json, majors/*.json, rules/faculty_rules.json, equivalences.json
"""
import json
import os

BASE = os.path.join(os.path.dirname(__file__), '..', 'data', 'handbook', 'faculties', 'engineering')

def semester_from_suffix(code):
    suffix = code[-1]
    m = {
        'F': 'S1', 'S': 'S2', 'W': 'FY', 'H': 'FY',
        'A': 'Q1', 'B': 'Q2', 'C': 'Q3', 'D': 'Q4',
        'X': 'varies', 'Z': 'varies', 'M': 'varies',
        'L': 'winter', 'U': 'summer', 'J': 'summer', 'P': 'summer'
    }
    return m.get(suffix, 'varies')

def year_level(code):
    for i, c in enumerate(code):
        if c.isdigit():
            return int(c)
    return 0

def dept_prefix(code):
    return ''.join(c for c in code if c.isalpha() and c.isupper()).rstrip(code[-1]) if code else ''

def extract_prefix(code):
    prefix = ''
    for c in code:
        if c.isalpha():
            prefix += c
        else:
            break
    return prefix

# ============================================================
# ALL COURSES extracted from programmes (pages 22-69) and dept listings (pages 71+)
# ============================================================

courses_raw = [
    # Architecture, Planning and Geomatics (APG)
    ("APG1003W", "Technology I", 20, 5),
    ("APG1004F", "History & Theory of Architecture I", 10, 5),
    ("APG1005S", "History & Theory of Architecture II", 10, 5),
    ("APG1016H", "Geomatics I", 18, 5),
    ("APG1020W", "Design & Theory Studio I", 60, 5),
    ("APG1021W", "Representation I", 20, 5),
    ("APG1022X", "Practical Training in Geomatics", 0, 5),
    ("APG1023S", "Surveying and GIS", 15, 5),
    ("APG1024F", "Introduction to Geo-Spatial Sciences", 8, 5),
    ("APG2000F", "History & Theory of Architecture III", 10, 6),
    ("APG2003S", "History & Theory of Architecture IV", 10, 6),
    ("APG2009F", "Theory of Structures I", 10, 6),
    ("APG2014S", "Geomatics II", 24, 6),
    ("APG2015F", "Geographic Information Systems I", 24, 6),
    ("APG2019X", "Practical Training I", 0, 6),
    ("APG2021W", "Technology II (Major Course)", 20, 6),
    ("APG2026F", "Construction Surveying", 16, 6),
    ("APG2027X", "Work Experience", 0, 6),
    ("APG2039W", "Design & Theory Studio II (Major Course)", 60, 6),
    ("APG2040F", "Surveying I", 18, 6),
    ("APG2041S", "Applied Surveying & GISc", 14, 6),
    ("APG2042Z", "Representation II", 8, 6),
    ("APG2043F", "Environment & Services I", 10, 6),
    ("APG3000Z", "History & Theory of Architecture V", 10, 7),
    ("APG3012S", "Geomatics III", 24, 7),
    ("APG3013F", "Numerical Methods in Geomatics", 16, 7),
    ("APG3016C", "Surveying II", 12, 7),
    ("APG3017D", "Surveying III", 12, 7),
    ("APG3023W", "Technology III (major course)", 20, 7),
    ("APG3027Z", "Cadastral Survey & Registration Projects", 24, 7),
    ("APG3028X", "Independent Research", 0, 7),
    ("APG3033W", "Land & Cadastral Survey Law", 16, 7),
    ("APG3034Z", "Environment & Services II", 10, 7),
    ("APG3035F", "Theory of Structures II", 10, 7),
    ("APG3036F", "Management Practice Law", 10, 7),
    ("APG3037W", "Design & Theory Studio III (Major Course)", 60, 7),
    ("APG3038F", "Professional Communication Studies", 12, 7),
    ("APG3039B", "Spatial Data Infrastructures", 12, 7),
    ("APG3040C", "Advanced Spatial Data Analysis", 12, 7),
    ("APG3041Z", "Representation III", 8, 7),
    ("APG4001S", "Geodesy", 24, 8),
    ("APG4002Z", "Land Use Planning & Township Design", 16, 8),
    ("APG4003Z", "Geomatics Project", 40, 8),
    ("APG4005F", "Engineering Surveying & Adjustment", 18, 8),
    ("APG4010X", "Geoinformatics Camp", 4, 8),
    ("APG4011F", "Geomatics IV", 24, 8),
    ("APG4012S", "Geomatics Management & Professionalism", 24, 8),

    # Chemical Engineering (CHE)
    ("CHE1006F", "Chemical Engineering IA", 18, 5),
    ("CHE1007S", "Chemical Engineering IB", 18, 5),
    ("CHE2000X", "Field Trip", 4, 6),
    ("CHE2005W", "Chemical Engineering II", 72, 6),
    ("CHE2006S", "Introduction to Biotechnology", 24, 6),
    ("CHE3006F", "Fundamentals of Chemical Engineering III", 54, 7),
    ("CHE3007S", "Data Science, System Dynamics and Process Control", 24, 7),
    ("CHE3008S", "Chemical Engineering Project Management & Unit Operation Design", 20, 7),
    ("CHE3000X", "Workplace Experience", 0, 7),
    ("CHE3067S", "Design and Operation of Catalytic Reactors", 16, 7),
    ("CHE3068S", "Bioprocess Engineering", 16, 7),
    ("CHE3069S", "Mineral and Metallurgical Processing", 16, 7),
    ("CHE3070S", "Numerical Simulation for Chemical Engineers", 16, 7),
    ("CHE4036Z", "Chemical Engineering Design", 36, 8),
    ("CHE4045Z", "Chemical Engineering Research", 36, 8),
    ("CHE4048F", "Business, Society & Environment", 20, 8),
    ("CHE4049F", "Process Synthesis & Equipment Design", 20, 8),
    ("CHE4057F", "Industrial Ecology for Chemical Engineers", 8, 8),
    ("CHE4058Z", "Life Cycle Assessment", 8, 8),
    ("CHE4068F", "Bioprocess Engineering Design", 16, 8),
    ("CHE4069F", "Mineral & Metallurgical Processing II", 16, 8),
    ("CHE4070F", "Numerical Optimisation for Chemical Engineers", 16, 8),
    ("CHE4072F", "Renewable Energy in the Process Industry", 16, 8),
    ("CHE1001P", "Introduction to Chemical Engineering", 22, 5),

    # Civil Engineering (CIV)
    ("CIV1008F", "Introduction to Civil Engineering", 12, 5),
    ("CIV1009F", "Civil Engineering Drawing", 8, 5),
    ("CIV1011S", "Introduction to Engineering Mechanics", 15, 5),
    ("CIV1012S", "Sustainable Urban Infrastructure", 8, 5),
    ("CIV1013S", "Environmental Chemistry for Civil Engineers", 12, 5),
    ("CIV1014Z", "Water Challenge Scenario Project", 4, 6),
    ("CIV2020X", "Practical Experience", 0, 6),
    ("CIV2044F", "Mechanics of Materials", 15, 6),
    ("CIV2045F", "Geotechnical Engineering I", 8, 6),
    ("CIV2046F", "Transportation Engineering I", 15, 6),
    ("CIV2047Z", "Transportation Infrastructure Project", 4, 6),
    ("CIV2048S", "Hydraulics I", 15, 7),
    ("CIV2049Z", "Water and Sanitation Infrastructure Project", 4, 6),
    ("CIV2050Z", "Structural Systems Project", 4, 6),
    ("CIV2051S", "Analysis of Statistically Determinate Structures", 15, 7),
    ("CIV3042F", "Geotechnical Engineering II", 16, 7),
    ("CIV3043F", "Hydraulic Engineering", 16, 7),
    ("CIV3044F", "Engineering Hydrology", 8, 7),
    ("CIV3045S", "Transportation Planning", 16, 7),
    ("CIV3046S", "Water Treatment", 12, 7),
    ("CIV3047S", "Urban Water Services", 16, 7),
    ("CIV3048F", "Structural Analysis II", 16, 7),
    ("CIV3049S", "Structural Design I", 16, 7),
    ("CIV4035C", "Design Project", 24, 8),
    ("CIV4041F", "Professional Practice", 12, 8),
    ("CIV4042F", "Wastewater Treatment", 12, 8),
    ("CIV4044S", "Research Project", 48, 8),
    ("CIV4045F", "Structural Design II", 18, 8),
    ("CIV4046F", "Transportation Engineering", 18, 8),
    ("CIV4042F", "Water Waste Treatment", 12, 8),

    # Construction Economics and Management (CON)
    ("CON1004W", "Construction Technology I", 26, 5),
    ("CON1007X", "Practical Training", 0, 5),
    ("CON1010S", "Construction Information Systems", 8, 5),
    ("CON1021F", "Property and Planning I", 14, 5),
    ("CON1022F", "Building Construction I", 14, 5),
    ("CON1023S", "Building Construction II", 14, 5),
    ("CON1024S", "Property Economics I", 14, 5),
    ("CON1025S", "Property and Technology", 14, 5),
    ("CON2006W", "Construction Technology II", 28, 6),
    ("CON2013X", "Practical Training", 0, 6),
    ("CON2020S", "Construction Management I", 16, 6),
    ("CON2032S", "Property Investment and Finance I", 14, 6),
    ("CON2033F", "Real Property Law I", 14, 6),
    ("CON2034S", "Professionalism in the Built Environment", 12, 6),
    ("CON2035S", "Property and Planning II", 14, 6),
    ("CON2036F", "Property Valuation I", 14, 6),
    ("CON2037W", "Measurement & Design Appraisal I", 20, 6),
    ("CON3012W", "Construction Technology III", 28, 7),
    ("CON3022X", "Practical Training", 0, 7),
    ("CON3030F", "Construction Costing", 14, 7),
    ("CON3031W", "Measurement & Design Appraisal II", 26, 7),
    ("CON3032W", "Applied Contract Law I", 12, 7),
    ("CON3033S", "Property Studies I", 14, 7),
    ("CON3038W", "Construction Management II", 28, 7),
    ("CON3043W", "Cost Engineering under Uncertainty", 14, 7),
    ("CON3046S", "Property and Facilities Management", 14, 7),
    ("CON3047F", "Property Investment and Finance II", 14, 7),
    ("CON3048F", "Property Development I", 14, 7),
    ("CON3050F", "Property and Contract Law", 14, 7),
    ("CON3051F", "Property Valuation II", 14, 7),
    ("CON3052S", "Property Economics II", 14, 7),
    ("CON3053S", "Property and Environment", 14, 7),
    ("CON3054S", "Property Development II", 10, 7),

    # Electrical Engineering (EEE)
    ("EEE1000X", "Practical Training", 0, 5),
    ("EEE1008F", "Introduction to Electrical Engineering A", 12, 5),
    ("EEE1009S", "Introduction to Electrical Engineering B", 12, 5),
    ("EEE2041F", "Introduction to Electrical Engineering & Power Utilisation", 16, 6),
    ("EEE2042S", "Introduction to Analogue & Digital Electronics", 8, 6),
    ("EEE2044S", "Introduction to Power Engineering", 16, 6),
    ("EEE2045F", "Analogue Electronics", 16, 6),
    ("EEE2046F", "Embedded Systems I", 16, 6),
    ("EEE2047S", "Signals and Systems I", 16, 6),
    ("EEE2048S", "Professional Communication for Electrical Engineering", 8, 6),
    ("EEE3000X", "Practical Training", 0, 7),
    ("EEE3088F", "Electrical Engineering Design Principles", 8, 7),
    ("EEE3089F", "Electromagnetic Engineering", 16, 7),
    ("EEE3090F", "Electronic Devices and Circuits", 16, 7),
    ("EEE3091F", "Energy Conversion I", 16, 7),
    ("EEE3092F", "Signals & Systems II", 16, 7),
    ("EEE3093S", "Communication & Network Engineering", 16, 7),
    ("EEE3094S", "Control Systems Engineering", 16, 7),
    ("EEE3096S", "Embedded Systems II", 16, 7),
    ("EEE3097S", "Engineering Design: Electrical & Computer Engineering", 8, 7),
    ("EEE3098S", "Engineering Design: Electrical Engineering", 8, 7),
    ("EEE3099S", "Engineering Design: Mechatronics", 8, 7),
    ("EEE3100S", "Energy Systems & Grids I", 16, 7),
    ("EEE4022S", "Research Project", 40, 8),
    ("EEE4113F", "Engineering System Design", 16, 8),
    ("EEE4114F", "Digital Signal Processing", 16, 8),
    ("EEE4117F", "Energy Conversion II", 16, 8),
    ("EEE4118F", "Process Control & Instrumentation", 16, 8),
    ("EEE4119F", "Mechatronics", 16, 8),
    ("EEE4120F", "High Performance Digital Embedded Systems", 16, 8),
    ("EEE4121F", "Mobile and Wireless Networks", 16, 8),
    ("EEE4124C", "Impact of Engineering on the Natural & Social Environment", 8, 8),
    ("EEE4125C", "New Ventures: Planning, Practice & Professionalism", 16, 8),
    ("EEE4126F", "Energy Systems & Grids II", 16, 8),
    ("EEE4127F", "Mechatronic Systems", 16, 8),

    # Mechanical Engineering (MEC)
    ("MEC1007F", "Introduction to Engineering Drawing", 8, 5),
    ("MEC1008S", "Introduction to Mechanical Design", 8, 5),
    ("MEC1009F", "Introduction to Engineering Mechanics", 16, 5),
    ("MEC1009S", "Introduction to Engineering Mechanics", 16, 5),
    ("MEC1018S", "Introduction to Computer-Aided Design", 6, 5),
    ("MEC1019S", "Introduction to Materials Science and Engineering", 8, 5),
    ("MEC1020W", "Introduction to Mechanical Engineering", 20, 5),
    ("MEC1000X", "Practical Training I", 0, 5),
    ("MEC1003F", "Engineering Drawing", 8, 5),
    ("MEC2000X", "Practical Training II", 0, 7),
    ("MEC2045S", "Applied Engineering Mechanics", 16, 6),
    ("MEC2046F", "Materials Science in Mechanical Engineering", 12, 6),
    ("MEC2047F", "Engineering Dynamics", 16, 6),
    ("MEC2047S", "Engineering Dynamics", 16, 6),
    ("MEC2048S", "Mechanical Engineering Design", 16, 6),
    ("MEC2049F", "Solid Mechanics I", 16, 6),
    ("MEC2050S", "Thermofluids I", 16, 6),
    ("MEC3074F", "Measurement and Actuators", 8, 7),
    ("MEC3075F", "Computer Methods for Mechanical Engineers", 12, 7),
    ("MEC3076F", "Stress Analysis and Materials", 16, 7),
    ("MEC3077F", "Thermofluids II", 16, 7),
    ("MEC3078S", "Mechanics of Machines", 8, 7),
    ("MEC3079S", "Control Systems", 12, 8),
    ("MEC3080S", "Thermofluids III", 16, 7),
    ("MEC3081S", "Manufacturing Sciences", 12, 7),
    ("MEC3082S", "Mechanical Engineering Machine Element Design", 16, 7),
    ("MEC3083W", "Engineer in Society", 16, 8),
    ("MEC4047F", "Mechanical Vibrations", 12, 8),
    ("MEC4108S", "System Design", 12, 8),
    ("MEC4123F", "Engineer in Business", 16, 8),
    ("MEC4124W", "Engineering Product Design", 22, 8),
    ("MEC4125F", "Thermofluids IV", 20, 8),
    ("MEC4126F", "Integrating Embedded Systems", 16, 8),
    ("MEC4127F", "Mechatronic Systems", 16, 8),
    ("MEC4128Z", "Final Year Engineering Project", 20, 8),

    # Faculty-wide (END)
    ("END1019Z", "Ethics and Engineering", 0, 5),

    # Cross-faculty courses commonly used by EBE students
    # (these reference other faculties but appear in EBE curricula)

    # Accounting (ACC) — Commerce
    ("ACC1021F", "Accounting for Business I", 15, 5),
    ("ACC2042H", "Accounting for Construction", 24, 6),

    # Chemistry (CEM) — Science
    ("CEM1000W", "Chemistry 1000", 36, 5),

    # Civil Engineering (CIV) — own faculty, missing from main list
    ("CIV1006S", "Introduction to Civil Engineering", 18, 5),

    # Commercial Law (CML) — Law
    ("CML1001F", "Business Law", 18, 5),
    ("CML2005F", "Construction Law", 18, 6),
    ("CML4607F", "Construction Law (Advanced)", 18, 8),

    # Computer Science (CSC) — Science
    ("CSC1015F", "Computer Science 1015", 18, 5),
    ("CSC1015S", "Computer Science 1015", 18, 5),
    ("CSC1016S", "Computer Science 1016", 18, 5),
    ("CSC1017S", "Computer Science 1017", 18, 5),
    ("CSC1019F", "Computer Science 1019", 18, 5),
    ("CSC2001F", "Data Structures", 24, 6),
    ("CSC2002S", "Data Structures", 24, 6),

    # Economics (ECO) — Commerce
    ("ECO1007S", "Economics for Engineers", 18, 5),
    ("ECO1008F", "Microeconomics I", 18, 5),
    ("ECO1009S", "Macroeconomics I", 18, 5),

    # Electrical Engineering (EEE) — own faculty, missing from main list
    ("EEE2046S", "Signals and Systems I", 24, 6),

    # Environmental & Geographical Science (EGS) — Science
    ("EGS1005F", "Introduction to Environmental Science", 18, 5),

    # Finance and Tax (FTX) — Commerce
    ("FTX2020F", "Business Finance", 18, 6),

    # Geological Sciences (GEO) — Science
    ("GEO1008F", "Introduction to Earth and Environmental Sciences", 18, 5),
    ("GEO1010F", "Geology for Engineers", 18, 5),

    # Mathematics (MAM) — Science
    ("MAM1010F", "Mathematics I (Commerce/Humanities)", 18, 5),
    ("MAM1020F", "Mathematics for Engineers I", 18, 5),
    ("MAM1021S", "Mathematics for Engineers II", 18, 5),
    ("MAM2083F", "Differential Equations", 12, 6),
    ("MAM2083S", "Differential Equations", 12, 6),
    ("MAM2084F", "Linear Algebra", 12, 6),
    ("MAM2084S", "Linear Algebra", 12, 6),

    # Mechanical Engineering (MEC) — own faculty, missing from main list
    ("MEC1010F", "Introduction to Mechanical Engineering", 18, 5),

    # Physics (PHY) — Science
    ("PHY1012F", "Physics A for Engineers", 18, 5),
    ("PHY1013S", "Physics B for Engineers", 18, 5),
    ("PHY1031F", "Physics for Geomatics", 18, 5),
    ("PHY1032S", "Physics for Geomatics", 18, 5),
    ("PHY2010S", "Electronics", 24, 6),

    # Statistics (STA) — Science
    ("STA1000S", "Statistics 1000", 18, 5),
    ("STA1008F", "Statistics for Engineers", 18, 5),
    ("STA1008S", "Statistics for Engineers", 18, 5),
    ("STA2020S", "Applied Statistics", 24, 6),
]

# Remove duplicates by code (keep first occurrence)
seen = set()
courses = []
for code, title, credits, nqf in courses_raw:
    if code not in seen:
        seen.add(code)
        courses.append((code, title, credits, nqf))

# Sort by code
courses.sort(key=lambda x: x[0])

# Build course index
course_index = {
    "$schema": "handbook-course-index-v1",
    "faculty": "engineering",
    "year": 2026,
    "total_courses": len(courses),
    "courses": []
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
    # Flag cross-faculty courses
    cross_faculty_prefixes = {
        "ACC": "commerce", "BUS": "commerce", "ECO": "commerce", "FTX": "commerce",
        "INF": "commerce", "CML": "law", "PBL": "law", "PVL": "law",
        "BIO": "science", "CEM": "science", "CSC": "science", "EGS": "science",
        "GEO": "science", "MAM": "science", "PHY": "science", "STA": "science",
        "HUB": "health-sciences", "ASL": "humanities", "HST": "humanities",
        "PHI": "humanities", "POL": "humanities", "SOC": "humanities"
    }
    if prefix in cross_faculty_prefixes:
        entry["is_ebe_course"] = False
        entry["offered_by_faculty"] = cross_faculty_prefixes[prefix]

    course_index["courses"].append(entry)

# ============================================================
# PROGRAMMES / MAJORS
# ============================================================

programmes = [
    {
        "id": "bas",
        "programme_code": "EB012APG01",
        "name": "Bachelor of Architectural Studies",
        "abbreviation": "BAS",
        "department": "Architecture, Planning and Geomatics",
        "duration_years": 3,
        "minimum_credits": 376,
        "saqa_id": 3933,
        "curriculum": {
            "year_1": {
                "core": ["APG1003W", "APG1004F", "APG1005S", "APG1020W", "APG1021W"],
                "credits": 120
            },
            "year_2": {
                "core": ["APG2000F", "APG2003S", "APG2009F", "APG2021W", "APG2043F", "APG2039W", "APG2042Z", "APG2027X"],
                "credits": 128
            },
            "year_3": {
                "core": ["APG3000Z", "APG3023W", "APG3028X", "APG3034Z", "APG3035F", "APG3036F", "APG3037W", "APG3041Z"],
                "credits": 128
            }
        },
        "notes": [
            "Core courses are sequential",
            "Theory of Structures courses (APG2009F and APG3035F) are sequential",
            "Mandatory Fieldwork: APG1003W, APG2021W, APG1020W, APG2039W, APG3037W"
        ]
    },
    {
        "id": "bsc-geomatics-surveying-4yr",
        "programme_code": "EB019APG09",
        "name": "Bachelor of Science in Geomatics: Surveying Stream 4-year curriculum",
        "abbreviation": "BSc(Geomatics)",
        "department": "Architecture, Planning and Geomatics",
        "duration_years": 4,
        "minimum_credits": 519,
        "saqa_id": 116420,
        "curriculum": {
            "year_1": {
                "core": ["APG1024F", "CSC1017S", "GEO1010F", "MAM1020F", "MAM1021S", "APG1023S", "STA1008S", "PHY1031F"],
                "credits": 117
            },
            "year_2": {
                "core": ["APG2014S", "APG2015F", "APG2019X", "APG2040F", "APG2041S", "MAM2083S", "MAM2084F", "PHY1031F", "PHY1032S"],
                "credits": 148
            },
            "year_3": {
                "core": ["APG3012S", "APG3013F", "APG3016C", "APG3017D", "APG3027Z", "APG3033W", "APG3038F", "APG3040C"],
                "elective_credits": 12,
                "credits": 154
            },
            "year_4": {
                "core": ["APG4001S", "APG4002Z", "APG4003Z", "APG4005F", "APG4010X", "APG4011F", "APG4012S"],
                "credits": 150
            }
        }
    },
    {
        "id": "bsc-eng-chemical-4yr",
        "programme_code": "EB001CHE01",
        "name": "Bachelor of Science in Engineering in Chemical Engineering 4-year curriculum",
        "abbreviation": "BSc(Eng)(Chemical)",
        "department": "Chemical Engineering",
        "duration_years": 4,
        "minimum_credits": 560,
        "saqa_id": 13983,
        "curriculum": {
            "year_1": {
                "core": ["CEM1000W", "CHE1006F", "CHE1007S", "MAM1020F", "MAM1021S", "PHY1012F", "STA1008S"],
                "credits": 138
            },
            "year_2": {
                "core": ["CHE2000X", "CHE2005W", "MAM2083S", "MAM2084F"],
                "elective_credits": "0-48",
                "credits": "108-156"
            },
            "year_3": {
                "core": ["CHE3006F", "CHE3007S", "CHE3008S", "CHE3000X"],
                "elective_credits": "16-58",
                "credits": "114-156"
            },
            "year_4": {
                "core": ["CHE4036Z", "CHE4045Z", "CHE4048F", "CHE4049F"],
                "elective_credits": "16-34",
                "credits": "128-146"
            }
        },
        "elective_categories": {
            "science_electives": {
                "minimum_credits": 42,
                "minimum_nqf6_credits": 24
            },
            "humanities_electives": {
                "minimum_credits": 15
            },
            "advanced_engineering_electives": {
                "minimum_credits": 32,
                "minimum_nqf8_credits": 16
            },
            "free_elective": {
                "minimum_credits": 15
            }
        }
    },
    {
        "id": "bsc-eng-civil-4yr",
        "programme_code": "EB002CIV01",
        "name": "Bachelor of Science in Engineering in Civil Engineering 4-year curriculum",
        "abbreviation": "BSc(Eng)(Civil)",
        "department": "Civil Engineering",
        "duration_years": 4,
        "minimum_credits": 576,
        "saqa_id": 13974,
        "curriculum": {
            "year_1": {
                "core": ["CIV1013S", "CIV1008F", "CIV1012S", "CIV1011S", "MAM1020F", "MAM1021S", "CIV1014Z", "CIV1009F", "APG1023S", "PHY1012F", "GEO1008F"],
                "credits": 140
            },
            "year_2": {
                "core": ["CIV2044F", "CIV2045F", "CIV2046F", "CIV2047Z", "CIV2048S", "CIV2049Z", "CIV2050Z", "CIV2051S", "MAM2083F", "STA1008F", "CSC1015S", "ECO1007S"],
                "credits": 144
            },
            "year_3": {
                "core": ["CIV3042F", "CIV3043F", "CIV3044F", "CIV3045S", "CIV3046S", "CIV3047S", "CIV3048F", "CIV3049S", "ECO1007S"],
                "humanities_elective_credits": 18,
                "credits": 152
            },
            "year_4": {
                "core": ["CIV4035C", "CIV4041F", "CIV4042F", "CIV4044S", "CIV4045F", "CIV4046F", "CIV2020X", "EGS1005F"],
                "credits": 144
            }
        }
    },
    {
        "id": "bsc-construction-studies",
        "programme_code": "EB015CON04",
        "name": "Bachelor of Science in Construction Studies",
        "abbreviation": "BSc(ConstStudies)",
        "department": "Construction Economics and Management",
        "duration_years": 3,
        "minimum_credits": 422,
        "saqa_id": 11703,
        "curriculum": {
            "year_1": {
                "core": ["ACC1021F", "CIV1006S", "CON1004W", "CON1010S", "ECO1008F", "ECO1009S", "MAM1010F", "MEC1010F", "STA1000S", "CON1007X"],
                "credits": 145
            },
            "year_2": {
                "core": ["ACC2042H", "APG1023S", "CML1001F", "CML2005F", "CON2006W", "CON2020S", "CON2034S", "CON2037W", "CON2013X"],
                "credits": 141
            },
            "year_3": {
                "core": ["CON3012W", "CON3030F", "CON3031W", "CON3032W", "CON3033S", "CON3038W", "CON3043W", "CON3022X"],
                "credits": 136
            }
        }
    },
    {
        "id": "bsc-property-studies",
        "programme_code": "EB017CON03",
        "name": "Bachelor of Science in Property Studies",
        "abbreviation": "BSc(PropStudies)",
        "department": "Construction Economics and Management",
        "duration_years": 3,
        "minimum_credits": 452,
        "saqa_id": 11693,
        "curriculum": {
            "year_1": {
                "core": ["CON1021F", "CON1022F", "CON1023S", "CON1024S", "CON1025S", "ECO1008F", "ECO1009S", "MAM1010F", "STA1000S"],
                "credits": 142
            },
            "year_2": {
                "core": ["ACC1021F", "CML1001F", "CON2032S", "CON2033F", "CON2034S", "CON2035S", "CON2036F", "FTX2020F", "STA2020S"],
                "credits": 143
            },
            "year_3": {
                "core": ["CON3046S", "CON3047F", "CON3048F", "CON3050F", "CON3051F", "CON3052S", "CON3053S", "CON3054S", "CSC1015F"],
                "credits": 126
            }
        }
    },
    {
        "id": "bsc-eng-electrical-4yr",
        "programme_code": "EB009EEE01",
        "name": "Bachelor of Science in Engineering in Electrical Engineering 4-year curriculum",
        "abbreviation": "BSc(Eng)(Electrical)",
        "department": "Electrical Engineering",
        "duration_years": 4,
        "minimum_credits": 560,
        "saqa_id": 13979,
        "curriculum": {
            "year_1": {
                "core": ["CSC1015F", "EEE1008F", "MAM1020F", "PHY1012F", "CSC1016S", "EEE1009S", "MAM1021S", "PHY1013S", "EEE1000X"],
                "credits": 132
            },
            "year_2": {
                "core": ["EEE2045F", "EEE2046F", "MAM2083F", "MEC1003F", "MEC1009F", "EEE2044S", "MAM2084S", "PHY2010S", "EEE2047S", "EEE2048S"],
                "credits": 144
            },
            "year_3": {
                "core": ["EEE3088F", "EEE3089F", "EEE3090F", "EEE3091F", "EEE3092F", "EEE3093S", "EEE3094S", "EEE3098S", "EEE3100S", "EEE3000X"],
                "complementary_studies_credits": 18,
                "credits": 146
            },
            "year_4": {
                "core": ["EEE4113F", "CML4607F", "EEE4125C", "EEE4124C", "EEE4022S"],
                "elective_core_credits": 48,
                "credits": 138
            }
        }
    },
    {
        "id": "bsc-eng-elec-computer-4yr",
        "programme_code": "EB022EEE02",
        "name": "Bachelor of Science in Engineering in Electrical and Computer Engineering 4-year curriculum",
        "abbreviation": "BSc(Eng)(Elec&Comp)",
        "department": "Electrical Engineering",
        "duration_years": 4,
        "minimum_credits": 560,
        "saqa_id": 66518,
        "curriculum": {
            "year_1": {
                "core": ["CSC1015F", "EEE1008F", "MAM1020F", "PHY1012F", "CSC1016S", "EEE1009S", "MAM1021S", "PHY1013S", "EEE1000X"],
                "credits": 132
            },
            "year_2": {
                "core": ["EEE2045F", "EEE2046F", "MEC1003F", "MAM2083F", "MEC1009F", "EEE2044S", "EEE2047S", "MAM2084S", "EEE2048S", "PHY2010S"],
                "credits": 136
            },
            "year_3": {
                "core": ["CSC2001F", "EEE3088F", "EEE3089F", "EEE3090F", "EEE3092F", "EEE3096S", "EEE3097S", "EEE3000X"],
                "elective_core": ["CSC2002S", "EEE3093S", "EEE3094S"],
                "complementary_studies_credits": 18,
                "credits": "154-162"
            },
            "year_4": {
                "core": ["EEE4113F", "CML4607F", "EEE4125C", "EEE4124C", "EEE4022S"],
                "elective_core_credits": 48,
                "credits": 138
            }
        }
    },
    {
        "id": "bsc-eng-mechatronics-4yr",
        "programme_code": "EB011EEE05",
        "name": "Bachelor of Science in Engineering in Mechatronics 4-year curriculum",
        "abbreviation": "BSc(Eng)(Mechatronics)",
        "department": "Electrical Engineering",
        "duration_years": 4,
        "minimum_credits": 560,
        "saqa_id": 13980,
        "curriculum": {
            "year_1": {
                "core": ["CSC1015F", "EEE1008F", "MAM1020F", "PHY1012F", "CSC1016S", "EEE1009S", "MAM1021S", "PHY1013S", "EEE1000X"],
                "credits": 132
            },
            "year_2": {
                "core": ["EEE2045F", "EEE2046F", "EEE2048S", "MAM2083F", "MEC1003F", "MEC1009F", "EEE2044S", "EEE2047S", "MAM2084S", "PHY2010S"],
                "credits": 136
            },
            "year_3": {
                "core": ["EEE3088F", "EEE3090F", "EEE3091F", "EEE3092F", "MEC2047F", "EEE3096S", "EEE3094S", "EEE3099S", "MEC2045S"],
                "complementary_studies_credits": 18,
                "credits": 146
            },
            "year_4": {
                "core": ["EEE4113F", "CML4607F", "EEE4124C", "EEE4125C", "EEE4022S"],
                "elective_core_credits": 48,
                "credits": 138
            }
        }
    },
    {
        "id": "bsc-eng-mechanical-4yr",
        "programme_code": "EB005MEC01",
        "name": "Bachelor of Science in Engineering in Mechanical Engineering 4-year curriculum",
        "abbreviation": "BSc(Eng)(Mechanical)",
        "department": "Mechanical Engineering",
        "duration_years": 4,
        "minimum_credits": 560,
        "saqa_id": 13977,
        "curriculum": {
            "year_1": {
                "core": ["MAM1020F", "MAM1021S", "MEC1007F", "MEC1009S", "MEC1018S", "MEC1019S", "MEC1020W", "PHY1012F", "PHY1013S"],
                "credits": 130
            },
            "year_2": {
                "core": ["CSC1019F", "EEE2041F", "EEE2042S", "MAM2083F", "MAM2084S", "MEC1000X", "MEC2046F", "MEC2047S", "MEC2048S", "MEC2049F", "MEC2050S"],
                "credits": 144
            },
            "year_3": {
                "core": ["MEC2000X", "MEC3074F", "MEC3075F", "MEC3076F", "MEC3077F", "MEC3078S", "MEC3079S", "MEC3080S", "MEC3081S", "MEC3082S", "MEC3083W", "STA1008F"],
                "credits": 144
            },
            "year_4": {
                "core": ["MEC4047F", "MEC4108S", "MEC4123F", "MEC4124W", "MEC4125F", "MEC4128Z"],
                "complementary_studies_credits": 15,
                "open_elective_credits": 27,
                "credits": 144
            }
        }
    },
    {
        "id": "bsc-eng-mech-mechatronic-4yr",
        "programme_code": "EB010MEC05",
        "name": "Bachelor of Science in Engineering in Mechanical & Mechatronic Engineering 4-year curriculum",
        "abbreviation": "BSc(Eng)(Mech&Mechatronic)",
        "department": "Mechanical Engineering",
        "duration_years": 4,
        "minimum_credits": 560,
        "saqa_id": 13982,
        "curriculum": {
            "year_1": {
                "core": ["MAM1020F", "MAM1021S", "MEC1007F", "MEC1009S", "MEC1018S", "MEC1019S", "MEC1020W", "PHY1012F", "PHY1013S"],
                "credits": 130
            },
            "year_2": {
                "core": ["CSC1019F", "EEE2041F", "EEE2042S", "MAM2083F", "MAM2084S", "MEC1000X", "MEC2046F", "MEC2047S", "MEC2048S", "MEC2049F", "MEC2050S"],
                "credits": 144
            },
            "year_3": {
                "core": ["EEE2046S", "MEC2000X", "MEC3074F", "MEC3075F", "MEC3076F", "MEC3077F", "MEC3078S", "MEC3079S", "MEC3080S", "MEC3081S", "MEC3082S", "MEC3083W", "STA1008F"],
                "credits": 144
            },
            "year_4": {
                "core": ["MEC4047F", "MEC4108S", "MEC4123F", "MEC4124W", "MEC4126F", "MEC4127F", "MEC4128Z"],
                "complementary_studies_credits": 15,
                "open_elective_credits": 15,
                "credits": 144
            }
        }
    }
]

# ============================================================
# FACULTY RULES (from pages 13-21)
# ============================================================

faculty_rules = {
    "$schema": "handbook-rules-v1",
    "faculty": "engineering",
    "year": 2026,
    "rules": {
        "admission": {
            "FB1": "Candidates must hold: (a) NSC endorsed by Umalusi for degree study; (b) senior certificate with matric endorsement; (c) certificate of complete/conditional exemption from Matriculation Board; or (d) a recognised degree."
        },
        "duration": {
            "FB2.1": "BAS, BSc(ConstStudies), BSc(PropStudies): minimum 3 academic years.",
            "FB2.2": "BSc(Eng), BSc(Geomatics): minimum 4 academic years."
        },
        "curriculum": {
            "FB3.1": "Candidates must comply with curriculum and course requirements prescribed by Senate.",
            "FB3.2": "Minimum 560 credits for 4-year degrees, 432 credits for 3-year degrees.",
            "FB3.3": "Curriculum subject to approval of Dean and Head of Department.",
            "FB3.4": "Timetable clashes not allowed. Priority given to courses in arrears.",
            "FB3.5": "Cannot withdraw from a repeating course without Dean's permission."
        },
        "credit_exemption": {
            "FB4.1": "Credit/exemption may be granted per Rules GB2 and GB3.",
            "FB4.2": "Course credits older than 10 years cannot be carried forward without special Senate permission."
        },
        "progress": {
            "FB5": "Academic year determined by expected graduation year."
        },
        "assessment": {
            "FB6.1": "Courses assessed by formal examination or review with satisfactory DP performance.",
            "FB6.2": "Formal examination: written/oral examination, tutorials, class tests, term papers.",
            "FB6.3": "DP certificate may be withheld if work incomplete or attendance unsatisfactory.",
            "FB6.4": "DP courses: pass/fail result (PA or DPR).",
            "FB6.5": "Review: assessment by internal examiner(s) of coursework."
        },
        "supplementary_examinations": {
            "FB7.1": "Senate may permit supplementary exams: must have DP and at least 45%.",
            "FB7.1_note": "Chemical Engineering courses with mandatory reassessments do not offer supplementaries.",
            "FB7.2": "TRP: Tutored Reassessment Programme for marks 40-44%, with mandatory attendance.",
            "FB7.3": "Senate may permit one additional assessment for one course in final year preventing graduation (min 45%)."
        },
        "readmission": {
            "FB8.1_BAS": "Cannot renew if: fail major course, fail any course more than once, fail 80% of credits, or cannot complete in 4 years. Min 64 credits/year.",
            "FB8.2_ChemEng4yr": "Cannot renew if: first year fail to get 102 credits (FECR at 66); subsequent years fail 108 credits.",
            "FB8.3_ChemEng5yr": "Cannot renew if: first year fail to get 66 credits (FECR at 48); subsequent years fail 82 credits.",
            "FB8.8_CivEng4yr": "Cannot renew if: first year fail 112 credits (FECR 68, must pass MAM1020F/S and PHY1012F/S plus 32 from others); subsequent years 112 credits.",
            "FB8.10_ElecEng4yr": "Cannot renew if: first year fail 96 credits (FECR 66); subsequent years 116 or 112 credits depending on curriculum.",
            "FB8.11_MechEng4yr": "Cannot renew if: first year fail 116 credits (FECR 90); subsequent years 116 credits."
        },
        "distinction": {
            "FB9.1_BAS": "First class pass in Design & Theory Studio III Exam and first class pass or second class (Div 1) in another Studio Exam, plus 3 additional first class passes.",
            "FB9.2_BSc_Eng_Geomatics": "Complete in minimum time, at least first class in research project, and for honours: second class in research project. CWA 65% for honours, 75% for first class honours.",
            "FB9.3_ConstStudies_PropStudies": "Minimum CWA of 75%."
        }
    }
}

# ============================================================
# EQUIVALENCES
# ============================================================

equivalences = {
    "$schema": "handbook-equivalences-v1",
    "faculty": "engineering",
    "year": 2026,
    "equivalences": [
        {
            "type": "extended_curriculum",
            "standard": "MAM1020F",
            "extended": "MAM1023F",
            "note": "ASPECT extended version of Mathematics IA for Engineers"
        },
        {
            "type": "extended_curriculum",
            "standard": "MAM1021S",
            "extended": "MAM1024S",
            "note": "ASPECT extended version of Mathematics IB for Engineers"
        },
        {
            "type": "extended_curriculum",
            "standard": "PHY1012F",
            "extended": "PHY1014F",
            "note": "ASPECT extended version of Physics A for Engineers"
        },
        {
            "type": "extended_curriculum",
            "standard": "PHY1013S",
            "extended": "PHY1015S",
            "note": "ASPECT extended version of Physics B for Engineers"
        },
        {
            "type": "extended_curriculum",
            "standard": "MAM2083S",
            "extended": "MAM2083S",
            "aspect_version": "MAM2085F",
            "note": "Vector Calculus for ASPECT students taken as MAM2085F"
        },
        {
            "type": "extended_curriculum",
            "standard": "MAM2084F",
            "aspect_version": "MAM2084S",
            "note": "Linear Algebra for ASPECT students taken in S2 as MAM2084S"
        },
        {
            "type": "cross_programme",
            "course": "CIV1006S",
            "equivalent": "CIV1008F",
            "note": "Building Science I (Construction Studies) vs Introduction to Civil Engineering"
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

# Course index
write_json('courses/_index.json', course_index)

# Majors/programmes
for prog in programmes:
    pid = prog['id']
    write_json(f'majors/{pid}.json', prog)

# Faculty rules
write_json('rules/faculty_rules.json', faculty_rules)

# Equivalences
write_json('equivalences.json', equivalences)

print(f"\nDone! Created {len(courses)} courses, {len(programmes)} programmes")
print(f"EBE-native courses: {sum(1 for c in course_index['courses'] if c.get('is_ebe_course') is not False)}")
print(f"Cross-faculty courses: {sum(1 for c in course_index['courses'] if c.get('is_ebe_course') is False)}")
