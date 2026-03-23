from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from src.agents.handbook_rules_agent import HandbookRulesAgent
from src.config import Settings


def _parse_year_number(value: str) -> int:
    match = re.search(r"\d+", value)
    return int(match.group(0)) if match else 1


def _parse_term_label(year: str, semester: str) -> str:
    year_number = _parse_year_number(year)
    sem_match = re.search(r"\d+", semester)
    sem_number = int(sem_match.group(0)) if sem_match else 1
    return f"Year {year_number} - Semester {sem_number}"


def _is_postgrad_code(code: str) -> bool:
    match = re.search(r"\d", code)
    if not match:
        return False
    return int(match.group(0)) >= 5


def _code_level(code: str) -> int | None:
    match = re.search(r"\d", code)
    if not match:
        return None
    return int(match.group(0))


def _science_prefix(code: str) -> str:
    match = re.match(r"([A-Z]{3,4})", code)
    return match.group(1) if match else ""


def _extract_first_int(value: Any) -> int | None:
    if isinstance(value, int):
        return value
    if not isinstance(value, str):
        return None
    match = re.search(r"\d+", value)
    return int(match.group(0)) if match else None


def _build_milestone(year_number: int, text: Any) -> dict[str, Any] | None:
    minimum = _extract_first_int(text)
    if minimum is None:
        return None
    return {
        "year": year_number,
        "min_credits": minimum,
        "description": str(text),
    }


def _build_source_rules_from_rulebook(rulebook: dict[str, Any]) -> list[dict[str, Any]]:
    bsc_rules = rulebook.get("bsc_degree_rules", {})
    registration = bsc_rules.get("registration_limits", {})
    curriculum = bsc_rules.get("curriculum_rules", {})

    return [
        {
            "id": "FB3",
            "title": "Semester registration cap",
            "description": str(registration.get("FB3") or ""),
            "category": "load",
            "severity": "blocker",
        },
        {
            "id": "FB7.1",
            "title": "Minimum total and science credits",
            "description": str(
                curriculum.get("total_credits", {}).get("FB7_1") or ""
            ),
            "category": "curriculum",
            "severity": "warning",
        },
        {
            "id": "FB7.2",
            "title": "Minimum level 7 credits",
            "description": str(
                curriculum.get("senior_courses_requirement", {}).get("FB7_2") or ""
            ),
            "category": "curriculum",
            "severity": "warning",
        },
        {
            "id": "FB7.3",
            "title": "Mathematics and statistics requirement",
            "description": str(
                curriculum.get("mathematics_requirement", {}).get("FB7_3") or ""
            ),
            "category": "curriculum",
            "severity": "warning",
        },
        {
            "id": "FB7.6",
            "title": "Prerequisite enforcement",
            "description": str(
                curriculum.get("prerequisites_critical_note", {}).get("FB7_6_note3")
                or ""
            ),
            "category": "prerequisite",
            "severity": "blocker",
        },
    ]


