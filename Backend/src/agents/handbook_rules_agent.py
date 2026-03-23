from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
_WHITESPACE_RE = re.compile(r"\s+")
_CODE_RE = re.compile(r"\b[A-Z]{3,4}\d{4}(?:[A-Z](?:/[A-Z]){0,3})?\b")
_RULE_CODE_RE = re.compile(r"\bFB\d(?:\.\d+)?\b", flags=re.IGNORECASE)

_RULE_KEYWORDS = {
    "prerequisite",
    "co-requisite",
    "corequisite",
    "minimum",
    "maximum",
    "credit",
    "semester",
    "term",
    "year",
    "required",
    "must",
    "not permitted",
    "cannot",
    "nqf",
    "progression",
}


def _normalize(text: str) -> str:
    return _WHITESPACE_RE.sub(" ", text).strip()


def _clean_sentence(sentence: str) -> str:
    cleaned = _normalize(sentence)
    return cleaned.strip(" -:;,.\t")


def _score_sentence(sentence: str) -> int:
    lowered = sentence.lower()
    score = 0
    for keyword in _RULE_KEYWORDS:
        if keyword in lowered:
            score += 2
    if len(sentence) < 30 or len(sentence) > 320:
        score -= 2
    if _CODE_RE.search(sentence):
        score += 1
    return score


def _categorize(sentence: str) -> str:
    lowered = sentence.lower()
    if "prerequisite" in lowered or "co-requisite" in lowered or "corequisite" in lowered:
        return "prerequisite"
    if "credit" in lowered and ("semester" in lowered or "term" in lowered or "year" in lowered):
        return "load"
    if "nqf" in lowered:
        return "sequencing"
    if "must" in lowered or "required" in lowered or "cannot" in lowered or "not permitted" in lowered:
        return "policy"
    return "advice"


def _severity(sentence: str) -> str:
    lowered = sentence.lower()
    if "cannot" in lowered or "not permitted" in lowered or "must" in lowered or "required" in lowered:
        return "blocker"
    if "should" in lowered or "recommended" in lowered or "advised" in lowered:
        return "warning"
    return "info"


def _extract_number(pattern: str, text: str) -> int | None:
    match = re.search(pattern, text, flags=re.IGNORECASE)
    if not match:
        return None
    try:
        return int(match.group(1))
    except (TypeError, ValueError):
        return None


def _derive_policy(excerpts: list[str]) -> dict[str, Any]:
    joined = "\n".join(excerpts)

    min_term_credits = _extract_number(
        r"(?:minimum|min)\s+(\d{1,3})\s+credits?(?:[^.\n]{0,60})(?:semester|term)",
        joined,
    )
    max_term_credits = _extract_number(
        r"(?:maximum|max)\s+(\d{1,3})\s+credits?(?:[^.\n]{0,60})(?:semester|term)",
        joined,
    )
    if max_term_credits is None:
        # Covers rules phrased as "shall not register for more than X credits in each semester".
        max_term_credits = _extract_number(
            r"not\s+register\s+for\s+more\s+than[^\d]{0,40}(\d{1,3})\s+nqf\s+credits?(?:[^.\n]{0,80})semester",
            joined,
        )
    min_year_credits = _extract_number(
        r"(?:minimum|min)\s+(\d{1,3})\s+credits?(?:[^.\n]{0,60})(?:year|annual)",
        joined,
    )
    postgrad_year_min = _extract_number(
        r"postgraduate(?:[^.\n]{0,80})(?:year\s*(\d)|level\s*(\d))",
        joined,
    )

    return {
        "min_term_credits": min_term_credits if min_term_credits is not None else 30,
        "max_term_credits": max_term_credits if max_term_credits is not None else 75,
        "min_year_credits": min_year_credits,
        "disallow_postgrad_before_year": postgrad_year_min if postgrad_year_min is not None else 4,
        "enforce_unique_courses": True,
        "enforce_prerequisite_sequence": True,
    }


def _extract_between(text: str, start_marker: str, end_markers: list[str]) -> str:
    lowered = text.lower()
    start_idx = lowered.find(start_marker.lower())
    if start_idx == -1:
        return ""

    end_idx = len(text)
    for marker in end_markers:
        marker_idx = lowered.find(marker.lower(), start_idx + len(start_marker))
        if marker_idx != -1 and marker_idx < end_idx:
            end_idx = marker_idx

    return _normalize(text[start_idx:end_idx])


