import json
import re
from pathlib import Path
from typing import Any, Literal

from google import genai

from src.academic_rules import ScienceHandbookRulesService
from src.config import Settings
from src.handbook_store import HandbookStore
from src.handbook_validator import HandbookValidator
from src.retrieval import ScienceRetriever


_FACULTY_LABELS: dict[str, str] = {
    "science": "Science",
    "commerce": "Commerce",
    "engineering": "Engineering & the Built Environment",
    "health-sciences": "Health Sciences",
    "humanities": "Humanities",
    "law": "Law",
}

# ---------------------------------------------------------------------------
# Handbook directory layout (used by _build_handbook_direct_context):
#   data/handbook/faculties/{slug}/
#     meta.json              → qualifications, course-code system, NQF levels
#     rules/faculty_rules.json → key rules (readmission, prereqs, progression)
#     equivalences.json      → course equivalence chains
#     courses/{CODE}.json    → full course detail (outline, prereqs, convener…)
#     majors/{name}.json     → major curriculum by year (combinations/core)
#     departments/           → department-level metadata
#     timetable/             → timetable data (optional)
# ---------------------------------------------------------------------------


def _classify_query_intent(query: str) -> str:
    """Return 'personal', 'lookup', or 'general' based on the student's question.

    • 'personal'  – student is asking about their own situation (eligibility,
                    plan, credits, "can I…", "am I…", etc.)
    • 'lookup'    – student is asking about a named course or major
    • 'general'   – general handbook question that doesn't need their history
    """
    # Extract just the student question if it follows the embedded marker.
    question_match = re.search(
        r"Student question:\s*(.+)$", query, re.DOTALL | re.IGNORECASE
    )
    text = question_match.group(1).strip() if question_match else query
    text_lower = text.lower()

    personal_patterns = [
        r"\bcan i\b",
        r"\bam i\b",
        r"\bdo i\b",
        r"\bwill i\b",
        r"\bshould i\b",
        r"\bmy (course|major|degree|plan|credit|progress|program|mark|result|subject|module)\b",
        r"\bam i eligible\b",
        r"\bi (need|want|plan|have|passed|failed|took|am taking|didn.t|registered)\b",
        r"\bmy academic\b",
        r"\bmy student\b",
        r"\bfor me\b",
        r"\bmy situation\b",
    ]
    for pattern in personal_patterns:
        if re.search(pattern, text_lower):
            return "personal"

    # Named course code → lookup
    if re.search(r"\b[A-Z]{3,4}\d{4}[A-Z]?\b", text.upper()):
        return "lookup"

    return "general"


def _format_course_for_context(course: dict[str, Any]) -> str:
    lines = [f"[Course: {course.get('code', '?')}]"]
    if course.get("title"):
        lines.append(f"Title: {course['title']}")
    credits = course.get("credits") or course.get("nqf_credits")
    nqf = course.get("nqf_level")
    semester = course.get("semester") or course.get("semester_code")
    year_level = course.get("year_level") or course.get("year")
    parts: list[str] = []
    if credits is not None:
        parts.append(f"Credits: {credits}")
    if nqf is not None:
        parts.append(f"NQF Level: {nqf}")
    if semester:
        parts.append(f"Semester: {semester}")
    if year_level:
        parts.append(f"Year: {year_level}")
    if parts:
        lines.append(" | ".join(parts))
    if course.get("outline"):
        lines.append(f"Outline: {str(course['outline'])[:400]}")
    prereqs = course.get("prerequisites")
    if isinstance(prereqs, dict):
        prereq_text = prereqs.get("text") or ""
        if prereq_text:
            lines.append(f"Prerequisites: {prereq_text}")
    elif prereqs:
        lines.append(f"Prerequisites: {prereqs}")
    if course.get("convener"):
        lines.append(f"Convener: {course['convener']}")
    if course.get("assessment"):
        lines.append(f"Assessment: {course['assessment']}")
    return "\n".join(lines)


