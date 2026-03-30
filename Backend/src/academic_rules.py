from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from src.agents.handbook_rules_agent import HandbookRulesAgent
from src.config import Settings
from src.handbook_store import HandbookStore
from src.handbook_validator import HandbookValidator
from src.storage import ChunkStore


_COURSE_REQUIREMENTS_CACHE: dict[str, dict[str, dict[str, Any]]] = {}


def _parse_year_number(value: str) -> int:
    match = re.search(r"\d+", value)
    return int(match.group(0)) if match else 1


def _parse_term_label(year: str, semester: str) -> str:
    year_number = _parse_year_number(year)
    sem_match = re.search(r"\d+", semester)
    sem_number = int(sem_match.group(0)) if sem_match else 1
    return f"Year {year_number} - Semester {sem_number}"


def _parse_semester_number(value: str) -> int:
    normalized = str(value or "").strip().lower()
    explicit = _extract_first_int(normalized)
    if explicit in {1, 2}:
        return explicit
    if normalized in {"f", "s1", "semester 1", "first"}:
        return 1
    if normalized in {"s", "s2", "semester 2", "second"}:
        return 2
    return 1


def _term_index(year: str, semester: str) -> int:
    return (_parse_year_number(year) * 10) + _parse_semester_number(semester)


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


def _normalize_course_code(code: Any) -> str:
    return str(code or "").strip().upper()


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


