import json
import logging
import re
from pathlib import Path

from src.config import Settings

logger = logging.getLogger(__name__)


_COURSE_CODE_PATTERN = re.compile(
    r"\b([A-Z]{3,4}\d{4}(?:[A-Za-z](?:/[A-Za-z]){0,3})?)\b",
)
_CODE_TITLE_PATTERN = re.compile(
    r"\b([A-Z]{3,4}\d{4}(?:[A-Za-z](?:/[A-Za-z]){0,3})?)\b\s+([A-Za-z][A-Za-z0-9&(),:.'/ -]{3,120}?)(?=(?:\.{3,}|\s{2,}|\s+\d{1,3}\s+\d|\s+\d{1,3}\s+NQF\b|\s+NQF\b)|$)",
)
_SEMESTER_PATTERN = re.compile(r"\b(semester\s*1|semester\s*2|sem\s*1|sem\s*2|s1|s2)\b", re.IGNORECASE)
_PREREQ_PATTERN = re.compile(r"pre[- ]?requisite[s]?", re.IGNORECASE)
_CREDITS_NQF_FULL = re.compile(
    r"\b(\d{1,3})\s+NQF\s+credits?\s+at\s+NQF\s+level\s+(\d{1,2})\b",
    re.IGNORECASE,
)
_TABLE_CREDITS_NQF = re.compile(
    r"\.{3,}\s*(\d{1,3})\s+(\d{1,2})\b",
)
# Code-specific patterns: code must appear directly before credits info (forward-looking)
_CODE_TABLE_CREDITS_NQF = re.compile(
    r"\b([A-Z]{3,4}\d{4}(?:[A-Za-z](?:/[A-Za-z]){0,3})?)\b"
    r"[A-Za-z0-9 (),.+\-]{0,150}?\.{3,}\s*(\d{1,3})\s+(\d{1,2})\b",
)
_CODE_FULL_CREDITS_NQF = re.compile(
    r"\b([A-Z]{3,4}\d{4}(?:[A-Za-z](?:/[A-Za-z]){0,3})?)\b"
    r"[^.\n]{0,150}?(\d{1,3})\s+NQF\s+credits?\s+at\s+NQF\s+level\s+(\d{1,2})\b",
    re.IGNORECASE,
)
_TITLE_STOPWORDS = (
    "course entry requirements",
    "assessment",
    "convener",
    "dp requirements",
    "nqf",
    "credits",
    "degrees offered",
    "departments in the faculty",
    "core courses",
    "code course",
    "first year",
    "second year",
    "third year",
    "postgraduate",
)


def _normalize_whitespace(value: str) -> str:
    return " ".join(value.split())