def _format_major_for_context(entry: dict[str, Any]) -> str:
    payload = entry.get("payload", {})
    title = entry.get("title") or payload.get("major_name") or payload.get("specialisation") or "?"
    faculty = entry.get("faculty_slug", "")
    lines = [f"[Major: {title} | Faculty: {faculty}]"]

    min_credits = payload.get("minimum_credits") or payload.get("total_credits")
    if min_credits:
        lines.append(f"Minimum credits: {min_credits}")

    years_list: list[dict[str, Any]] = payload.get("years", [])
    curriculum = payload.get("curriculum")

    if years_list:
        for year_data in years_list[:4]:
            year_num = year_data.get("year") or year_data.get("year_number", "?")
            label = year_data.get("label") or f"Year {year_num}"
            combos: list[dict[str, Any]] = year_data.get("combinations", [])
            if combos:
                combo = combos[0]
                all_courses = combo.get("courses", [])
                codes = [
                    (c.get("code", "") if isinstance(c, dict) else str(c))
                    for c in all_courses[:10]
                    if c
                ]
                if codes:
                    lines.append(f"{label}: {', '.join(codes)}")
                choose_groups = [
                    ("choose_one_of", "Choose 1 of"),
                    ("choose_two_of", "Choose 2 of"),
                    ("choose_three_of", "Choose 3 of"),
                ]
                for field, label_prefix in choose_groups:
                    electives = combo.get(field, [])
                    if electives:
                        el_codes = [
                            (e.get("code", "") if isinstance(e, dict) else str(e))
                            for e in electives[:8]
                        ]
                        lines.append(f"  {label_prefix}: {', '.join(el_codes)}")
    elif isinstance(curriculum, dict):
        for key in sorted(curriculum.keys()):
            if re.match(r"year", key, re.IGNORECASE):
                year_data = curriculum[key]
                if not isinstance(year_data, dict):
                    continue
                core = year_data.get("core", [])[:10]
                if core:
                    lines.append(f"{key.replace('_', ' ').title()}: {', '.join(core)}")
    elif isinstance(curriculum, list):
        for item in curriculum[:5]:
            if not isinstance(item, dict):
                continue
            year_label = item.get("year") or item.get("level") or ""
            courses_here = item.get("courses", [])[:10]
            codes = [
                (c.get("code", "") if isinstance(c, dict) else str(c))
                for c in courses_here
                if c
            ]
            if codes:
                lines.append(f"Year {year_label}: {', '.join(codes)}")

    return "\n".join(lines)


