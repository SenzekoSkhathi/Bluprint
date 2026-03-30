"""
Build individual course JSON files for Engineering and Built Environment faculty.

This script reads courses/_index.json and generates one handbook-course-v1 file per
course code so Engineering matches the per-course layout used by Science and Commerce.
"""
import json
import os

BASE = os.path.join(
    os.path.dirname(__file__), "..", "data", "handbook", "faculties", "engineering"
)


def year_level(code):
    for c in code:
        if c.isdigit():
            return int(c)
    return 0


def semester_from_suffix(code):
    suffix = code[-1] if code else ""
    m = {
        "F": "S1",
        "S": "S2",
        "W": "FY",
        "H": "FY",
        "X": "varies",
        "Z": "varies",
        "M": "varies",
        "L": "winter",
        "U": "summer",
        "P": "summer",
        "A": "Q1",
        "B": "Q2",
        "C": "Q3",
        "D": "Q4",
        "J": "summer",
    }
    return m.get(suffix, "varies")


DEPT_SLUGS = {
    "ACC": "accounting",
    "APG": "architecture-planning-geomatics",
    "CEM": "chemistry",
    "CHE": "chemical-engineering",
    "CIV": "civil-engineering",
    "CML": "commercial-law",
    "CON": "construction-economics-and-management",
    "CSC": "computer-science",
    "ECO": "economics",
    "EEE": "electrical-engineering",
    "EGS": "environmental-and-geographical-science",
    "END": "engineering-faculty",
    "FTX": "finance-and-tax",
    "GEO": "geological-sciences",
    "MAM": "mathematics-and-applied-mathematics",
    "MEC": "mechanical-engineering",
    "PHY": "physics",
    "STA": "statistical-sciences",
}

CROSS_FACULTY_PREFIXES = {
    "ACC": "commerce",
    "CML": "law",
    "CSC": "science",
    "ECO": "commerce",
    "EGS": "science",
    "FTX": "commerce",
    "CEM": "science",
    "GEO": "science",
    "MAM": "science",
    "PHY": "science",
    "STA": "science",
}


def write_json(path, data):
    full = os.path.join(BASE, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def main():
    index_path = os.path.join(BASE, "courses", "_index.json")
    with open(index_path, "r", encoding="utf-8") as f:
        index_data = json.load(f)

    courses = index_data.get("courses", [])
    print(f"Read {len(courses)} Engineering courses from _index.json")

    generated = 0
    for entry in courses:
        code = entry["code"]
        title = entry["title"]
        prefix = entry.get("department_prefix", "")
        semester_code = code[-1]
        is_cross = prefix in CROSS_FACULTY_PREFIXES

        course_file = {
            "$schema": "handbook-course-v1",
            "code": code,
            "title": title,
            "department": DEPT_SLUGS.get(prefix, prefix.lower()),
            "credits": entry["nqf_credits"],
            "nqf_level": entry["nqf_level"],
            "year_level": entry.get("year_level", year_level(code)),
            "semester": entry.get("semester", semester_from_suffix(code)),
            "semester_code": semester_code,
            "convener": "See 2026 EBE Faculty Handbook",
            "prerequisites": {
                "text": "Refer to the programme and departmental sections in the 2026 EBE Faculty Handbook.",
                "parsed": {"type": "see_handbook", "codes": []},
            },
            "corequisites": [],
            "outline": "Course title and credit value verified from the 2026 EBE Faculty Handbook.",
            "lecture_times": "See departmental timetable and official class schedule.",
            "dp_requirements": "See 2026 EBE Faculty Handbook.",
            "assessment": "See departmental and faculty assessment rules in the 2026 EBE Faculty Handbook.",
            "is_engineering_course": not is_cross,
        }

        if is_cross:
            course_file["offered_by_faculty"] = CROSS_FACULTY_PREFIXES[prefix]

        write_json(f"courses/{code}.json", course_file)
        generated += 1

    print(f"Generated {generated} individual Engineering course files")


if __name__ == "__main__":
    main()
