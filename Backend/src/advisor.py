import json
import re
from collections.abc import Iterator
from pathlib import Path
from typing import Any, Iterator, Literal

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


def _classify_query_intent(query: str, conversation_history: list[dict] | None = None) -> str:
    """Return 'personal', 'lookup', or 'general' based on the student's question.

    • 'personal'  – student is asking about their own situation (eligibility,
                    plan, credits, "can I…", "am I…", etc.)
    • 'lookup'    – student is asking about a named course or major
    • 'general'   – general handbook question that doesn't need their history

    When conversation_history is present the classifier also checks the most
    recent assistant turn for topic continuity — a short follow-up like "what
    about the second one?" inherits intent from the previous exchange.
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
        r"\bwould i\b",
        r"\bmy (course|major|degree|plan|credit|progress|program|mark|result|subject|module|year|semester|gpa)\b",
        r"\bam i eligible\b",
        r"\bi (need|want|plan|have|passed|failed|took|am taking|didn.t|registered|qualify|applied)\b",
        r"\bmy academic\b",
        r"\bmy student\b",
        r"\bfor me\b",
        r"\bmy situation\b",
        r"\beligible\b",
        r"\bqualify\b",
        r"\bon track\b",
        r"\bmy plan\b",
        r"\bmy progress\b",
        r"\bnext year\b",
        r"\bnext semester\b",
        r"\bregister\b",
        r"\benroll\b",
        r"\bwhich (course|major|subject)s? (should|can|do|must) i\b",
        r"\bhow many credits (do|have) i\b",
    ]
    for pattern in personal_patterns:
        if re.search(pattern, text_lower):
            return "personal"

    # Named course code → lookup
    if re.search(r"\b[A-Z]{3,4}\d{4}[A-Z]?\b", text.upper()):
        return "lookup"

    # Short follow-up questions (≤12 words) inherit the intent from the most
    # recent conversation turn so "what about that one?" stays personal/lookup
    # rather than being misclassified as general.
    word_count = len(text.split())
    if word_count <= 12 and conversation_history:
        # Find the most recent assistant reply intent signal in history.
        for turn in reversed(conversation_history):
            if turn.get("role") == "assistant":
                prev_text = turn.get("text", "").lower()
                # If the previous bot reply discussed a specific course or the
                # student's personal situation, inherit that context.
                if re.search(r"\b[A-Z]{3,4}\d{4}[A-Z]?\b", prev_text.upper()):
                    return "lookup"
                if any(kw in prev_text for kw in ("your plan", "you have", "you passed", "you failed",
                                                    "you need", "you can", "you're", "you are",
                                                    "credits", "prerequisite", "eligible")):
                    return "personal"
                break

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


def _format_course_entry(c: Any) -> str:
    """Return a display string for a course entry (dict or plain code string).

    Handles is_pattern entries by appending the resolves_to alternatives so
    BluBot knows e.g. 'STA100xF/S' means any of STA1000F/STA1000S/STA1006S/STA1007S.
    """
    if not isinstance(c, dict):
        return str(c)
    code = c.get("code", "")
    if c.get("is_pattern") and c.get("resolves_to"):
        resolved = ", ".join(
            (r.get("code", r) if isinstance(r, dict) else str(r))
            for r in c["resolves_to"][:6]
        )
        return f"{code} (i.e. one of: {resolved})"
    return code


def _format_combo(combo: dict[str, Any], indent: str = "  ") -> list[str]:
    """Format a single curriculum combination into display lines."""
    out: list[str] = []
    all_courses = combo.get("courses", [])
    codes = [_format_course_entry(c) for c in all_courses[:12] if c]
    if codes:
        out.append(f"{indent}Courses: {', '.join(codes)}")

    # Standard elective choice groups
    choose_groups = [
        ("choose_one_of",   "Choose 1 of"),
        ("choose_two_of",   "Choose 2 of"),
        ("choose_three_of", "Choose 3 of"),
    ]
    for field, label_prefix in choose_groups:
        electives = combo.get(field, [])
        if electives:
            el_codes = [_format_course_entry(e) for e in electives[:8]]
            out.append(f"{indent}{label_prefix}: {', '.join(el_codes)}")

    # Highly-recommended courses within a combination
    highly_rec = combo.get("highly_recommended", [])
    if highly_rec:
        rec_codes = [_format_course_entry(r) for r in highly_rec[:6]]
        out.append(f"{indent}Highly recommended: {', '.join(rec_codes)}")

    # Recommended courses
    rec = combo.get("recommended", [])
    if rec:
        rec_codes = [_format_course_entry(r) for r in rec[:6]]
        out.append(f"{indent}Recommended: {', '.join(rec_codes)}")

    # BIO13-style stream / custom instruction fields
    instruction = combo.get("instruction", "")
    if instruction:
        out.append(f"{indent}Note: {instruction}")

    return out


def _format_major_for_context(entry: dict[str, Any]) -> str:
    payload = entry.get("payload", {})
    title = entry.get("title") or payload.get("major_name") or payload.get("specialisation") or "?"
    faculty = entry.get("faculty_slug", "")
    lines = [f"[Major: {title} | Faculty: {faculty}]"]

    min_credits = payload.get("minimum_credits") or payload.get("total_credits")
    if min_credits:
        lines.append(f"Minimum credits: {min_credits}")

    # Surface hard constraints immediately so BluBot can't miss them
    mutual_excl = payload.get("mutual_exclusions_with", [])
    if mutual_excl:
        lines.append(
            f"MUTUAL EXCLUSION: Cannot be taken alongside major(s): {', '.join(mutual_excl)}"
        )
    companion_req = payload.get("required_companion_majors", [])
    if companion_req:
        lines.append(
            f"REQUIRED COMPANION: Must be taken concurrently with major(s): {', '.join(companion_req)}"
        )
    if payload.get("has_student_limit"):
        lines.append("ENROLLMENT LIMIT: Limited intake at Year 2 — check with department.")

    notes = payload.get("notes", "")
    if notes:
        lines.append(f"Notes: {notes}")

    years_list: list[dict[str, Any]] = payload.get("years", [])
    curriculum = payload.get("curriculum")

    if years_list:
        for year_data in years_list[:4]:
            year_num = year_data.get("year") or year_data.get("year_number", "?")
            year_label = year_data.get("label") or f"Year {year_num}"
            year_note = year_data.get("note", "") or year_data.get("instruction", "")
            combos: list[dict[str, Any]] = year_data.get("combinations", [])
            if not combos:
                continue

            if len(combos) == 1:
                # Only one valid path — emit it directly
                combo = combos[0]
                combo_desc = combo.get("description", "")
                header = f"{year_label}"
                if combo_desc:
                    header += f" ({combo_desc})"
                lines.append(f"{header}:")
                lines.extend(_format_combo(combo, indent="  "))
            else:
                # Multiple combinations — valid ALTERNATIVES the student may choose from
                lines.append(f"{year_label} — choose ONE of the following combinations:")
                for idx, combo in enumerate(combos, start=1):
                    combo_desc = combo.get("description", "")
                    combo_label = f"  Option {idx}"
                    if combo_desc:
                        combo_label += f" ({combo_desc})"
                    lines.append(f"{combo_label}:")
                    lines.extend(_format_combo(combo, indent="    "))

            if year_note:
                lines.append(f"  ↳ {year_note}")

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
            year_label_val = item.get("year") or item.get("level") or ""
            courses_here = item.get("courses", [])[:10]
            codes = [_format_course_entry(c) for c in courses_here if c]
            if codes:
                lines.append(f"Year {year_label_val}: {', '.join(codes)}")

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

    def _build_handbook_direct_context(
        self,
        query: str,
        faculty_slug: str,
        conversation_history: list[dict] | None = None,
    ) -> tuple[str, dict[str, list[str]]]:
        """Look up courses and majors directly from handbook JSON files.

        Returns:
            (context_str, metadata) where metadata = {
                "courses": [<code>, ...],   # course codes actually resolved
                "majors":  [<title>, ...],  # major names actually matched
            }

        This bypasses the vector retriever for known course codes and major
        names, giving the model precise structured data from the source files
        instead of fuzzy PDF chunk matches.
        """
        sections: list[str] = []
        found_courses: list[str] = []
        found_majors: list[str] = []

        # 1. Course code lookup (from the raw query text, not just student question)
        codes = list(dict.fromkeys(re.findall(r"\b[A-Z]{3,4}\d{4}[A-Z]?\b", query.upper())))
        for code in codes[:4]:
            course = self._validator.handbook_store.course_by_code(code)
            if course:
                sections.append(_format_course_for_context(course))
                found_courses.append(code)

        # 2. Major / degree name lookup
        # Build the search text from the current question PLUS recent conversation turns
        # so that follow-up questions like "can I take X instead?" still trigger the
        # major lookup even when the student doesn't repeat the major name.
        question_match = re.search(
            r"Student question:\s*(.+)$", query, re.DOTALL | re.IGNORECASE
        )
        question_text = question_match.group(1).strip() if question_match else query

        # Append the last few conversation turns to give major-name context to follow-ups.
        history_text = ""
        if conversation_history:
            recent_turns = conversation_history[-6:]  # last 3 back-and-forths
            history_text = " ".join(
                str(t.get("text", "")) for t in recent_turns if t.get("text")
            )

        major_index = self._validator.handbook_store.load_major_index()
        scored: list[tuple[float, dict[str, Any]]] = []

        def _word_matches(key_word: str, text: str) -> bool:
            """Match a key word against text, tolerating common abbreviations.

            E.g. "statistics" matches "stats", "mathematics" matches "maths"/"math",
            "computer" matches "comp" / "cs".
            """
            if key_word in text:
                return True
            # Prefix match for 5+ char words (e.g. "statistic" prefix of "statistics")
            if len(key_word) >= 5 and text.find(key_word[:5]) >= 0:
                return True
            return False

        q_lower = question_text.lower()
        h_lower = history_text.lower() if history_text else ""

        for key, entries in major_index.items():
            key_words = [w for w in re.split(r"\W+", key) if len(w) >= 3]
            if not key_words:
                continue
            # Score against current question (full weight) and history (half weight)
            question_hits = sum(1 for w in key_words if _word_matches(w, q_lower))
            history_hits = sum(1 for w in key_words if h_lower and _word_matches(w, h_lower))
            raw_score = (question_hits + 0.5 * history_hits) / len(key_words)
            if raw_score < 0.4:
                continue
            for entry in entries:
                entry_faculty = entry.get("faculty_slug", "")
                # Prefer the active faculty but allow cross-faculty if score is high.
                weight = 1.0 if entry_faculty == faculty_slug else 0.7
                scored.append((raw_score * weight, entry))

        scored.sort(key=lambda x: x[0], reverse=True)
        added_titles: set[str] = set()
        for _, entry in scored[:2]:
            title = entry.get("title", "")
            if title not in added_titles:
                sections.append(_format_major_for_context(entry))
                added_titles.add(title)
                found_majors.append(title)

        return "\n\n".join(sections), {"courses": found_courses, "majors": found_majors}

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
        # Both fast and thinking use gemini-2.5-flash.
        # Thinking mode uses a much higher thinking_budget for deeper reasoning.
        return self.settings.gemini_fast_model

    def _resolve_top_k(
        self,
        top_k: int,
        model_profile: Literal["fast", "thinking"] | None,
    ) -> int:
        if model_profile == "fast":
            # Fast mode keeps retrieval narrow to reduce context size and latency.
            return max(1, min(top_k, 3))
        # Thinking and default: allow more retrieved chunks for richer context.
        return max(8, top_k)

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
            # Fast: short replies, no reasoning — best for simple handbook lookups.
            return {
                "temperature": 0.3,
                "max_output_tokens": 1024,
                "thinking_config": {"thinking_budget": 0},
            }

        # Thinking / default: gemini-2.5-flash with deep reasoning budget.
        # Higher budget = more thorough internal reasoning before responding.
        # Long max_output_tokens prevents responses from being cut off mid-sentence.
        return {
            "temperature": 0.3,
            "max_output_tokens": 8192,
            "thinking_config": {"thinking_budget": 15000},
        }

    def _build_student_context_block(self, student_context: dict) -> str:
        """Format a student's complete academic profile into a prompt block.

        This is the intelligence core: Gemini will use this to answer questions
        like "can I take X?" or "am I on track?" with full knowledge of the
        student's actual history — not just generic handbook rules.

        Grade-aware risk annotations are automatically computed and surfaced:
        - Courses passed with < 55% are flagged as BORDERLINE PASS — dependent
          courses may be harder, and progression risk should be highlighted.
        - Failed courses are tracked so prereq chains can be checked.
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

        # Grade-aware academic standing
        # Build a grade map for fast lookup (code → numeric grade).
        completed_passed: list[dict] = student_context.get("completed_passed", [])
        completed_failed: list[dict] = student_context.get("completed_failed", [])

        grade_map: dict[str, float] = {}
        for c in completed_passed:
            g = c.get("grade")
            if g is not None:
                try:
                    grade_map[c.get("code", "")] = float(g)
                except (ValueError, TypeError):
                    pass

        # Borderline passes: passed but ≤ 54% — at risk for dependent courses.
        borderline_passes = [
            c for c in completed_passed
            if grade_map.get(c.get("code", ""), 100) <= 54
        ]
        # Solid passes: ≥ 75% — can be cited as strengths.
        strong_passes = [
            c for c in completed_passed
            if grade_map.get(c.get("code", ""), 0) >= 75
        ]

        if borderline_passes:
            lines.append(
                f"\n⚠ BORDERLINE PASSES ({len(borderline_passes)} courses — passed ≤54%, "
                "may struggle in dependent courses):"
            )
            for c in borderline_passes:
                g = grade_map.get(c.get("code", ""), None)
                g_str = f"{g:.0f}%" if g is not None else "?"
                lines.append(f"  {c.get('code', '?')} | {c.get('title', '')} | {g_str}")

        # Completed — passed (full list)
        if completed_passed:
            lines.append(f"\nCompleted courses — passed ({len(completed_passed)} courses):")
            for c in completed_passed[:40]:
                g = grade_map.get(c.get("code", ""), None)
                grade_str = f" | {g:.0f}%" if g is not None else ""
                risk_flag = " ⚠BORDERLINE" if c.get("code") in {bp.get("code") for bp in borderline_passes} else ""
                strong_flag = " ★" if c.get("code") in {sp.get("code") for sp in strong_passes} else ""
                lines.append(
                    f"  {c.get('code', '?')} | {c.get('title', '')} | {c.get('credits', 0)} cr"
                    f" | NQF{c.get('nqf_level', '?')} | {c.get('semester', '')}{grade_str}{risk_flag}{strong_flag}"
                )

        # Completed — failed
        if completed_failed:
            lines.append(f"\nFailed / incomplete ({len(completed_failed)} courses):")
            for c in completed_failed[:10]:
                g = c.get("grade")
                grade_str = f" | {float(g):.0f}%" if g is not None else ""
                lines.append(
                    f"  {c.get('code', '?')} | {c.get('title', '')} | {c.get('credits', 0)} cr{grade_str}"
                )

        # Computed GPA / average (if grade data present)
        all_grades = list(grade_map.values())
        if all_grades:
            avg = sum(all_grades) / len(all_grades)
            academic_standing = (
                "Good standing" if avg >= 65
                else "Satisfactory" if avg >= 55
                else "At academic risk"
            )
            lines.append(f"\nAcademic standing: {academic_standing} | Avg grade: {avg:.1f}%")

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
        conversation_history: list[dict] | None = None,
    ) -> dict:
        faculty_label = _FACULTY_LABELS.get(faculty_slug, faculty_slug.title())

        # ── Classify query intent ────────────────────────────────────────────
        # 'general'  → handbook information question (no student history needed)
        # 'lookup'   → specific course or major detail
        # 'personal' → student's own situation (needs history + validation)
        # Pass conversation_history so short follow-ups inherit prior intent.
        intent = _classify_query_intent(query, conversation_history)

        # ── Direct handbook context (always fetched — supplements vector search) ─
        direct_context, _lookup_meta = self._build_handbook_direct_context(query, faculty_slug, conversation_history)

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

        # ── Student context & plan validation (personal queries always; others for awareness) ──
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
        elif ctx:
            # For non-personal queries, still include a compact identity summary
            # so BluBot knows who it's talking to and can reference their situation.
            student_block = self._build_student_context_block(ctx)
            validation_block = ""
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

        # ── Build system instruction (role-level, not part of conversation turns) ──
        # The system instruction tells the model WHO it is and HOW to behave.
        # Context blocks (student profile, handbook data) go in the first user turn.
        if model_profile == "fast":
            system_instruction = (
                f"You are BluBot, UCT {faculty_label} Faculty's academic advisor. "
                "Be warm, direct, and practical — no stiff assistant phrases. "
                "Answer clearly and completely. Never cut your response off before finishing. "
                "Name missing prerequisites explicitly.\n\n"
                "CRITICAL — USE THE HANDBOOK DATA:\n"
                "The [Major: ...] and [Course: ...] blocks in the context are OFFICIAL UCT curriculum data. "
                "If the answer is visible there, state it directly. "
                "NEVER say 'I don't have handbook details', 'consult the handbook', or 'I can't confirm' "
                "when the structured data above already contains the answer. "
                "If genuinely uncertain, say so in one clear line."
            )
        else:
            # Thinking mode: deep, thorough, conversational.
            # Proactive insight: if there are plan blockers or borderline grades,
            # BluBot should volunteer relevant warnings even when not directly asked —
            # a real advisor wouldn't stay silent about a registration blocker.
            proactive_note = ""
            ctx_check = student_context or {}
            raw_planned = ctx_check.get("planned_courses") or []
            if raw_planned and validation_block:
                proactive_note = (
                    "\n- PROACTIVE AWARENESS: If the student's PLAN VALIDATION block contains "
                    "blockers or serious warnings that are directly relevant to their question "
                    "(even if they didn't ask about it), mention them naturally — e.g. "
                    "'By the way, I noticed your plan has a missing prerequisite for X...' "
                    "A real advisor wouldn't stay silent about a registration blocker."
                )
            borderline_note = ""
            passed_courses = ctx_check.get("completed_passed", [])
            borderline_codes = []
            for c in passed_courses:
                g = c.get("grade")
                try:
                    if g is not None and float(g) <= 54:
                        borderline_codes.append(c.get("code", ""))
                except (ValueError, TypeError):
                    pass
            if borderline_codes:
                borderline_note = (
                    f"\n- GRADE RISK AWARENESS: The student passed {', '.join(borderline_codes[:5])} "
                    "with ≤54% (borderline). When answering questions about follow-on courses that "
                    "depend on these, flag the grade risk proactively — e.g. "
                    "'You passed X but with a borderline mark; the follow-on course is significantly harder.'"
                )

            system_instruction = (
                f"You are BluBot, UCT {faculty_label} Faculty's academic advisor. "
                "You speak like a knowledgeable friend — warm, specific, and direct. "
                "Never introduce yourself, restate the question, or use stiff assistant phrases. "
                "Get straight to the answer.\n\n"
                "CRITICAL — USE THE HANDBOOK DATA:\n"
                "The [Major: ...] and [Course: ...] blocks in the context are OFFICIAL UCT curriculum data "
                "extracted directly from the Science Handbook. "
                "When a course code, major name, or course combination appears in those blocks, you HAVE "
                "that information — treat it as ground truth. "
                "NEVER say 'I don't have handbook details', 'consult the handbook', 'I can't confirm', "
                "or 'without specific handbook details' when the structured data above already contains "
                "the answer. Answer directly from the data provided.\n\n"
                "Core guidelines:\n"
                "- Always cross-reference the student's FULL course history (passed, failed, in-progress) "
                "against handbook prerequisites before drawing any conclusion.\n"
                "- When a major shows multiple combinations per year, those are VALID ALTERNATIVES — "
                "explain the options clearly and which best fits the student's situation.\n"
                "- Treat every STUDENT PLAN VALIDATION blocker as confirmed fact — address relevant ones.\n"
                "- Apply policy rules (readmission, progression, credit requirements) where applicable.\n"
                "- Give concrete, practical next steps — not just observations.\n"
                "- Name every missing prerequisite explicitly by course code.\n"
                "- Maintain full continuity across the conversation — never lose track of what was discussed.\n"
                "- If genuinely uncertain after reviewing all context, say so plainly and suggest the "
                "student confirm with their faculty office.\n"
                "- Never cut your response off mid-thought. Complete every point fully before stopping."
                + proactive_note
                + borderline_note
            )

        # ── Build the context block that anchors every conversation ──────────
        # This goes in a preamble user turn so Gemini's multi-turn system sees
        # the handbook + student data as established context, not part of the query.
        context_parts: list[str] = []
        if student_section:
            context_parts.append(student_section.strip())
        if validation_section:
            context_parts.append(validation_section.strip())
        if handbook_context:
            context_parts.append(f"Handbook data:\n{handbook_context}")

        context_preamble = "\n\n".join(context_parts)

        # ── Build native multi-turn contents array ────────────────────────────
        # Structure:
        #   [context preamble turn (user)]
        #   [ack turn (model)]          ← keeps Gemini's turn alternation valid
        #   [history turn 1 (user)]
        #   [history turn 1 reply (model)]
        #   ...
        #   [current question (user)]   ← this is what the model answers next
        #
        # Using proper role-alternated turns gives the model genuine multi-turn
        # understanding instead of just a text dump injected into a single prompt.
        contents: list[dict[str, Any]] = []

        if context_preamble:
            contents.append({"role": "user", "parts": [{"text": context_preamble}]})
            contents.append({
                "role": "model",
                "parts": [{"text": "Understood. I have your academic profile and the handbook context. What's your question?"}],
            })

        # Inject real conversation history as alternating user/model turns.
        if conversation_history:
            for turn in conversation_history[-10:]:
                role = turn.get("role", "")
                text = str(turn.get("text", "")).strip()
                if not text:
                    continue
                gemini_role = "user" if role == "user" else "model"
                # Avoid consecutive same-role turns — Gemini requires strict alternation.
                if contents and contents[-1]["role"] == gemini_role:
                    # Merge with the previous turn's text.
                    contents[-1]["parts"][0]["text"] += f"\n{text}"
                else:
                    contents.append({"role": gemini_role, "parts": [{"text": text}]})

        # Extract the clean student question (strip any injected persona/context wrapping).
        clean_question_match = re.search(
            r"Student question:\s*(.+)$", query, re.DOTALL | re.IGNORECASE
        )
        clean_question = clean_question_match.group(1).strip() if clean_question_match else query

        # Ensure last turn before our question is model (required for alternation).
        if contents and contents[-1]["role"] == "user":
            contents.append({
                "role": "model",
                "parts": [{"text": "Got it, go ahead."}],
            })

        contents.append({"role": "user", "parts": [{"text": clean_question}]})

        # If no context preamble and no history, fall back to a single-turn prompt
        # so we always have at least one turn.
        if not contents:
            contents = [{"role": "user", "parts": [{"text": clean_question}]}]

        resolved_model = self._resolve_model(model_profile)
        generation_config = self._build_generation_config(model_profile)

        try:
            response = self.client.models.generate_content(
                model=resolved_model,
                contents=contents,
                config={
                    **generation_config,
                    "system_instruction": system_instruction,
                },
            )
        except Exception:
            # Fallback: retry without system_instruction in case the model/SDK
            # version doesn't support it in config — pack it into the first turn.
            fallback_contents = [
                {"role": "user", "parts": [{"text": f"{system_instruction}\n\n{context_preamble}"}]},
                {"role": "model", "parts": [{"text": "Understood."}]},
            ] + contents[2:]  # skip the original context preamble turns
            response = self.client.models.generate_content(
                model=resolved_model,
                contents=fallback_contents,
                config=generation_config,
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

    def answer_stream(
        self,
        query: str,
        run_id: str | None = None,
        top_k: int = 5,
        model_profile: Literal["fast", "thinking"] | None = None,
        student_context: dict | None = None,
        faculty_slug: str = "science",
        conversation_history: list[dict] | None = None,
    ) -> Iterator[str]:
        """Stream the advisor response as Server-Sent Events (SSE).

        Yields lines in SSE format:
          data: {"type": "token", "text": "...chunk..."}\n\n
          data: {"type": "done", "citations": [...], "intent": "..."}\n\n
          data: {"type": "error", "message": "..."}\n\n

        The full answer() pipeline (context building, retrieval, prompt
        construction) runs synchronously before streaming begins; only the
        Gemini token emission is streamed.
        """
        # Run the full non-streaming path to get the complete response,
        # but use generate_content_stream so we can yield tokens as they arrive.
        # We reuse the same context/prompt building logic by calling answer()
        # except we intercept just before generate_content.

        def _status(text: str) -> str:
            return f"data: {json.dumps({'type': 'status', 'text': text})}\n\n"

        # ── Shared setup (mirrors answer()) ──────────────────────────────────
        faculty_label = _FACULTY_LABELS.get(faculty_slug, faculty_slug.title())

        yield _status("Thinking...")

        intent = _classify_query_intent(query, conversation_history)

        direct_context, lookup_meta = self._build_handbook_direct_context(query, faculty_slug, conversation_history)

        # Emit what was actually found — no hardcoded topic guessing
        found_courses = lookup_meta.get("courses", [])
        found_majors = lookup_meta.get("majors", [])
        if found_courses and found_majors:
            yield _status(f"Reading {found_courses[0]} · Looking at {found_majors[0]} Major...")
        elif found_courses:
            suffix = ", ".join(found_courses[:3])
            yield _status(f"Reading {suffix} Course Description{'s' if len(found_courses) > 1 else ''}...")
        elif found_majors:
            yield _status(f"Looking at {' & '.join(found_majors)} Major{'s' if len(found_majors) > 1 else ''}...")
        else:
            yield _status("Searching The Handbook...")

        effective_top_k = self._resolve_top_k(top_k, model_profile)
        retrieval = self.retriever.search(
            query=query,
            run_id=run_id,
            top_k=effective_top_k,
            fast_mode=model_profile == "fast",
        )
        _MIN_SCORE = 0.45
        hits = [h for h in retrieval.get("hits", []) if float(h.get("score", 0)) >= _MIN_SCORE]

        # Show the titles of the top retrieved sections so the user can see what's being read
        if hits:
            top_titles = list(dict.fromkeys(
                h.get("title", "").split("—")[0].strip()
                for h in hits[:3]
                if h.get("title")
            ))
            if top_titles:
                yield _status(f"Reading: {' · '.join(top_titles[:2])}...")

        if self._include_policy_context(model_profile):
            yield _status("Checking Faculty Rules...")
            policy_context, policy_citations = self._build_policy_context(
                run_id=retrieval.get("run_id"), faculty_slug=faculty_slug
            )
        else:
            policy_context, policy_citations = "", []

        ctx = student_context or {}
        if intent == "personal":
            yield _status("Reviewing Your Academic Profile...")
            student_block = self._build_student_context_block(ctx)
            raw_planned = ctx.get("planned_courses") or []
            raw_majors = ctx.get("selected_majors") or []
            validation_block = (
                self._build_validation_context(raw_planned, raw_majors, faculty_slug)
                if raw_planned else ""
            )
        elif ctx:
            student_block = self._build_student_context_block(ctx)
            validation_block = ""
        else:
            student_block = ""
            validation_block = ""

        yield _status("Preparing Response...")

        handbook_sections: list[str] = []
        if direct_context:
            handbook_sections.append(f"Structured handbook data:\n{direct_context}")
        if policy_context:
            handbook_sections.append(f"Policy constraints:\n{policy_context}")
        retrieved_block = self._build_context(hits)
        if retrieved_block:
            handbook_sections.append(f"Additional retrieved context:\n{retrieved_block}")
        handbook_context = "\n\n".join(handbook_sections)

        student_section = f"{student_block}\n\n" if student_block else ""
        validation_section = f"{validation_block}\n\n" if validation_block else ""

        # Build system instruction (mirrors answer() — keep in sync)
        if model_profile == "fast":
            system_instruction = (
                f"You are BluBot, UCT {faculty_label} Faculty's academic advisor. "
                "Be warm, direct, and practical — no stiff assistant phrases. "
                "Answer clearly and completely. Never cut your response off before finishing. "
                "Name missing prerequisites explicitly.\n\n"
                "CRITICAL — USE THE HANDBOOK DATA:\n"
                "The [Major: ...] and [Course: ...] blocks in the context are OFFICIAL UCT curriculum data. "
                "If the answer is visible there, state it directly. "
                "NEVER say 'I don't have handbook details', 'consult the handbook', 'I can't confirm' "
                "when the structured data above already contains the answer. "
                "If genuinely uncertain, say so in one clear line."
            )
        else:
            proactive_note = ""
            raw_planned_s = ctx.get("planned_courses") or []
            if raw_planned_s and validation_block:
                proactive_note = (
                    "\n- PROACTIVE AWARENESS: If the student's PLAN VALIDATION block contains "
                    "blockers or serious warnings that are directly relevant to their question "
                    "(even if they didn't ask about it), mention them naturally. "
                    "A real advisor wouldn't stay silent about a registration blocker."
                )
            borderline_note = ""
            passed_courses = ctx.get("completed_passed", [])
            borderline_codes: list[str] = []
            for c in passed_courses:
                g = c.get("grade")
                try:
                    if g is not None and float(g) <= 54:
                        borderline_codes.append(c.get("code", ""))
                except (ValueError, TypeError):
                    pass
            if borderline_codes:
                borderline_note = (
                    f"\n- GRADE RISK AWARENESS: The student passed {', '.join(borderline_codes[:5])} "
                    "with ≤54% (borderline). Flag the grade risk proactively on dependent courses."
                )
            system_instruction = (
                f"You are BluBot, UCT {faculty_label} Faculty's academic advisor. "
                "You speak like a knowledgeable friend — warm, specific, and direct. "
                "Never introduce yourself, restate the question, or use stiff assistant phrases. "
                "Get straight to the answer.\n\n"
                "CRITICAL — USE THE HANDBOOK DATA:\n"
                "The [Major: ...] and [Course: ...] blocks in the context are OFFICIAL UCT curriculum data "
                "extracted directly from the Science Handbook. "
                "When a course code, major name, or course combination appears in those blocks, you HAVE "
                "that information — treat it as ground truth. "
                "NEVER say 'I don't have handbook details', 'consult the handbook', 'I can't confirm', "
                "or 'without specific handbook details' when the structured data above already contains "
                "the answer. Answer directly from the data provided.\n\n"
                "Core guidelines:\n"
                "- Always cross-reference the student's FULL course history against handbook prerequisites.\n"
                "- When a major shows multiple combinations per year, those are VALID ALTERNATIVES — "
                "explain the options clearly.\n"
                "- Treat every STUDENT PLAN VALIDATION blocker as confirmed fact.\n"
                "- Give concrete, practical next steps — not just observations.\n"
                "- Name every missing prerequisite explicitly by course code.\n"
                "- Maintain full continuity across the conversation.\n"
                "- Never cut your response off mid-thought. Complete every point fully."
                + proactive_note + borderline_note
            )

        context_parts: list[str] = []
        if student_section:
            context_parts.append(student_section.strip())
        if validation_section:
            context_parts.append(validation_section.strip())
        if handbook_context:
            context_parts.append(f"Handbook data:\n{handbook_context}")
        context_preamble = "\n\n".join(context_parts)

        contents: list[dict[str, Any]] = []
        if context_preamble:
            contents.append({"role": "user", "parts": [{"text": context_preamble}]})
            contents.append({
                "role": "model",
                "parts": [{"text": "Understood. I have your academic profile and the handbook context. What's your question?"}],
            })

        if conversation_history:
            for turn in conversation_history[-10:]:
                role = turn.get("role", "")
                text = str(turn.get("text", "")).strip()
                if not text:
                    continue
                gemini_role = "user" if role == "user" else "model"
                if contents and contents[-1]["role"] == gemini_role:
                    contents[-1]["parts"][0]["text"] += f"\n{text}"
                else:
                    contents.append({"role": gemini_role, "parts": [{"text": text}]})

        clean_question_match = re.search(
            r"Student question:\s*(.+)$", query, re.DOTALL | re.IGNORECASE
        )
        clean_question = clean_question_match.group(1).strip() if clean_question_match else query

        if contents and contents[-1]["role"] == "user":
            contents.append({"role": "model", "parts": [{"text": "Got it, go ahead."}]})
        contents.append({"role": "user", "parts": [{"text": clean_question}]})
        if not contents:
            contents = [{"role": "user", "parts": [{"text": clean_question}]}]

        resolved_model = self._resolve_model(model_profile)
        generation_config = self._build_generation_config(model_profile)

        citations = [
            {"source": idx + 1, "title": h.get("title", ""), "s3_key": h.get("s3_key", ""), "score": h.get("score", 0.0)}
            for idx, h in enumerate(hits)
        ]
        policy_start = len(citations)
        citations.extend(
            {"source": policy_start + idx + 1, "title": c.get("title", ""), "s3_key": c.get("s3_key", ""), "score": c.get("score", 0.0)}
            for idx, c in enumerate(policy_citations)
        )

        # ── Stream tokens ─────────────────────────────────────────────────────
        try:
            stream = self.client.models.generate_content_stream(
                model=resolved_model,
                contents=contents,
                config={**generation_config, "system_instruction": system_instruction},
            )
            for chunk in stream:
                text = getattr(chunk, "text", None) or ""
                if text:
                    yield f"data: {json.dumps({'type': 'token', 'text': text})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
            return

        yield f"data: {json.dumps({'type': 'done', 'citations': citations, 'intent': intent, 'run_id': retrieval.get('run_id')})}\n\n"
