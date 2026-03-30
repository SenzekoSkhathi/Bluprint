from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


def _normalize_slug(value: Any) -> str:
    return str(value or "").strip().lower()


def _normalize_code(value: Any) -> str:
    return str(value or "").strip().upper()


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


def _course_code_variants(code: str) -> set[str]:
    normalized = _normalize_code(code)
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


@dataclass(frozen=True)
class FacultySummary:
    slug: str
    name: str
    courses_count: int
    majors_count: int


class HandbookStore:
    """Deterministic read-only view over structured handbook JSON artifacts."""

    def __init__(self, base_data_dir: Path):
        self.base_data_dir = Path(base_data_dir)
        self.faculties_dir = self.base_data_dir / "handbook" / "faculties"

        self._faculty_meta_cache: dict[str, dict[str, Any]] = {}
        self._course_by_code_cache: dict[str, dict[str, Any]] | None = None
        self._major_index_cache: dict[str, list[dict[str, Any]]] | None = None
        self._equivalence_map_cache: dict[str, set[str]] | None = None

    def faculty_slugs(self) -> list[str]:
        if not self.faculties_dir.exists():
            return []
        slugs: list[str] = []
        for row in self.faculties_dir.iterdir():
            if row.is_dir():
                slugs.append(row.name)
        return sorted(slugs)

    def load_faculty_meta(self, faculty_slug: str) -> dict[str, Any]:
        normalized = _normalize_slug(faculty_slug)
        if normalized in self._faculty_meta_cache:
            return dict(self._faculty_meta_cache[normalized])

        meta_path = self.faculties_dir / normalized / "meta.json"
        if not meta_path.exists():
            raise FileNotFoundError(f"Faculty meta file not found: {meta_path}")

        payload = json.loads(meta_path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            payload = {}
        self._faculty_meta_cache[normalized] = payload
        return dict(payload)

    def list_courses(self, faculty_slug: str) -> list[dict[str, Any]]:
        slug = _normalize_slug(faculty_slug)
        root = self.faculties_dir / slug / "courses"
        if not root.exists():
            return []

        index_file = root / "_index.json"
        if index_file.exists():
            payload = json.loads(index_file.read_text(encoding="utf-8"))
            if isinstance(payload, dict) and isinstance(payload.get("courses"), list):
                return [row for row in payload["courses"] if isinstance(row, dict)]

        rows: list[dict[str, Any]] = []
        for course_file in sorted(root.glob("*.json")):
            if course_file.name.startswith("_"):
                continue
            try:
                payload = json.loads(course_file.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                continue
            if not isinstance(payload, dict):
                continue
            rows.append(payload)
        return rows

    def course_by_code(self, code: str) -> dict[str, Any] | None:
        normalized = _normalize_code(code)
        if not normalized:
            return None

        if self._course_by_code_cache is None:
            self._course_by_code_cache = {}
            for slug in self.faculty_slugs():
                for payload in self.list_courses(slug):
                    if not isinstance(payload, dict):
                        continue
                    course_code = _normalize_code(payload.get("code"))
                    if not course_code:
                        continue
                    record = dict(payload)
                    record.setdefault("faculty_slug", slug)
                    self._course_by_code_cache[course_code] = record

        hit = self._course_by_code_cache.get(normalized)
        return dict(hit) if isinstance(hit, dict) else None

    def load_major_index(self) -> dict[str, list[dict[str, Any]]]:
        if self._major_index_cache is not None:
            return {
                key: [dict(item) for item in value]
                for key, value in self._major_index_cache.items()
            }

        indexed: dict[str, list[dict[str, Any]]] = {}
        for slug in self.faculty_slugs():
            majors_dir = self.faculties_dir / slug / "majors"
            if not majors_dir.exists():
                continue

            for major_file in sorted(majors_dir.glob("*.json")):
                if major_file.name.startswith("_"):
                    continue
                try:
                    payload = json.loads(major_file.read_text(encoding="utf-8"))
                except (json.JSONDecodeError, OSError):
                    continue
                if not isinstance(payload, dict):
                    continue

                title = (
                    str(payload.get("major_name") or payload.get("specialisation") or payload.get("programme_name") or "")
                    .strip()
                )
                if not title:
                    continue
                key = _normalize_slug(re.sub(r"\bmajor\b", "", title))
                row = {
                    "faculty_slug": slug,
                    "key": key,
                    "title": title,
                    "file": major_file.name,
                    "payload": payload,
                }
                indexed.setdefault(key, []).append(row)

        self._major_index_cache = indexed
        return {
            key: [dict(item) for item in value]
            for key, value in indexed.items()
        }

    def load_equivalence_map(self) -> dict[str, set[str]]:
        if self._equivalence_map_cache is not None:
            return {key: set(values) for key, values in self._equivalence_map_cache.items()}

        mapping: dict[str, set[str]] = {}
        for slug in self.faculty_slugs():
            path = self.faculties_dir / slug / "equivalences.json"
            if not path.exists():
                continue
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
                    for completed in completed_codes:
                        expanded_completed.update(_course_code_variants(completed))

                    for required in required_codes:
                        key = _normalize_code(required)
                        if not key:
                            continue
                        accepted = mapping.setdefault(key, set())
                        accepted.update(_course_code_variants(key))
                        accepted.update(expanded_completed)

        self._equivalence_map_cache = mapping
        return {key: set(values) for key, values in mapping.items()}

    def summarize_faculties(self) -> list[FacultySummary]:
        summaries: list[FacultySummary] = []
        for slug in self.faculty_slugs():
            name = slug.replace("-", " ").title()
            try:
                meta = self.load_faculty_meta(slug)
            except FileNotFoundError:
                meta = {}
            name = str(meta.get("faculty_name") or name)

            courses_count = len(self.list_courses(slug))
            majors_count = 0
            majors_dir = self.faculties_dir / slug / "majors"
            if majors_dir.exists():
                majors_count = len(
                    [
                        row
                        for row in majors_dir.glob("*.json")
                        if not row.name.startswith("_")
                    ]
                )
            summaries.append(
                FacultySummary(
                    slug=slug,
                    name=name,
                    courses_count=courses_count,
                    majors_count=majors_count,
                )
            )

        return summaries
