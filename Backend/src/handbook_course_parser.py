from __future__ import annotations

import re
from dataclasses import dataclass


COURSE_CODE_RE = re.compile(r"^[A-Z]{3,4}\d{4}(?:[A-Za-z](?:/[A-Za-z]){0,3})?$")
COURSE_START_RE = re.compile(
    r"\b([A-Z]{3,4}\d{4}(?:[A-Za-z](?:/[A-Za-z]){0,3})?)\b\s+"
    r"([A-Za-z][A-Za-z0-9&(),:'/\- ]{3,180}?)\s+"
    r"(\d{1,3})\s+NQF\s+credits?\s+at\s+NQF\s+level\s+(\d{1,2})",
    re.IGNORECASE,
)
FIELD_STOP_RE = re.compile(
    r"\s+(?:Convener:|Course entry requirements:|Course outline:|Lecture times:|DP requirements:|Assessment:)|$",
    re.IGNORECASE,
)
MAX_CONTEXT_CHARS = 380_000


@dataclass
class HandbookCourse:
    code: str
    title: str
    credits: int
    nqf_level: int
    convener: str
    prerequisites: str
    outline: str
    raw_block: str


def normalize_whitespace(value: str) -> str:
    return " ".join(value.split())


def normalize_title(value: str) -> str:
    compact = normalize_whitespace(value.strip(" -:|.,;"))
    if not compact:
        return compact

    letters = [char for char in compact if char.isalpha()]
    if letters:
        upper_ratio = sum(1 for char in letters if char.isupper()) / len(letters)
        if upper_ratio > 0.75:
            return compact.title()
    return compact


