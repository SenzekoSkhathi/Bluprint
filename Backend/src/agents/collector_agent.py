"""Collector Agent — extracts department course details from handbook chunks.

Focuses on a single department section (e.g. Department of Archaeology) and
returns normalized course records ready for Course Verifier validation.
"""

from __future__ import annotations

import json
import logging
import re

from google import genai

from src.config import Settings
from src.handbook_course_parser import (
    COURSE_CODE_RE,
    extract_department_context,
    format_outline_text,
    normalize_title,
    normalize_whitespace,
    parse_handbook_courses,
)

logger = logging.getLogger(__name__)

_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)
_COURSE_START_RE = re.compile(
    r"\b([A-Z]{3,4}\d{4}(?:[A-Za-z](?:/[A-Za-z]){0,3})?)\b\s+"
    r"([A-Za-z][A-Za-z0-9&(),:'/\- ]{3,140}?)\s+"
    r"(\d{1,3})\s+NQF\s+credits?\s+at\s+NQF\s+level\s+(\d{1,2})",
    re.IGNORECASE,
)
_WINDOW_RADIUS = 2400
# Larger section window helps retain late-section entries (often postgrad)
# in long department chapters before segmentation/parsing.
_MAX_CONTEXT_CHARS = 380_000
_SEGMENT_SIZE = 16_000
_SEGMENT_OVERLAP = 1_800
def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "department"


def _parse_json_array(raw: str) -> list[dict]:
    cleaned = _JSON_FENCE_RE.sub("", raw).strip()
    payload = json.loads(cleaned)
    if not isinstance(payload, list):
        return []
    return [item for item in payload if isinstance(item, dict)]


def _to_int(value: object, fallback: int) -> int:
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        digits = re.search(r"\d+", value)
        if digits:
            return int(digits.group(0))
    return fallback


def _group_from_code(code: str) -> str:
    level_match = re.search(r"\d", code)
    if not level_match:
        return "Year 1"
    level = int(level_match.group(0))
    if level <= 1:
        return "Year 1"
    if level == 2:
        return "Year 2"
    if level == 3:
        return "Year 3"
    return "Postgrad"


def _default_nqf(group: str) -> int:
    return {"Year 1": 5, "Year 2": 6, "Year 3": 7, "Postgrad": 8}.get(group, 5)


def _expand_compound_code(code: str) -> list[str]:
    """Expand slash suffix codes to separate offerings (e.g. CSC1015F/S -> F and S)."""
    normalized = str(code).upper().strip()
    match = re.match(r"^([A-Z]{3,4}\d{4})([A-Za-z](?:/[A-Za-z]){1,3})$", normalized)
    if not match:
        return [normalized]

    base, suffixes = match.groups()
    expanded: list[str] = []
    for suffix in suffixes.split("/"):
        suffix_clean = suffix.strip().upper()
        if not suffix_clean:
            continue
        expanded.append(f"{base}{suffix_clean}")

    return expanded or [normalized]


def _as_outcomes(outline: str) -> list[str]:
    if not outline:
        return ["Refer to handbook section for course outcomes."]

    parts = [
        part.strip(" -•\t")
        for part in re.split(r"[.;]\s+", outline)
        if part.strip()
    ]
    outcomes = [part for part in parts if len(part) > 8]
    if not outcomes:
        return [outline]
    return outcomes[:5]


def _extract_field(block: str, field_label: str) -> str:
    pattern = re.compile(
        rf"{re.escape(field_label)}\s*(.+?)(?=\s+(?:Convener:|Course entry requirements:|Course outline:|Lecture times:|DP requirements:|Assessment:)|$)",
        flags=re.IGNORECASE,
    )
    match = pattern.search(block)
    return normalize_whitespace(match.group(1)) if match else ""


def _is_department_heading(compact: str, start: int) -> bool:
    prefix = compact[max(0, start - 120) : start]
    prefix_lower = prefix.lower()
    return "departments in the faculty" in prefix_lower


def _score_department_candidate(candidate: str, start: int, compact: str) -> int:
    score = 0
    lowered_candidate = candidate.lower()
    opening = lowered_candidate[:400]

    if _is_department_heading(compact, start):
        score += 500
    if "the department is housed in" in lowered_candidate:
        score += 80
    if "the departmental abbreviation" in lowered_candidate:
        score += 60
    if "undergraduate courses" in lowered_candidate:
        score += 40
    if "course outline:" in lowered_candidate:
        score += 25
    if "nqf credits" in lowered_candidate:
        score += 10

    if "section in this handbook" in lowered_candidate:
        score -= 300
    if "mission of the department of" in lowered_candidate:
        score -= 120
    if re.search(r"\.{5,}\s*\d{1,3}\s+department of ", opening):
        score -= 1000
    if opening.count("department of ") > 1:
        score -= 600

    score += len(
        re.findall(
            r"\b[A-Z]{3,4}\d{4}(?:[A-Za-z](?:/[A-Za-z]){0,3})?\b",
            candidate,
        )
    )
    return score
