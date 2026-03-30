from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
FACULTIES_DIR = ROOT / "data" / "handbook" / "faculties"
AUDIT_DIR = ROOT / "data" / "audits"
REPORT_PATH = AUDIT_DIR / "handbook_integrity_report.json"


COURSE_CODE_RE = re.compile(r"[A-Z]{3,4}\d{4}(?:[A-Z](?:/[A-Z]){0,5}|x)?")


@dataclass
class FacultyStats:
    slug: str
    courses: int = 0
    majors: int = 0


def _normalize_code(value: Any) -> str:
    return str(value or "").strip().upper()


def _extract_codes(value: Any) -> set[str]:
    if value is None:
        return set()
    if isinstance(value, list):
        found: set[str] = set()
        for item in value:
            found.update(_extract_codes(item))
        return found
    if isinstance(value, dict):
        found: set[str] = set()
        for item in value.values():
            found.update(_extract_codes(item))
        return found

    text = str(value)
    return {token.strip().upper() for token in COURSE_CODE_RE.findall(text) if token.strip()}


def _course_variants(code: str) -> set[str]:
    normalized = _normalize_code(code)
    if not normalized:
        return set()

    if "X" in normalized or normalized.endswith("X"):
        return set()

    if normalized.endswith("/S") and len(normalized) > 2:
        stem = normalized[:-2]
        if stem and stem[-1].isalpha():
            stem = stem[:-1]
        return {normalized, f"{stem}F", f"{stem}S"}

    compact = re.fullmatch(r"([A-Z]{3,4}\d{4})([A-Z](?:/[A-Z]){1,5})", normalized)
    if compact:
        base = compact.group(1)
        suffixes = [part.strip().upper() for part in compact.group(2).split("/")]
        return {normalized, *{f"{base}{suffix}" for suffix in suffixes if suffix}}

    alt = re.fullmatch(r"([A-Z]{3,4}\d{4}[A-Z]?)/([A-Z])", normalized)
    if alt:
        left = alt.group(1)
        right = alt.group(2)
        stem = re.sub(r"[A-Z]$", "", left)
        variants = {normalized, left}
        if stem:
            variants.add(f"{stem}{right}")
        return variants

    return {normalized}


def _looks_like_pattern(code: str) -> bool:
    normalized = _normalize_code(code)
    return "X" in normalized


def _course_base(code: str) -> str:
    normalized = _normalize_code(code)
    match = re.match(r"([A-Z]{3,4}\d{4})", normalized)
    return match.group(1) if match else ""


def _extract_codes_from_course_list(courses: Any) -> set[str]:
    codes: set[str] = set()
    if not isinstance(courses, list):
        return codes
    for course in courses:
        if isinstance(course, dict):
            code = _normalize_code(course.get("code"))
            if code:
                codes.add(code)
            continue
        if isinstance(course, str):
            parsed = _extract_codes(course)
            codes.update(parsed)
    return codes


def _extract_major_required_codes(payload: dict[str, Any]) -> set[str]:
    """Extract required course codes from structured major/programme schema.

    Only required-like code fields are used. Optional alternatives are excluded
    to avoid counting advisory options as hard integrity failures.
    """
    collected: set[str] = set()

    years = payload.get("years")
    if isinstance(years, list):
        for year_row in years:
            if not isinstance(year_row, dict):
                continue
            combinations = year_row.get("combinations")
            if not isinstance(combinations, list):
                continue
            for combo in combinations:
                if not isinstance(combo, dict):
                    continue
                collected.update(_extract_codes_from_course_list(combo.get("required_core")))
                collected.update(_extract_codes_from_course_list(combo.get("courses")))
                collected.update(_extract_codes_from_course_list(combo.get("choose_one_of")))
                collected.update(_extract_codes_from_course_list(combo.get("choose_two_of")))
                collected.update(_extract_codes_from_course_list(combo.get("choose_three_of")))

    curriculum = payload.get("curriculum")
    if isinstance(curriculum, list):
        for row in curriculum:
            if not isinstance(row, dict):
                continue
            collected.update(_extract_codes_from_course_list(row.get("courses")))

    if isinstance(curriculum, dict):
        for row in curriculum.values():
            if not isinstance(row, dict):
                continue
            collected.update(_extract_codes_from_course_list(row.get("core")))
            collected.update(_extract_codes_from_course_list(row.get("required_core")))

    if collected:
        return collected
    return _extract_codes(payload)


def _is_code_resolved(code: str, course_codes: set[str], course_bases: set[str]) -> bool:
    if _looks_like_pattern(code):
        return True
    variants = _course_variants(code)
    if variants and not course_codes.isdisjoint(variants):
        return True
    base = _course_base(code)
    return bool(base and base in course_bases)


