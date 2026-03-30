from __future__ import annotations

import re
from typing import Any

from src.handbook_store import HandbookStore


def _normalize_code(value: Any) -> str:
    return str(value or "").strip().upper()


def _parse_year(value: Any) -> int:
    match = re.search(r"\d+", str(value or ""))
    return int(match.group(0)) if match else 1


def _parse_semester_number(value: Any) -> int:
    normalized = str(value or "").strip().lower()
    match = re.search(r"\d+", normalized)
    if match:
        number = int(match.group(0))
        if number in {1, 2}:
            return number
    if normalized in {"f", "s1", "semester 1", "first"}:
        return 1
    if normalized in {"s", "s2", "semester 2", "second"}:
        return 2
    return 1


def _term_index(year: Any, semester: Any) -> int:
    return (_parse_year(year) * 10) + _parse_semester_number(semester)


def _extract_course_codes_from_value(value: Any) -> set[str]:
    if value is None:
        return set()
    if isinstance(value, list):
        found: set[str] = set()
        for item in value:
            found.update(_extract_course_codes_from_value(item))
        return found
    if isinstance(value, dict):
        found: set[str] = set()
        for item in value.values():
            found.update(_extract_course_codes_from_value(item))
        return found

    normalized = str(value).strip().upper()
    if not normalized:
        return set()
    return {
        code.strip().upper()
        for code in re.findall(r"[A-Z]{3,4}\d{4}[A-Z]?", normalized)
        if code.strip()
    }


def _course_code_variants(code: str) -> set[str]:
    normalized = _normalize_code(code)
    if not normalized:
        return set()

    variants: set[str] = {normalized}
    compact_suffix = re.fullmatch(r"([A-Z]{3,4}\d{4})([A-Z](?:/[A-Z]){1,5})", normalized)
    if compact_suffix:
        base = compact_suffix.group(1)
        for suffix in compact_suffix.group(2).split("/"):
            token = suffix.strip().upper()
            if token:
                variants.add(f"{base}{token}")

    alt_form = re.fullmatch(r"([A-Z]{3,4}\d{4}[A-Z]?)/([A-Z])", normalized)
    if alt_form:
        left = alt_form.group(1)
        right = alt_form.group(2)
        variants.add(left)
        stem = re.sub(r"[A-Z]$", "", left)
        if stem:
            variants.add(f"{stem}{right}")

    return variants


def _expand_known_codes_with_equivalences(
    known_codes: set[str], equivalence_map: dict[str, set[str]]
) -> set[str]:
    expanded = set(known_codes)
    changed = True
    while changed:
        changed = False
        for required_code, accepted_codes in equivalence_map.items():
            if expanded.isdisjoint(accepted_codes):
                continue
            additions = _course_code_variants(required_code)
            additions.add(required_code)
            if additions.issubset(expanded):
                continue
            expanded.update(additions)
            changed = True
    return expanded


def _is_requirement_satisfied(required_code: str, known_codes: set[str]) -> bool:
    required_variants = _course_code_variants(required_code)
    if not required_variants:
        return False
    return not known_codes.isdisjoint(required_variants)