class CollectorAgent:
    """Gemini-based collector for handbook department course extraction."""

    name = "collector"

    # Use a stronger Gemini model for extraction reliability.
    _DEFAULT_COLLECTOR_MODEL = "gemini-2.5-pro"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self._model = settings.gemini_collector_model or self._DEFAULT_COLLECTOR_MODEL

    def collect_department_courses(
        self,
        chunks: list[dict],
        department: str,
        handbook_title: str = "2026 Science-Handbook-UCT",
    ) -> list[dict]:
        dept_norm = normalize_whitespace(department)
        relevant = [
            chunk for chunk in chunks if handbook_title.lower() in str(chunk.get("title", "")).lower()
        ]

        if not relevant:
            logger.warning("CollectorAgent: no chunks found for handbook=%s", handbook_title)
            return []

        relevant = sorted(relevant, key=lambda c: int(c.get("chunk_index", 0)))
        text = "\n".join(str(chunk.get("text", "")) for chunk in relevant)
        context = self._extract_department_context(text=text, department=dept_norm)

        if not context:
            logger.warning("CollectorAgent: no department context found for %s", dept_norm)
            return []

        deterministic = self._collect_deterministically(context)
        if deterministic:
            logger.info(
                "CollectorAgent: parsed %d courses deterministically for %s",
                len(deterministic),
                dept_norm,
            )
            return self._merge_and_normalize(
                courses=deterministic,
                department=dept_norm,
                handbook_title=handbook_title,
            )

        segment_results: list[dict] = []
        for segment in self._segment_text(context):
            extracted = self._collect_segment(segment=segment, department=dept_norm)
            segment_results.extend(extracted)

        if not segment_results:
            logger.info("CollectorAgent: Gemini returned no records; applying heuristic extraction for %s", dept_norm)
            segment_results = self._collect_with_heuristics(context)

        return self._merge_and_normalize(
            courses=self._enrich_with_local_outline_fields(segment_results, context),
            department=dept_norm,
            handbook_title=handbook_title,
        )

    def _collect_deterministically(self, context: str) -> list[dict]:
        handbook_courses = parse_handbook_courses(context)
        extracted: list[dict] = []
        for course in handbook_courses.values():
            extracted.append(
                {
                    "code": course.code,
                    "title": course.title,
                    "credits": course.credits,
                    "nqf_level": course.nqf_level,
                    "convener_details": course.convener,
                    "entry_requirements": course.prerequisites,
                    "outline_details": course.outline,
                }
            )
        return extracted

    def _enrich_with_local_outline_fields(self, courses: list[dict], context: str) -> list[dict]:
        """Backfill full handbook-style details from local text around each code."""
        if not courses:
            return courses

        code_matches = list(
            re.finditer(
                r"\b([A-Z]{3,4}\d{4}(?:[A-Za-z](?:/[A-Za-z]){0,3})?)\b",
                context,
            )
        )
        if not code_matches:
            return courses

        positions: dict[str, int] = {}
        ordered_positions: list[tuple[int, str]] = []
        for match in code_matches:
            code = match.group(1).upper()
            if code in positions:
                continue
            positions[code] = match.start()
            ordered_positions.append((match.start(), code))

        ordered_positions.sort(key=lambda item: item[0])

        for record in courses:
            code = str(record.get("code", "")).upper()
            if code not in positions:
                continue

            start = positions[code]
            current_index = next((idx for idx, (_, c) in enumerate(ordered_positions) if c == code), -1)
            if current_index < 0:
                continue

            end = len(context)
            if current_index + 1 < len(ordered_positions):
                end = ordered_positions[current_index + 1][0]

            block = context[start:end]

            convener = _extract_field(block, "Convener:")
            entry = _extract_field(block, "Course entry requirements:")
            outline_body = _extract_field(block, "Course outline:")
            lecture_times = _extract_field(block, "Lecture times:")
            dp_requirements = _extract_field(block, "DP requirements:")
            assessment = _extract_field(block, "Assessment:")

            sections: list[str] = []
            if outline_body:
                sections.append(outline_body)
            if lecture_times:
                sections.append(f"Lecture times: {lecture_times}")
            if dp_requirements:
                sections.append(f"DP requirements: {dp_requirements}")
            if assessment:
                sections.append(f"Assessment: {assessment}")

            combined_outline = format_outline_text(" ".join(sections))

            if convener and str(record.get("convener_details", "")).lower() in {"", "not listed"}:
                record["convener_details"] = convener

            if entry and str(record.get("entry_requirements", "")).lower() in {"", "none listed"}:
                record["entry_requirements"] = entry

            current_outline = str(record.get("outline_details", ""))
            if combined_outline and len(combined_outline) > len(current_outline):
                record["outline_details"] = combined_outline

            # Extract credits and NQF level directly from the handbook header line
            # (e.g. 'BIO1000F CELL BIOLOGY 18 NQF credits at NQF level 5').
            # This corrects cases where Gemini failed to parse the credits value.
            header_m = re.search(
                r"\b"
                + re.escape(code)
                + r"[^\n]{0,200?}(\d{1,3})\s+NQF\s+credits?\s+at\s+NQF\s+level\s+(\d{1,2})",
                block[:800],
                re.IGNORECASE,
            )
            if header_m:
                h_credits = int(header_m.group(1))
                h_nqf = int(header_m.group(2))
                # Override 0/missing credits from Gemini with the handbook value.
                # (Genuine 0-credit courses still show 0 in the header, so this is safe.)
                current_credits = record.get("credits", 0)
                if not isinstance(current_credits, (int, float)) or int(current_credits) <= 0:
                    record["credits"] = h_credits
                record["nqf_level"] = h_nqf

        return courses

    def _extract_department_context(self, text: str, department: str) -> str:
        context = extract_department_context(text, department)
        if context:
            return context

        compact = normalize_whitespace(text)
        lower = compact.lower()
        windows: list[str] = []
        for match in re.finditer(re.escape(department.lower()), lower):
            w_start = max(0, match.start() - _WINDOW_RADIUS)
            w_end = min(len(compact), match.end() + _WINDOW_RADIUS)
            windows.append(compact[w_start:w_end])
            if sum(len(w) for w in windows) >= _MAX_CONTEXT_CHARS:
                break

        return "\n".join(windows)[:_MAX_CONTEXT_CHARS]

    def _segment_text(self, text: str) -> list[str]:
        if len(text) <= _SEGMENT_SIZE:
            return [text]

        chunks: list[str] = []
        start = 0
        while start < len(text):
            end = min(start + _SEGMENT_SIZE, len(text))
            chunks.append(text[start:end])
            if end == len(text):
                break
            start = max(0, end - _SEGMENT_OVERLAP)

        return chunks

    def _collect_segment(self, segment: str, department: str) -> list[dict]:
        prompt = (
            "You extract UCT course records from handbook text.\n"
            "Target department: Department of "
            f"{department}.\n\n"
            "Extract only real courses that belong to this department section.\n"
            "Return ONLY a JSON array. Do not include markdown.\n"
            "Each course item must use this schema:\n"
            "{\n"
            '  "code": "ACC1021F",\n'
            '  "title": "Accounting for Business I",\n'
            '  "credits": 18,\n'
            '  "nqf_level": 5,\n'
            '  "convener_details": "Dr ...",\n'
            '  "entry_requirements": "None listed",\n'
            '  "outline_details": "Short concise summary of course outline"\n'
            "}\n\n"
            "Rules:\n"
            "- code must be uppercase and match exactly how it appears in the text, including compound suffixes.\n"
            "  Valid patterns: [A-Z]{3,4}\\d{4}(?:[A-Za-z](?:/[A-Za-z]){0,3})? "
            "(e.g. BIO1000F, AGE3006H, CSC1015F/S, MAM1004F/S, AGE1005L). "
            "If a code contains slash suffixes (like F/S), split it into separate entries "
            "(CSC1015F and CSC1015S) using the same course details.\n"
            "- credits: read the integer N from the pattern 'N NQF credits at NQF level L' "
            "(e.g. '18 NQF credits at NQF level 5' -> credits=18, nqf_level=5). "
            "Use 0 only when the handbook explicitly states 0 credits.\n"
            "- keep values factual; do not invent missing data\n"
            "- if a field is missing in text, use empty string except entry_requirements which can be 'None listed'\n"
            "- credits and nqf_level must be integers\n\n"
            f"Department source text:\n{segment}"
        )

        try:
            response = self.client.models.generate_content(
                model=self._model,
                contents=prompt,
            )
            raw = response.text or "[]"
        except Exception as exc:
            logger.warning("CollectorAgent: Gemini extraction failed (%s)", exc)
            return []

        try:
            return _parse_json_array(raw)
        except Exception as exc:
            logger.warning("CollectorAgent: JSON parse failure (%s)", exc)
            return []

    def _collect_with_heuristics(self, context: str) -> list[dict]:
        """Heuristic parser for course blocks when LLM extraction is empty."""
        matches = list(_COURSE_START_RE.finditer(context))
        if not matches:
            return []

        extracted: list[dict] = []
        for index, match in enumerate(matches):
            code = match.group(1).upper()
            title = normalize_title(match.group(2))
            credits = int(match.group(3))
            nqf_level = int(match.group(4))

            block_start = match.start()
            block_end = matches[index + 1].start() if index + 1 < len(matches) else min(len(context), match.end() + 1600)
            block = context[block_start:block_end]

            convener = _extract_field(block, "Convener:")
            entry = _extract_field(block, "Course entry requirements:")
            outline_body = _extract_field(block, "Course outline:")
            lecture_times = _extract_field(block, "Lecture times:")
            dp_requirements = _extract_field(block, "DP requirements:")
            assessment = _extract_field(block, "Assessment:")

            sections: list[str] = []
            if outline_body:
                sections.append(outline_body)
            if lecture_times:
                sections.append(f"Lecture times: {lecture_times}")
            if dp_requirements:
                sections.append(f"DP requirements: {dp_requirements}")
            if assessment:
                sections.append(f"Assessment: {assessment}")
            combined_outline = format_outline_text(" ".join(sections))

            extracted.append(
                {
                    "code": code,
                    "title": title,
                    "credits": credits,
                    "nqf_level": nqf_level,
                    "convener_details": convener,
                    "entry_requirements": entry,
                    "outline_details": combined_outline,
                }
            )

        return extracted

    def _merge_and_normalize(
        self,
        courses: list[dict],
        department: str,
        handbook_title: str,
    ) -> list[dict]:
        by_code: dict[str, dict] = {}

        for record in courses:
            raw_code = str(record.get("code", "")).strip().upper()
            if not raw_code or not COURSE_CODE_RE.match(raw_code):
                continue

            for expanded_code in _expand_compound_code(raw_code):
                title = normalize_whitespace(str(record.get("title", "")).strip())
                title = normalize_title(title)
                if not title:
                    title = f"Course {expanded_code}"

                group = _group_from_code(expanded_code)
                credits = _to_int(record.get("credits"), fallback=18)
                nqf_level = _to_int(record.get("nqf_level"), fallback=_default_nqf(group))

                convener = normalize_whitespace(str(record.get("convener_details", "")).strip())
                entry_requirements = normalize_whitespace(
                    str(record.get("entry_requirements", "")).strip()
                )
                outline = format_outline_text(str(record.get("outline_details", "")).strip())

                normalized = {
                    "id": expanded_code.lower(),
                    "code": expanded_code,
                    "title": title,
                    "group": group,
                    "credits": credits,
                    "nqf_level": nqf_level,
                    "semester": "From handbook",
                    "department": department,
                    "delivery": "Handbook derived",
                    "prerequisites": entry_requirements,
                    "description": outline,
                    "outcomes": _as_outcomes(outline),
                    "source": handbook_title,
                    "convener_details": convener or "Not listed",
                    "entry_requirements": entry_requirements,
                    "outline_details": outline,
                }

                existing = by_code.get(expanded_code)
                if existing is None:
                    by_code[expanded_code] = normalized
                    continue

                # Prefer richer record (more non-default fields).
                score_existing = self._richness(existing)
                score_new = self._richness(normalized)
                if score_new > score_existing:
                    by_code[expanded_code] = normalized

        merged = sorted(by_code.values(), key=lambda item: item["code"])
        logger.info(
            "CollectorAgent: normalized %d courses (%d raw records) for %s",
            len(merged),
            len(courses),
            department,
        )
        return merged

    @staticmethod
    def _richness(course: dict) -> int:
        score = 0
        for key in ("title", "convener_details", "entry_requirements", "outline_details"):
            value = str(course.get(key, "")).strip().lower()
            if value and value not in {"not listed", "none listed"}:
                score += len(value)
        return score

    @staticmethod
    def cache_key(run_id: str, department: str) -> str:
        return f"{run_id}.dept-{_slugify(department)}"
