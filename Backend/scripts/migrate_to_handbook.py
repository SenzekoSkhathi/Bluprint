#!/usr/bin/env python
"""
Migrate existing AI-extracted handbook data into the new structured handbook file system.

Reads from:
  - Backend/data/courses/*.verified.json  (13 department files)
  - Backend/data/majors/*.verified.json   (1 majors file)
  - Backend/data/rules/*.rules.json       (1 rules file)

Writes to:
  - Backend/data/handbook/faculties/science/courses/{CODE}.json + _index.json
  - Backend/data/handbook/faculties/science/majors/{CODE}-{name}.json + _index.json
  - Backend/data/handbook/faculties/science/rules/*.json (split rule files)
"""

import json
import os
import re
import sys
from pathlib import Path

# Paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
COURSE_SRC = DATA_DIR / "courses"
MAJORS_SRC = DATA_DIR / "majors"
RULES_SRC = DATA_DIR / "rules"
HANDBOOK_DIR = DATA_DIR / "handbook" / "faculties" / "science"

# Department name normalization
DEPT_MAP = {
    "Department of Archaeology": "archaeology",
    "Department of Astronomy": "astronomy",
    "Department of Biological Sciences": "biological-sciences",
    "Department of Chemistry": "chemistry",
    "Department of Computer Science": "computer-science",
    "Department of Environmental and Geographical Science": "environmental-geographical-science",
    "Department of Geological Sciences": "geological-sciences",
    "Department of Mathematics and Applied Mathematics": "mathematics-applied-mathematics",
    "Department of Molecular and Cell Biology": "molecular-cell-biology",
    "Department of Oceanography": "oceanography",
    "Department of Physics": "physics",
    "Department of Statistical Sciences": "statistical-sciences",
    "Multiple (offered by other faculties)": "other-faculties",
}


def normalize_dept(raw_dept: str) -> str:
    """Normalize department name to a slug."""
    if raw_dept in DEPT_MAP:
        return DEPT_MAP[raw_dept]
    # Fallback: slugify
    slug = raw_dept.lower().replace("department of ", "")
    slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")
    return slug


def extract_semester_code(course_code: str) -> str:
    """Extract semester code (F/S/H/W/Z/P/L) from course code suffix."""
    if not course_code:
        return "unknown"
    last_char = course_code[-1].upper()
    if last_char in ("F", "S", "H", "W", "Z", "P", "L"):
        return last_char
    return "unknown"


def infer_semester(code: str, raw_semester: str) -> str:
    """Infer normalized semester string from code suffix and raw text."""
    suffix = extract_semester_code(code)
    mapping = {
        "F": "S1",
        "S": "S2",
        "H": "FY",  # half-credit full-year
        "W": "FY",  # full-credit full-year
        "Z": "special",
        "P": "summer",
        "L": "winter",
    }
    return mapping.get(suffix, "unknown")


def parse_prerequisites(text) -> dict:
    """
    Parse prerequisite text into a structured AND/OR tree.
    Returns both raw text and parsed structure.
    """
    # Handle case where prerequisites are already a dict
    if isinstance(text, dict):
        return {"text": str(text), "parsed": None}
    if isinstance(text, list):
        return {"text": str(text), "parsed": None}
    if not text or not isinstance(text, str):
        return {"text": "None", "parsed": None}
    if text.strip().lower() in ("none", "n/a", "", "nil"):
        return {"text": text or "None", "parsed": None}

    # Extract course codes from the text
    codes = re.findall(r"[A-Z]{2,4}\d{3,4}[A-Za-z]?(?:/[A-Z])?", text)

    if not codes:
        return {"text": text, "parsed": None}

    # Simple heuristic: if "and" separates codes, it's all required
    # if "or" separates codes, it's choose one
    text_lower = text.lower()

    # Detect OR groups
    if " or " in text_lower and " and " in text_lower:
        # Complex mixed logic - store as text with extracted codes
        return {
            "text": text,
            "parsed": {
                "type": "complex",
                "codes_mentioned": list(dict.fromkeys(codes)),  # dedupe preserving order
                "note": "Complex prerequisite logic - see text"
            }
        }
    elif " or " in text_lower:
        return {
            "text": text,
            "parsed": {
                "type": "or",
                "codes": list(dict.fromkeys(codes))
            }
        }
    elif " and " in text_lower or len(codes) > 1:
        return {
            "text": text,
            "parsed": {
                "type": "and",
                "codes": list(dict.fromkeys(codes))
            }
        }
    else:
        return {
            "text": text,
            "parsed": {
                "type": "and",
                "codes": list(dict.fromkeys(codes))
            }
        }


