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


def _parse_prereq_tree(text: str) -> dict[str, Any]:
    """Parse a prerequisite text string into a minimal AND/OR tree.

    Returns a tree dict with ``type`` one of:
      "code"   → {"type": "code", "code": "MAM1031F"}
      "and"    → {"type": "and", "operands": [...]}
      "or"     → {"type": "or", "operands": [...]}
      "any"    → {"type": "any"}  (no requirements / unknown)
    """
    if not text:
        return {"type": "any"}

    text = re.sub(r"\s+", " ", str(text).strip())

    # Split on " or " first — standard logical precedence (AND binds tighter).
    or_segments = re.split(r"\bor\b", text, flags=re.IGNORECASE)

    operands: list[dict[str, Any]] = []
    for segment in or_segments:
        codes = re.findall(r"[A-Z]{3,4}\d{4}[A-Z]?", segment.upper())
        if not codes:
            continue
        # Within an OR segment, split by "and" to get inner AND groups.
        and_parts = re.split(r"\band\b", segment, flags=re.IGNORECASE)
        if len(and_parts) > 1:
            inner_codes: list[str] = []
            for part in and_parts:
                inner_codes.extend(re.findall(r"[A-Z]{3,4}\d{4}[A-Z]?", part.upper()))
            if len(inner_codes) == 1:
                operands.append({"type": "code", "code": inner_codes[0]})
            elif inner_codes:
                operands.append(
                    {"type": "and", "operands": [{"type": "code", "code": c} for c in inner_codes]}
                )
        else:
            for code in codes:
                operands.append({"type": "code", "code": code})

    if not operands:
        return {"type": "any"}
    if len(operands) == 1:
        return operands[0]
    return {"type": "or", "operands": operands}


def _eval_prereq_tree(tree: dict[str, Any], known_codes: set[str]) -> bool:
    """Evaluate a prerequisite tree against a set of known-satisfied course codes."""
    tree_type = tree.get("type")
    if tree_type == "code":
        return _is_requirement_satisfied(tree["code"], known_codes)
    if tree_type == "and":
        return all(_eval_prereq_tree(op, known_codes) for op in tree.get("operands", []))
    if tree_type == "or":
        return any(_eval_prereq_tree(op, known_codes) for op in tree.get("operands", []))
    # "any" or unknown → no requirement
    return True