def _extract_rule_block(text: str, rule_code: str) -> str:
    pattern = re.compile(rf"\b{re.escape(rule_code)}\b", flags=re.IGNORECASE)
    match = pattern.search(text)
    if not match:
        return ""

    following = text[match.end() :]
    next_match = _RULE_CODE_RE.search(following)
    end = match.end() + (next_match.start() if next_match else len(following))
    return _normalize(text[match.start() : end])


def _find_rule_start(text: str, rule_code: str, start_at: int = 0) -> int:
    preferred_patterns = [
        rf"\b{re.escape(rule_code)}\s+(?:The|Except|Any|A|In|Re-registration|Students|All|Total|Number|Mathematics|Elective|Major)\b",
        rf"\b{re.escape(rule_code)}\s+[A-Z]",
        rf"\b{re.escape(rule_code)}\b",
    ]

    for pattern in preferred_patterns:
        match = re.search(pattern, text[start_at:], flags=re.IGNORECASE)
        if match:
            return start_at + match.start()

    return -1


def _extract_ordered_rule_blocks(text: str, codes: list[str]) -> list[dict[str, str]]:
    starts: list[tuple[str, int]] = []
    search_from = 0

    for code in codes:
        idx = _find_rule_start(text, code, start_at=search_from)
        if idx == -1:
            continue
        starts.append((code, idx))
        search_from = idx + len(code)

    blocks: list[dict[str, str]] = []
    for i, (code, start_idx) in enumerate(starts):
        end_idx = starts[i + 1][1] if i + 1 < len(starts) else len(text)
        block = _normalize(text[start_idx:end_idx])
        if not block:
            continue
        blocks.append({"rule_code": code, "text": block})

    return blocks


def _merge_chunks_with_overlap(chunks: list[dict[str, Any]]) -> str:
    ordered = sorted(chunks, key=lambda chunk: int(chunk.get("chunk_index", 0)))
    merged = ""

    for chunk in ordered:
        current = _normalize(str(chunk.get("text", "")))
        if not current:
            continue
        if not merged:
            merged = current
            continue

        max_overlap = min(400, len(merged), len(current))
        overlap = 0
        for size in range(max_overlap, 39, -1):
            if merged.endswith(current[:size]):
                overlap = size
                break

        if overlap > 0:
            merged = f"{merged} {current[overlap:].lstrip()}".strip()
        else:
            merged = f"{merged} {current}".strip()

    return merged


def _extract_subsection(text: str, start_marker: str, end_markers: list[str]) -> str:
    lowered = text.lower()
    start_idx = lowered.find(start_marker.lower())
    if start_idx == -1:
        return ""

    end_idx = len(text)
    for marker in end_markers:
        marker_idx = lowered.find(marker.lower(), start_idx + len(start_marker))
        if marker_idx != -1 and marker_idx < end_idx:
            end_idx = marker_idx

    return _normalize(text[start_idx:end_idx])


def _extract_readmission_milestones(section_text: str) -> dict[str, Any]:
    preceding_year_min = _extract_number(
        r"completed\s+(?:at\s+least\s+)?(\d{1,3})\s+credits\s+in\s+the\s+preceding\s+year",
        section_text,
    )

    milestones: list[dict[str, Any]] = []
    milestone_pattern = re.compile(
        r"\([a-e]\)\s*by\s+the\s+end\s+of\s+the\s+"
        r"(first|second|third|fourth|fifth)\s+year\s+of\s+registration,\s*([^;.]*)",
        flags=re.IGNORECASE,
    )
    year_map = {
        "first": 1,
        "second": 2,
        "third": 3,
        "fourth": 4,
        "fifth": 5,
    }

    for match in milestone_pattern.finditer(section_text):
        year_label = match.group(1).lower()
        clause = _normalize(match.group(2))
        credits_match = re.search(r"\b(\d{1,3})\b", clause)
        milestones.append(
            {
                "year": year_map.get(year_label),
                "min_credits": int(credits_match.group(1)) if credits_match else None,
                "requirement": clause,
            }
        )

    return {
        "preceding_year_min_credits": preceding_year_min,
        "milestones": milestones,
    }