def main() -> None:
    faculty_stats: list[FacultyStats] = []
    missing_course_refs: list[dict[str, Any]] = []
    alias_or_variant_course_refs: list[dict[str, Any]] = []
    missing_equivalence_targets: list[dict[str, Any]] = []
    alias_or_variant_equivalence_targets: list[dict[str, Any]] = []
    semester_suffix_mismatches: list[dict[str, Any]] = []
    malformed_json_files: list[str] = []

    course_codes: set[str] = set()
    course_bases: set[str] = set()
    equivalence_required_codes: set[str] = set()
    major_required_codes_global: set[str] = set()

    # Pre-scan all course codes across faculties so cross-fac references resolve.
    for faculty_dir in sorted(FACULTIES_DIR.iterdir()):
        if not faculty_dir.is_dir():
            continue
        courses_dir = faculty_dir / "courses"
        if not courses_dir.exists():
            continue
        for course_file in sorted(courses_dir.glob("*.json")):
            if course_file.name.startswith("_"):
                continue
            try:
                course_payload = json.loads(course_file.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                continue
            if not isinstance(course_payload, dict):
                continue
            code = _normalize_code(course_payload.get("code") or course_file.stem)
            if not code:
                continue
            course_codes.add(code)
            base = _course_base(code)
            if base:
                course_bases.add(base)

    # Pre-scan major required codes (structured fields only) for later severity decisions.
    for faculty_dir in sorted(FACULTIES_DIR.iterdir()):
        if not faculty_dir.is_dir():
            continue
        majors_dir = faculty_dir / "majors"
        if not majors_dir.exists():
            continue
        for major_file in sorted(majors_dir.glob("*.json")):
            if major_file.name.startswith("_"):
                continue
            try:
                major_payload = json.loads(major_file.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                continue
            if not isinstance(major_payload, dict):
                continue
            major_required_codes_global.update(_extract_major_required_codes(major_payload))

    # Pre-scan equivalence required-side aliases (for example packaging codes
    # retained in handbook text but represented by split offerings in course files).
    for faculty_dir in sorted(FACULTIES_DIR.iterdir()):
        if not faculty_dir.is_dir():
            continue
        eq_path = faculty_dir / "equivalences.json"
        if not eq_path.exists():
            continue
        try:
            eq_payload = json.loads(eq_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        groups = eq_payload.get("equivalences", []) if isinstance(eq_payload, dict) else []
        if not isinstance(groups, list):
            continue
        for group in groups:
            if not isinstance(group, dict):
                continue
            rows = group.get("entries", [])
            if not isinstance(rows, list):
                continue
            for row in rows:
                if not isinstance(row, dict):
                    continue
                equivalence_required_codes.update(_extract_codes(row.get("credit_required")))

    for faculty_dir in sorted(FACULTIES_DIR.iterdir()):
        if not faculty_dir.is_dir():
            continue
        slug = faculty_dir.name
        stats = FacultyStats(slug=slug)

        courses_dir = faculty_dir / "courses"
        if courses_dir.exists():
            for course_file in sorted(courses_dir.glob("*.json")):
                if course_file.name.startswith("_"):
                    continue
                try:
                    payload = json.loads(course_file.read_text(encoding="utf-8"))
                except (json.JSONDecodeError, OSError):
                    malformed_json_files.append(str(course_file.relative_to(ROOT)))
                    continue

                if not isinstance(payload, dict):
                    continue
                code = _normalize_code(payload.get("code") or course_file.stem)
                if not code:
                    continue
                course_codes.add(code)
                base = _course_base(code)
                if base:
                    course_bases.add(base)
                stats.courses += 1

                semester_value = str(payload.get("semester") or "").strip().upper()
                if code.endswith("F") and semester_value not in {"S1", "SEMESTER 1"}:
                    semester_suffix_mismatches.append(
                        {
                            "file": str(course_file.relative_to(ROOT)),
                            "code": code,
                            "expected": "S1",
                            "found": semester_value,
                        }
                    )
                if code.endswith("S") and semester_value not in {"S2", "SEMESTER 2"}:
                    semester_suffix_mismatches.append(
                        {
                            "file": str(course_file.relative_to(ROOT)),
                            "code": code,
                            "expected": "S2",
                            "found": semester_value,
                        }
                    )
                if code.endswith("W") and semester_value not in {"FY", "FULL YEAR", "FULL-YEAR"}:
                    semester_suffix_mismatches.append(
                        {
                            "file": str(course_file.relative_to(ROOT)),
                            "code": code,
                            "expected": "FY",
                            "found": semester_value,
                        }
                    )

        majors_dir = faculty_dir / "majors"
        if majors_dir.exists():
            for major_file in sorted(majors_dir.glob("*.json")):
                if major_file.name.startswith("_"):
                    continue
                stats.majors += 1
                try:
                    payload = json.loads(major_file.read_text(encoding="utf-8"))
                except (json.JSONDecodeError, OSError):
                    malformed_json_files.append(str(major_file.relative_to(ROOT)))
                    continue

                referenced = _extract_major_required_codes(payload)
                for code in sorted(referenced):
                    if not _is_code_resolved(code, course_codes, course_bases):
                        if code in equivalence_required_codes:
                            alias_or_variant_course_refs.append(
                                {
                                    "faculty": slug,
                                    "major_file": str(major_file.relative_to(ROOT)),
                                    "missing_code": code,
                                    "classification": "equivalence_required_alias",
                                }
                            )
                            continue
                        base = _course_base(code)
                        if base and base in course_bases:
                            alias_or_variant_course_refs.append(
                                {
                                    "faculty": slug,
                                    "major_file": str(major_file.relative_to(ROOT)),
                                    "missing_code": code,
                                    "classification": "variant_of_existing_base",
                                }
                            )
                            continue
                        missing_course_refs.append(
                            {
                                "faculty": slug,
                                "major_file": str(major_file.relative_to(ROOT)),
                                "missing_code": code,
                            }
                        )

        equivalence_path = faculty_dir / "equivalences.json"
        if equivalence_path.exists():
            try:
                payload = json.loads(equivalence_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                malformed_json_files.append(str(equivalence_path.relative_to(ROOT)))
                payload = {}

            entries = payload.get("equivalences", []) if isinstance(payload, dict) else []
            if isinstance(entries, list):
                for group in entries:
                    if not isinstance(group, dict):
                        continue
                    rows = group.get("entries", [])
                    if not isinstance(rows, list):
                        continue
                    for row in rows:
                        if not isinstance(row, dict):
                            continue
                        required = _extract_codes(row.get("credit_required"))
                        equivalence_required_codes.update(required)
                        completed = _extract_codes(row.get("completed_course"))
                        for code in sorted(required.union(completed)):
                            if not _is_code_resolved(code, course_codes, course_bases):
                                if code in equivalence_required_codes:
                                    alias_or_variant_equivalence_targets.append(
                                        {
                                            "faculty": slug,
                                            "equivalence_type": row.get("type", "unknown"),
                                            "missing_code": code,
                                            "classification": "legacy_or_packaging_alias",
                                        }
                                    )
                                    continue
                                if code not in major_required_codes_global:
                                    alias_or_variant_equivalence_targets.append(
                                        {
                                            "faculty": slug,
                                            "equivalence_type": row.get("type", "unknown"),
                                            "missing_code": code,
                                            "classification": "legacy_equivalence_only_code",
                                        }
                                    )
                                    continue
                                missing_equivalence_targets.append(
                                    {
                                        "faculty": slug,
                                        "equivalence_type": row.get("type", "unknown"),
                                        "missing_code": code,
                                    }
                                )

        faculty_stats.append(stats)

    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    report = {
        "summary": {
            "faculties": [
                {
                    "slug": row.slug,
                    "courses": row.courses,
                    "majors": row.majors,
                }
                for row in faculty_stats
            ],
            "total_courses": sum(row.courses for row in faculty_stats),
            "total_majors": sum(row.majors for row in faculty_stats),
            "missing_course_reference_count": len(missing_course_refs),
            "alias_or_variant_course_reference_count": len(alias_or_variant_course_refs),
            "missing_equivalence_target_count": len(missing_equivalence_targets),
            "alias_or_variant_equivalence_target_count": len(alias_or_variant_equivalence_targets),
            "semester_suffix_mismatch_count": len(semester_suffix_mismatches),
            "malformed_json_count": len(malformed_json_files),
        },
        "missing_course_references": missing_course_refs,
        "alias_or_variant_course_references": alias_or_variant_course_refs,
        "missing_equivalence_targets": missing_equivalence_targets,
        "alias_or_variant_equivalence_targets": alias_or_variant_equivalence_targets,
        "semester_suffix_mismatches": semester_suffix_mismatches,
        "malformed_json_files": malformed_json_files,
    }

    REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=True), encoding="utf-8")

    print("Handbook integrity audit complete")
    print(f"Report: {REPORT_PATH.relative_to(ROOT)}")
    print(f"Missing major/programme references: {len(missing_course_refs)}")
    print(f"Alias/variant major/programme references: {len(alias_or_variant_course_refs)}")
    print(f"Missing equivalence targets: {len(missing_equivalence_targets)}")
    print(f"Alias/variant equivalence targets: {len(alias_or_variant_equivalence_targets)}")
    print(f"Semester suffix mismatches: {len(semester_suffix_mismatches)}")
    print(f"Malformed JSON files: {len(malformed_json_files)}")


if __name__ == "__main__":
    main()
