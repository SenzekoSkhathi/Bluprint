"""Course Verifier Agent — uses Gemini to validate extracted course catalog entries.

Checks:
    1. Course code format: [A-Z]{3-4}\\d{4}(?:[A-Za-z](?:/[A-Za-z]){0,3})?
         (e.g. ACC1021F, MAM1031F, STA3036S, CSC1015F/S)
  2. Course title quality: must be a real title, not "Course XYZ1234" or garbled text
  3. Credits plausibility: typical UCT values are 12, 16, 18, 20, 24, 30, 36
  4. NQF level alignment: Year 1 → 5, Year 2 → 6, Year 3 → 7, Postgrad → 8/9
  5. Deduplication: removes exact-code duplicates; preserves F/S semester pairs
"""

import json
import logging
import re

from google import genai

from src.config import Settings

logger = logging.getLogger(__name__)

_VALID_CODE_RE = re.compile(r"^[A-Z]{3,4}\d{4}(?:[A-Za-z](?:/[A-Za-z]){0,3})?$")
# UCT typical credit values — anything wildly outside this range is suspicious
_TYPICAL_CREDITS = {12, 16, 18, 20, 24, 30, 36, 48, 60, 72}
_CREDITS_MIN = 4
_CREDITS_MAX = 120

_NQF_BY_GROUP = {"Year 1": 5, "Year 2": 6, "Year 3": 7, "Postgrad": 8}

_BATCH_SIZE = 25


def _expand_compound_code(code: str) -> list[str]:
    """Expand slash suffix course codes into separate offerings."""
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