def _describe_prereq_tree(tree: dict[str, Any], known_codes: set[str]) -> str:
    """Return a human-readable description of what is missing in the tree."""
    tree_type = tree.get("type")
    if tree_type == "code":
        code = tree["code"]
        if not _is_requirement_satisfied(code, known_codes):
            return code
        return ""
    if tree_type == "and":
        missing = [
            _describe_prereq_tree(op, known_codes)
            for op in tree.get("operands", [])
        ]
        missing = [m for m in missing if m]
        return ", ".join(missing) if missing else ""
    if tree_type == "or":
        all_parts = [op.get("code") or _describe_prereq_tree(op, known_codes) for op in tree.get("operands", [])]
        all_parts = [p for p in all_parts if p]
        return f"one of [{' / '.join(all_parts)}]" if all_parts else ""
    return ""


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

            # Build prerequisite tree — uses AND/OR logic parsed from text.
            prereq_raw = payload.get("prerequisites")
            prereq_tree: dict[str, Any] | None = None
            if isinstance(prereq_raw, dict):
                prereq_text = prereq_raw.get("text") or ""
                if prereq_text:
                    prereq_tree = _parse_prereq_tree(prereq_text)
                else:
                    # Fallback: treat listed codes as AND requirements.
                    fallback_codes = list(_extract_course_codes_from_value(prereq_raw.get("parsed")))
                    if fallback_codes:
                        prereq_tree = (
                            {"type": "code", "code": fallback_codes[0]}
                            if len(fallback_codes) == 1
                            else {"type": "and", "operands": [{"type": "code", "code": c} for c in fallback_codes]}
                        )
            elif prereq_raw:
                fallback_codes = list(_extract_course_codes_from_value(prereq_raw))
                if fallback_codes:
                    prereq_tree = (
                        {"type": "code", "code": fallback_codes[0]}
                        if len(fallback_codes) == 1
                        else {"type": "and", "operands": [{"type": "code", "code": c} for c in fallback_codes]}
                    )

            coreq_codes = _extract_course_codes_from_value(payload.get("corequisites"))

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

            # Evaluate the prerequisite tree (correctly handles OR/AND).
            if prereq_tree is not None and not _eval_prereq_tree(prereq_tree, known_before):
                missing_desc = _describe_prereq_tree(prereq_tree, known_before) or "prerequisite"
                # Remove self-reference from missing description.
                missing_desc = missing_desc.replace(code, "").strip(", ") or "prerequisite"
                issues.append(
                    {
                        "id": f"handbook-val-{issue_counter}",
                        "severity": "blocker",
                        "category": "prerequisite",
                        "title": f"Prerequisites not satisfied for {code}",
                        "message": f"{code} requires: {missing_desc}.",
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

        major_catalog = self.handbook_store.load_major_index()
        unknown_majors = []
        for major in selected_majors:
            key = re.sub(r"[^a-z0-9]+", "", major.lower())
            if key and key not in major_catalog:
                unknown_majors.append(major)

        # ── 1A: Major requirement validation ─────────────────────────────────
        all_plan_codes: set[str] = set()
        for r in normalized_rows:
            all_plan_codes.update(_course_code_variants(r["code"]))
        all_plan_codes = _expand_known_codes_with_equivalences(all_plan_codes, equivalence_map)

        for major_name in selected_majors:
            norm_key = re.sub(r"\bmajor\b", "", re.sub(r"[^a-z0-9 ]+", "", major_name.lower())).strip()
            norm_key_compact = re.sub(r"\s+", "", norm_key)

            matched_rows = (
                major_catalog.get(norm_key_compact)
                or major_catalog.get(norm_key)
            )
            if not matched_rows:
                # Try matching by major_code against all catalog entries
                for rows in major_catalog.values():
                    for row in rows:
                        payload_code = str(
                            row.get("payload", {}).get("major_code")
                            or row.get("payload", {}).get("programme_code")
                            or ""
                        ).strip().upper()
                        if payload_code and payload_code == major_name.strip().upper():
                            matched_rows = [row]
                            break
                    if matched_rows:
                        break

            if not matched_rows:
                continue

            matched = next(
                (r for r in matched_rows if r.get("faculty_slug") == target_faculty),
                matched_rows[0],
            )
            payload = matched.get("payload", {})
            required_core: set[str] = set()
            optional_groups: list[tuple[int, list[str]]] = []

            years_data = payload.get("years") if isinstance(payload.get("years"), list) else []
            curriculum = payload.get("curriculum")

            # Science-style: years[] with combinations
            for year_entry in years_data:
                if not isinstance(year_entry, dict):
                    continue
                for combo in year_entry.get("combinations", []):
                    if not isinstance(combo, dict):
                        continue
                    for course in combo.get("required_core", []) + combo.get("courses", []):
                        code = _normalize_code(course.get("code") if isinstance(course, dict) else course)
                        if code:
                            required_core.add(code)
                    for n, group_key in [(1, "choose_one_of"), (2, "choose_two_of"), (3, "choose_three_of")]:
                        candidates = [
                            _normalize_code(c.get("code") if isinstance(c, dict) else c)
                            for c in combo.get(group_key, [])
                        ]
                        candidates = [c for c in candidates if c]
                        if candidates:
                            optional_groups.append((n, candidates))

            # Dict-style: curriculum = {year_1: {core: [codes]}, year_2: ...}
            if not years_data and isinstance(curriculum, dict):
                for year_key, year_data in curriculum.items():
                    if not re.match(r"year[_\s]*\d+", year_key.lower()):
                        continue
                    if not isinstance(year_data, dict):
                        continue
                    for code in year_data.get("core", []):
                        norm = _normalize_code(code)
                        if norm:
                            required_core.add(norm)

            # Commerce-style: curriculum = [{year: 1, courses: [{code, credits}]}]
            if not years_data and isinstance(curriculum, list):
                for row in curriculum:
                    if not isinstance(row, dict):
                        continue
                    for course in row.get("courses", []):
                        code = _normalize_code(course.get("code") if isinstance(course, dict) else course)
                        if code:
                            required_core.add(code)

            missing_required = sorted(
                c for c in required_core
                if c and not _is_requirement_satisfied(c, all_plan_codes)
            )
            if missing_required:
                issues.append(
                    {
                        "id": f"handbook-val-{issue_counter}",
                        "severity": "warning",
                        "category": "major-requirement",
                        "title": f"Missing required courses for {major_name}",
                        "message": (
                            f"{len(missing_required)} required course(s) for {major_name} are not in your plan: "
                            f"{', '.join(missing_required[:8])}"
                            f"{'…' if len(missing_required) > 8 else '.'}"
                        ),
                    }
                )
                issue_counter += 1

            for min_count, candidates in optional_groups:
                satisfied_count = sum(
                    1 for c in candidates if _is_requirement_satisfied(c, all_plan_codes)
                )
                if satisfied_count < min_count:
                    issues.append(
                        {
                            "id": f"handbook-val-{issue_counter}",
                            "severity": "warning",
                            "category": "major-requirement",
                            "title": f"Elective requirement not met for {major_name}",
                            "message": (
                                f"{major_name} requires at least {min_count} of: "
                                f"{', '.join(candidates[:6])}{'…' if len(candidates) > 6 else ''}. "
                                f"Currently {satisfied_count} satisfied."
                            ),
                        }
                    )
                    issue_counter += 1

        # ── 1B: Graduation readiness — credits and NQF7 ──────────────────────
        GRADUATION_TOTAL_CREDITS = 360
        GRADUATION_NQF7_MIN = 120

        total_plan_credits = sum(r["credits"] for r in normalized_rows)
        nqf7_credits = 0
        for row in normalized_rows:
            course_payload = self.handbook_store.course_by_code(row["code"])
            if course_payload:
                nqf = course_payload.get("nqf_level")
                try:
                    if int(nqf) >= 7:
                        nqf7_credits += row["credits"]
                except (TypeError, ValueError):
                    pass

        if total_plan_credits > 0 and total_plan_credits < GRADUATION_TOTAL_CREDITS:
            gap = GRADUATION_TOTAL_CREDITS - total_plan_credits
            issues.append(
                {
                    "id": f"handbook-val-{issue_counter}",
                    "severity": "warning",
                    "category": "graduation",
                    "title": "Total credits below graduation requirement",
                    "message": (
                        f"Your plan has {total_plan_credits} credits. "
                        f"Graduation requires {GRADUATION_TOTAL_CREDITS}. "
                        f"You are {gap} credits short."
                    ),
                }
            )
            issue_counter += 1

        if total_plan_credits > 0 and nqf7_credits < GRADUATION_NQF7_MIN:
            gap = GRADUATION_NQF7_MIN - nqf7_credits
            issues.append(
                {
                    "id": f"handbook-val-{issue_counter}",
                    "severity": "warning",
                    "category": "graduation",
                    "title": "NQF Level 7 credits below minimum",
                    "message": (
                        f"Your plan has {nqf7_credits} NQF Level 7 credits. "
                        f"Graduation requires at least {GRADUATION_NQF7_MIN}. "
                        f"You need {gap} more Level 7 credits."
                    ),
                }
            )
            issue_counter += 1

        # Recompute summary after all checks
        summary = {
            "blockers": sum(1 for issue in issues if issue.get("severity") == "blocker"),
            "warnings": sum(1 for issue in issues if issue.get("severity") == "warning"),
            "infos": sum(1 for issue in issues if issue.get("severity") == "info"),
        }

        return {
            "target_faculty": target_faculty,
            "selected_majors": selected_majors,
            "unknown_selected_majors": unknown_majors,
            "term_credit_totals": term_credit_totals,
            "plan_credit_total": total_plan_credits,
            "plan_nqf7_credits": nqf7_credits,
            "issues": issues,
            "summary": summary,
            "data_source": "structured_handbook_json",
        }