class HandbookValidator:
    """Deterministic, faculty-aware plan validator backed by structured handbook files."""

    def __init__(self, handbook_store: HandbookStore):
        self.handbook_store = handbook_store

    def validate_plan(
        self,
        planned_courses: list[dict[str, Any]],
        *,
        selected_majors: list[str] | None = None,
        target_faculty: str = "science",
    ) -> dict[str, Any]:
        issues: list[dict[str, Any]] = []
        issue_counter = 1

        selected_majors = [str(item).strip() for item in (selected_majors or []) if str(item).strip()]
        equivalence_map = self.handbook_store.load_equivalence_map()

        normalized_rows: list[dict[str, Any]] = []
        for row in planned_courses:
            code = _normalize_code(row.get("code"))
            if not code:
                continue
            normalized_rows.append(
                {
                    "code": code,
                    "year": row.get("year", "Year 1"),
                    "semester": row.get("semester", "Semester 1"),
                    "credits": int(row.get("credits", 0) or 0),
                }
            )

        term_credit_totals: dict[str, int] = {}
        seen_code_counts: dict[str, int] = {}

        for row in normalized_rows:
            code = row["code"]
            semester = str(row["semester"])
            year = str(row["year"])
            term_label = f"Year {_parse_year(year)} - Semester {_parse_semester_number(semester)}"
            term_credit_totals[term_label] = term_credit_totals.get(term_label, 0) + int(row["credits"])
            seen_code_counts[code] = seen_code_counts.get(code, 0) + 1

            # Suffix policy enforced deterministically for all faculties.
            if code.endswith("F") and "2" in semester:
                issues.append(
                    {
                        "id": f"handbook-val-{issue_counter}",
                        "severity": "blocker",
                        "category": "policy",
                        "title": f"Semester mismatch for {code}",
                        "message": f"{code} is a Semester 1 (F) course and cannot be planned in {semester}.",
                        "relatedCourseCode": code,
                        "relatedTerm": term_label,
                    }
                )
                issue_counter += 1
            if code.endswith("S") and "1" in semester:
                issues.append(
                    {
                        "id": f"handbook-val-{issue_counter}",
                        "severity": "blocker",
                        "category": "policy",
                        "title": f"Semester mismatch for {code}",
                        "message": f"{code} is a Semester 2 (S) course and cannot be planned in {semester}.",
                        "relatedCourseCode": code,
                        "relatedTerm": term_label,
                    }
                )
                issue_counter += 1
            if (code.endswith("H") or code.endswith("W")) and "2" in semester:
                issues.append(
                    {
                        "id": f"handbook-val-{issue_counter}",
                        "severity": "blocker",
                        "category": "policy",
                        "title": f"Full-year course placement issue for {code}",
                        "message": f"{code} is a full-year course and must start in Semester 1.",
                        "relatedCourseCode": code,
                        "relatedTerm": term_label,
                    }
                )
                issue_counter += 1

            course_payload = self.handbook_store.course_by_code(code)
            if course_payload is None:
                issues.append(
                    {
                        "id": f"handbook-val-{issue_counter}",
                        "severity": "warning",
                        "category": "catalog",
                        "title": f"Course not found in handbook dataset: {code}",
                        "message": (
                            f"{code} is not currently present in structured handbook files across encoded faculties. "
                            "Verify the code or add it to the relevant faculty catalog."
                        ),
                        "relatedCourseCode": code,
                    }
                )
                issue_counter += 1

        ordered_rows = sorted(
            normalized_rows,
            key=lambda row: (_term_index(row["year"], row["semester"]), row["code"]),
        )

        for row in ordered_rows:
            code = row["code"]
            payload = self.handbook_store.course_by_code(code)
            if payload is None:
                continue

            prereq_codes = _extract_course_codes_from_value(payload.get("prerequisites"))
            coreq_codes = _extract_course_codes_from_value(payload.get("corequisites"))
            if isinstance(payload.get("prerequisites"), dict):
                prereq_obj = payload.get("prerequisites")
                prereq_codes.update(_extract_course_codes_from_value(prereq_obj.get("parsed")))
                prereq_codes.update(_extract_course_codes_from_value(prereq_obj.get("text")))

            prior_codes = {
                item["code"]
                for item in ordered_rows
                if _term_index(item["year"], item["semester"])
                < _term_index(row["year"], row["semester"])
            }
            through_term_codes = {
                item["code"]
                for item in ordered_rows
                if _term_index(item["year"], item["semester"])
                <= _term_index(row["year"], row["semester"])
            }

            known_before: set[str] = set()
            for prior in prior_codes:
                known_before.update(_course_code_variants(prior))
            known_before = _expand_known_codes_with_equivalences(known_before, equivalence_map)

            known_through_term: set[str] = set()
            for prior in through_term_codes:
                known_through_term.update(_course_code_variants(prior))
            known_through_term = _expand_known_codes_with_equivalences(known_through_term, equivalence_map)

            prereq_missing = sorted(
                required
                for required in prereq_codes
                if required != code and not _is_requirement_satisfied(required, known_before)
            )
            if prereq_missing:
                issues.append(
                    {
                        "id": f"handbook-val-{issue_counter}",
                        "severity": "blocker",
                        "category": "prerequisite",
                        "title": f"Prerequisites not satisfied for {code}",
                        "message": (
                            f"{code} is planned before prerequisite completion evidence for: "
                            f"{', '.join(prereq_missing[:5])}."
                        ),
                        "relatedCourseCode": code,
                    }
                )
                issue_counter += 1

            coreq_missing = sorted(
                required
                for required in coreq_codes
                if required != code and not _is_requirement_satisfied(required, known_through_term)
            )
            if coreq_missing:
                issues.append(
                    {
                        "id": f"handbook-val-{issue_counter}",
                        "severity": "blocker",
                        "category": "prerequisite",
                        "title": f"Corequisites not satisfied for {code}",
                        "message": (
                            f"{code} requires concurrent/prior enrolment in: "
                            f"{', '.join(coreq_missing[:5])}."
                        ),
                        "relatedCourseCode": code,
                    }
                )
                issue_counter += 1

        for code, count in sorted(seen_code_counts.items()):
            if count <= 1:
                continue
            issues.append(
                {
                    "id": f"handbook-val-{issue_counter}",
                    "severity": "warning",
                    "category": "plan-shape",
                    "title": f"Duplicate planned course: {code}",
                    "message": f"{code} appears {count} times in the current plan.",
                    "relatedCourseCode": code,
                }
            )
            issue_counter += 1

        summary = {
            "blockers": sum(1 for issue in issues if issue.get("severity") == "blocker"),
            "warnings": sum(1 for issue in issues if issue.get("severity") == "warning"),
            "infos": sum(1 for issue in issues if issue.get("severity") == "info"),
        }

        major_catalog = self.handbook_store.load_major_index()
        unknown_majors = []
        for major in selected_majors:
            key = re.sub(r"[^a-z0-9]+", "", major.lower())
            if key and key not in major_catalog:
                unknown_majors.append(major)

        return {
            "target_faculty": target_faculty,
            "selected_majors": selected_majors,
            "unknown_selected_majors": unknown_majors,
            "term_credit_totals": term_credit_totals,
            "issues": issues,
            "summary": summary,
            "data_source": "structured_handbook_json",
        }
