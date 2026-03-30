"""
Build individual course JSON files for Health Sciences faculty.

This script reads courses/_index.json and generates one handbook-course-v1 file per
course code so Health Sciences matches the per-course layout used by Science and Commerce.
"""
import json
import os

BASE = os.path.join(
    os.path.dirname(__file__), "..", "data", "handbook", "faculties", "health-sciences"
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
    "AAE": "anaesthesia-and-perioperative-medicine",
    "AHS": "health-and-rehabilitation-sciences",
    "ASL": "african-languages-and-literatures",
    "CEM": "chemistry",
    "CHM": "surgery",
    "CSC": "computer-science",
    "FCE": "family-community-and-emergency-care",
    "HSE": "health-sciences-education",
    "HUB": "human-biology",
    "IBS": "integrative-biomedical-sciences",
    "MAM": "mathematics-and-applied-mathematics",
    "MDN": "medicine",
    "OBS": "obstetrics-and-gynaecology",
    "PED": "paediatrics-and-child-health",
    "PHY": "physics",
    "PPH": "public-health",
    "PRY": "psychiatry-and-mental-health",
    "PSY": "psychology",
    "PTY": "pathology",
    "RAY": "radiation-medicine",
    "SLL": "language-studies",
    "STA": "statistical-sciences",
}

CROSS_FACULTY_PREFIXES = {
    "ASL": "humanities",
    "CEM": "science",
    "CSC": "science",
    "MAM": "science",
    "PHY": "science",
    "PSY": "humanities",
    "SLL": "humanities",
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
    print(f"Read {len(courses)} Health Sciences courses from _index.json")

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
            "convener": "See 2026 Health Sciences Faculty Handbook",
            "prerequisites": {
                "text": "Refer to the programme and departmental sections in the 2026 Health Sciences Faculty Handbook.",
                "parsed": {"type": "see_handbook", "codes": []},
            },
            "corequisites": [],
            "outline": "Course title and credit value verified from the 2026 Health Sciences Faculty Handbook.",
            "lecture_times": "See module block schedule and official class timetable.",
            "dp_requirements": "See 2026 Health Sciences Faculty Handbook.",
            "assessment": "See departmental and faculty assessment rules in the 2026 Health Sciences Faculty Handbook.",
            "is_health_sciences_course": not is_cross,
        }

        if is_cross:
            course_file["offered_by_faculty"] = CROSS_FACULTY_PREFIXES[prefix]

        write_json(f"courses/{code}.json", course_file)
        generated += 1

    print(f"Generated {generated} individual Health Sciences course files")


if __name__ == "__main__":
    main()
