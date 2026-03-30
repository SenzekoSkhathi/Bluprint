"""
Copy course detail fields from home-faculty course files into cross-faculty copies.

For each faculty, finds course files with `offered_by_faculty` set (meaning the course
is catalogued in this faculty but officially belongs to another) and copies the enriched
fields from the home-faculty's course file if the cross-faculty file still has placeholder
text.

Usage:
  python copy_cross_faculty_details.py

Copies details for:
  Engineering  <- Science  (CSC, MAM, STA, EGS, CEM, GEO, PHY etc.)
  Engineering  <- Commerce (ACC, ECO, FTX)
  Engineering  <- Law      (CML)
  Health Sciences <- Humanities (PSY, ASL, SLL)
  Health Sciences <- Science    (CEM, CSC, MAM, PHY, STA)
  Humanities   <- Commerce (BUS, ECO, FTX)
  Humanities   <- Law      (CML, PBL, PVL)
  Humanities   <- Science  (CSC, MAM, STA)
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional


PLACEHOLDER_PREFIXES = {
    "convener": ["See 2026"],
    "outline": ["Course title and credit value verified"],
    "lecture_times": ["See departmental timetable", "See module block schedule"],
    "dp_requirements": ["See 2026"],
    "assessment": ["See departmental"],
    "prereq_text": ["Refer to the programme", "Refer to programme"],
}


def is_placeholder(value: str, field: str) -> bool:
    if not isinstance(value, str):
        return False
    for prefix in PLACEHOLDER_PREFIXES.get(field, []):
        if value.startswith(prefix):
            return True
    return False


def load_course(path: Path) -> Optional[dict]:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def copy_fields(src: dict, dst: dict) -> bool:
    """Copy non-placeholder fields from src into dst where dst has placeholders.
    Returns True if anything was changed."""
    changed = False

    scalar_fields = ["convener", "outline", "lecture_times", "dp_requirements", "assessment"]
    for field in scalar_fields:
        src_val = src.get(field, "")
        dst_val = dst.get(field, "")
        if src_val and not is_placeholder(src_val, field) and is_placeholder(dst_val, field):
            dst[field] = src_val
            changed = True

    # prerequisites
    src_prereq = src.get("prerequisites", {})
    dst_prereq = dst.get("prerequisites", {})
    src_prereq_text = src_prereq.get("text", "") if isinstance(src_prereq, dict) else ""
    dst_prereq_text = dst_prereq.get("text", "") if isinstance(dst_prereq, dict) else ""
    if (
        isinstance(src_prereq, dict)
        and isinstance(dst_prereq, dict)
        and src_prereq_text
        and not is_placeholder(src_prereq_text, "prereq_text")
        and dst_prereq_text.startswith("Refer to")
    ):
        dst["prerequisites"] = src_prereq
        changed = True

    # corequisites
    src_coreq = src.get("corequisites", [])
    dst_coreq = dst.get("corequisites", [])
    if src_coreq and not dst_coreq:
        dst["corequisites"] = src_coreq
        changed = True

    return changed


def process_faculty(
    faculty_slug: str,
    courses_dir: Path,
    course_lookup: dict[str, Path],
) -> tuple[int, int]:
    """Process one faculty's cross-faculty courses. Returns (checked, updated)."""
    checked = 0
    updated = 0
    for course_file in sorted(courses_dir.glob("*.json")):
        if course_file.name == "_index.json":
            continue
        dst_data = load_course(course_file)
        if dst_data is None:
            continue
        offered_by = dst_data.get("offered_by_faculty")
        if not offered_by:
            continue  # native course, skip
        if not is_placeholder(dst_data.get("convener", ""), "convener"):
            continue  # already has real convener, skip

        code = course_file.stem
        src_path = course_lookup.get(code)
        if src_path is None:
            continue  # no home-faculty file found

        src_data = load_course(src_path)
        if src_data is None:
            continue

        checked += 1
        if copy_fields(src_data, dst_data):
            course_file.write_text(
                json.dumps(dst_data, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            updated += 1
            print(f"  Updated {faculty_slug}/{code} from {offered_by}")

    return checked, updated


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    faculties_root = repo_root / "data" / "handbook" / "faculties"

    # Build a flat lookup: course_code -> Path to course JSON file in its home faculty
    print("Building course lookup from all faculties...")
    course_lookup: dict[str, Path] = {}
    for faculty_dir in sorted(faculties_root.iterdir()):
        courses_dir = faculty_dir / "courses"
        if not courses_dir.is_dir():
            continue
        for f in courses_dir.glob("*.json"):
            if f.name == "_index.json":
                continue
            code = f.stem
            # If multiple faculties have the same code, prefer the one where is_<faculty>_course is True
            if code not in course_lookup:
                course_lookup[code] = f
            else:
                # Prefer the home-faculty version (where the course is NOT a cross-faculty copy)
                existing_data = load_course(course_lookup[code])
                new_data = load_course(f)
                if existing_data and new_data:
                    existing_offered = existing_data.get("offered_by_faculty")
                    new_offered = new_data.get("offered_by_faculty")
                    if new_offered is None and existing_offered is not None:
                        # new file is the home-faculty version
                        course_lookup[code] = f

    print(f"Course lookup built: {len(course_lookup)} codes")
    print()

    total_checked = 0
    total_updated = 0
    for faculty_slug in ["engineering", "health-sciences", "humanities"]:
        courses_dir = faculties_root / faculty_slug / "courses"
        print(f"--- {faculty_slug} ---")
        checked, updated = process_faculty(faculty_slug, courses_dir, course_lookup)
        print(f"  checked={checked} updated={updated}")
        total_checked += checked
        total_updated += updated

    print()
    print(f"Total: checked={total_checked} updated={total_updated}")


if __name__ == "__main__":
    main()