class ScienceAdvisor:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.retriever = ScienceRetriever(settings)
        self.rules_service = ScienceHandbookRulesService(settings)
        self._handbook_data_dir = Path(settings.resolved_data_dir) / "handbook" / "faculties"
        _store = HandbookStore(Path(settings.resolved_data_dir))
        self._validator = HandbookValidator(_store)

    def _build_handbook_direct_context(self, query: str, faculty_slug: str) -> str:
        """Look up courses and majors directly from handbook JSON files.

        This bypasses the vector retriever for known course codes and major
        names, giving the model precise structured data from the source files
        instead of fuzzy PDF chunk matches.
        """
        sections: list[str] = []

        # 1. Course code lookup (from the raw query text, not just student question)
        codes = list(dict.fromkeys(re.findall(r"\b[A-Z]{3,4}\d{4}[A-Z]?\b", query.upper())))
        for code in codes[:4]:
            course = self._validator.handbook_store.course_by_code(code)
            if course:
                sections.append(_format_course_for_context(course))

        # 2. Major / degree name lookup
        question_match = re.search(
            r"Student question:\s*(.+)$", query, re.DOTALL | re.IGNORECASE
        )
        question_text = question_match.group(1).strip() if question_match else query
        question_lower = question_text.lower()

        major_index = self._validator.handbook_store.load_major_index()
        scored: list[tuple[float, dict[str, Any]]] = []

        for key, entries in major_index.items():
            key_words = [w for w in re.split(r"\W+", key) if len(w) >= 3]
            if not key_words:
                continue
            hit_count = sum(1 for w in key_words if w in question_lower)
            score = hit_count / len(key_words)
            if score < 0.5:
                continue
            for entry in entries:
                entry_faculty = entry.get("faculty_slug", "")
                # Prefer the active faculty but allow cross-faculty if score is high.
                weight = 1.0 if entry_faculty == faculty_slug else 0.7
                scored.append((score * weight, entry))

        scored.sort(key=lambda x: x[0], reverse=True)
        added_titles: set[str] = set()
        for _, entry in scored[:2]:
            title = entry.get("title", "")
            if title not in added_titles:
                sections.append(_format_major_for_context(entry))
                added_titles.add(title)

        return "\n\n".join(sections)

    def _build_context(self, hits: list[dict]) -> str:
        blocks: list[str] = []
        for index, hit in enumerate(hits, start=1):
            blocks.append(
                "\n".join(
                    [
                        f"[Source {index}]",
                        f"Title: {hit.get('title', '')}",
                        f"S3 Key: {hit.get('s3_key', '')}",
                        f"Score: {round(float(hit.get('score', 0.0)), 6)}",
                        f"Chunk: {hit.get('text', '')}",
                    ]
                )
            )
        return "\n\n".join(blocks)

    def _build_policy_context_from_json(self, faculty_slug: str) -> tuple[str, list[dict]]:
        """Build policy context from structured handbook JSON for non-Science faculties."""
        faculty_dir = self._handbook_data_dir / faculty_slug
        meta: dict[str, Any] = {}
        rules_data: dict[str, Any] = {}

        meta_path = faculty_dir / "meta.json"
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                pass

        rules_path = faculty_dir / "rules" / "faculty_rules.json"
        if rules_path.exists():
            try:
                rules_data = json.loads(rules_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                pass

        if not meta and not rules_data:
            return "", []

        faculty_label = meta.get("faculty") or _FACULTY_LABELS.get(faculty_slug, faculty_slug.title())
        year = meta.get("year", 2026)
        lines: list[str] = [
            f"Use these policy constraints from the {year} {faculty_label} Handbook when relevant:",
        ]

        # Qualifications summary
        qualifications = meta.get("qualifications", {})
        degrees = qualifications.get("undergraduate_degrees", [])
        if degrees:
            lines.append("- Undergraduate degrees offered:")
            for deg in degrees[:6]:
                abbr = deg.get("abbreviation", "")
                min_credits = deg.get("minimum_credits", "n/a")
                nqf = deg.get("nqf_level", "n/a")
                years_str = deg.get("minimum_duration_years", "n/a")
                lines.append(
                    f"  - {abbr}: min {min_credits} NQF credits, NQF level {nqf}, {years_str} years"
                )

        # Course code system
        code_system = meta.get("course_code_system", {})
        suffix_codes = code_system.get("suffix_codes", {})
        if suffix_codes:
            lines.append("- Course code suffixes:")
            for suffix, info in list(suffix_codes.items())[:5]:
                meaning = info.get("meaning", "") if isinstance(info, dict) else str(info)
                lines.append(f"  - {suffix} = {meaning}")

        # Key rules from faculty_rules.json — emit the most important ones
        rule_sets = rules_data.get("rule_sets", [])
        important_topics = {
            "prerequisites", "readmission", "repeating_courses", "max_courses_per_year",
            "minimum_credits", "promotion_law", "performance", "dp_requirements",
        }
        emitted = 0
        lines.append("- Key faculty rules:")
        for rule_set in rule_sets:
            if emitted >= 12:
                break
            for rule in rule_set.get("rules", []):
                if emitted >= 12:
                    break
                topic = rule.get("topic", "")
                if topic in important_topics:
                    lines.append(f"  - [{rule.get('id', '')}] {rule.get('text', '')}")
                    emitted += 1

        citations = [
            {
                "title": f"{year} {faculty_label} Handbook — faculty rules",
                "s3_key": f"policy:{faculty_slug}:faculty_rules",
                "score": 1.0,
            },
        ]
        return "\n".join(lines), citations

    def _build_policy_context(self, run_id: str | None = None, faculty_slug: str = "science") -> tuple[str, list[dict]]:
        # Non-Science faculties: load from structured handbook JSON directly.
        if faculty_slug and faculty_slug != "science":
            return self._build_policy_context_from_json(faculty_slug)

        try:
            extracted = self.rules_service.extract_rules(
                run_id=run_id,
                handbook_title="2026 Science-Handbook-UCT",
            )
        except Exception:
            return "", []

        focused = extracted.get("focused_policy_rules", {})
        rulebook = extracted.get("rulebook", {})
        if not focused and not rulebook:
            return "", []

        readmission = focused.get("readmission_from_2023", {})
        sb001 = readmission.get("sb001", {}).get("requirements", {})
        sb016 = readmission.get("sb016", {}).get("requirements", {})
        transfer = focused.get("transfer_into_science", {})
        bsc_mins = focused.get("bsc_curricula_rules", {}).get("minimum_requirements", {})

        bsc_rules = rulebook.get("bsc_degree_rules", {}) if isinstance(rulebook, dict) else {}
        registration = bsc_rules.get("registration_limits", {})
        supplementary = bsc_rules.get("supplementary_examinations", {})
        curriculum = bsc_rules.get("curriculum_rules", {})
        majors = curriculum.get("majors", {})
        math_requirement = curriculum.get("mathematics_requirement", {})
        prerequisite_note = curriculum.get("prerequisites_critical_note", {})
        third_year_per_major = curriculum.get("third_year_credits_per_major", {})
        course_codes = rulebook.get("course_code_system", {}) if isinstance(rulebook, dict) else {}
        terminology = rulebook.get("essential_terminology", {}) if isinstance(rulebook, dict) else {}

        max_term = focused.get("operational_constraints", {}).get("registration", {}).get(
            "max_term_credits"
        )
        if not max_term and isinstance(registration, dict):
            fb3_text = str(registration.get("FB3") or "")
            max_term_match = [int(part) for part in re.findall(r"\d+", fb3_text)]
            max_term = max_term_match[0] if max_term_match else "n/a"

        lines: list[str] = [
            "Use these policy constraints from the 2026 Science Handbook when relevant:",
            "- Readmission (SB001, FB5.1): preceding year minimum credits = "
            f"{sb001.get('preceding_year_min_credits', 'n/a')}.",
            "- Readmission (SB016, FB5.2): preceding year minimum credits = "
            f"{sb016.get('preceding_year_min_credits', 'n/a')} (except first registration year).",
            "- Transfer into Science (FB6):",
        ]

        for requirement in transfer.get("minimum_requirements", []):
            lines.append(f"  - {requirement}")

        lines.extend(
            [
                "- BSc curriculum minima (FB7):",
                "  - Total NQF credits: "
                f"{bsc_mins.get('min_total_nqf_credits', 'n/a')}",
                "  - Science credits: "
                f"{bsc_mins.get('min_science_credits', 'n/a')}",
                "  - Level 7 credits: "
                f"{bsc_mins.get('min_level7_credits', 'n/a')}",
                "- Registration limit (FB3):",
                f"  - Maximum credits per semester: {max_term}",
                "- Course code semantics:",
                f"  - F={course_codes.get('codes', {}).get('F', 'First-semester')}",
                f"  - S={course_codes.get('codes', {}).get('S', 'Second-semester')}",
                f"  - H={course_codes.get('codes', {}).get('H', 'Full-year half-credit')}",
                f"  - W={course_codes.get('codes', {}).get('W', 'Full-year full-credit')}",
                "- Prerequisite enforcement:",
                f"  - {prerequisite_note.get('FB7_6_note3', terminology.get('prerequisite', ''))}",
                "- Mathematics/Statistics core rule (FB7.3):",
                f"  - {math_requirement.get('FB7_3', 'Apply handbook mathematics/statistics requirement.')}",
                "- Major constraints (FB7.5/FB7.7):",
                f"  - {majors.get('FB7_5', 'At least one approved major is required.')}",
                "  - Business Computing must be paired with Computer Science.",
                "  - Computer Engineering must be paired with Computer Science.",
                "  - Applied Statistics / Mathematical Statistics / Statistics & Data Science are mutually exclusive.",
                f"  - {third_year_per_major.get('FB7_7', 'At least 72 level-7 credits per major.')}",
                "- Supplementary exam limits:",
                "  - First-year: up to 108 credits.",
                "  - Non-first-year: up to 120 credits, of which up to 72 may be third-year.",
                f"  - {supplementary.get('FB4_3', '')}",
            ]
        )

        policy_citations = [
            {
                "title": "2026 Science Handbook FB5.1 (SB001 readmission)",
                "s3_key": "policy:FB5.1",
                "score": 1.0,
            },
            {
                "title": "2026 Science Handbook FB5.2 (SB016 readmission)",
                "s3_key": "policy:FB5.2",
                "score": 1.0,
            },
            {
                "title": "2026 Science Handbook FB6 (transfer into Science)",
                "s3_key": "policy:FB6",
                "score": 1.0,
            },
            {
                "title": "2026 Science Handbook FB7 (BSc curricula rules)",
                "s3_key": "policy:FB7",
                "score": 1.0,
            },
            {
                "title": "2026 Science Handbook FB3 (registration limits)",
                "s3_key": "policy:FB3",
                "score": 1.0,
            },
            {
                "title": "2026 Science Handbook FB4 (supplementary examinations)",
                "s3_key": "policy:FB4",
                "score": 1.0,
            },
            {
                "title": "2026 Science Handbook course code system",
                "s3_key": "policy:course-code-system",
                "score": 1.0,
            },
        ]

        return "\n".join(lines), policy_citations

    def _resolve_model(
        self,
        model_profile: Literal["fast", "thinking"] | None = None,
    ) -> str:
        if model_profile in  ("fast", "thinking"):
            # gemini-2.5-flash: optimised for speed, minimal reasoning budget.
            return self.settings.gemini_fast_model
        # Default (None) and "thinking" both use gemini-2.5-pro for deeper reasoning.
        return self.settings.gemini_thinking_model

    def _resolve_top_k(
        self,
        top_k: int,
        model_profile: Literal["fast", "thinking"] | None,
    ) -> int:
        if model_profile == "fast":
            # Fast mode keeps retrieval narrow to reduce context size and latency.
            return max(1, min(top_k, 2))
        # Thinking and default: allow more retrieved chunks.
        return max(6, top_k)

    def _include_policy_context(
        self,
        model_profile: Literal["fast", "thinking"] | None,
    ) -> bool:
        return model_profile != "fast"

    def _build_generation_config(
        self,
        model_profile: Literal["fast", "thinking"] | None,
    ) -> dict[str, Any]:
        if model_profile == "fast":
            # gemini-2.5-flash: short output, no thinking budget for speed.
            return {
                "temperature": 0.2,
                "max_output_tokens": 256,
                "thinking_config": {"thinking_budget": 0},
            }

        # Default (None) and "thinking": gemini-2.5-pro with extended reasoning.
        return {
            "temperature": 0.1,
            "max_output_tokens": 800,
            "thinking_config": {"thinking_budget": 3000},
        }

    def _build_student_context_block(self, student_context: dict) -> str:
        """Format a student's complete academic profile into a prompt block.

        This is the intelligence core: Gemini will use this to answer questions
        like "can I take X?" or "am I on track?" with full knowledge of the
        student's actual history — not just generic handbook rules.
        """
        if not student_context:
            return ""

        lines: list[str] = ["=== STUDENT ACADEMIC PROFILE ==="]

        # Identity
        name = student_context.get("name", "")
        snum = student_context.get("student_number", "")
        degree = student_context.get("degree", "")
        year = student_context.get("year")
        majors = student_context.get("majors", [])

        identity_parts: list[str] = []
        if name:
            identity_parts.append(name)
        if snum:
            identity_parts.append(f"Student No: {snum}")
        if identity_parts:
            lines.append(" | ".join(identity_parts))

        if degree:
            degree_line = degree
            if year:
                degree_line += f" | Year {year} of 4"
            lines.append(degree_line)

        if majors:
            majors_str = ", ".join(majors) if isinstance(majors, list) else str(majors)
            lines.append(f"Majors: {majors_str}")

        # Credit standing
        credits_earned = student_context.get("credits_earned")
        credits_total = student_context.get("credits_total", 360)
        nqf7_earned = student_context.get("nqf7_credits_earned")
        nqf7_required = student_context.get("nqf7_credits_required", 120)
        milestone_label = student_context.get("milestone_label", "")
        milestone_required = student_context.get("milestone_required")

        credit_parts: list[str] = []
        if credits_earned is not None:
            credit_parts.append(f"Credits: {credits_earned}/{credits_total} earned")
        if nqf7_earned is not None:
            credit_parts.append(f"NQF7: {nqf7_earned}/{nqf7_required}")
        if credit_parts:
            lines.append(" | ".join(credit_parts))

        if milestone_label and milestone_required is not None:
            on_track = credits_earned >= milestone_required if credits_earned is not None else None
            status = " — ON TRACK" if on_track else (" — BEHIND MILESTONE" if on_track is False else "")
            lines.append(f"Milestone: {milestone_label}{status}")

        # Completed — passed
        completed_passed: list[dict] = student_context.get("completed_passed", [])
        if completed_passed:
            lines.append(f"\nCompleted courses — passed ({len(completed_passed)} courses):")
            for c in completed_passed[:40]:
                grade_str = f" | {c.get('grade')}%" if c.get("grade") is not None else ""
                lines.append(
                    f"  {c.get('code', '?')} | {c.get('title', '')} | {c.get('credits', 0)} cr"
                    f" | NQF{c.get('nqf_level', '?')} | {c.get('semester', '')}{grade_str}"
                )

        # Completed — failed
        completed_failed: list[dict] = student_context.get("completed_failed", [])
        if completed_failed:
            lines.append(f"\nFailed / incomplete ({len(completed_failed)} courses):")
            for c in completed_failed[:10]:
                grade_str = f" | {c.get('grade')}%" if c.get("grade") is not None else ""
                lines.append(
                    f"  {c.get('code', '?')} | {c.get('title', '')} | {c.get('credits', 0)} cr{grade_str}"
                )

        # In progress
        in_progress: list[dict] = student_context.get("courses_in_progress", [])
        if in_progress:
            lines.append(f"\nCurrently registered — in progress ({len(in_progress)} courses):")
            for c in in_progress[:20]:
                lines.append(
                    f"  {c.get('code', '?')} | {c.get('title', '')} | {c.get('credits', 0)} cr"
                    f" | NQF{c.get('nqf_level', '?')} | {c.get('semester', '')}"
                )

        lines.append("=================================")
        return "\n".join(lines)

    def _build_validation_context(
        self,
        planned_courses: list[dict],
        selected_majors: list[str],
        faculty_slug: str,
    ) -> str:
        """Run HandbookValidator on the student's plan and return a structured summary block."""
        if not planned_courses:
            return ""
        try:
            result = self._validator.validate_plan(
                planned_courses,
                selected_majors=selected_majors,
                target_faculty=faculty_slug,
            )
        except Exception:
            return ""

        issues: list[dict] = result.get("issues", [])
        plan_credits: int = result.get("plan_credit_total", 0)
        nqf7_credits: int = result.get("plan_nqf7_credits", 0)

        if not issues and not plan_credits:
            return ""

        lines: list[str] = ["=== STUDENT PLAN VALIDATION ==="]
        lines.append(
            f"Plan totals: {plan_credits} NQF credits planned | {nqf7_credits} at NQF level 7+"
        )

        blockers = [i for i in issues if i.get("severity") == "blocker"]
        warnings = [i for i in issues if i.get("severity") != "blocker"]

        if blockers:
            lines.append(f"\nPlan blockers ({len(blockers)}):")
            for issue in blockers[:8]:
                lines.append(
                    f"  [{issue.get('category', '?')}] {issue.get('title', '')} — {issue.get('message', '')}"
                )

        if warnings:
            lines.append(f"\nPlan warnings ({len(warnings)}):")
            for issue in warnings[:8]:
                lines.append(
                    f"  [{issue.get('category', '?')}] {issue.get('title', '')} — {issue.get('message', '')}"
                )

        if not issues:
            lines.append("No plan issues detected.")

        lines.append("================================")
        return "\n".join(lines)

    def answer(
        self,
        query: str,
        run_id: str | None = None,
        top_k: int = 5,
        model_profile: Literal["fast", "thinking"] | None = None,
        student_context: dict | None = None,
        faculty_slug: str = "science",
    ) -> dict:
        faculty_label = _FACULTY_LABELS.get(faculty_slug, faculty_slug.title())

        # ── Classify query intent ────────────────────────────────────────────
        # 'general'  → handbook information question (no student history needed)
        # 'lookup'   → specific course or major detail
        # 'personal' → student's own situation (needs history + validation)
        intent = _classify_query_intent(query)

        # ── Direct handbook context (always fetched — supplements vector search) ─
        direct_context = self._build_handbook_direct_context(query, faculty_slug)

        # ── Vector retrieval (used alongside direct context) ──────────────────
        effective_top_k = self._resolve_top_k(top_k, model_profile)
        retrieval = self.retriever.search(
            query=query,
            run_id=run_id,
            top_k=effective_top_k,
            fast_mode=model_profile == "fast",
        )
        # Drop chunks below relevance threshold — low scores confuse more than help.
        _MIN_SCORE = 0.45
        hits = [h for h in retrieval.get("hits", []) if float(h.get("score", 0)) >= _MIN_SCORE]

        # ── Policy context (skip for fast mode & general intent in fast mode) ─
        if self._include_policy_context(model_profile):
            policy_context, policy_citations = self._build_policy_context(
                run_id=retrieval.get("run_id"),
                faculty_slug=faculty_slug,
            )
        else:
            policy_context, policy_citations = "", []

        # ── Student context & plan validation (only for personal queries) ────
        ctx = student_context or {}
        if intent == "personal":
            student_block = self._build_student_context_block(ctx)
            raw_planned = ctx.get("planned_courses") or []
            raw_majors = ctx.get("selected_majors") or []
            validation_block = (
                self._build_validation_context(raw_planned, raw_majors, faculty_slug)
                if raw_planned
                else ""
            )
        else:
            student_block = ""
            validation_block = ""

        # ── Assemble handbook context ─────────────────────────────────────────
        handbook_sections: list[str] = []
        if direct_context:
            handbook_sections.append(f"Structured handbook data:\n{direct_context}")
        if policy_context:
            handbook_sections.append(f"Policy constraints:\n{policy_context}")
        retrieved_block = self._build_context(hits)
        if retrieved_block:
            handbook_sections.append(f"Additional retrieved context:\n{retrieved_block}")

        handbook_context = "\n\n".join(handbook_sections)

        # Early exit only if there is truly nothing to work with.
        if not handbook_context and not student_block:
            return {
                "run_id": retrieval.get("run_id"),
                "answer": (
                    "I don't have handbook data loaded for that query yet. "
                    "Try rephrasing or check with your faculty office."
                ),
                "citations": [],
                "retrieval": retrieval,
            }

        student_section = f"{student_block}\n\n" if student_block else ""
        validation_section = f"{validation_block}\n\n" if validation_block else ""

        # ── Build prompt based on model profile AND intent ────────────────────
        # General / lookup: answer from handbook facts, invite follow-up.
        # Personal: cross-reference student history, give personalised guidance.

        if model_profile == "fast":
            if intent == "personal":
                prompt = (
                    f"You are BluBot, UCT {faculty_label} Faculty's academic advisor. "
                    "Be warm, direct, and practical — no stiff assistant phrases. "
                    "The student is asking about their own situation. "
                    "Check their course history against the handbook before answering. "
                    "Answer in 3-5 bullet points. Name missing prerequisites explicitly. "
                    "If uncertain, say so in one clear line.\n\n"
                    f"{student_section}"
                    f"{validation_section}"
                    f"Student query:\n{query}\n\n"
                    f"Handbook data:\n{handbook_context}"
                )
            else:
                prompt = (
                    f"You are BluBot, UCT {faculty_label} Faculty's academic advisor. "
                    "Be warm, direct, and practical — no stiff assistant phrases. "
                    "Answer this handbook question concisely in 3-5 bullet points. "
                    "Use only the structured handbook data provided.\n\n"
                    f"Student query:\n{query}\n\n"
                    f"Handbook data:\n{handbook_context}"
                )
        else:
            # Thinking / default (gemini-2.5-pro with reasoning budget)
            if intent == "personal":
                prompt = (
                    f"You are BluBot, UCT {faculty_label} Faculty's academic advisor. "
                    "Be warm, conversational, and specific — speak like a knowledgeable friend, not a policy document. "
                    "Do not restate the question or introduce yourself. Get straight to the answer.\n\n"
                    "The student is asking about their own situation. Follow these steps:\n"
                    "1. Check the student's course history against handbook prerequisites.\n"
                    "2. If a STUDENT PLAN VALIDATION block is present, treat blockers as confirmed — address relevant ones.\n"
                    "3. Apply policy constraints when the question involves readmission, progression, or credits.\n"
                    "4. Give clear, practical next steps.\n"
                    "5. Name any missing prerequisites explicitly.\n"
                    "6. If uncertain about something, say so plainly.\n\n"
                    f"{student_section}"
                    f"{validation_section}"
                    f"Student query:\n{query}\n\n"
                    f"Handbook data:\n{handbook_context}"
                )
            elif intent == "lookup":
                prompt = (
                    f"You are BluBot, UCT {faculty_label} Faculty's academic advisor. "
                    "Be warm and clear — no stiff assistant phrases. "
                    "The student is asking about a specific course or programme. "
                    "Present the key details clearly from the structured handbook data provided. "
                    "After answering, briefly invite the student to ask a follow-up if they want to know "
                    "whether they're eligible or how it fits their plan.\n\n"
                    f"Student query:\n{query}\n\n"
                    f"Handbook data:\n{handbook_context}"
                )
            else:
                # General information question
                prompt = (
                    f"You are BluBot, UCT {faculty_label} Faculty's academic advisor. "
                    "Be warm, friendly, and direct — speak like a knowledgeable friend. "
                    "Do not restate the question or introduce yourself. "
                    "Answer this general handbook question clearly from the data provided. "
                    "After giving the answer, ask one short friendly follow-up — for example whether "
                    "the student is personally interested in this programme so you can check how it fits their profile.\n\n"
                    f"Student query:\n{query}\n\n"
                    f"Handbook data:\n{handbook_context}"
                )

        resolved_model = self._resolve_model(model_profile)
        generation_config = self._build_generation_config(model_profile)

        try:
            response = self.client.models.generate_content(
                model=resolved_model,
                contents=prompt,
                config=generation_config,
            )
        except Exception:
            response = self.client.models.generate_content(
                model=resolved_model,
                contents=prompt,
            )

        citations = [
            {
                "source": idx + 1,
                "title": hit.get("title", ""),
                "s3_key": hit.get("s3_key", ""),
                "score": hit.get("score", 0.0),
            }
            for idx, hit in enumerate(hits)
        ]
        policy_start = len(citations)
        citations.extend(
            {
                "source": policy_start + idx + 1,
                "title": citation.get("title", ""),
                "s3_key": citation.get("s3_key", ""),
                "score": citation.get("score", 0.0),
            }
            for idx, citation in enumerate(policy_citations)
        )

        return {
            "run_id": retrieval.get("run_id"),
            "answer": getattr(response, "text", "") or "No response generated.",
            "model_profile": model_profile or "thinking",
            "model": resolved_model,
            "effective_top_k": effective_top_k,
            "intent": intent,
            "citations": citations,
            "retrieval": retrieval,
        }
