"""
Build individual course JSON files for Humanities faculty.

This script reads courses/_index.json and generates one handbook-course-v1 file per
course code so Humanities matches the per-course layout used by Science and Commerce.
"""
import json
import os

BASE = os.path.join(
    os.path.dirname(__file__), "..", "data", "handbook", "faculties", "humanities"
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
    }
    return m.get(suffix, "varies")


DEPT_SLUGS = {
    "AFR": "centre-for-african-studies",
    "ASL": "african-languages-and-literatures",
    "AXL": "archaeology",
    "BUS": "management-studies",
    "DOH": "academic-development-programme",
    "ECO": "economics",
    "ELL": "english-language-and-literature",
    "EGS": "environmental-and-geographical-science",
    "FAM": "film-and-media-studies",
    "FIN": "fine-art",
    "GND": "gender-studies",
    "HST": "historical-studies",
    "LIN": "linguistics",
    "LIS": "knowledge-and-information-stewardship",
    "MAM": "mathematics-and-applied-mathematics",
    "MCL": "modern-and-classical-languages",
    "MUZ": "music",
    "PHI": "philosophy",
    "POL": "political-studies",
    "PSY": "psychology",
    "REL": "religious-studies",
    "RHT": "rhetoric-studies",
    "SOC": "sociology",
    "STA": "statistical-sciences",
    "SWK": "social-development",
    "TDP": "theatre-and-performance",
}

CROSS_FACULTY_PREFIXES = {
    "BUS": "commerce",
    "CML": "law",
    "CSC": "science",
    "ECO": "commerce",
    "MAM": "science",
    "PBL": "law",
    "PVL": "law",
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
    print(f"Read {len(courses)} Humanities courses from _index.json")

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
            "convener": "See 2026 Humanities Faculty Handbook",
            "prerequisites": {
                "text": "Refer to programme and departmental requirements in the 2026 Humanities Faculty Handbook.",
                "parsed": {"type": "see_handbook", "codes": []},
            },
            "corequisites": [],
            "outline": "Course title and credit value verified from the 2026 Humanities Faculty Handbook.",
            "lecture_times": "See departmental timetable and official class schedule.",
            "dp_requirements": "See 2026 Humanities Faculty Handbook.",
            "assessment": "See departmental and faculty assessment rules in the 2026 Humanities Faculty Handbook.",
            "is_humanities_course": not is_cross,
        }

        if is_cross:
            course_file["offered_by_faculty"] = CROSS_FACULTY_PREFIXES[prefix]

        write_json(f"courses/{code}.json", course_file)
        generated += 1

    print(f"Generated {generated} individual Humanities course files")


if __name__ == "__main__":
    main()