def _load_course_requirements(base_dir: Path) -> dict[str, dict[str, Any]]:
    cache_key = str(base_dir.resolve())
    cached = _COURSE_REQUIREMENTS_CACHE.get(cache_key)
    if cached is not None:
        return cached

    requirements: dict[str, dict[str, Any]] = {}
    courses_root = base_dir / "handbook" / "faculties"
    for course_file in courses_root.glob("*/courses/*.json"):
        if course_file.name.startswith("_"):
            continue
        try:
            payload = json.loads(course_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        if not isinstance(payload, dict):
            continue

        code = _normalize_course_code(payload.get("code") or course_file.stem)
        if not code:
            continue

        prerequisites = payload.get("prerequisites")
        prerequisite_codes = _extract_course_codes_from_value(prerequisites)
        if isinstance(prerequisites, dict):
            prerequisite_codes.update(_extract_course_codes_from_value(prerequisites.get("parsed")))
            prerequisite_codes.update(_extract_course_codes_from_value(prerequisites.get("text")))

        corequisites = payload.get("corequisites")
        corequisite_codes = _extract_course_codes_from_value(corequisites)

        requirements[code] = {
            "code": code,
            "title": str(payload.get("title") or code).strip(),
            "prerequisites": {item for item in prerequisite_codes if item != code},
            "corequisites": {item for item in corequisite_codes if item != code},
        }

    _COURSE_REQUIREMENTS_CACHE[cache_key] = requirements
    return requirements


def _course_code_variants(code: str) -> set[str]:
    """Expand compact handbook patterns like STA1000F/S/P/L into concrete variants."""
    normalized = _normalize_course_code(code)
    if not normalized:
        return set()

    variants: set[str] = {normalized}

    compact_suffix = re.fullmatch(r"([A-Z]{3,4}\d{4})([A-Z](?:/[A-Z]){1,5})", normalized)
    if compact_suffix:
        base = compact_suffix.group(1)
        suffixes = compact_suffix.group(2).split("/")
        for suffix in suffixes:
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


def _load_equivalence_map(base_dir: Path) -> dict[str, set[str]]:
    equivalence_map: dict[str, set[str]] = {}
    for path in (base_dir / "handbook" / "faculties").glob("*/equivalences.json"):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue

        entries = payload.get("equivalences", []) if isinstance(payload, dict) else []
        if not isinstance(entries, list):
            continue

        for group in entries:
            if not isinstance(group, dict):
                continue
            group_entries = group.get("entries", [])
            if not isinstance(group_entries, list):
                continue

            for entry in group_entries:
                if not isinstance(entry, dict):
                    continue

                required_codes = _extract_course_codes_from_value(entry.get("credit_required"))
                completed_codes = _extract_course_codes_from_value(entry.get("completed_course"))

                if not required_codes or not completed_codes:
                    continue

                expanded_completed: set[str] = set()
                for code in completed_codes:
                    expanded_completed.update(_course_code_variants(code))

                for required in required_codes:
                    key = _normalize_course_code(required)
                    if not key:
                        continue
                    accepted = equivalence_map.setdefault(key, set())
                    accepted.update(_course_code_variants(key))
                    accepted.update(expanded_completed)

    return equivalence_map


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


def _is_course_requirement_satisfied(required_code: str, known_codes: set[str]) -> bool:
    required_variants = _course_code_variants(required_code)
    if not required_variants:
        return False
    return not known_codes.isdisjoint(required_variants)


def _extract_course_option_groups(courses: Any) -> list[tuple[str, set[str]]]:
    if not isinstance(courses, list):
        return []

    groups: list[tuple[str, set[str]]] = []
    for course in courses:
        if isinstance(course, dict):
            primary = _normalize_course_code(course.get("code"))
            alternatives = _extract_course_codes_from_value(course.get("alternative"))
            options: set[str] = set()
            if primary:
                options.update(_course_code_variants(primary))
            for alt in alternatives:
                options.update(_course_code_variants(alt))
            label = primary or "/".join(sorted(alternatives)[:2])
            if label and options:
                groups.append((label, options))
            continue

        fallback_codes = _extract_course_codes_from_value(course)
        if not fallback_codes:
            continue
        options: set[str] = set()
        for code in fallback_codes:
            options.update(_course_code_variants(code))
        groups.append((sorted(fallback_codes)[0], options))

    return groups


def _extract_year_course_codes(courses: Any) -> set[str]:
    if not isinstance(courses, list):
        return set()
    collected: set[str] = set()
    for course in courses:
        if not isinstance(course, dict):
            continue
        code = _normalize_course_code(course.get("code"))
        if code:
            collected.add(code)
    return collected


def _evaluate_major_combination(combination: dict[str, Any], known_codes: set[str]) -> tuple[bool, list[str], str]:
    combination_id = str(combination.get("combination_id", "")).strip() or "unlabeled-combination"

    required_core = _extract_course_option_groups(combination.get("required_core"))
    courses = _extract_course_option_groups(combination.get("courses"))

    choose_groups = [
        ("choose_one_of", 1),
        ("choose_two_of", 2),
        ("choose_three_of", 3),
    ]

    missing: list[str] = []

    required_groups = required_core if required_core else courses
    for label, option_codes in required_groups:
        if known_codes.isdisjoint(option_codes):
            missing.append(label)

    for field_name, minimum in choose_groups:
        option_groups = _extract_course_option_groups(combination.get(field_name))
        options = [label for label, _ in option_groups]
        if not options:
            continue
        matched = sum(
            1 for _, option_codes in option_groups if not known_codes.isdisjoint(option_codes)
        )
        if matched < minimum:
            missing.append(
                f"{field_name}:{minimum}-of-{len(options)} (matched {matched})"
            )

    return (len(missing) == 0, missing, combination_id)


def _normalize_locked_pathways(payload: dict[str, dict[str, str]] | None) -> dict[str, dict[int, str]]:
    normalized: dict[str, dict[int, str]] = {}
    if not isinstance(payload, dict):
        return normalized

    for major_name, rows in payload.items():
        major_key = re.sub(r"\bmajor\b", "", str(major_name or "").lower())
        major_key = re.sub(r"[^a-z0-9]+", "", major_key).strip()
        if not major_key or not isinstance(rows, dict):
            continue

        normalized_rows: dict[int, str] = {}
        for year_key, combination_id in rows.items():
            year_number = _extract_first_int(year_key)
            combination = str(combination_id or "").strip()
            if year_number is None or not combination:
                continue
            normalized_rows[year_number] = combination

        if normalized_rows:
            normalized[major_key] = normalized_rows

    return normalized


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
        self.chunk_store = ChunkStore(settings.resolved_data_dir, settings=settings)
        self.handbook_store = HandbookStore(settings.resolved_data_dir)
        self.handbook_validator = HandbookValidator(self.handbook_store)

    @property
    def _rules_dir(self) -> Path:
        path = self.base_dir / "rules"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _resolve_run_id(self, run_id: str | None) -> str:
        if run_id:
            return run_id

        latest = self.chunk_store.latest_run_id()
        if not latest:
            raise FileNotFoundError("No chunk artifacts found. Run /pipelines/science/run first.")
        return latest

    def _rules_cache_path(self, run_id: str, handbook_title: str | None) -> Path:
        suffix = "all"
        if handbook_title:
            suffix = re.sub(r"[^a-z0-9]+", "-", handbook_title.lower()).strip("-") or "all"
        return self._rules_dir / f"{run_id}.{suffix}.rules.json"

    def _load_chunks(self, run_id: str) -> list[dict[str, Any]]:
        return self.chunk_store.ensure_local_and_load(run_id)

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
        selected_major_pathways: dict[str, dict[str, str]] | None = None,
        attempt_history: list[dict[str, Any]] | None = None,
        readmission_pathway: str | None = "auto",
        plan_intent: str | None = "snapshot",
        validation_mode: str | None = "advisory",
        run_id: str | None = None,
        handbook_title: str | None = "2026 Science-Handbook-UCT",
    ) -> dict[str, Any]:
        deterministic_result = self.handbook_validator.validate_plan(
            planned_courses=planned_courses,
            selected_majors=selected_majors,
            target_faculty="science",
        )

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

        def _normalize_major_name(name: str) -> str:
            normalized = re.sub(r"\bmajor\b", "", name.lower())
            normalized = re.sub(r"[^a-z0-9]+", "", normalized)
            return normalized.strip()

        selected_majors = [str(major).strip() for major in (selected_majors or []) if str(major).strip()]
        normalized_major_pathways = _normalize_locked_pathways(selected_major_pathways)
        normalized_attempt_history = [
            row
            for row in (attempt_history or [])
            if isinstance(row, dict) and _normalize_course_code(row.get("code"))
        ]
        normalized_plan_intent = str(plan_intent or "snapshot").strip().lower()
        if normalized_plan_intent not in {"snapshot", "graduation_candidate"}:
            normalized_plan_intent = "snapshot"
        normalized_validation_mode = str(validation_mode or "advisory").strip().lower()
        if normalized_validation_mode not in {"advisory", "strict_graduation"}:
            normalized_validation_mode = "advisory"

        equivalence_map = _load_equivalence_map(self.base_dir)
        course_requirements = _load_course_requirements(self.base_dir)

        cross_routes_payload: dict[str, Any] = {}
        cross_routes_candidates = [
            self._rules_dir / "cross-faculty-routes.json",
            self.base_dir / "handbook" / "faculties" / "science" / "rules" / "cross-faculty-routes.json",
        ]
        for cross_routes_path in cross_routes_candidates:
            if not cross_routes_path.exists():
                continue
            try:
                loaded_payload = json.loads(cross_routes_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                continue
            if isinstance(loaded_payload, dict):
                cross_routes_payload = loaded_payload
                break

        configured_external_majors: set[str] = set()
        external_major_prefix_map: dict[str, set[str]] = {}
        external_major_route_codes: dict[str, set[str]] = {}
        external_major_min_level7: dict[str, int] = {}
        external_major_status: dict[str, str] = {}
        external_major_stage_codes: dict[str, dict[str, set[str]]] = {}

        def _gather_route_codes(stages: Any) -> set[str]:
            if not isinstance(stages, list):
                return set()
            collected: set[str] = set()
            for stage in stages:
                if not isinstance(stage, dict):
                    continue
                for key in ("recommended", "required", "options", "courses"):
                    values = stage.get(key)
                    if isinstance(values, list):
                        for code in values:
                            parsed = str(code).strip().upper()
                            if parsed:
                                collected.add(parsed)
            return collected

        global_constraints = cross_routes_payload.get("global_constraints", {})
        route_free_replacement_limit = global_constraints.get("free_replacement_limit_credits")
        route_hierarchical_threshold = global_constraints.get("hierarchical_sequence_required_above_credits")

        for department in cross_routes_payload.get("departments", []):
            if not isinstance(department, dict):
                continue
            dept_prefix = str(department.get("prefix", "")).strip().upper()
            dept_status = str(department.get("status", "active") or "active").strip().lower()
            routes = department.get("routes")
            if not isinstance(routes, list):
                continue

            for route in routes:
                if not isinstance(route, dict):
                    continue
                aliases = route.get("major_names", [])
                if not isinstance(aliases, list):
                    continue

                route_prefixes = {
                    str(prefix).strip().upper()
                    for prefix in route.get("prefixes", [])
                    if str(prefix).strip()
                }
                if not route_prefixes and dept_prefix:
                    route_prefixes = {dept_prefix}

                route_codes = _gather_route_codes(route.get("stages", []))
                route_status = str(route.get("status", dept_status) or dept_status).strip().lower()
                min_level7_credits = route.get("min_level7_credits")
                if not isinstance(min_level7_credits, int):
                    min_level7_credits = 72

                for alias in aliases:
                    major_name = str(alias).strip()
                    if not major_name:
                        continue
                    normalized = _normalize_major_name(major_name)
                    configured_external_majors.add(normalized)
                    external_major_prefix_map[normalized] = set(route_prefixes)
                    external_major_route_codes[normalized] = set(route_codes)
                    external_major_min_level7[normalized] = min_level7_credits
                    external_major_status[normalized] = route_status
                    stage_codes: dict[str, set[str]] = {}
                    for stage in route.get("stages", []):
                        if not isinstance(stage, dict):
                            continue
                        stage_name = str(stage.get("stage", "")).strip().lower()
                        if not stage_name:
                            continue
                        staged = stage_codes.setdefault(stage_name, set())
                        for key in ("recommended", "required", "options", "courses"):
                            values = stage.get(key)
                            if not isinstance(values, list):
                                continue
                            for code in values:
                                parsed = _normalize_course_code(code)
                                if parsed:
                                    staged.add(parsed)
                    if stage_codes:
                        external_major_stage_codes[normalized] = stage_codes

        major_definitions: dict[str, dict[str, Any]] = {}

        def _index_major_alias(defn: dict[str, Any], *candidates: Any) -> None:
            for candidate in candidates:
                normalized_alias = _normalize_major_name(str(candidate or ""))
                if normalized_alias:
                    major_definitions[normalized_alias] = defn

        faculties_dir = self.base_dir / "handbook" / "faculties"
        if faculties_dir.exists():
            for major_file in faculties_dir.glob("*/majors/*.json"):
                if major_file.name.startswith("_"):
                    continue
                try:
                    payload = json.loads(major_file.read_text(encoding="utf-8"))
                except (json.JSONDecodeError, OSError):
                    continue

                if not isinstance(payload, dict):
                    continue

                if isinstance(payload.get("years"), list):
                    defn = {
                        "kind": "major",
                        "name": str(payload.get("major_name") or "").strip(),
                        "years": payload.get("years") or [],
                    }
                    _index_major_alias(
                        defn,
                        payload.get("major_name"),
                        payload.get("major_code"),
                        major_file.stem,
                    )
                    continue

                curriculum = payload.get("curriculum")
                if isinstance(curriculum, list):
                    normalized_years: list[dict[str, Any]] = []
                    for row in curriculum:
                        if not isinstance(row, dict):
                            continue
                        year_number = _extract_first_int(row.get("year"))
                        if year_number is None:
                            continue
                        courses = row.get("courses") if isinstance(row.get("courses"), list) else []
                        normalized_years.append(
                            {
                                "year": year_number,
                                "label": f"Year {year_number} curriculum",
                                "combinations": [
                                    {
                                        "combination_id": f"{major_file.stem}-Y{year_number}-A",
                                        "description": "Programme curriculum pathway",
                                        "courses": courses,
                                    }
                                ],
                            }
                        )

                    if normalized_years:
                        defn = {
                            "kind": "programme",
                            "name": str(payload.get("specialisation") or payload.get("programme_name") or "").strip(),
                            "years": normalized_years,
                        }
                        _index_major_alias(
                            defn,
                            payload.get("specialisation"),
                            payload.get("programme_name"),
                            major_file.stem,
                        )

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

        attempt_counts: dict[str, int] = {}
        passed_attempt_codes: set[str] = set()
        for attempt in normalized_attempt_history:
            code = _normalize_course_code(attempt.get("code"))
            if not code:
                continue
            attempt_counts[code] = attempt_counts.get(code, 0) + 1
            if bool(attempt.get("passed")):
                passed_attempt_codes.update(_course_code_variants(code))

        for code, count in sorted(attempt_counts.items()):
            if count < 3:
                continue
            if code in passed_attempt_codes:
                continue
            issues.append(
                {
                    "id": f"rule-val-{issue_counter}",
                    "severity": "warning",
                    "category": "readmission",
                    "title": f"Multiple unsuccessful attempts detected for {code}",
                    "message": (
                        f"Attempt history shows {count} attempts for {code} with no recorded pass. "
                        "Confirm repeat-attempt and readmission eligibility before final registration."
                    ),
                    "relatedCourseCode": code,
                }
            )
            _attach_evidence(
                issues[-1],
                fallback_reference="FB5: Readmission progression",
                fallback_text="Repeat-attempt history can affect progression and readmission outcomes.",
            )
            issue_counter += 1

        planned_sorted = sorted(
            planned_courses,
            key=lambda row: (
                _parse_year_number(str(row.get("year", "Year 1"))),
                _parse_semester_number(str(row.get("semester", "Semester 1"))),
                _normalize_course_code(row.get("code")),
            ),
        )

        planned_term_entries: list[dict[str, Any]] = []
        for row in planned_sorted:
            code = _normalize_course_code(row.get("code"))
            if not code:
                continue
            year = str(row.get("year", "Year 1"))
            semester = str(row.get("semester", "Semester 1"))
            planned_term_entries.append(
                {
                    "code": code,
                    "year": year,
                    "semester": semester,
                    "term": _parse_term_label(year, semester),
                    "term_index": _term_index(year, semester),
                }
            )

        def _expanded_from_codes(codes: set[str]) -> set[str]:
            expanded: set[str] = set()
            for raw_code in codes:
                expanded.update(_course_code_variants(raw_code))
            return _expand_known_codes_with_equivalences(expanded, equivalence_map)

        for entry in planned_term_entries:
            code = str(entry["code"])
            req = course_requirements.get(code)
            if not req:
                continue

            prior_codes = {
                str(item["code"])
                for item in planned_term_entries
                if int(item["term_index"]) < int(entry["term_index"])
            }
            current_or_prior_codes = {
                str(item["code"])
                for item in planned_term_entries
                if int(item["term_index"]) <= int(entry["term_index"])
            }

            known_before = _expanded_from_codes(prior_codes)
            known_before.update(passed_attempt_codes)
            known_before = _expand_known_codes_with_equivalences(known_before, equivalence_map)

            known_through_term = _expanded_from_codes(current_or_prior_codes)
            known_through_term.update(passed_attempt_codes)
            known_through_term = _expand_known_codes_with_equivalences(known_through_term, equivalence_map)

            prereq_missing = sorted(
                required
                for required in req.get("prerequisites", set())
                if not _is_course_requirement_satisfied(required, known_before)
            )
            if prereq_missing:
                issues.append(
                    {
                        "id": f"rule-val-{issue_counter}",
                        "severity": "blocker",
                        "category": "prerequisite",
                        "title": f"Prerequisites not satisfied for {code}",
                        "message": (
                            f"{code} is planned in {entry['term']} before required prior-course completion. "
                            f"Missing prerequisite evidence for: {', '.join(prereq_missing[:5])}."
                        ),
                        "relatedCourseCode": code,
                        "relatedTerm": str(entry["term"]),
                    }
                )
                _attach_evidence(
                    issues[-1],
                    preferred_rule_ids=["FB7.6"],
                    fallback_reference="FB7.6: Prerequisite enforcement",
                )
                issue_counter += 1

            coreq_missing = sorted(
                required
                for required in req.get("corequisites", set())
                if not _is_course_requirement_satisfied(required, known_through_term)
            )
            if coreq_missing:
                issues.append(
                    {
                        "id": f"rule-val-{issue_counter}",
                        "severity": "blocker",
                        "category": "prerequisite",
                        "title": f"Corequisites not satisfied for {code}",
                        "message": (
                            f"{code} requires concurrent or prior enrolment in: "
                            f"{', '.join(coreq_missing[:5])}."
                        ),
                        "relatedCourseCode": code,
                        "relatedTerm": str(entry["term"]),
                    }
                )
                _attach_evidence(
                    issues[-1],
                    preferred_rule_ids=["FB7.6"],
                    fallback_reference="FB7.6: Prerequisite enforcement",
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
            severity = "warning" if normalized_plan_intent == "graduation_candidate" else "info"
            issues.append(
                {
                    "id": f"rule-val-{issue_counter}",
                    "severity": severity,
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
            severity = "warning" if normalized_plan_intent == "graduation_candidate" else "info"
            issues.append(
                {
                    "id": f"rule-val-{issue_counter}",
                    "severity": severity,
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
            severity = "warning" if normalized_plan_intent == "graduation_candidate" else "info"
            issues.append(
                {
                    "id": f"rule-val-{issue_counter}",
                    "severity": severity,
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
            severity = "warning" if normalized_plan_intent == "graduation_candidate" else "info"
            issues.append(
                {
                    "id": f"rule-val-{issue_counter}",
                    "severity": severity,
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
            available_major_set = {
                _normalize_major_name(str(item))
                for item in available_majors
                if str(item).strip()
            }
            has_science_major_selected = any(
                _normalize_major_name(major) in available_major_set
                for major in selected_majors
            )
            if not has_science_major_selected:
                issues.append(
                    {
                        "id": f"rule-val-{issue_counter}",
                        "severity": "blocker",
                        "category": "major",
                        "title": "At least one Science major is required",
                        "message": (
                            "Cross-faculty routes can be combined with Science majors, but FB7.5 "
                            "still requires at least one approved Science major to be selected."
                        ),
                    }
                )
                _attach_evidence(
                    issues[-1],
                    fallback_reference="FB7.5: Approved major requirement",
                    fallback_text=str(majors_rule_text),
                )
                issue_counter += 1

            for major in selected_majors:
                normalized_major = _normalize_major_name(major)
                if normalized_major not in available_major_set and normalized_major not in configured_external_majors:
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

            max_planned_year = max(year_credit_totals.keys()) if year_credit_totals else 1
            progression_year = max(1, max_planned_year)

            known_codes_by_year: dict[int, set[str]] = {}
            cumulative_known_codes: set[str] = set()
            planned_sorted = sorted(
                planned_courses,
                key=lambda row: (
                    _parse_year_number(str(row.get("year", "Year 1"))),
                    _extract_first_int(str(row.get("semester", "Semester 1"))) or 1,
                ),
            )
            for course in planned_sorted:
                code = _normalize_course_code(course.get("code"))
                year_number = _parse_year_number(str(course.get("year", "Year 1")))
                if not code:
                    continue
                cumulative_known_codes.update(_course_code_variants(code))
                known_codes_by_year[year_number] = _expand_known_codes_with_equivalences(
                    set(cumulative_known_codes),
                    equivalence_map,
                )
                cumulative_known_codes = set(known_codes_by_year[year_number])

            for major in selected_majors:
                normalized_major = _normalize_major_name(major)
                staged = external_major_stage_codes.get(normalized_major)

                if staged:
                    stage_year_map = {"foundation": 1, "intermediate": 2, "senior": 3}
                    for stage_name, required_year in stage_year_map.items():
                        if required_year > progression_year:
                            continue
                        stage_codes = staged.get(stage_name, set())
                        if not stage_codes:
                            continue
                        known_for_year = known_codes_by_year.get(required_year, cumulative_known_codes)
                        matched = sum(
                            1
                            for code in stage_codes
                            if _is_course_requirement_satisfied(code, known_for_year)
                        )
                        required_count = 1 if stage_name in {"foundation", "intermediate"} else 2
                        if matched >= required_count:
                            continue

                        severity = "warning" if normalized_plan_intent == "graduation_candidate" else "info"
                        sample = ", ".join(sorted(stage_codes)[:4])
                        issues.append(
                            {
                                "id": f"rule-val-{issue_counter}",
                                "severity": severity,
                                "category": "major",
                                "title": f"Cross-faculty route stage incomplete for {major}",
                                "message": (
                                    f"{major} route {stage_name} stage (Year {required_year}) appears under-planned. "
                                    f"Matched {matched} / {required_count} expected route courses. "
                                    f"Examples from this stage: {sample}."
                                ),
                                "relatedTerm": f"Year {required_year}",
                            }
                        )
                        _attach_evidence(
                            issues[-1],
                            fallback_reference="FB7.4: Cross-faculty elective substitution rules",
                            fallback_text="Cross-faculty progression is validated against route-stage definitions.",
                        )
                        issue_counter += 1
                    continue

                major_def = major_definitions.get(normalized_major)

                if major_def is not None:
                    years = major_def.get("years", [])
                    for year_row in years:
                        if not isinstance(year_row, dict):
                            continue
                        year_number = _extract_first_int(year_row.get("year"))
                        if year_number is None or year_number > progression_year:
                            continue

                        combinations = year_row.get("combinations", [])
                        if not isinstance(combinations, list) or not combinations:
                            continue

                        locked_combination = normalized_major_pathways.get(normalized_major, {}).get(year_number)
                        effective_combinations = combinations
                        if locked_combination:
                            effective_combinations = [
                                combo
                                for combo in combinations
                                if isinstance(combo, dict)
                                and str(combo.get("combination_id", "")).strip() == locked_combination
                            ]
                            if not effective_combinations:
                                issues.append(
                                    {
                                        "id": f"rule-val-{issue_counter}",
                                        "severity": "warning",
                                        "category": "major",
                                        "title": f"Locked pathway not found for {major} in Year {year_number}",
                                        "message": (
                                            f"Selected lock {locked_combination} was not found in handbook combinations "
                                            f"for {major} Year {year_number}."
                                        ),
                                        "relatedTerm": f"Year {year_number}",
                                    }
                                )
                                _attach_evidence(
                                    issues[-1],
                                    fallback_reference="FB7.5: Approved major requirement",
                                    fallback_text="Pathway locks must map to valid handbook combination IDs.",
                                )
                                issue_counter += 1
                                continue

                        known_for_year = known_codes_by_year.get(year_number, cumulative_known_codes)
                        evaluated = [
                            _evaluate_major_combination(combination, known_for_year)
                            for combination in effective_combinations
                            if isinstance(combination, dict)
                        ]
                        if not evaluated:
                            continue
                        if any(result[0] for result in evaluated):
                            continue

                        best = min(evaluated, key=lambda item: len(item[1]))
                        missing_preview = ", ".join(best[1][:4])
                        severity = "warning" if normalized_plan_intent == "graduation_candidate" else "info"
                        issues.append(
                            {
                                "id": f"rule-val-{issue_counter}",
                                "severity": severity,
                                "category": "major",
                                "title": f"Major pathway shortfall for {major} in Year {year_number}",
                                "message": (
                                    f"No handbook-listed combination is fully satisfied for {major} in Year {year_number}. "
                                    f"Closest match ({best[2]}) is still missing: {missing_preview}."
                                ),
                                "relatedTerm": f"Year {year_number}",
                            }
                        )
                        _attach_evidence(
                            issues[-1],
                            fallback_reference="FB7.5: Approved major requirement",
                            fallback_text="Major progression validation is based on handbook major combination structures.",
                        )
                        issue_counter += 1
                    continue

                issues.append(
                    {
                        "id": f"rule-val-{issue_counter}",
                        "severity": "info",
                        "category": "major",
                        "title": f"No structured handbook pathway data loaded for {major}",
                        "message": (
                            f"{major} has no loaded staged cross-faculty route or major/programme-year mapping, "
                            "so progression checks for this major are advisory-only."
                        ),
                    }
                )
                _attach_evidence(
                    issues[-1],
                    fallback_reference="FB7.5: Approved major requirement",
                    fallback_text="Major progression validation needs structured handbook pathway data.",
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

            for selected in selected_majors:
                normalized_major = _normalize_major_name(selected)
                if normalized_major in external_major_prefix_map:
                    major_prefix_map[selected] = set(external_major_prefix_map[normalized_major])

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

                normalized_major = _normalize_major_name(major)
                min_level7_for_major = 72
                if normalized_major in external_major_min_level7:
                    min_level7_for_major = external_major_min_level7[normalized_major]

                if major_level7_credits < min_level7_for_major:
                    severity = "warning"
                    route_status = external_major_status.get(normalized_major, "")
                    if normalized_major in external_major_min_level7 and route_status == "provisional":
                        severity = "info"
                    issues.append(
                        {
                            "id": f"rule-val-{issue_counter}",
                            "severity": severity,
                            "category": "major",
                            "title": f"Level-7 credits shortfall for {major}",
                            "message": (
                                f"FB7.7 expects at least {min_level7_for_major} distinct level-7 credits "
                                f"for this major route. Current plan has {major_level7_credits} "
                                f"level-7 credits mapped to {major}."
                            ),
                        }
                    )
                    issue_counter += 1

            non_science_codes: set[str] = set()
            non_science_credits = 0
            for course in planned_courses:
                code = str(course.get("code", "")).strip().upper()
                if not code:
                    continue
                prefix = _science_prefix(code)
                credits = int(course.get("credits", 0) or 0)
                if prefix not in science_prefixes:
                    non_science_codes.add(code)
                    non_science_credits += credits

            free_limit = (
                route_free_replacement_limit
                if isinstance(route_free_replacement_limit, int)
                else 72
            )
            sequence_threshold = (
                route_hierarchical_threshold
                if isinstance(route_hierarchical_threshold, int)
                else free_limit
            )

            selected_external_norm = [
                _normalize_major_name(major)
                for major in selected_majors
                if _normalize_major_name(major) in configured_external_majors
            ]

            if non_science_credits > sequence_threshold:
                if not selected_external_norm:
                    issues.append(
                        {
                            "id": f"rule-val-{issue_counter}",
                            "severity": "warning",
                            "category": "curriculum",
                            "title": "Non-Science credits exceed free replacement threshold",
                            "message": (
                                f"Planned non-Science credits total {non_science_credits}, above the "
                                f"{sequence_threshold}-credit FB7.4 threshold. Select and validate at "
                                "least one cross-faculty route to satisfy hierarchical-sequence expectations."
                            ),
                        }
                    )
                    _attach_evidence(
                        issues[-1],
                        fallback_reference="FB7.4: Cross-faculty elective substitution rules",
                    )
                    issue_counter += 1
                else:
                    supported_codes = set()
                    for major_norm in selected_external_norm:
                        supported_codes.update(external_major_route_codes.get(major_norm, set()))
                    unmatched_non_science = sorted(non_science_codes - supported_codes)
                    if unmatched_non_science:
                        issues.append(
                            {
                                "id": f"rule-val-{issue_counter}",
                                "severity": "warning",
                                "category": "curriculum",
                                "title": "Some non-Science courses are outside selected route definitions",
                                "message": (
                                    f"FB7.4 hierarchical-sequence validation found {len(unmatched_non_science)} "
                                    "non-Science course(s) not mapped to selected external major routes. "
                                    f"Examples: {', '.join(unmatched_non_science[:5])}."
                                ),
                            }
                        )
                        _attach_evidence(
                            issues[-1],
                            fallback_reference="FB7.4: Cross-faculty elective substitution rules",
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

        requested_pathway = str(readmission_pathway or "auto").strip().lower()
        valid_pathways = {"auto", "sb001", "sb016"}
        if requested_pathway not in valid_pathways:
            requested_pathway = "auto"

        pathway_results: list[tuple[str, list[dict[str, Any]], int]] = []
        for pathway_key, pathway_data in (("sb001", sb001), ("sb016", sb016)):
            if not isinstance(pathway_data, dict):
                continue
            next_counter, pathway_issues = _evaluate_pathway(pathway_key, pathway_data)
            pathway_results.append((pathway_key, pathway_issues, next_counter))

        if pathway_results:
            chosen_result: tuple[str, list[dict[str, Any]], int] | None = None
            if requested_pathway != "auto":
                for result in pathway_results:
                    if result[0] == requested_pathway:
                        chosen_result = result
                        break

            if chosen_result is None:
                chosen_result = min(pathway_results, key=lambda item: len(item[1]))

            chosen_pathway, chosen_issues, next_counter = chosen_result
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
                        + (
                            "(auto-selected best-fitting pathway for the current plan projection)."
                            if requested_pathway == "auto"
                            else "(explicitly requested pathway)."
                        )
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

        # Phase 2 deterministic core issues are merged into the legacy
        # science validator output to keep one consistent validation surface.
        deterministic_issues = deterministic_result.get("issues", [])
        merged_count = 0
        seen_issue_keys = {
            (
                str(issue.get("category", "")).strip().lower(),
                str(issue.get("title", "")).strip().lower(),
                str(issue.get("relatedCourseCode", "")).strip().upper(),
                str(issue.get("relatedTerm", "")).strip().lower(),
            )
            for issue in issues
            if isinstance(issue, dict)
        }
        for issue in deterministic_issues:
            if not isinstance(issue, dict):
                continue
            key = (
                str(issue.get("category", "")).strip().lower(),
                str(issue.get("title", "")).strip().lower(),
                str(issue.get("relatedCourseCode", "")).strip().upper(),
                str(issue.get("relatedTerm", "")).strip().lower(),
            )
            if key in seen_issue_keys:
                continue
            seen_issue_keys.add(key)
            issues.append(issue)
            merged_count += 1

        summary = {
            "blockers": sum(1 for issue in issues if issue.get("severity") == "blocker"),
            "warnings": sum(1 for issue in issues if issue.get("severity") == "warning"),
            "infos": sum(1 for issue in issues if issue.get("severity") == "info"),
        }

        completion_gaps = {
            "total_credits_gap": max(0, (min_total if isinstance(min_total, int) else 0) - all_credit_total),
            "science_credits_gap": max(0, (min_science if isinstance(min_science, int) else 0) - science_credit_total),
            "level7_credits_gap": max(0, (min_level7 if isinstance(min_level7, int) else 0) - level7_credit_total),
            "maths_stats_requirement_met": bool(meets_math_option_a or meets_math_option_b),
        }

        graduation_reasons: list[str] = []
        for issue in issues:
            severity = str(issue.get("severity", "")).strip().lower()
            title = str(issue.get("title", "")).strip()
            category = str(issue.get("category", "")).strip().lower()
            if severity == "blocker":
                graduation_reasons.append(title or "Blocking handbook validation issue")
                continue
            if (
                normalized_validation_mode == "strict_graduation"
                and severity == "warning"
                and category in {"major", "curriculum", "prerequisite", "load", "readmission"}
            ):
                graduation_reasons.append(f"Warning treated as blocking in strict mode: {title}")

        if completion_gaps["total_credits_gap"] > 0:
            graduation_reasons.append("Total credits are below handbook minimum.")
        if completion_gaps["science_credits_gap"] > 0:
            graduation_reasons.append("Science credits are below handbook minimum.")
        if completion_gaps["level7_credits_gap"] > 0:
            graduation_reasons.append("Level 7 credits are below handbook minimum.")
        if not completion_gaps["maths_stats_requirement_met"]:
            graduation_reasons.append("Mathematics/statistics curriculum requirement is not yet met.")

        graduation_verdict = {
            "eligible": len(graduation_reasons) == 0,
            "mode": normalized_validation_mode,
            "reasons": graduation_reasons,
        }

        return {
            "run_id": extracted.get("run_id"),
            "handbook_title": extracted.get("handbook_title"),
            "planner_policy": policy,
            "source_rules": source_rules,
            "focused_policy_rules": focused,
            "selected_majors": selected_majors,
            "selected_major_pathways": normalized_major_pathways,
            "attempt_history_count": len(normalized_attempt_history),
            "readmission_pathway": chosen_pathway if pathway_results else requested_pathway,
            "plan_intent": normalized_plan_intent,
            "validation_mode": normalized_validation_mode,
            "deterministic_handbook_core": {
                "issues_added": merged_count,
                "summary": deterministic_result.get("summary", {}),
            },
            "completion_gaps": completion_gaps,
            "graduation_verdict": graduation_verdict,
            "issues": issues,
            "summary": summary,
        }