class CourseVerifierAgent:
    """AI-powered verification pass for handbook-extracted course entries."""

    name = "course_verifier"

    # Use a capable Gemini model — can be overridden via GEMINI_MODEL env var
    _VERIFIER_MODEL = "gemini-2.5-flash"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = genai.Client(api_key=settings.gemini_api_key)
        # Prefer the configured model; fall back to the built-in default
        self._model = settings.gemini_model or self._VERIFIER_MODEL

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def verify(self, courses: list[dict]) -> list[dict]:
        """Return a verified, deduplicated, sorted list of course dicts.

        Runs two passes:
          1. Local structural deduplication + code-format filtering
          2. Gemini semantic verification (batched)
        """
        logger.info("CourseVerifierAgent: starting verification of %d courses", len(courses))

        # Pass 1 — local deduplication and code format check
        courses = self._deduplicate(courses)
        courses = [c for c in courses if _VALID_CODE_RE.match(c.get("code", ""))]

        logger.info("CourseVerifierAgent: %d courses after local dedup + format filter", len(courses))

        if not courses:
            return []

        # Pass 2 — Gemini batched verification
        verified: list[dict] = []
        for batch_start in range(0, len(courses), _BATCH_SIZE):
            batch = courses[batch_start : batch_start + _BATCH_SIZE]
            verified.extend(self._verify_batch_with_gemini(batch))

        verified = sorted(verified, key=lambda c: c["code"])
        logger.info("CourseVerifierAgent: %d courses after Gemini verification", len(verified))
        return verified

    # ------------------------------------------------------------------
    # Pass 1 — local deduplication
    # ------------------------------------------------------------------

    def _deduplicate(self, courses: list[dict]) -> list[dict]:
        """Remove only exact-code duplicates; slash variants are expanded first.

        Courses with any suffix (F, S, H, W, P/L, Z, etc.) are never merged.
        When a code uses slash suffixes (e.g. F/S), it is expanded to separate
        records per suffix before exact-code deduplication.
        """
        by_code: dict[str, dict] = {}
        for course in courses:
            raw_code = course.get("code", "")
            for code in _expand_compound_code(raw_code):
                if not code:
                    continue
                expanded_course = dict(course)
                expanded_course["code"] = code
                expanded_course["id"] = code.lower()

                existing = by_code.get(code)
                if existing is None:
                    by_code[code] = expanded_course
                else:
                    # Keep the one with the better (longer, non-generic) title
                    if self._title_quality(expanded_course) > self._title_quality(existing):
                        by_code[code] = expanded_course

        # Codes are never grouped by base; only exact-code duplicates are removed.
        return list(by_code.values())

    @staticmethod
    def _title_quality(course: dict) -> int:
        title = course.get("title", "")
        code = course.get("code", "")
        if title == f"Course {code}" or not title:
            return 0
        return len(title)

    # ------------------------------------------------------------------
    # Pass 2 — Gemini verification
    # ------------------------------------------------------------------

    def _verify_batch_with_gemini(self, courses: list[dict]) -> list[dict]:
        """Send a batch to Gemini for verification; return cleaned courses."""
        payload = [
            {
                "code": c["code"],
                "title": c["title"],
                "credits": c["credits"],
                "nqf_level": c["nqf_level"],
                "group": c["group"],
            }
            for c in courses
        ]

        prompt = (
            "You are a South African university (UCT) course catalog verifier.\n"
            "Inspect each course entry and return ONLY a JSON array with one object per course.\n\n"
            "Verification rules:\n"
            "1. CODE FORMAT — must match [A-Z]{3,4}\\d{4}(?:[A-Za-z](?:/[A-Za-z]){0,3})? "
            "(e.g. ACC1021F, MAM1031F, STA3036S, COMP2001, CSC1015F/S). "
            "Set valid=false if the code is malformed.\n"
            "2. TITLE — must be a real, concise course title. "
            "If the title is generic (e.g. 'Course ACC1021F') or clearly garbled text, "
            "set needs_review=true and leave the title unchanged (do NOT invent a new one).\n"
            "3. CREDITS — typical UCT values: 12, 16, 18, 20, 24, 30, 36. "
            "If the value is clearly wrong (e.g. 1, 2, 200, 999) set needs_review=true. "
            "Otherwise keep whatever value is given.\n"
            "4. NQF LEVEL — must align with the year group: "
            "Year 1 → 5, Year 2 → 6, Year 3 → 7, Postgrad → 8. "
            "Correct the nqf_level if it clearly disagrees with the group.\n"
            "5. Return every course, including ones that look fine. "
            "Only set valid=false for code-format failures.\n\n"
            "Required JSON structure for each item:\n"
            "{\n"
            '  "code": "<unchanged>",\n'
            '  "title": "<title string>",\n'
            '  "credits": <integer>,\n'
            '  "nqf_level": <integer>,\n'
            '  "valid": true|false,\n'
            '  "needs_review": true|false\n'
            "}\n\n"
            f"Courses to verify:\n{json.dumps(payload, indent=2)}"
        )

        try:
            response = self.client.models.generate_content(
                model=self._model,
                contents=prompt,
            )
            raw = response.text.strip()
        except Exception as exc:
            logger.warning("CourseVerifierAgent: Gemini call failed (%s); returning batch unchanged", exc)
            return courses

        # Strip markdown fences that the model sometimes wraps around JSON
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
        raw = re.sub(r"\s*```\s*$", "", raw, flags=re.MULTILINE)
        raw = raw.strip()

        try:
            results = json.loads(raw)
        except json.JSONDecodeError as exc:
            logger.warning("CourseVerifierAgent: JSON parse error (%s); returning batch unchanged", exc)
            return courses

        if not isinstance(results, list) or len(results) != len(courses):
            logger.warning(
                "CourseVerifierAgent: unexpected response length (%d vs %d); returning batch unchanged",
                len(results) if isinstance(results, list) else -1,
                len(courses),
            )
            return courses

        verified: list[dict] = []
        for original, fix in zip(courses, results):
            if not isinstance(fix, dict):
                verified.append(original)
                continue

            # Drop courses whose code format Gemini flagged as invalid
            if not fix.get("valid", True):
                logger.info("CourseVerifierAgent: dropped invalid course code %s", original["code"])
                continue

            updated = dict(original)

            # Apply title fix only if Gemini returned a real non-generic title
            fix_title = str(fix.get("title", "")).strip()
            if (
                fix_title
                and fix_title != f"Course {original['code']}"
                and fix_title != original.get("title", "")
            ):
                updated["title"] = fix_title

            # Apply credits fix
            fix_credits = fix.get("credits")
            if isinstance(fix_credits, (int, float)) and _CREDITS_MIN <= int(fix_credits) <= _CREDITS_MAX:
                updated["credits"] = int(fix_credits)

            # Apply NQF level fix
            fix_nqf = fix.get("nqf_level")
            if isinstance(fix_nqf, (int, float)) and 1 <= int(fix_nqf) <= 10:
                updated["nqf_level"] = int(fix_nqf)

            verified.append(updated)

        return verified