def _normalize_rules_payload(
    payload: dict[str, Any], run_id: str, handbook_title: str | None
) -> dict[str, Any]:
    if "planner_policy" in payload and "focused_policy_rules" in payload:
        payload.setdefault("run_id", run_id)
        payload.setdefault("handbook_title", handbook_title or "")
        return payload

    bsc_rules = payload.get("bsc_degree_rules", {})
    registration = bsc_rules.get("registration_limits", {})
    readmission_2023 = bsc_rules.get("readmission_rules_from_2023", {})
    curriculum = bsc_rules.get("curriculum_rules", {})
    transfer = bsc_rules.get("transfer_from_other_faculties", {})

    sb001 = readmission_2023.get("bsc_standard_SB001", {})
    sb016 = readmission_2023.get("edp_SB016", {})

    sb001_requirements = {
        "preceding_year_min_credits": _extract_first_int(sb001.get("FB5_1")),
        "milestones": [
            milestone
            for milestone in [
                _build_milestone(1, sb001.get("by_end_of_year_1")),
                _build_milestone(2, sb001.get("by_end_of_year_2")),
                _build_milestone(3, sb001.get("by_end_of_year_3")),
            ]
            if milestone is not None
        ],
    }
    sb016_requirements = {
        "preceding_year_min_credits": _extract_first_int(sb016.get("FB5_2")),
        "milestones": [
            milestone
            for milestone in [
                _build_milestone(1, sb016.get("by_end_of_year_1")),
                _build_milestone(2, sb016.get("by_end_of_year_2")),
                _build_milestone(3, sb016.get("by_end_of_year_3")),
                _build_milestone(4, sb016.get("by_end_of_year_4")),
            ]
            if milestone is not None
        ],
    }

    fb7_1_text = curriculum.get("total_credits", {}).get("FB7_1")
    min_total_nqf_credits = _extract_first_int(fb7_1_text)
    min_science_credits = None
    if isinstance(fb7_1_text, str):
        all_numbers = [int(match) for match in re.findall(r"\d+", fb7_1_text)]
        if len(all_numbers) >= 2:
            min_science_credits = all_numbers[1]
    min_level7_credits = _extract_first_int(
        curriculum.get("senior_courses_requirement", {}).get("FB7_2")
    )

    # FB7.1 text includes both totals. Keep science min fixed if exact parse is ambiguous.
    if min_science_credits is None:
        min_science_credits = 180

    max_term_credits = _extract_first_int(registration.get("FB3")) or 72

    focused_policy_rules = {
        "handbook_title": handbook_title or payload.get("document", ""),
        "readmission_from_2023": {
            "sb001": {
                "rule_code": "FB5.1",
                "text": str(sb001.get("FB5_1") or ""),
                "requirements": sb001_requirements,
            },
            "sb016": {
                "rule_code": "FB5.2",
                "text": str(sb016.get("FB5_2") or ""),
                "requirements": sb016_requirements,
            },
            "related_matters": bsc_rules.get("general_readmission_rules", {}),
        },
        "transfer_into_science": {
            "rule_code": "FB6",
            "text": str(transfer.get("FB6") or ""),
            "minimum_requirements": [
                "Meet normal BSc school-leaving subject requirements.",
                "Comply with FB5.1-FB5.3 (not academically excluded).",
            ],
        },
        "bsc_curricula_rules": {
            "section_title": "Curricula rules for the Bachelor of Science (BSc) degree",
            "rules": curriculum,
            "minimum_requirements": {
                "min_total_nqf_credits": min_total_nqf_credits,
                "min_science_credits": min_science_credits,
                "min_level7_credits": min_level7_credits,
            },
        },
        "operational_constraints": {
            "readmission": {
                "sb001": {
                    "preceding_year_min_credits": sb001_requirements.get(
                        "preceding_year_min_credits"
                    ),
                    "year_end_milestones": sb001_requirements.get("milestones", []),
                },
                "sb016": {
                    "preceding_year_min_credits": sb016_requirements.get(
                        "preceding_year_min_credits"
                    ),
                    "year_end_milestones": sb016_requirements.get("milestones", []),
                },
            },
            "transfer_into_science": {
                "minimum_requirements": [
                    "Meet normal BSc school-leaving subject requirements.",
                    "Comply with FB5.1-FB5.3 (not academically excluded).",
                ],
            },
            "bsc_curriculum": {
                "min_total_nqf_credits": min_total_nqf_credits,
                "min_science_credits": min_science_credits,
                "min_level7_credits": min_level7_credits,
            },
            "registration": {
                "max_term_credits": max_term_credits,
            },
        },
    }

    planner_policy = {
        "min_term_credits": 30,
        "max_term_credits": max_term_credits,
        "disallow_postgrad_before_year": 4,
        "enforce_unique_courses": True,
        "enforce_prerequisite_sequence": True,
        "bsc_curriculum_min_total_credits": min_total_nqf_credits,
        "bsc_curriculum_min_science_credits": min_science_credits,
        "bsc_curriculum_min_level7_credits": min_level7_credits,
    }

    return {
        "run_id": run_id,
        "handbook_title": handbook_title or payload.get("document", ""),
        "generated_at": "",
        "rule_count": 0,
        "rules": _build_source_rules_from_rulebook(payload),
        "planner_policy": planner_policy,
        "focused_policy_rules": focused_policy_rules,
        "rulebook": payload,
    }


