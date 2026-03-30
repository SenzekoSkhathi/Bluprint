"""
Enrich handbook course JSON files with detailed text extracted from faculty PDF handbooks.

Usage examples:
  python enrich_course_files_from_pdf.py --faculty engineering --pdf "Backend/data/handbooks/2026 EBE Faculty Handbook.pdf"
  python enrich_course_files_from_pdf.py --faculty health-sciences --pdf "Backend/data/handbooks/2026 HS Faculty Handbook.pdf"
  python enrich_course_files_from_pdf.py --faculty humanities --pdf "Backend/data/handbooks/2026 Humanities-Handbook-UCT.pdf"
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Dict, List, Optional

from pypdf import PdfReader


def normalize_whitespace(text: str) -> str:
    text = text.replace("\u00a0", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def extract_field(block: str, labels: List[str], stop_labels: List[str]) -> Optional[str]:
    label_pattern = "|".join(re.escape(label) for label in labels)
    if stop_labels:
        stop_pattern = "|".join(re.escape(label) for label in stop_labels)
        pattern = rf"(?:{label_pattern})\s*(.*?)(?={stop_pattern}|\Z)"
    else:
        # No explicit stop labels (used for Assessment): stop at blank line,
        # next course-code header line, or end of block.
        pattern = rf"(?:{label_pattern})\s*(.*?)(?=\n\s*\n|\n[A-Z]{{2,4}}\d{{4}}[A-Z]\b|\Z)"
    m = re.search(pattern, block, flags=re.IGNORECASE | re.DOTALL)
    if not m:
        return None
    value = normalize_whitespace(m.group(1))
    return value if value else None


def split_corequisites(text: str) -> List[str]:
    codes = re.findall(r"\b[A-Z]{2,4}\d{4}[A-Z]\b", text)
    deduped: List[str] = []
    seen = set()
    for code in codes:
        if code not in seen:
            seen.add(code)
            deduped.append(code)
    return deduped


def read_pdf_text(pdf_path: Path) -> str:
    reader = PdfReader(str(pdf_path))
    chunks = []
    for page in reader.pages:
        chunks.append(page.extract_text() or "")
    text = "\n".join(chunks)
    return text.replace("\u00a0", " ")


def find_header_positions(text: str, target_codes: set[str]) -> Dict[str, List[int]]:
    # A likely course header is code followed shortly by an NQF-credit phrase.
    pattern = re.compile(r"\b([A-Z]{2,4}\d{4}[A-Z])\b(?=[\s\S]{0,160}?NQF credits at NQF level)")
    positions: Dict[str, List[int]] = {}
    for m in pattern.finditer(text):
        code = m.group(1)
        if code in target_codes:
            positions.setdefault(code, []).append(m.start())
    return positions


def find_fallback_positions(text: str, target_codes: set[str]) -> Dict[str, List[int]]:
    positions: Dict[str, List[int]] = {}
    for code in target_codes:
        for m in re.finditer(rf"\b{re.escape(code)}\b", text):
            positions.setdefault(code, []).append(m.start())
    return positions


def choose_best_position(text: str, code: str, positions: List[int]) -> Optional[int]:
    if not positions:
        return None

    best_pos = None
    best_score = -1
    for pos in positions:
        window = text[pos : pos + 2600]
        score = 0
        if "Convener:" in window:
            score += 3
        if "Course entry requirements:" in window or "Pre-requisites:" in window or "Prerequisites:" in window:
            score += 3
        if "Co-requisites:" in window or "Corequisites:" in window:
            score += 2
        if "Course outline:" in window:
            score += 3
        if "Lecture times:" in window:
            score += 2
        if "DP requirements:" in window:
            score += 2
        if "Assessment:" in window:
            score += 2
        if "NQF credits at NQF level" in window:
            score += 2
        if "Course outline:" in window and "Lecture times:" in window:
            score += 2
        if score > best_score:
            best_score = score
            best_pos = pos
    return best_pos


def build_blocks(text: str, target_codes: set[str]) -> Dict[str, str]:
    code_positions = find_header_positions(text, target_codes)

    # Fallback: include plain occurrences for codes that did not match header pattern.
    fallback_positions = find_fallback_positions(text, target_codes)
    for code in target_codes:
        if code not in code_positions and code in fallback_positions:
            code_positions[code] = fallback_positions[code]

    all_headers = []
    for code, positions in code_positions.items():
        chosen = choose_best_position(text, code, positions)
        if chosen is not None:
            all_headers.append((chosen, code))

    all_headers.sort(key=lambda x: x[0])
    blocks: Dict[str, str] = {}

    for idx, (start, code) in enumerate(all_headers):
        end = all_headers[idx + 1][0] if idx + 1 < len(all_headers) else min(len(text), start + 8000)
        block = text[start:end]
        blocks[code] = block

    return blocks


def enrich_course_file(course_path: Path, block: Optional[str]) -> bool:
    with course_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    if not block:
        return False

    updated = False

    convener = extract_field(
        block,
        ["Convener:"],
        [
            "Course entry requirements:",
            "Pre-requisites:",
            "Prerequisites:",
            "Co-requisites:",
            "Corequisites:",
            "Course outline:",
            "Objective:",
            "Lecture times:",
            "DP requirements:",
            "Assessment:",
        ],
    )

    prereq_text = extract_field(
        block,
        ["Course entry requirements:", "Pre-requisites:", "Prerequisites:"],
        [
            "Co-requisites:",
            "Corequisites:",
            "Objective:",
            "Course outline:",
            "Lecture times:",
            "DP requirements:",
            "Assessment:",
        ],
    )

    coreq_text = extract_field(
        block,
        ["Co-requisites:", "Corequisites:"],
        ["Objective:", "Course outline:", "Lecture times:", "DP requirements:", "Assessment:"],
    )

    objective = extract_field(
        block,
        ["Objective:"],
        ["Course outline:", "Lecture times:", "DP requirements:", "Assessment:"],
    )

    outline = extract_field(
        block,
        ["Course outline:"],
        ["Lecture times:", "DP requirements:", "Assessment:"],
    )

    lecture_times = extract_field(
        block,
        ["Lecture times:"],
        ["DP requirements:", "Assessment:"],
    )

    dp_requirements = extract_field(
        block,
        ["DP requirements:"],
        ["Assessment:"],
    )

    assessment = extract_field(block, ["Assessment:"], [])

    if convener and data.get("convener", "").startswith("See 2026"):
        data["convener"] = convener
        updated = True

    if prereq_text:
        current_prereq = data.get("prerequisites", {})
        if current_prereq.get("text", "").startswith("Refer to"):
            data["prerequisites"] = {
                "text": prereq_text,
                "parsed": {"type": "text_only", "codes": re.findall(r"\b[A-Z]{2,4}\d{4}[A-Z]\b", prereq_text)},
            }
            updated = True

    if coreq_text:
        coreq_codes = split_corequisites(coreq_text)
        if coreq_codes and data.get("corequisites", []) == []:
            data["corequisites"] = coreq_codes
            updated = True

    combined_outline = None
    if objective and outline:
        combined_outline = f"Objective: {objective} Course outline: {outline}"
    elif outline:
        combined_outline = outline
    elif objective:
        combined_outline = objective

    if combined_outline and data.get("outline", "").startswith("Course title and credit value verified"):
        data["outline"] = combined_outline
        updated = True

    if lecture_times and data.get("lecture_times", "").startswith("See departmental timetable"):
        data["lecture_times"] = lecture_times
        updated = True

    if dp_requirements and data.get("dp_requirements", "").startswith("See 2026"):
        data["dp_requirements"] = dp_requirements
        updated = True

    if assessment and data.get("assessment", "").startswith("See departmental"):
        data["assessment"] = assessment
        updated = True

    if updated:
        with course_path.open("w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")

    return updated


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--faculty", required=True, choices=["engineering", "health-sciences", "humanities"])
    parser.add_argument("--pdf", required=True)
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    faculty_courses_dir = repo_root / "data" / "handbook" / "faculties" / args.faculty / "courses"
    pdf_path = repo_root.parent / args.pdf

    index_path = faculty_courses_dir / "_index.json"
    with index_path.open("r", encoding="utf-8") as f:
        index_data = json.load(f)

    target_codes = {entry["code"] for entry in index_data.get("courses", [])}

    text = read_pdf_text(pdf_path)
    blocks = build_blocks(text, target_codes)

    updated_count = 0
    missing_block = 0

    for code in sorted(target_codes):
        course_path = faculty_courses_dir / f"{code}.json"
        if not course_path.exists():
            continue
        block = blocks.get(code)
        if not block:
            missing_block += 1
            continue
        if enrich_course_file(course_path, block):
            updated_count += 1

    print(
        f"faculty={args.faculty} total={len(target_codes)} blocks_found={len(blocks)} updated={updated_count} missing_blocks={missing_block}"
    )


if __name__ == "__main__":
    main()