def normalize_text(value: str) -> str:
    text = value or ""
    text = (
        text.replace("â€™", "'")
        .replace("â€œ", '"')
        .replace("â€\"", '"')
        .replace("â€", '"')
        .replace("â€“", "-")
        .replace("â€”", "-")
        .replace("’", "'")
        .replace("‘", "'")
        .replace("“", '"')
        .replace("”", '"')
        .replace("\u00a0", " ")
    )
    text = re.sub(r"DEPARTMENTS IN THE FACULTY\s+\d+", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"SCHEDULE OF COURSES\s+\d+", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\b([A-Za-z]{2,})\s+\1\b", r"\1", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def normalize_compare_text(value: str) -> str:
    text = normalize_text(value)
    text = re.sub(r"\s*[:;,.]+\s*", " ", text)
    return text.casefold().strip()


def extract_field(block: str, field_label: str) -> str:
    pattern = re.compile(
        rf"{re.escape(field_label)}\s*(.+?)(?={FIELD_STOP_RE.pattern})",
        re.IGNORECASE,
    )
    match = pattern.search(block)
    return normalize_whitespace(match.group(1)) if match else ""


def format_outline_text(outline_raw: str) -> str:
    text = normalize_whitespace(outline_raw)
    if not text:
        return ""

    text = (
        text.replace("â¢", "•")
        .replace("â€¢", "•")
        .replace("€¢", "•")
        .replace("â€™", "'")
        .replace("â€", '"')
        .replace("â€œ", '"')
        .replace("â€\"", '"')
        .replace("â€“", "-")
        .replace("â€”", "-")
        .replace("âs", "'s")
    )
    text = (
        text.replace("’", "'")
        .replace("‘", "'")
        .replace("“", '"')
        .replace("”", '"')
        .replace("\u00a0", " ")
    )
    text = re.sub(r"(?<=[A-Za-z])â(?=[A-Za-z])", "'", text)
    text = re.sub(r"\b([A-Za-z]{2,})\s+\1\b", r"\1", text, flags=re.IGNORECASE)

    text = re.sub(
        r"Assessment:\s*Class participation \(workshops/\s*oth\s+within UCT and from further afield will be brought in to supplement material through lectures, interviews and/or short case studies\.?",
        "Assessment: Class participation (workshops/other tasks), tests and assignments as specified in the handbook.",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"Who did hind the linguistic map that we see today\?\s*What social, technological and palaeoenvironmental systems shaped the evolution of societies\?\s*Did Africa have any civilisations\?\s*",
        "",
        text,
        flags=re.IGNORECASE,
    )

    text = re.sub(r"\s*(What you can expect to take away from this course:)\s*", r"\n\1\n", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*•\s*", "\n• ", text)
    text = re.sub(r"\s*(Lecture times:)\s*", r"\n\1 ", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*(DP requirements:)\s*", r"\n\1 ", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*(Assessment:)\s*", r"\n\1 ", text, flags=re.IGNORECASE)
    text = re.sub(r"\.\s+(?=[A-Z])", ".\n", text)

    text = re.sub(r"\bpresent\s*-\s*day\b", "present-day", text, flags=re.IGNORECASE)
    text = re.sub(r"\bsub\s*-\s*minimum\b", "sub-minimum", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(\d+)\s*-\s*hour\b", r"\1-hour", text, flags=re.IGNORECASE)
    text = re.sub(r"\blast\s*-\s*(\d+)\s*years\b", r"last-\1 years", text, flags=re.IGNORECASE)

    lines = [line.strip() for line in text.split("\n") if line.strip()]
    deduped_lines: list[str] = []
    seen: set[str] = set()
    for line in lines:
        key = re.sub(r"\s+", " ", line.lower()).strip(" .;,:-")
        if not key:
            continue
        key = re.sub(r"^[•\-]\s*", "", key)
        key = key.replace("present -day", "present-day")
        if key in seen:
            continue

        if deduped_lines:
            prev_key = re.sub(r"\s+", " ", deduped_lines[-1].lower()).strip(" .;,:-")
            prev_key = re.sub(r"^[•\-]\s*", "", prev_key)
            prev_key = prev_key.replace("present -day", "present-day")

            if len(key) > 24 and key in prev_key:
                continue
            if len(prev_key) > 24 and prev_key in key:
                deduped_lines[-1] = line
                seen.add(key)
                continue

            if deduped_lines[-1].startswith("•") and line.startswith("•"):
                if len(key) > 40 and len(prev_key) > 40 and key[:70] == prev_key[:70]:
                    if len(key) >= len(prev_key):
                        deduped_lines[-1] = line
                        seen.add(key)
                    continue

        seen.add(key)
        deduped_lines.append(line)

    formatted = "\n".join(deduped_lines)
    if not formatted.lower().startswith("course outline"):
        formatted = f"Course outline:\n{formatted}"
    return formatted


def build_outline(block: str) -> str:
    outline_body = extract_field(block, "Course outline:")
    lecture_times = extract_field(block, "Lecture times:")
    dp_requirements = extract_field(block, "DP requirements:")
    assessment = extract_field(block, "Assessment:")

    sections: list[str] = []
    if outline_body:
        sections.append(outline_body)
    if lecture_times:
        sections.append(f"Lecture times: {lecture_times}")
    if dp_requirements:
        sections.append(f"DP requirements: {dp_requirements}")
    if assessment:
        sections.append(f"Assessment: {assessment}")
    return format_outline_text(" ".join(sections))


def is_department_heading(compact_text: str, start: int) -> bool:
    prefix = compact_text[max(0, start - 120) : start].lower()
    return "departments in the faculty" in prefix


def score_department_candidate(candidate: str, start: int, compact_text: str) -> int:
    lowered = candidate.lower()
    opening = lowered[:400]
    score = 0

    if is_department_heading(compact_text, start):
        score += 500
    if "the department is housed in" in lowered:
        score += 80
    if "the departmental abbreviation" in lowered:
        score += 60
    if "undergraduate courses" in lowered:
        score += 40
    if "course outline:" in lowered:
        score += 25
    if "nqf credits" in lowered:
        score += 10

    if "section in this handbook" in lowered:
        score -= 300
    if "mission of the department of" in lowered:
        score -= 120
    if re.search(r"\.{5,}\s*\d{1,3}\s+department of ", opening):
        score -= 1000
    if opening.count("department of ") > 1:
        score -= 600

    score += len(re.findall(r"\b[A-Z]{3,4}\d{4}(?:[A-Za-z](?:/[A-Za-z]){0,3})?\b", candidate))
    return score


def extract_department_context(handbook_text: str, department: str) -> str:
    compact = normalize_whitespace(handbook_text)
    lower = compact.lower()
    needle = f"department of {department}".lower()
    starts = [match.start() for match in re.finditer(re.escape(needle), lower)]
    if not starts:
        return ""

    all_mentions = [
        match.start()
        for match in re.finditer(r"department of [a-z][a-z'\- ]{2,80}", lower)
    ]
    chapter_heading_starts = [start for start in all_mentions if is_department_heading(compact, start)]

    candidates: list[tuple[int, int, str]] = []
    for start in starts:
        next_heading_start = next((value for value in chapter_heading_starts if value > start), None)
        if next_heading_start is not None:
            end = next_heading_start
        else:
            tail = lower[start + len(needle) :]
            next_match = re.search(r"\bdepartment of [a-z][a-z'\- ]{2,80}\b", tail)
            end = start + len(needle) + (next_match.start() if next_match else len(tail))

        candidate = compact[start : min(end, start + MAX_CONTEXT_CHARS)]
        score = score_department_candidate(candidate, start, compact)
        candidates.append((score, start, candidate))

    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return candidates[0][2]


def parse_handbook_courses(context: str) -> dict[str, HandbookCourse]:
    matches = list(COURSE_START_RE.finditer(context))
    result: dict[str, HandbookCourse] = {}

    for index, match in enumerate(matches):
        code = match.group(1).upper()
        title = normalize_title(match.group(2))
        credits = int(match.group(3))
        nqf_level = int(match.group(4))

        block_start = match.start()
        block_end = matches[index + 1].start() if index + 1 < len(matches) else len(context)
        block = context[block_start:block_end]

        result[code] = HandbookCourse(
            code=code,
            title=title,
            credits=credits,
            nqf_level=nqf_level,
            convener=extract_field(block, "Convener:"),
            prerequisites=extract_field(block, "Course entry requirements:"),
            outline=build_outline(block),
            raw_block=block,
        )

    return result