def migrate_courses():
    """Migrate department course files into per-course JSON files."""
    print("\n=== MIGRATING COURSES ===")

    courses_out = HANDBOOK_DIR / "courses"
    courses_out.mkdir(parents=True, exist_ok=True)

    all_courses = []
    duplicates = {}

    for src_file in sorted(COURSE_SRC.glob("*.verified.json")):
        with open(src_file, encoding="utf-8") as f:
            data = json.load(f)

        courses = data.get("courses", [])
        dept_name = src_file.stem.split(".dept-")[1].replace(".verified", "") if ".dept-" in src_file.stem else "unknown"
        print(f"  {dept_name}: {len(courses)} courses")

        for c in courses:
            code = c.get("course_code", "").strip()
            if not code:
                continue

            # Track duplicates (same course in multiple dept files)
            if code in duplicates:
                duplicates[code].append(dept_name)
                continue
            duplicates[code] = [dept_name]

            dept_normalized = normalize_dept(c.get("department", ""))
            semester_code = extract_semester_code(code)
            semester = infer_semester(code, c.get("semester", ""))
            prereqs = parse_prerequisites(c.get("prerequisites", ""))

            course_json = {
                "$schema": "handbook-course-v1",
                "code": code,
                "title": c.get("course_title", ""),
                "department": dept_normalized,
                "credits": c.get("course_credits", 0),
                "nqf_level": c.get("nqf_level", 0),
                "year_level": c.get("year_level", 0),
                "semester": semester,
                "semester_code": semester_code,
                "convener": c.get("convener", ""),
                "prerequisites": prereqs,
                "corequisites": [],
                "outline": c.get("course_outline", ""),
                "lecture_times": c.get("lecture_times", ""),
                "dp_requirements": c.get("dp_requirements", ""),
                "assessment": c.get("assessment", ""),
                "is_science_course": dept_normalized != "other-faculties",
            }

            # Sanitize code for filename (e.g., CSC1015F/S -> CSC1015F_S)
            safe_code = code.replace("/", "_")

            # Write per-course file
            out_path = courses_out / f"{safe_code}.json"
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(course_json, f, indent=2, ensure_ascii=False)

            # Add to index
            all_courses.append({
                "code": code,
                "title": c.get("course_title", ""),
                "credits": c.get("course_credits", 0),
                "nqf_level": c.get("nqf_level", 0),
                "department": dept_normalized,
                "semester_code": semester_code,
                "year_level": c.get("year_level", 0),
                "is_science_course": dept_normalized != "other-faculties",
            })

    # Sort index by code
    all_courses.sort(key=lambda x: x["code"])

    # Write index
    index = {
        "$schema": "handbook-course-index-v1",
        "faculty": "science",
        "year": 2026,
        "count": len(all_courses),
        "courses": all_courses,
    }
    with open(courses_out / "_index.json", "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)

    # Report duplicates
    dups = {k: v for k, v in duplicates.items() if len(v) > 1}
    if dups:
        print(f"\n  NOTE: {len(dups)} duplicate course codes found (kept first occurrence):")
        for code, depts in sorted(dups.items()):
            print(f"    {code} -> {depts}")

    print(f"\n  TOTAL: {len(all_courses)} unique courses written")
    return all_courses


def migrate_majors():
    """Migrate majors file into per-major JSON files."""
    print("\n=== MIGRATING MAJORS ===")

    majors_out = HANDBOOK_DIR / "majors"
    majors_out.mkdir(parents=True, exist_ok=True)

    # Find the majors file
    majors_files = list(MAJORS_SRC.glob("*.verified.json"))
    if not majors_files:
        print("  ERROR: No majors file found!")
        return []

    with open(majors_files[0], encoding="utf-8") as f:
        data = json.load(f)

    majors = data.get("majors", [])
    print(f"  Found {len(majors)} majors")

    # Known constraints from handbook
    mutual_exclusions = {
        "STA01": ["STA02", "STA13"],  # Applied Stats
        "STA02": ["STA01", "STA13"],  # Mathematical Stats
        "STA13": ["STA01", "STA02"],  # Stats & Data Science
    }
    companion_requirements = {
        "CSC02": ["CSC05"],  # Business Computing requires CS
        "CSC03": ["CSC05"],  # Computer Engineering requires CS
    }
    student_limits = {
        "MCB01": True,  # Biochemistry
        "MCB04": True,  # Genetics
        "HUB17": True,  # Human Anatomy & Physiology
        "GEO02": True,  # Geology
    }

    all_majors = []

    for major in majors:
        code = major.get("major_code", "")
        name = major.get("major_name", "")
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

        major_json = {
            "$schema": "handbook-major-v1",
            "major_code": code,
            "major_name": name,
            "department": normalize_dept(major.get("department", "")),
            "notes": major.get("notes", ""),
            "mutual_exclusions_with": mutual_exclusions.get(code, []),
            "required_companion_majors": companion_requirements.get(code, []),
            "has_student_limit": student_limits.get(code, False),
            "years": major.get("years", []),
        }

        filename = f"{code}-{slug}.json"
        out_path = majors_out / filename
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(major_json, f, indent=2, ensure_ascii=False)

        all_majors.append({
            "major_code": code,
            "major_name": name,
            "department": normalize_dept(major.get("department", "")),
            "filename": filename,
            "mutual_exclusions_with": mutual_exclusions.get(code, []),
            "required_companion_majors": companion_requirements.get(code, []),
            "has_student_limit": student_limits.get(code, False),
        })

        print(f"  {code} - {name}")

    # Write index
    index = {
        "$schema": "handbook-major-index-v1",
        "faculty": "science",
        "year": 2026,
        "count": len(all_majors),
        "majors": all_majors,
    }
    with open(majors_out / "_index.json", "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)

    print(f"\n  TOTAL: {len(all_majors)} majors written")
    return all_majors


def migrate_rules():
    """Split monolithic rules JSON into focused rule files."""
    print("\n=== MIGRATING RULES ===")

    rules_out = HANDBOOK_DIR / "rules"
    rules_out.mkdir(parents=True, exist_ok=True)

    # Find the rules file
    rules_files = list(RULES_SRC.glob("*.rules.json"))
    if not rules_files:
        print("  ERROR: No rules file found!")
        return

    with open(rules_files[0], encoding="utf-8") as f:
        data = json.load(f)

    bsc_rules = data.get("bsc_degree_rules", {})

    # 1. degree-bsc.json — Core BSc requirements
    degree_bsc = {
        "$schema": "handbook-degree-rules-v1",
        "degree_code": "BSc",
        "faculty": "science",
        "year": 2026,
        "duration": bsc_rules.get("duration", {}),
        "registration_limits": bsc_rules.get("registration_limits", {}),
        "curriculum_rules": bsc_rules.get("curriculum_rules", {}),
        "course_code_system": data.get("course_code_system", {}),
        "essential_terminology": data.get("essential_terminology", {}),
        "progression_status_codes": data.get("progression_status_codes", {}),
    }
    _write_rule(rules_out / "degree-bsc.json", degree_bsc)
    print("  degree-bsc.json")

    # 2. readmission-sb001.json — Standard BSc
    readmission_2023 = bsc_rules.get("readmission_rules_from_2023", {})
    sb001 = {
        "$schema": "handbook-readmission-v1",
        "pathway_code": "SB001",
        "applies_to": "Students first registered from 2023",
        "rule_reference": "FB5.1",
        "preceding_year_min_credits": 72,
        "data": readmission_2023.get("bsc_standard_SB001", {}),
    }
    _write_rule(rules_out / "readmission-sb001.json", sb001)
    print("  readmission-sb001.json")

    # 3. readmission-sb016.json — EDP
    sb016 = {
        "$schema": "handbook-readmission-v1",
        "pathway_code": "SB016",
        "applies_to": "Students on Extended Degree Programme, first registered from 2023",
        "rule_reference": "FB5.2",
        "preceding_year_min_credits": 72,
        "preceding_year_min_credits_note": "Unless first year of registration",
        "data": readmission_2023.get("edp_SB016", {}),
    }
    _write_rule(rules_out / "readmission-sb016.json", sb016)
    print("  readmission-sb016.json")

    # 4. readmission-pre2023.json — Legacy rules
    pre2023 = bsc_rules.get("readmission_rules_before_2023", {})
    pre2023_out = {
        "$schema": "handbook-readmission-v1",
        "pathway_code": "pre-2023",
        "applies_to": "Students first registered before 2023",
        "bsc_standard": pre2023.get("bsc_standard", {}),
        "edp": pre2023.get("edp", {}),
    }
    _write_rule(rules_out / "readmission-pre2023.json", pre2023_out)
    print("  readmission-pre2023.json")

    # 5. supplementary-exams.json
    supp = {
        "$schema": "handbook-supplementary-exams-v1",
        "rule_reference": "FB4",
        "data": bsc_rules.get("supplementary_examinations", {}),
    }
    _write_rule(rules_out / "supplementary-exams.json", supp)
    print("  supplementary-exams.json")

    # 6. General readmission rules
    general = {
        "$schema": "handbook-general-readmission-v1",
        "data": bsc_rules.get("general_readmission_rules", {}),
    }
    _write_rule(rules_out / "general-readmission.json", general)
    print("  general-readmission.json")

    # 7. Transfer rules
    transfer = {
        "$schema": "handbook-transfer-v1",
        "rule_reference": "FB6",
        "data": bsc_rules.get("transfer_from_other_faculties", {}),
    }
    _write_rule(rules_out / "transfer.json", transfer)
    print("  transfer.json")

    print("\n  NOTE: distinction.json, deans-merit-list.json, non-science-electives.json")
    print("  must be hand-encoded from handbook PDF (not in extracted rules data)")


def _write_rule(path: Path, data: dict):
    """Write a rule JSON file."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def main():
    print("=" * 60)
    print("HANDBOOK MIGRATION: AI-extracted data -> structured files")
    print("=" * 60)
    print(f"Source: {DATA_DIR}")
    print(f"Target: {HANDBOOK_DIR}")

    courses = migrate_courses()
    majors = migrate_majors()
    migrate_rules()

    print("\n" + "=" * 60)
    print("MIGRATION COMPLETE")
    print("=" * 60)
    print(f"  Courses: {len(courses)} files + _index.json")
    print(f"  Majors:  {len(majors)} files + _index.json")
    print(f"  Rules:   7 files (3 more need hand-encoding)")
    print(f"\nNext steps:")
    print(f"  1. Hand-encode: equivalences.json, meta.json, timetable/2026.json")
    print(f"  2. Hand-encode: distinction.json, deans-merit-list.json, non-science-electives.json")
    print(f"  3. Verify all data against handbook PDF")


if __name__ == "__main__":
    main()