def _clean_title(value: str) -> str:
    cleaned = _normalize_whitespace(value.strip(" -:|.,;"))
    cleaned = re.sub(r"\s*\.{2,}.*$", "", cleaned)  # strip table dots e.g. "Title ......... 18 5"
    cleaned = re.sub(r"\b(pre[- ]?requisite[s]?|semester\s*[12])\b.*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\b\d{1,3}\s+NQF\b.*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\b(NQF\s+credits?|NQF\s+level)\b.*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\b(course\s+entry\s+requirements|convener|assessment|dp\s+requirements)\b.*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\b(since\s+the\s+code|students\s+will\s+be\s+concurrently\s+registered|students\s+will\s+enrol|the\s+course\s+is\s+also\s+open\s+to)\b.*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\b(preference\s+will\s+be\s+given\s+to|recommended:)\b.*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.strip(" -:|.,;")
    if len(cleaned) > 90:
        cleaned = cleaned[:90].rstrip(" -:|.,;")
    return cleaned


def _looks_like_course_title(candidate: str) -> bool:
    value = _normalize_whitespace(candidate)
    if len(value) < 4 or len(value) > 100:
        return False
    if _COURSE_CODE_PATTERN.search(value):
        return False
    # Reject strings starting like a partial course code (e.g. "M1000W in level...")
    if re.match(r"[A-Z]\d", value):
        return False
    # Course titles are concise noun phrases — reject anything that reads like prose
    if len(value.split()) > 8:
        return False

    lowered = value.lower()
    if any(token in lowered for token in _TITLE_STOPWORDS):
        return False

    if not value[0].isalpha() or value[0].islower():
        return False

    alpha_count = sum(1 for char in value if char.isalpha())
    return alpha_count >= 6


def _title_score(candidate: str) -> int:
    value = _clean_title(candidate)
    if not _looks_like_course_title(value):
        return -100

    score = 10
    words = value.split()
    score += min(len(words), 8)

    if len(value) <= 60:
        score += 3

    if "&" in value:
        score += 1

    return score


def _apply_title_candidate(record: dict, candidate: str | None) -> None:
    if not candidate:
        return

    cleaned = _clean_title(candidate)
    score = _title_score(cleaned)
    if score > record.get("_title_score", -1):
        record["title"] = cleaned
        record["_title_score"] = score


def _extract_inline_title_after_code(text: str, code: str) -> str | None:
    pattern = re.compile(
        rf"\b{re.escape(code)}\b\s+([A-Za-z][A-Za-z0-9&(),:.'/ -]{{3,120}}?)"
        rf"(?=(?:\s+\.{{2,}}|\s+\d{{1,3}}\s+\d\b|\s+\d{{1,3}}\s+NQF\b|\s+NQF\b|\s+Course entry requirements:|\s+Convener:|\s+Assessment:|\s+DP requirements:|$))",
        re.IGNORECASE,
    )
    match = pattern.search(text)
    if not match:
        return None

    candidate = _clean_title(match.group(1))
    if not _looks_like_course_title(candidate):
        return None
    return candidate


def _extract_field(block: str, field_label: str) -> str:
    pattern = re.compile(
        rf"{re.escape(field_label)}\s*(.+?)(?=\s+(?:Convener:|Course entry requirements:|Course outline:|Lecture times:|DP requirements:|Assessment:|[A-Z]{{3,4}}\d{{4}}(?:[A-Za-z](?:/[A-Za-z]){{0,3}})?\b)|$)",
        flags=re.IGNORECASE,
    )
    match = pattern.search(block)
    return _normalize_whitespace(match.group(1)) if match else ""


def _format_outline_text(outline_raw: str) -> str:
    text = _normalize_whitespace(outline_raw)
    if not text:
        return ""

    text = (
        text.replace("â¢", "•")
        .replace("â€¢", "•")
        .replace("€¢", "•")
        .replace("â€™", "'")
        .replace("â€œ", '"')
        .replace("â€\"", '"')
        .replace("â€“", "-")
        .replace("â€”", "-")
        .replace("âs", "'s")
    )

    text = re.sub(r"\s*(What you can expect to take away from this course:)\s*", r"\n\1\n", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*•\s*", "\n• ", text)
    text = re.sub(r"\s*(Lecture times:)\s*", r"\n\1 ", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*(DP requirements:)\s*", r"\n\1 ", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*(Assessment:)\s*", r"\n\1 ", text, flags=re.IGNORECASE)
    text = re.sub(r"\.\s+(?=[A-Z])", ".\n", text)

    if not text.lower().startswith("course outline"):
        text = f"Course outline: {text}"

    return text.strip()


def _canonical_semester(raw: str) -> str:
    lowered = raw.lower().replace(" ", "")
    if lowered in {"s1", "sem1", "semester1"}:
        return "Semester 1"
    if lowered in {"s2", "sem2", "semester2"}:
        return "Semester 2"
    return "From handbook"


def _infer_department(source_title: str, source_key: str, code: str) -> str:
    combined = f"{source_title} {source_key}".lower()
    if code.startswith("MATH") or "math" in combined:
        return "Mathematics"
    if code.startswith("PHYS") or "physics" in combined:
        return "Physics"
    if code.startswith("CHEM") or "chem" in combined:
        return "Chemistry"
    if code.startswith("BIOL") or "biolog" in combined:
        return "Biology"
    if code.startswith("COMP") or "comput" in combined:
        return "Computer Science"
    return "Science"


def _find_lines_containing_code(text: str, code: str) -> list[str]:
    token = re.compile(rf"\b{re.escape(code)}\b")
    lines: list[str] = []
    seen: set[str] = set()
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if not token.search(line):
            continue
        if line in seen:
            continue
        seen.add(line)
        lines.append(line)
    return lines


def _title_from_line(code: str, line: str) -> str | None:
    if not line:
        return None
    # Handle handbook forms like "CODE Title ..." and "CODE TITLE ...".
    title_after_code = re.search(
        rf"\b{re.escape(code)}\b\s+([A-Za-z][A-Za-z0-9&(),:.'/ -]{{3,120}}?)"
        rf"(?=(?:\s+\d{{1,3}}\s+NQF|\s+NQF|\s+Convener:|\s+Course\s+entry\s+requirements:|\s+Course\s+outline:|\s+Lecture\s+times:|\s+DP\s+requirements:|\s+Assessment:|\s+Students?\b|\s+Notes?:|$))",
        line,
        flags=re.IGNORECASE,
    )
    if title_after_code:
        candidate = _clean_title(title_after_code.group(1))
        candidate = re.sub(r"\b(\d{1,3}\s+NQF|CONVENER|COURSE\s+ENTRY\s+REQUIREMENTS|COURSE\s+OUTLINE)\b.*$", "", candidate, flags=re.IGNORECASE).strip(" -:|.,;")
        candidate = re.sub(r"\s+[A-Z]$", "", candidate).strip(" -:|.,;")
        candidate = re.sub(r"\b(Each|For|Student|Students)\b$", "", candidate, flags=re.IGNORECASE).strip(" -:|.,;")
        if _looks_like_course_title(candidate):
            return candidate.title()

    # Handle common handbook formats like "COMP2001 - Data Structures".
    explicit = re.search(rf"\b{re.escape(code)}\b\s*[-:|]\s*([^\n\r]{{3,100}})", line)
    if explicit:
        candidate = _clean_title(explicit.group(1))
        if _looks_like_course_title(candidate):
            return candidate

    # Fallback only when the line starts with the code (true heading row).
    if not re.match(rf"^\s*{re.escape(code)}\b", line):
        return None

    # Remove code from heading line and keep likely title segment.
    reduced = re.sub(rf"\b{re.escape(code)}\b", "", line)
    reduced = reduced.strip(" -:|.,;")
    candidate = _clean_title(reduced)
    if _looks_like_course_title(candidate) and len(candidate.split()) >= 2:
        return candidate
    return None


def _context_windows(text: str, code: str, radius: int = 220) -> list[str]:
    windows: list[str] = []
    for match in re.finditer(re.escape(code), text):
        start = max(0, match.start() - radius)
        end = min(len(text), match.end() + radius)
        windows.append(text[start:end])
    return windows


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


def _expand_compound_code(code: str) -> list[str]:
    """Expand handbook compound suffix codes (e.g. CSC1015F/S -> [CSC1015F, CSC1015S])."""
    normalized = code.upper().strip()
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


def _code_stem(code: str) -> str:
    match = re.match(r"^([A-Z]{3,4}\d{4})", code.upper())
    return match.group(1) if match else code.upper()


def _is_generic_title_for_code(title: str, code: str) -> bool:
    normalized = _normalize_whitespace(title)
    return normalized.lower() == f"course {code.lower()}"


def _fallback_title_from_code(code: str) -> str | None:
    match = re.match(r"^([A-Z]{3,4})(\d{4})", code.upper())
    if not match:
        return None

    prefix, number = match.groups()
    subject_by_prefix = {
        "AGE": "Archaeology",
        "AST": "Astronomy",
        "BIO": "Biology",
        "CEM": "Chemistry",
        "CHE": "Chemistry",
        "CSC": "Computer Science",
        "COMP": "Computer Science",
        "EGS": "Environmental And Geographical Science",
        "ENV": "Environmental Science",
        "GEO": "Geological Sciences",
        "GES": "Geological Sciences",
        "MAM": "Mathematics",
        "MAT": "Mathematics",
        "MCB": "Molecular And Cell Biology",
        "OCG": "Oceanography",
        "OCN": "Oceanography",
        "SEA": "Oceanography",
        "PHY": "Physics",
        "STA": "Statistics",
    }

    subject = subject_by_prefix.get(prefix)
    if not subject:
        return None

    return f"{subject} {number}"


def _extract_title_from_text_for_code(text: str, code: str) -> str | None:
    escaped = re.escape(code)
    patterns = [
        # CODE - Title
        rf"\b{escaped}\b\s*[-:|]\s*([^\n\r]{{3,140}})",
        # CODE Title ... 18 NQF / Convener / Course outline
        rf"\b{escaped}\b\s+([A-Za-z][A-Za-z0-9&(),:.'/ -]{{3,140}}?)"
        rf"(?=(?:\s+\d{{1,3}}\s+NQF|\s+NQF|\s+Convener:|\s+Course\s+entry\s+requirements:|\s+Course\s+outline:|\s+Lecture\s+times:|\s+DP\s+requirements:|\s+Assessment:|$))",
        # Schedule rows: CODE Title 3 M to F / 1/3 By arrangement / See departmental entry
        rf"\b{escaped}\b\s+([A-Za-z][A-Za-z0-9&(),:.'/ -]{{3,140}}?)"
        rf"(?=(?:\s+\d(?:/\d)?\s+(?:M|Tu|W|Th|F|By|See)\b))",
    ]

    best: tuple[str, int] | None = None
    for pattern in patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            raw = match.group(1)
            candidate = _clean_title(raw)
            candidate = re.sub(r"\b(\d{1,3}\s+NQF|CONVENER|COURSE\s+ENTRY\s+REQUIREMENTS|COURSE\s+OUTLINE)\b.*$", "", candidate, flags=re.IGNORECASE).strip(" -:|.,;")
            candidate = re.sub(r"\b(Each|For|Student|Students)\b$", "", candidate, flags=re.IGNORECASE).strip(" -:|.,;")
            if not _looks_like_course_title(candidate):
                continue

            score = _title_score(candidate)
            if best is None or score > best[1]:
                best = (candidate, score)

    return best[0] if best else None


def _credits_from_code(code: str) -> int:
    return 20 if code.startswith(("COMP5", "COMP6")) else 15


def _nqf_from_group(group: str) -> int:
    return {"Year 1": 5, "Year 2": 6, "Year 3": 7, "Postgrad": 8}.get(group, 5)


_COURSES_CACHE_DIR = "courses"


class ScienceCourseCatalog:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.base_dir = settings.resolved_data_dir

    def _resolve_run_id(self, run_id: str | None) -> str:
        if run_id:
            return run_id

        # Prefer the newest cached course token when available. This keeps
        # /courses/science/list fast even if the latest chunk run is uncached.
        cache_dir = self.base_dir / _COURSES_CACHE_DIR
        if cache_dir.exists():
            cache_files = sorted(
                cache_dir.glob("*.verified.json"),
                key=lambda path: path.stat().st_mtime,
                reverse=True,
            )
            for cache_file in cache_files:
                name = cache_file.name
                if ".dept-" in name:
                    return name.split(".dept-", 1)[0]
                if name.endswith(".verified.json"):
                    return name.replace(".verified.json", "")

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

    def _load_chunk_text(self, run_id: str) -> list[dict]:
        chunks_path = self.base_dir / "chunks" / f"{run_id}.jsonl"
        if not chunks_path.exists():
            raise FileNotFoundError(
                f"Chunk file not found for run_id={run_id}. Run /pipelines/science/run first."
            )

        records: list[dict] = []
        with chunks_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                records.append(json.loads(line))

        return records

    @staticmethod
    def _coerce_int(value: object, fallback: int) -> int:
        try:
            if value is None:
                return fallback
            return int(str(value).strip())
        except Exception:
            return fallback

    @staticmethod
    def _group_from_year_level(year_level: object, fallback_code: str) -> str:
        if isinstance(year_level, int):
            return _group_from_code(f"ABC{year_level}000")

        raw = str(year_level or "").strip().lower()
        if "first" in raw or "year 1" in raw:
            return "Year 1"
        if "second" in raw or "year 2" in raw:
            return "Year 2"
        if "third" in raw or "year 3" in raw:
            return "Year 3"
        if "post" in raw or "honours" in raw or "masters" in raw or "phd" in raw:
            return "Postgrad"

        return _group_from_code(fallback_code)

    def _normalize_cached_course_record(self, raw: dict) -> dict | None:
        code = str(raw.get("code") or raw.get("course_code") or "").upper().strip()
        if not code:
            return None

        title = str(raw.get("title") or raw.get("course_title") or f"Course {code}").strip()
        # Canonical grouping rule: first numeric level in course code controls year bucket.
        group = _group_from_code(code)
        credits = self._coerce_int(raw.get("credits", raw.get("course_credits")), _credits_from_code(code))
        nqf_level = self._coerce_int(raw.get("nqf_level"), _nqf_from_group(group))

        semester = str(raw.get("semester") or "From handbook").strip()
        department = str(raw.get("department") or "Science").strip()
        delivery = str(raw.get("delivery") or "Handbook derived").strip()
        prerequisites = str(
            raw.get("prerequisites")
            or raw.get("entry_requirements")
            or raw.get("co_requisites")
            or "None listed"
        ).strip()

        outline_details = str(raw.get("outline_details") or raw.get("course_outline") or "").strip()
        lecture_times = str(raw.get("lecture_times") or "").strip()
        dp_requirements = str(raw.get("dp_requirements") or "").strip()
        assessment = str(raw.get("assessment") or "").strip()

        description = str(raw.get("description") or outline_details or f"Extracted from handbook source: {department}").strip()
        outcomes = raw.get("outcomes")
        normalized_outcomes = outcomes if isinstance(outcomes, list) and outcomes else [
            "Refer to the handbook entry for detailed outcomes."
        ]

        return {
            "id": code.lower(),
            "code": code,
            "title": title,
            "group": group,
            "credits": credits,
            "nqf_level": nqf_level,
            "semester": semester,
            "department": department,
            "delivery": delivery,
            "prerequisites": prerequisites,
            "description": description,
            "outcomes": normalized_outcomes,
            "source": str(raw.get("source") or "").strip(),
            "convener_details": str(raw.get("convener_details") or raw.get("convener") or "").strip(),
            "entry_requirements": str(raw.get("entry_requirements") or raw.get("prerequisites") or "").strip(),
            "outline_details": outline_details,
            "lecture_times": lecture_times,
            "dp_requirements": dp_requirements,
            "assessment": assessment,
        }

    @staticmethod
    def _extract_course_items(payload: object) -> list[dict]:
        """Accept both legacy list payloads and wrapped payloads with a courses array."""
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]

        if isinstance(payload, dict):
            courses = payload.get("courses")
            if isinstance(courses, list):
                return [item for item in courses if isinstance(item, dict)]

        return []

    def _latest_department_cache_token(self) -> str | None:
        cache_dir = self.base_dir / _COURSES_CACHE_DIR
        if not cache_dir.exists():
            return None

        dept_files = sorted(
            cache_dir.glob("*.dept-*.verified.json"),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        if not dept_files:
            return None

        latest = dept_files[0].name
        return latest.split(".dept-", 1)[0] if ".dept-" in latest else None

    def _load_department_verified_cache(self, run_id: str | None = None) -> tuple[str, list[dict]] | None:
        cache_dir = self.base_dir / _COURSES_CACHE_DIR
        if not cache_dir.exists():
            return None

        cache_token = run_id or self._latest_department_cache_token()
        if not cache_token:
            return None

        records: list[dict] = []
        for path in sorted(cache_dir.glob(f"{cache_token}.dept-*.verified.json")):
            try:
                with path.open("r", encoding="utf-8") as fh:
                    payload = json.load(fh)
            except Exception as exc:
                logger.warning("course_catalog: failed to read department cache %s (%s)", path, exc)
                continue

            for item in self._extract_course_items(payload):
                normalized = self._normalize_cached_course_record(item)
                if normalized is not None:
                    records.append(normalized)

        if not records:
            return None

        merged = self._local_dedup(records)
        logger.info("course_catalog: loaded %d courses from department caches for %s", len(merged), cache_token)
        return cache_token, merged

    def list_courses(self, run_id: str | None = None) -> dict:
        # Fastest path for UI: use department-verified cache files directly.
        cached_department = self._load_department_verified_cache(run_id)
        if cached_department is not None:
            cache_token, cached_department_courses = cached_department
            courses = self._expand_compound_codes(cached_department_courses)
            return {
                "run_id": cache_token,
                "count": len(courses),
                "courses": courses,
            }

        resolved_run_id = self._resolve_run_id(run_id)

        # Fastest path: a run-level verified cache already exists.
        cached = self._load_verified_cache(resolved_run_id)
        if cached is not None:
            courses = self._expand_compound_codes(cached)
            return {
                "run_id": resolved_run_id,
                "count": len(courses),
                "courses": courses,
            }

        # Next-fastest path: merge existing department verified caches.
        cached_department = self._load_department_verified_cache(resolved_run_id)
        if cached_department is not None:
            _, cached_department_courses = cached_department
            courses = self._expand_compound_codes(cached_department_courses)
            return {
                "run_id": resolved_run_id,
                "count": len(courses),
                "courses": courses,
            }

        chunks = self._load_chunk_text(resolved_run_id)

        by_code: dict[str, dict] = {}

        for chunk in chunks:
            text = str(chunk.get("text", ""))
            title = str(chunk.get("title", "")).strip()
            source = str(chunk.get("s3_key", "")).strip()
            text_compact = _normalize_whitespace(text)

            # Prefer explicit "CODE - Title" patterns when present.
            for code, parsed_title in _CODE_TITLE_PATTERN.findall(text):
                for normalized_code in _expand_compound_code(code):
                    clean_title = _clean_title(parsed_title)
                    title_score = _title_score(clean_title)
                    existing = by_code.get(normalized_code)
                    if existing:
                        if title_score > existing.get("_title_score", -1):
                            existing["title"] = clean_title
                            existing["_title_score"] = title_score
                        continue

                    by_code[normalized_code] = {
                        "id": normalized_code.lower(),
                        "code": normalized_code,
                        "title": clean_title if title_score >= 0 else f"Course {normalized_code}",
                        "_title_score": title_score if title_score >= 0 else -1,
                        "group": _group_from_code(normalized_code),
                        "credits": _credits_from_code(normalized_code),
                        "nqf_level": None,
                        "semester": "From handbook",
                        "department": _infer_department(title, source, normalized_code),
                        "delivery": "Handbook derived",
                        "prerequisites": "See handbook",
                        "description": f"Extracted from handbook source: {title or source}",
                        "outcomes": ["Refer to the handbook entry for detailed outcomes."],
                        "source": source,
                        "convener_details": "",
                        "entry_requirements": "",
                        "outline_details": "",
                    }

            # If no explicit title pattern exists, at least capture distinct codes.
            for code in _COURSE_CODE_PATTERN.findall(text):
                for normalized_code in _expand_compound_code(code):
                    record = by_code.get(normalized_code)
                    if record is None:
                        record = {
                            "id": normalized_code.lower(),
                            "code": normalized_code,
                            "title": f"Course {normalized_code}",
                            "_title_score": -1,
                            "group": _group_from_code(normalized_code),
                            "credits": _credits_from_code(normalized_code),
                            "nqf_level": None,
                            "semester": "From handbook",
                            "department": _infer_department(title, source, normalized_code),
                            "delivery": "Handbook derived",
                            "prerequisites": "See handbook",
                            "description": f"Extracted from handbook source: {title or source}",
                            "outcomes": ["Refer to the handbook entry for detailed outcomes."],
                            "source": source,
                            "convener_details": "",
                            "entry_requirements": "",
                            "outline_details": "",
                            "_semesters": set(),
                            "_prereq_codes": set(),
                        }
                        by_code[normalized_code] = record

                    if "_semesters" not in record:
                        record["_semesters"] = set()
                    if "_prereq_codes" not in record:
                        record["_prereq_codes"] = set()

                    for line_with_code in _find_lines_containing_code(text, normalized_code):
                        inferred_title = _title_from_line(normalized_code, line_with_code)
                        _apply_title_candidate(record, inferred_title)

                    inline_title = _extract_inline_title_after_code(text, normalized_code)
                    _apply_title_candidate(record, inline_title)

                    for raw_sem in _SEMESTER_PATTERN.findall(text_compact):
                        record["_semesters"].add(_canonical_semester(raw_sem))

                    for window in _context_windows(text, normalized_code):
                        convener = _extract_field(window, "Convener:")
                        entry = _extract_field(window, "Course entry requirements:")
                        outline_body = _extract_field(window, "Course outline:")
                        lecture_times = _extract_field(window, "Lecture times:")
                        dp_requirements = _extract_field(window, "DP requirements:")
                        assessment = _extract_field(window, "Assessment:")

                        sections: list[str] = []
                        if outline_body:
                            sections.append(outline_body)
                        if lecture_times:
                            sections.append(f"Lecture times: {lecture_times}")
                        if dp_requirements:
                            sections.append(f"DP requirements: {dp_requirements}")
                        if assessment:
                            sections.append(f"Assessment: {assessment}")

                        combined_outline = _format_outline_text(" ".join(sections))
                        if combined_outline and len(combined_outline) > len(str(record.get("outline_details", ""))):
                            record["outline_details"] = combined_outline
                            record["description"] = combined_outline

                        if convener and len(convener) > len(str(record.get("convener_details", ""))):
                            record["convener_details"] = convener

                        if entry and len(entry) > len(str(record.get("entry_requirements", ""))):
                            record["entry_requirements"] = entry

                        if _PREREQ_PATTERN.search(window):
                            for prereq_code in _COURSE_CODE_PATTERN.findall(window):
                                for prereq_upper in _expand_compound_code(prereq_code):
                                    if prereq_upper != normalized_code:
                                        record["_prereq_codes"].add(prereq_upper)

                        if record["description"].startswith("Extracted from handbook source"):
                            compact_window = _normalize_whitespace(window)
                            if len(compact_window) > 20:
                                record["description"] = compact_window[:220]

            # Code-specific credits/NQF extraction for this chunk.
            # Priority 1: "CODE ... N NQF credits at NQF level M" in detailed sections.
            for code_u, cred_s, nqf_s in _CODE_FULL_CREDITS_NQF.findall(text):
                for expanded_code in _expand_compound_code(code_u):
                    rec = by_code.get(expanded_code)
                    if rec and not rec.get("_credits_confirmed"):
                        rec["credits"] = int(cred_s)
                        rec["nqf_level"] = int(nqf_s)
                        rec["_credits_confirmed"] = True

            # Priority 2: table format "CODE Title ..... N M".
            for code_u, cred_s, nqf_s in _CODE_TABLE_CREDITS_NQF.findall(text):
                for expanded_code in _expand_compound_code(code_u):
                    rec = by_code.get(expanded_code)
                    if rec and not rec.get("_credits_confirmed") and rec.get("nqf_level") is None:
                        cr, nq = int(cred_s), int(nqf_s)
                        if 1 <= cr <= 360 and 1 <= nq <= 10:
                            rec["credits"] = cr
                            rec["nqf_level"] = nq


        for record in by_code.values():
            semesters = sorted(record.pop("_semesters", set()))
            prereq_codes = sorted(record.pop("_prereq_codes", set()))
            record.pop("_title_score", None)
            record.pop("_credits_confirmed", None)
            if not record.get("nqf_level"):
                record["nqf_level"] = _nqf_from_group(record["group"])

            if semesters:
                record["semester"] = " / ".join(semesters)

            if prereq_codes:
                record["prerequisites"] = ", ".join(prereq_codes)
            elif record["prerequisites"] == "See handbook":
                record["prerequisites"] = "None listed"

        # Full-text fallback for remaining generic titles (common in schedule/table sections).
        combined_handbook_text = "\n".join(str(chunk.get("text", "")) for chunk in chunks)
        for record in by_code.values():
            code = str(record.get("code", "")).upper()
            title = str(record.get("title", ""))
            if not code or not _is_generic_title_for_code(title, code):
                continue

            derived = _extract_title_from_text_for_code(combined_handbook_text, code)
            if derived:
                record["title"] = derived

        # Repair remaining generic titles (e.g. "Course BIO1000W") using
        # sibling variants that share the same code stem (BIO1000F/H/W).
        best_title_by_stem: dict[str, tuple[str, int]] = {}
        for record in by_code.values():
            code = str(record.get("code", "")).upper()
            title = str(record.get("title", ""))
            if not code or _is_generic_title_for_code(title, code):
                continue
            if not _looks_like_course_title(title):
                continue

            stem = _code_stem(code)
            score = _title_score(title)
            existing = best_title_by_stem.get(stem)
            if existing is None or score > existing[1]:
                best_title_by_stem[stem] = (title, score)

        for record in by_code.values():
            code = str(record.get("code", "")).upper()
            title = str(record.get("title", ""))
            if not code or not _is_generic_title_for_code(title, code):
                continue

            stem = _code_stem(code)
            replacement = best_title_by_stem.get(stem)
            if replacement:
                record["title"] = replacement[0]

        # Final deterministic fallback for any still-generic titles.
        for record in by_code.values():
            code = str(record.get("code", "")).upper()
            title = str(record.get("title", ""))
            if not code or not _is_generic_title_for_code(title, code):
                continue

            fallback = _fallback_title_from_code(code)
            if fallback:
                record["title"] = fallback

        raw_courses = sorted(by_code.values(), key=lambda item: item["code"])

        # Local-only deduplication (no Gemini — keeps the path fast)
        raw_courses = self._local_dedup(raw_courses)

        courses = raw_courses
        courses = self._expand_compound_codes(courses)

        return {
            "run_id": resolved_run_id,
            "count": len(courses),
            "courses": courses,
        }

    # ------------------------------------------------------------------
    # Local deduplication (no network calls)
    # ------------------------------------------------------------------

    @staticmethod
    def _local_dedup(courses: list[dict]) -> list[dict]:
        """Remove true duplicate codes while preserving F/S semester pairs."""
        import re as _re
        suffix_re = _re.compile(r"^([A-Z]{3,4}\d{4})([A-Za-z])$")

        by_code: dict[str, dict] = {}
        for course in courses:
            code = course.get("code", "").upper()
            if not code:
                continue
            existing = by_code.get(code)
            if existing is None:
                by_code[code] = course
            else:
                # Prefer entry with a real title over generic one
                def _quality(c: dict) -> int:
                    t = c.get("title", "")
                    return 0 if t == f"Course {c.get('code', '')}" or not t else len(t)
                if _quality(course) > _quality(existing):
                    by_code[code] = course

        by_base: dict[str, list[str]] = {}
        for code in by_code:
            m = suffix_re.match(code)
            base = m.group(1) if m else code
            by_base.setdefault(base, []).append(code)

        result: list[dict] = []
        for base, codes in by_base.items():
            suffixed = [c for c in codes if suffix_re.match(c)]
            if suffixed:
                best_per_suffix: dict[str, str] = {}
                for code in suffixed:
                    m = suffix_re.match(code)
                    suf = m.group(2) if m else code[-1]
                    def _quality(c: dict) -> int:
                        t = c.get("title", "")
                        return 0 if t == f"Course {c.get('code', '')}" or not t else len(t)
                    existing = best_per_suffix.get(suf)
                    if existing is None or _quality(by_code[code]) > _quality(by_code[existing]):
                        best_per_suffix[suf] = code
                result.extend(by_code[c] for c in best_per_suffix.values())
            else:
                def _quality(c: dict) -> int:
                    t = c.get("title", "")
                    return 0 if t == f"Course {c.get('code', '')}" or not t else len(t)
                best = max(codes, key=lambda c: _quality(by_code[c]))
                result.append(by_code[best])

        return sorted(result, key=lambda c: c["code"])

    @staticmethod
    def _expand_compound_codes(courses: list[dict]) -> list[dict]:
        """Expand slash-suffix codes in existing payloads (including cached results)."""
        expanded: list[dict] = []
        for course in courses:
            raw_code = str(course.get("code", "")).upper().strip()
            if not raw_code:
                continue
            for code in _expand_compound_code(raw_code):
                cloned = dict(course)
                cloned["code"] = code
                cloned["id"] = code.lower()
                expanded.append(cloned)

        return ScienceCourseCatalog._local_dedup(expanded)

    # ------------------------------------------------------------------
    # Verified course cache (populated by /courses/science/verify)
    # ------------------------------------------------------------------

    def _cache_path(self, cache_token: str) -> Path:
        cache_dir = self.base_dir / _COURSES_CACHE_DIR
        cache_dir.mkdir(parents=True, exist_ok=True)
        return cache_dir / f"{cache_token}.verified.json"

    def _load_verified_cache(self, cache_token: str) -> list[dict] | None:
        path = self._cache_path(cache_token)
        if not path.exists():
            return None
        try:
            with path.open("r", encoding="utf-8") as fh:
                payload = json.load(fh)
                courses = self._extract_course_items(payload)
                return courses if courses else None
        except Exception as exc:
            logger.warning("course_catalog: failed to read cache %s (%s)", path, exc)
            return None

    def verify_and_cache(self, run_id: str | None = None) -> dict:
        """Run Gemini verification on the extracted catalog and persist results.

        This is the slow path (Gemini API calls). Call it explicitly via
        POST /courses/science/verify rather than in the hot list path.
        """
        from src.agents.course_verifier_agent import CourseVerifierAgent

        resolved_run_id = self._resolve_run_id(run_id)
        # Always re-extract so verification is based on the latest extraction
        raw = self.list_courses(run_id=resolved_run_id)
        raw_courses = raw["courses"]

        verifier = CourseVerifierAgent(self.settings)
        verified = verifier.verify(raw_courses)

        # Persist to disk so subsequent list_courses calls use the cleaned data
        cache_path = self._cache_path(resolved_run_id)
        try:
            with cache_path.open("w", encoding="utf-8") as fh:
                json.dump(verified, fh, ensure_ascii=False, indent=2)
            logger.info("course_catalog: saved %d verified courses to %s", len(verified), cache_path)
        except Exception as exc:
            logger.warning("course_catalog: could not write cache (%s)", exc)

        return {
            "run_id": resolved_run_id,
            "count": len(verified),
            "courses": verified,
            "verification": "gemini_verified",
        }

    def collect_department_courses(
        self,
        department: str,
        handbook_title: str = "2026 Science-Handbook-UCT",
        run_id: str | None = None,
        force_refresh: bool = False,
    ) -> dict:
        """Collect and verify courses for a single department from handbook chunks."""
        from src.agents.collector_agent import CollectorAgent
        from src.agents.course_verifier_agent import CourseVerifierAgent

        resolved_run_id = self._resolve_run_id(run_id)
        cache_token = CollectorAgent.cache_key(resolved_run_id, department)

        if not force_refresh:
            cached = self._load_verified_cache(cache_token)
            if cached is not None and len(cached) > 0:
                normalized_cached = self._expand_compound_codes(cached)
                return {
                    "run_id": resolved_run_id,
                    "department": department,
                    "handbook_title": handbook_title,
                    "count": len(normalized_cached),
                    "courses": normalized_cached,
                    "verification": "gemini_verified_cache",
                }
            if cached is not None and len(cached) == 0:
                logger.info(
                    "course_catalog: ignoring empty department cache for %s (%s)",
                    department,
                    cache_token,
                )

        chunks = self._load_chunk_text(resolved_run_id)
        collector = CollectorAgent(self.settings)
        collected = collector.collect_department_courses(
            chunks=chunks,
            department=department,
            handbook_title=handbook_title,
        )

        verifier = CourseVerifierAgent(self.settings)
        verified = verifier.verify(collected)
        verified = self._expand_compound_codes(verified)

        cache_path = self._cache_path(cache_token)
        try:
            with cache_path.open("w", encoding="utf-8") as fh:
                json.dump(verified, fh, ensure_ascii=False, indent=2)
            logger.info(
                "course_catalog: saved %d department courses to %s",
                len(verified),
                cache_path,
            )
        except Exception as exc:
            logger.warning("course_catalog: could not write department cache (%s)", exc)

        return {
            "run_id": resolved_run_id,
            "department": department,
            "handbook_title": handbook_title,
            "count": len(verified),
            "courses": verified,
            "verification": "gemini_verified",
        }