def _extract_transfer_requirements(section_text: str) -> list[str]:
    requirements: list[str] = []

    part_a = re.search(
        r"\(a\)\s*(.+?)(?:,\s*and\s*\(b\)|;\s*\(b\))",
        section_text,
        flags=re.IGNORECASE,
    )
    if part_a:
        requirements.append(_normalize(part_a.group(1)))

    part_b = re.search(
        r"\(b\)\s*(.+?)(?:\.\s*Refer\s+to|\s*Refer\s+to|$)",
        section_text,
        flags=re.IGNORECASE,
    )
    if part_b:
        requirements.append(_normalize(part_b.group(1)))

    if not requirements:
        for label in ("a", "b", "c", "d"):
            match = re.search(
                rf"\({label}\)\s*([^;.]{{20,400}})",
                section_text,
                flags=re.IGNORECASE,
            )
            if match:
                requirements.append(_normalize(match.group(1)))
    return requirements


def _extract_curricula_rule_blocks(section_text: str) -> list[dict[str, str]]:
    return _extract_ordered_rule_blocks(section_text, [f"FB7.{idx}" for idx in range(1, 10)])


def _extract_focused_policy_rules(text: str, handbook_title: str | None) -> dict[str, Any]:
    title_lower = (handbook_title or "").lower()
    handbook_name = handbook_title or ""

    from_2023_section = _extract_between(
        text,
        "Refusal of readmission to the Faculty and related matters (for students first registered from 2023)",
        [
            "Transfer from other faculties into the Faculty of Science",
            "Refusal of readmission to the Faculty and related matters (for students first registered before 2023)",
        ],
    )

    sb001_section = _extract_subsection(
        from_2023_section,
        "Bachelor of Science degree (SB001)",
        ["Extended Degree Programme (EDP) (SB016)", "Extended Degree Programme (EDP) FB5.2"],
    )
    if not sb001_section:
        sb001_section = _extract_rule_block(from_2023_section, "FB5.1")

    sb016_section = _extract_subsection(
        from_2023_section,
        "Extended Degree Programme (EDP) (SB016)",
        ["Refusal of readmission to the Faculty and related matters (for students first registered before 2023)"],
    )
    if not sb016_section:
        sb016_section = _extract_rule_block(from_2023_section, "FB5.2")

    related_section = _extract_subsection(
        text,
        "FB5.3",
        ["Transfer from other faculties into the Faculty of Science"],
    )
    related_rules = _extract_ordered_rule_blocks(related_section, [f"FB5.{idx}" for idx in range(3, 9)])

    transfer_section = _extract_between(
        text,
        "Transfer from other faculties into the Faculty of Science",
        ["Curricula rules for the Bachelor of Science (BSc) degree"],
    )
    transfer_rule = _normalize(transfer_section)
    transfer_rule = re.sub(
        r"^Transfer\s+from\s+other\s+faculties\s+into\s+the\s+Faculty\s+of\s+Science\s*",
        "",
        transfer_rule,
        flags=re.IGNORECASE,
    )

    curricula_section = _extract_between(
        text,
        "Curricula rules for the Bachelor of Science (BSc) degree",
        ["Distinction", "Rules for the degree of Bachelor of Science Honours (BSc Hons)"],
    )
    curricula_rules = _extract_curricula_rule_blocks(curricula_section)

    sb001_requirements = _extract_readmission_milestones(sb001_section)
    sb016_requirements = _extract_readmission_milestones(sb016_section)

    curriculum_min_total = _extract_number(r"at\s+least\s+(\d{1,3})\s+nqf\s+credits", curricula_section)
    curriculum_min_science = _extract_number(
        r"at\s+least\s+(\d{1,3})\s+must\s+be\s+science\s+credits",
        curricula_section,
    )
    curriculum_min_level7 = _extract_number(
        r"at\s+least\s+(\d{1,3})\s+credits\s+at\s+level\s+7",
        curricula_section,
    )

    return {
        "handbook_title": handbook_name if handbook_name else title_lower,
        "readmission_from_2023": {
            "sb001": {
                "rule_code": "FB5.1",
                "text": sb001_section,
                "requirements": sb001_requirements,
            },
            "sb016": {
                "rule_code": "FB5.2",
                "text": sb016_section,
                "requirements": sb016_requirements,
            },
            "related_matters": related_rules,
        },
        "transfer_into_science": {
            "rule_code": "FB6",
            "text": transfer_rule,
            "minimum_requirements": _extract_transfer_requirements(transfer_rule),
        },
        "bsc_curricula_rules": {
            "section_title": "Curricula rules for the Bachelor of Science (BSc) degree",
            "rules": curricula_rules,
            "minimum_requirements": {
                "min_total_nqf_credits": curriculum_min_total,
                "min_science_credits": curriculum_min_science,
                "min_level7_credits": curriculum_min_level7,
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
                "minimum_requirements": _extract_transfer_requirements(transfer_rule),
            },
            "bsc_curriculum": {
                "min_total_nqf_credits": curriculum_min_total,
                "min_science_credits": curriculum_min_science,
                "min_level7_credits": curriculum_min_level7,
            },
        },
    }