class ScienceHandbookRulesService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.base_dir = settings.resolved_data_dir
        self.rules_agent = HandbookRulesAgent()

    @property
    def _rules_dir(self) -> Path:
        path = self.base_dir / "rules"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _resolve_run_id(self, run_id: str | None) -> str:
        if run_id:
            return run_id

        chunks_dir = self.base_dir / "chunks"
        if not chunks_dir.exists():
            raise FileNotFoundError("No chunk artifacts found. Run /pipelines/science/run first.")

        manifests = sorted(
            chunks_dir.glob("*.manifest.json"),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        if not manifests:
            raise FileNotFoundError("No chunk manifests available. Run /pipelines/science/run first.")

        return manifests[0].name.replace(".manifest.json", "")

    def _rules_cache_path(self, run_id: str, handbook_title: str | None) -> Path:
        suffix = "all"
        if handbook_title:
            suffix = re.sub(r"[^a-z0-9]+", "-", handbook_title.lower()).strip("-") or "all"
        return self._rules_dir / f"{run_id}.{suffix}.rules.json"

    def _load_chunks(self, run_id: str) -> list[dict[str, Any]]:
        chunks_path = self.base_dir / "chunks" / f"{run_id}.jsonl"
        if not chunks_path.exists():
            raise FileNotFoundError(
                f"Chunk file not found for run_id={run_id}. Run /pipelines/science/run first."
            )

        rows: list[dict[str, Any]] = []
        with chunks_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                rows.append(json.loads(line))
        return rows

    def extract_rules(
        self,
        run_id: str | None = None,
        handbook_title: str | None = "2026 Science-Handbook-UCT",
        force_refresh: bool = False,
    ) -> dict[str, Any]:
        resolved_run_id = self._resolve_run_id(run_id)
        cache_path = self._rules_cache_path(resolved_run_id, handbook_title)

        if cache_path.exists() and not force_refresh:
            cached_payload = json.loads(cache_path.read_text(encoding="utf-8"))
            return _normalize_rules_payload(
                cached_payload,
                run_id=resolved_run_id,
                handbook_title=handbook_title,
            )

        chunks = self._load_chunks(resolved_run_id)
        payload = self.rules_agent.build_rules_payload(
            chunks=chunks,
            run_id=resolved_run_id,
            handbook_title=handbook_title,
        )

        cache_path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")
        return _normalize_rules_payload(
            payload,
            run_id=resolved_run_id,
            handbook_title=handbook_title,
        )

    def validate_plan(
        self,
        planned_courses: list[dict[str, Any]],
        selected_majors: list[str] | None = None,
        run_id: str | None = None,
        handbook_title: str | None = "2026 Science-Handbook-UCT",
    ) -> dict[str, Any]:
        extracted = self.extract_rules(run_id=run_id, handbook_title=handbook_title)
        policy = extracted.get("planner_policy", {})
        source_rules = extracted.get("rules", [])

        source_rules_by_id: dict[str, dict[str, Any]] = {}
        source_rules_by_category: dict[str, dict[str, Any]] = {}
        for rule in source_rules:
            if not isinstance(rule, dict):
                continue
            rule_id = str(rule.get("id", "")).strip()
            rule_category = str(rule.get("category", "")).strip()
            if rule_id:
                source_rules_by_id[rule_id] = rule
            if rule_category and rule_category not in source_rules_by_category:
                source_rules_by_category[rule_category] = rule

        def _attach_evidence(
            issue: dict[str, Any],
            *,
            preferred_rule_ids: list[str] | None = None,
            fallback_reference: str | None = None,
            fallback_text: str | None = None,
        ) -> None:
            evidence_rule: dict[str, Any] | None = None
            for candidate_id in preferred_rule_ids or []:
                if candidate_id in source_rules_by_id:
                    evidence_rule = source_rules_by_id[candidate_id]
                    break

            if evidence_rule is None:
                category = str(issue.get("category", "")).strip()
                evidence_rule = source_rules_by_category.get(category)

            rule_reference: str | None = None
            rule_source_text: str | None = None

            if evidence_rule is not None:
                rule_id = str(evidence_rule.get("id", "")).strip()
                rule_title = str(evidence_rule.get("title", "")).strip()
                rule_desc = str(evidence_rule.get("description", "")).strip()
                if rule_id and rule_title:
                    rule_reference = f"{rule_id}: {rule_title}"
                elif rule_id:
                    rule_reference = rule_id
                elif rule_title:
                    rule_reference = rule_title
                if rule_desc:
                    rule_source_text = rule_desc

            if not rule_reference:
                rule_reference = fallback_reference
            if not rule_source_text:
                rule_source_text = fallback_text

            if rule_reference:
                issue["ruleReference"] = rule_reference
            if rule_source_text:
                issue["ruleSourceText"] = rule_source_text

        selected_majors = [str(major).strip() for major in (selected_majors or []) if str(major).strip()]

        min_term_credits = int(policy.get("min_term_credits", 30))
        max_term_credits = int(policy.get("max_term_credits", 75))
        postgrad_min_year = int(policy.get("disallow_postgrad_before_year", 4))
        focused = extracted.get("focused_policy_rules", {})
        constraints = focused.get("operational_constraints", {})
        rulebook = extracted.get("rulebook", {})

        issues: list[dict[str, Any]] = []
        issue_counter = 1

        term_credit_totals: dict[str, int] = {}
        year_credit_totals: dict[int, int] = {}
        code_seen: dict[str, int] = {}
        science_credit_total = 0
        level7_credit_total = 0
        all_credit_total = 0

        science_prefixes = {
            "AGE",
            "AST",
            "BIO",
            "CEM",
            "CSC",
            "EGS",
            "GEO",
            "HUB",
            "MAM",
            "MCB",
            "PHY",
            "SEA",
            "STA",
        }

        for course in planned_courses:
            code = str(course.get("code", "")).strip().upper()
            year = str(course.get("year", "Year 1"))
            semester = str(course.get("semester", "Semester 1"))
            credits = int(course.get("credits", 0) or 0)
            year_number = _parse_year_number(year)
            term = _parse_term_label(year, semester)

            if code:
                code_seen[code] = code_seen.get(code, 0) + 1

            term_credit_totals[term] = term_credit_totals.get(term, 0) + credits
            year_credit_totals[year_number] = year_credit_totals.get(year_number, 0) + credits
            all_credit_total += credits

            prefix = _science_prefix(code)
            if prefix in science_prefixes:
                science_credit_total += credits

            level = _code_level(code)
            if level == 3:
                level7_credit_total += credits

            if code and _is_postgrad_code(code):
                if year_number < postgrad_min_year:
                    issues.append(
                        {
                            "id": f"rule-val-{issue_counter}",
                            "severity": "blocker",
                            "category": "policy",
                            "title": f"Postgrad course planned too early: {code}",
                            "message": (
                                f"{code} appears to be postgraduate level and should be planned from "
                                f"Year {postgrad_min_year} onward based on handbook rules."
                            ),
                            "relatedCourseCode": code,
                            "relatedTerm": term,
                        }
                    )
                    _attach_evidence(
                        issues[-1],
                        preferred_rule_ids=["FB7.6"],
                        fallback_reference="Handbook sequencing rule",
                    )
                    issue_counter += 1

            if code.endswith("F") and "2" in semester:
                issues.append(
                    {
                        "id": f"rule-val-{issue_counter}",
                        "severity": "blocker",
                        "category": "policy",
                        "title": f"Semester mismatch for {code}",
                        "message": (
                            f"{code} is a first-semester course (F) and cannot be planned in {semester}."
                        ),
                        "relatedCourseCode": code,
                        "relatedTerm": term,
                    }
                )
                _attach_evidence(
                    issues[-1],
                    preferred_rule_ids=["FB7.6"],
                    fallback_reference="Handbook semester placement rule",
                )
                issue_counter += 1

            if code.endswith("S") and "1" in semester:
                issues.append(
                    {
                        "id": f"rule-val-{issue_counter}",
                        "severity": "blocker",
                        "category": "policy",
                        "title": f"Semester mismatch for {code}",
                        "message": (
                            f"{code} is a second-semester course (S) and cannot be planned in {semester}."
                        ),
                        "relatedCourseCode": code,
                        "relatedTerm": term,
                    }
                )
                _attach_evidence(
                    issues[-1],
                    preferred_rule_ids=["FB7.6"],
                    fallback_reference="Handbook semester placement rule",
                )
                issue_counter += 1

            if (code.endswith("H") or code.endswith("W")) and "2" in semester:
                issues.append(
                    {
                        "id": f"rule-val-{issue_counter}",
                        "severity": "blocker",
                        "category": "policy",
                        "title": f"Full-year course placement issue for {code}",
                        "message": (
                            f"{code} is a full-year course and should be planned from Semester 1."
                        ),
                        "relatedCourseCode": code,
                        "relatedTerm": term,
                    }
                )
                _attach_evidence(
                    issues[-1],
                    preferred_rule_ids=["FB7.6"],
                    fallback_reference="Handbook full-year course placement rule",
                )
                issue_counter += 1

        for code, count in code_seen.items():
            if count > 1:
                issues.append(
                    {
                        "id": f"rule-val-{issue_counter}",
                        "severity": "warning",
                        "category": "policy",
                        "title": f"Duplicate planned course: {code}",
                        "message": f"{code} appears {count} times in the plan. Review whether duplicates are valid.",
                        "relatedCourseCode": code,
                    }
                )
                _attach_evidence(
                    issues[-1],
                    fallback_reference="Handbook uniqueness expectation",
                )
                issue_counter += 1

        for term, total in term_credit_totals.items():
            if total < min_term_credits:
                issues.append(
                    {
                        "id": f"rule-val-{issue_counter}",
                        "severity": "warning",
                        "category": "load",
                        "title": f"Underload against handbook rule in {term}",
                        "message": (
                            f"{term} has {total} credits. Handbook-derived minimum term load is "
                            f"{min_term_credits} credits."
                        ),
                        "relatedTerm": term,
                    }
                )
                _attach_evidence(
                    issues[-1],
                    preferred_rule_ids=["FB3"],
                    fallback_reference="FB3: Semester registration cap",
                )
                issue_counter += 1
            if total > max_term_credits:
                issues.append(
                    {
                        "id": f"rule-val-{issue_counter}",
                        "severity": "blocker",
                        "category": "load",
                        "title": f"Overload against handbook rule in {term}",
                        "message": (
                            f"{term} has {total} credits. Handbook-derived maximum term load is "
                            f"{max_term_credits} credits."
                        ),
                        "relatedTerm": term,
                    }
                )
                _attach_evidence(
                    issues[-1],
                    preferred_rule_ids=["FB3"],
                    fallback_reference="FB3: Semester registration cap",
                )
                issue_counter += 1

        bsc_constraints = constraints.get("bsc_curriculum", {})
        min_total = bsc_constraints.get("min_total_nqf_credits")
        min_science = bsc_constraints.get("min_science_credits")
        min_level7 = bsc_constraints.get("min_level7_credits")

        if isinstance(min_total, int) and all_credit_total < min_total:
            issues.append(
                {
                    "id": f"rule-val-{issue_counter}",
                    "severity": "warning",
                    "category": "curriculum",
                    "title": "BSc total credits below handbook minimum",
                    "message": (
                        f"Planned total is {all_credit_total} credits. The handbook minimum is "
                        f"{min_total} total NQF credits (FB7.1)."
                    ),
                }
            )
            _attach_evidence(
                issues[-1],
                preferred_rule_ids=["FB7.1"],
                fallback_reference="FB7.1: Minimum total and science credits",
            )
            issue_counter += 1

        if isinstance(min_science, int) and science_credit_total < min_science:
            issues.append(
                {
                    "id": f"rule-val-{issue_counter}",
                    "severity": "warning",
                    "category": "curriculum",
                    "title": "Science credits below handbook minimum",
                    "message": (
                        f"Planned science-aligned credits are {science_credit_total}. The handbook "
                        f"minimum is {min_science} science credits (FB7.1)."
                    ),
                }
            )
            _attach_evidence(
                issues[-1],
                preferred_rule_ids=["FB7.1"],
                fallback_reference="FB7.1: Minimum total and science credits",
            )
            issue_counter += 1

        if isinstance(min_level7, int) and level7_credit_total < min_level7:
            issues.append(
                {
                    "id": f"rule-val-{issue_counter}",
                    "severity": "warning",
                    "category": "curriculum",
                    "title": "Level 7 credits below handbook minimum",
                    "message": (
                        f"Planned level 7-aligned credits are {level7_credit_total}. The handbook "
                        f"minimum is {min_level7} level 7 credits (FB7.2)."
                    ),
                }
            )
            _attach_evidence(
                issues[-1],
                preferred_rule_ids=["FB7.2"],
                fallback_reference="FB7.2: Minimum level 7 credits",
            )
            issue_counter += 1

        # FB7.3 mathematics/statistics requirement: either 18 MAM + 18 STA (level 5)
        # or at least 36 MAM credits (level 5).
        level5_math_credits = 0
        level5_stats_credits = 0
        for course in planned_courses:
            code = str(course.get("code", "")).strip().upper()
            credits = int(course.get("credits", 0) or 0)
            level = _code_level(code)
            if level != 1:
                continue
            prefix = _science_prefix(code)
            if prefix == "MAM":
                level5_math_credits += credits
            if prefix == "STA":
                level5_stats_credits += credits

        meets_math_option_a = level5_math_credits >= 18 and level5_stats_credits >= 18
        meets_math_option_b = level5_math_credits >= 36
        if not (meets_math_option_a or meets_math_option_b):
            issues.append(
                {
                    "id": f"rule-val-{issue_counter}",
                    "severity": "warning",
                    "category": "curriculum",
                    "title": "Mathematics/statistics requirement not yet met",
                    "message": (
                        "FB7.3 requires either at least 18 level-5 Mathematics credits plus "
                        "18 level-5 Statistics credits, or at least 36 level-5 Mathematics "
                        "credits. Current plan does not yet satisfy this."
                    ),
                }
            )
            _attach_evidence(
                issues[-1],
                preferred_rule_ids=["FB7.3"],
                fallback_reference="FB7.3: Mathematics/statistics requirement",
            )
            issue_counter += 1

        majors_rule_text = (
            rulebook.get("bsc_degree_rules", {})
            .get("curriculum_rules", {})
            .get("majors", {})
            .get("FB7_5")
        )
        major_constraints = (
            rulebook.get("bsc_degree_rules", {})
            .get("curriculum_rules", {})
            .get("majors", {})
            .get("special_constraints", {})
        )
        available_majors = (
            rulebook.get("bsc_degree_rules", {})
            .get("curriculum_rules", {})
            .get("majors", {})
            .get("available_majors", [])
        )
        if majors_rule_text:
            level7_science_courses = [
                str(course.get("code", "")).strip().upper()
                for course in planned_courses
                if _code_level(str(course.get("code", "")).strip().upper()) == 3
                and _science_prefix(str(course.get("code", "")).strip().upper())
                in science_prefixes
            ]
            if not level7_science_courses:
                issues.append(
                    {
                        "id": f"rule-val-{issue_counter}",
                        "severity": "info",
                        "category": "curriculum",
                        "title": "Major progression evidence not yet visible",
                        "message": (
                            "FB7.5 requires at least one approved major. No level-7 science "
                            "courses are currently present in this plan snapshot."
                        ),
                    }
                )
                _attach_evidence(
                    issues[-1],
                    fallback_reference="FB7.5: Approved major requirement",
                    fallback_text=str(majors_rule_text),
                )
                issue_counter += 1

        if majors_rule_text and not selected_majors:
            issues.append(
                {
                    "id": f"rule-val-{issue_counter}",
                    "severity": "warning",
                    "category": "major",
                    "title": "No major selected",
                    "message": "FB7.5 requires at least one approved major. Select at least one major in the planner.",
                }
            )
            _attach_evidence(
                issues[-1],
                fallback_reference="FB7.5: Approved major requirement",
                fallback_text=str(majors_rule_text),
            )
            issue_counter += 1

        if selected_majors and isinstance(available_majors, list) and len(available_majors) > 0:
            def _normalize_major_name(name: str) -> str:
                normalized = re.sub(r"\bmajor\b", "", name.lower())
                normalized = re.sub(r"[^a-z0-9]+", "", normalized)
                return normalized.strip()

            available_major_set = {
                _normalize_major_name(str(item))
                for item in available_majors
                if str(item).strip()
            }
            for major in selected_majors:
                if _normalize_major_name(major) not in available_major_set:
                    issues.append(
                        {
                            "id": f"rule-val-{issue_counter}",
                            "severity": "blocker",
                            "category": "major",
                            "title": f"Major not recognized by handbook: {major}",
                            "message": (
                                f"{major} does not appear in the handbook-approved majors list (FB7.5)."
                            ),
                        }
                    )
                    _attach_evidence(
                        issues[-1],
                        fallback_reference="FB7.5: Approved major requirement",
                        fallback_text=str(majors_rule_text),
                    )
                    issue_counter += 1

        if selected_majors:
            selected_major_set = set(selected_majors)
            if "Business Computing" in selected_major_set and "Computer Science" not in selected_major_set:
                issues.append(
                    {
                        "id": f"rule-val-{issue_counter}",
                        "severity": "blocker",
                        "category": "major",
                        "title": "Business Computing requires Computer Science",
                        "message": str(
                            major_constraints.get(
                                "Business_Computing",
                                "Business Computing may only be taken with Computer Science.",
                            )
                        ),
                    }
                )
                _attach_evidence(
                    issues[-1],
                    fallback_reference="FB7.5: Major combination constraint",
                    fallback_text=str(major_constraints.get("Business_Computing", "")),
                )
                issue_counter += 1

            if "Computer Engineering" in selected_major_set and "Computer Science" not in selected_major_set:
                issues.append(
                    {
                        "id": f"rule-val-{issue_counter}",
                        "severity": "blocker",
                        "category": "major",
                        "title": "Computer Engineering requires Computer Science",
                        "message": str(
                            major_constraints.get(
                                "Computer_Engineering",
                                "Computer Engineering may only be taken with Computer Science.",
                            )
                        ),
                    }
                )
                _attach_evidence(
                    issues[-1],
                    fallback_reference="FB7.5: Major combination constraint",
                    fallback_text=str(major_constraints.get("Computer_Engineering", "")),
                )
                issue_counter += 1

            stats_track = {
                "Applied Statistics",
                "Mathematical Statistics",
                "Statistics & Data Science",
            }
            selected_stats_majors = sorted(stats_track.intersection(selected_major_set))
            if len(selected_stats_majors) > 1:
                issues.append(
                    {
                        "id": f"rule-val-{issue_counter}",
                        "severity": "blocker",
                        "category": "major",
                        "title": "Conflicting statistics majors selected",
                        "message": (
                            "Only one of Applied Statistics, Mathematical Statistics, and "
                            "Statistics & Data Science may count toward the BSc degree."
                        ),
                    }
                )
                _attach_evidence(
                    issues[-1],
                    fallback_reference="FB7.5: Statistics major exclusivity",
                )
                issue_counter += 1

            major_prefix_map: dict[str, set[str]] = {
                "Applied Mathematics": {"MAM"},
                "Applied Statistics": {"STA"},
                "Archaeology": {"AGE"},
                "Artificial Intelligence": {"CSC"},
                "Astrophysics": {"AST", "PHY"},
                "Biochemistry": {"MCB"},
                "Biology": {"BIO"},
                "Business Computing": {"INF", "CSC"},
                "Chemistry": {"CEM"},
                "Computer Science": {"CSC"},
                "Computer Engineering": {"EEE", "CSC"},
                "Environmental & Geographical Science": {"EGS"},
                "Genetics": {"MCB"},
                "Geology": {"GEO"},
                "Human Anatomy & Physiology": {"HUB"},
                "Marine Biology": {"BIO", "SEA"},
                "Mathematical Statistics": {"STA"},
                "Mathematics": {"MAM"},
                "Ocean & Atmosphere Science": {"SEA", "EGS"},
                "Physics": {"PHY"},
                "Quantitative Biology": {"BIO", "STA", "MAM"},
                "Statistics & Data Science": {"STA"},
            }

            level7_by_code: dict[str, int] = {}
            for course in planned_courses:
                code = str(course.get("code", "")).strip().upper()
                if _code_level(code) != 3:
                    continue
                credits = int(course.get("credits", 0) or 0)
                if code and code not in level7_by_code:
                    level7_by_code[code] = credits

            for major in selected_majors:
                major_prefixes = major_prefix_map.get(major)
                if not major_prefixes:
                    issues.append(
                        {
                            "id": f"rule-val-{issue_counter}",
                            "severity": "info",
                            "category": "major",
                            "title": f"Major coverage could not be computed for {major}",
                            "message": (
                                f"FB7.7 requires at least 72 distinct level-7 credits per major. "
                                f"Please verify this manually for {major}."
                            ),
                        }
                    )
                    _attach_evidence(
                        issues[-1],
                        fallback_reference="FB7.7: Major level-7 credit minimum",
                    )
                    issue_counter += 1
                    continue

                major_level7_credits = sum(
                    credits
                    for code, credits in level7_by_code.items()
                    if _science_prefix(code) in major_prefixes
                )
                if major_level7_credits < 72:
                    issues.append(
                        {
                            "id": f"rule-val-{issue_counter}",
                            "severity": "warning",
                            "category": "major",
                            "title": f"Level-7 credits shortfall for {major}",
                            "message": (
                                f"FB7.7 expects at least 72 distinct level-7 credits per major. "
                                f"Current plan has {major_level7_credits} level-7 credits mapped to {major}."
                            ),
                        }
                    )
                    issue_counter += 1

        readmission_constraints = constraints.get("readmission", {})
        sb001 = readmission_constraints.get("sb001", {})
        sb016 = readmission_constraints.get("sb016", {})

        def _evaluate_pathway(path_key: str, data: dict[str, Any]) -> tuple[int, list[dict[str, Any]]]:
            local_issues: list[dict[str, Any]] = []
            local_counter = issue_counter

            preceding_year_min = data.get("preceding_year_min_credits")
            milestones = data.get("year_end_milestones", [])

            if isinstance(preceding_year_min, int):
                for year_number in sorted(year_credit_totals):
                    if year_number <= 1:
                        continue
                    prev_year_credits = year_credit_totals.get(year_number - 1, 0)
                    if prev_year_credits < preceding_year_min:
                        local_issues.append(
                            {
                                "id": f"rule-val-{local_counter}",
                                "severity": "warning",
                                "category": "readmission",
                                "title": f"{path_key.upper()} preceding-year credits below minimum",
                                "message": (
                                    f"Year {year_number - 1} has {prev_year_credits} credits. "
                                    f"{path_key.upper()} readmission expects at least "
                                    f"{preceding_year_min} in the preceding year (FB5)."
                                ),
                                "relatedTerm": f"Year {year_number - 1}",
                            }
                        )
                        _attach_evidence(
                            local_issues[-1],
                            fallback_reference="FB5: Readmission progression",
                        )
                        local_counter += 1

            for milestone in milestones:
                milestone_year = milestone.get("year")
                milestone_min = milestone.get("min_credits")
                if not isinstance(milestone_year, int) or not isinstance(milestone_min, int):
                    continue
                cumulative = sum(
                    credits
                    for year_number, credits in year_credit_totals.items()
                    if year_number <= milestone_year
                )
                if cumulative < milestone_min:
                    local_issues.append(
                        {
                            "id": f"rule-val-{local_counter}",
                            "severity": "warning",
                            "category": "readmission",
                            "title": f"{path_key.upper()} milestone shortfall by end of year {milestone_year}",
                            "message": (
                                f"Cumulative planned credits by end of Year {milestone_year} are "
                                f"{cumulative}. {path_key.upper()} requires at least {milestone_min} "
                                f"by this point (FB5)."
                            ),
                            "relatedTerm": f"Year {milestone_year}",
                        }
                    )
                    _attach_evidence(
                        local_issues[-1],
                        fallback_reference="FB5: Readmission progression",
                    )
                    local_counter += 1

            return local_counter, local_issues

        pathway_results: list[tuple[str, list[dict[str, Any]], int]] = []
        for pathway_key, pathway_data in (("sb001", sb001), ("sb016", sb016)):
            if not isinstance(pathway_data, dict):
                continue
            next_counter, pathway_issues = _evaluate_pathway(pathway_key, pathway_data)
            pathway_results.append((pathway_key, pathway_issues, next_counter))

        if pathway_results:
            best_pathway = min(pathway_results, key=lambda item: len(item[1]))
            chosen_pathway, chosen_issues, next_counter = best_pathway
            issue_counter = next_counter
            issues.extend(chosen_issues)

            issues.append(
                {
                    "id": f"rule-val-{issue_counter}",
                    "severity": "info",
                    "category": "readmission",
                    "title": "Readmission pathway applied for validation",
                    "message": (
                        f"Readmission checks were applied using {chosen_pathway.upper()} milestones "
                        "(the best-fitting pathway for the current plan projection)."
                    ),
                }
            )
            _attach_evidence(
                issues[-1],
                fallback_reference="FB6: Transfer into Science",
                fallback_text="Meet normal BSc subject requirements and comply with FB5 progression rules.",
            )
            issue_counter += 1

        # Ensure every critical rule failure has handbook-grounded evidence.
        for issue in issues:
            if issue.get("severity") not in {"blocker", "warning"}:
                continue
            if issue.get("ruleReference") or issue.get("ruleSourceText"):
                continue
            _attach_evidence(
                issue,
                fallback_reference="Handbook planner policy",
                fallback_text="Validation is grounded in extracted handbook planner policy and focused rule constraints.",
            )

        transfer_constraints = constraints.get("transfer_into_science", {}).get(
            "minimum_requirements", []
        )
        if transfer_constraints:
            issues.append(
                {
                    "id": f"rule-val-{issue_counter}",
                    "severity": "info",
                    "category": "transfer",
                    "title": "Transfer-to-Science policy requirements",
                    "message": (
                        "For transfer cases, satisfy all FB6 minimum requirements: "
                        + "; ".join(str(req) for req in transfer_constraints)
                    ),
                }
            )
            issue_counter += 1

        summary = {
            "blockers": sum(1 for issue in issues if issue.get("severity") == "blocker"),
            "warnings": sum(1 for issue in issues if issue.get("severity") == "warning"),
            "infos": sum(1 for issue in issues if issue.get("severity") == "info"),
        }

        return {
            "run_id": extracted.get("run_id"),
            "handbook_title": extracted.get("handbook_title"),
            "planner_policy": policy,
            "source_rules": source_rules,
            "focused_policy_rules": focused,
            "selected_majors": selected_majors,
            "issues": issues,
            "summary": summary,
        }