class HandbookRulesAgent:
    name = "handbook_rules"

    def _extract_rule_candidates(
        self,
        chunks: list[dict[str, Any]],
        handbook_title: str | None,
    ) -> list[str]:
        filtered = chunks
        if handbook_title:
            title_lower = handbook_title.lower()
            handbook_filtered = [
                chunk for chunk in chunks if title_lower in str(chunk.get("title", "")).lower()
            ]
            if handbook_filtered:
                filtered = handbook_filtered

        text = " ".join(_normalize(str(chunk.get("text", ""))) for chunk in filtered)
        if not text:
            return []

        text = text[:600_000]
        sentences = [_clean_sentence(s) for s in _SENTENCE_SPLIT_RE.split(text)]

        ranked: list[tuple[int, str]] = []
        seen: set[str] = set()

        for sentence in sentences:
            if not sentence:
                continue
            score = _score_sentence(sentence)
            if score < 4:
                continue
            lowered = sentence.lower()
            if lowered in seen:
                continue
            seen.add(lowered)
            ranked.append((score, sentence))

        ranked.sort(key=lambda item: item[0], reverse=True)
        return [sentence for _, sentence in ranked[:25]]

    def _build_filtered_text(
        self,
        chunks: list[dict[str, Any]],
        handbook_title: str | None,
    ) -> str:
        filtered = chunks
        if handbook_title:
            title_lower = handbook_title.lower()
            handbook_filtered = [
                chunk for chunk in chunks if title_lower in str(chunk.get("title", "")).lower()
            ]
            if handbook_filtered:
                filtered = handbook_filtered

        return _merge_chunks_with_overlap(filtered)

    def build_rules_payload(
        self,
        *,
        chunks: list[dict[str, Any]],
        run_id: str,
        handbook_title: str | None,
    ) -> dict[str, Any]:
        combined_text = self._build_filtered_text(chunks, handbook_title)
        excerpts = self._extract_rule_candidates(chunks, handbook_title)
        focused_policy_rules = _extract_focused_policy_rules(combined_text, handbook_title)

        rules: list[dict[str, Any]] = []
        for index, excerpt in enumerate(excerpts, start=1):
            rules.append(
                {
                    "id": f"rule-{index}",
                    "title": f"Handbook rule {index}",
                    "description": excerpt,
                    "category": _categorize(excerpt),
                    "severity": _severity(excerpt),
                }
            )

        planner_policy = _derive_policy(excerpts)
        if planner_policy.get("max_term_credits") == 75:
            explicit_cap = _extract_number(
                r"not\s+register\s+for\s+more\s+than[^\d]{0,40}(\d{1,3})\s+nqf\s+credits?(?:[^.\n]{0,80})semester",
                combined_text,
            )
            if explicit_cap is not None:
                planner_policy["max_term_credits"] = explicit_cap
        curricula_mins = focused_policy_rules.get("bsc_curricula_rules", {}).get(
            "minimum_requirements", {}
        )
        if curricula_mins:
            planner_policy["bsc_curriculum_min_total_credits"] = curricula_mins.get(
                "min_total_nqf_credits"
            )
            planner_policy["bsc_curriculum_min_science_credits"] = curricula_mins.get(
                "min_science_credits"
            )
            planner_policy["bsc_curriculum_min_level7_credits"] = curricula_mins.get(
                "min_level7_credits"
            )

        return {
            "run_id": run_id,
            "handbook_title": handbook_title,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "rule_count": len(rules),
            "rules": rules,
            "planner_policy": planner_policy,
            "focused_policy_rules": focused_policy_rules,
        }
