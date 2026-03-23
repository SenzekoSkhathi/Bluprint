from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.handbook_course_parser import (
    COURSE_CODE_RE,
    HandbookCourse,
    extract_department_context,
    normalize_compare_text,
    normalize_text,
    parse_handbook_courses,
)
def normalize_whitespace(value: str) -> str:
    return " ".join(value.split())


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "department"


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def read_chunks(path: Path, handbook_title: str) -> str:
    parts: list[str] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            if handbook_title.lower() not in str(record.get("title", "")).lower():
                continue
            parts.append(str(record.get("text", "")))
    return "\n".join(parts)


def compare_text(actual: str, expected: str, threshold: float = 0.92) -> dict[str, Any]:
    actual_norm = normalize_compare_text(actual)
    expected_norm = normalize_compare_text(expected)

    if not actual_norm and not expected_norm:
        status = "missing_both"
        similarity = 1.0
    elif actual_norm == expected_norm:
        status = "match"
        similarity = 1.0
    elif actual_norm and expected_norm and (actual_norm in expected_norm or expected_norm in actual_norm):
        status = "partial"
        similarity = min(len(actual_norm), len(expected_norm)) / max(len(actual_norm), len(expected_norm))
    else:
        similarity = SequenceMatcher(None, actual_norm, expected_norm).ratio()
        status = "close" if similarity >= threshold else "mismatch"

    return {
        "status": status,
        "similarity": round(similarity, 4),
        "actual": actual,
        "expected": expected,
    }


def compare_number(actual: Any, expected: int) -> dict[str, Any]:
    try:
        actual_int = int(actual)
    except (TypeError, ValueError):
        return {"status": "mismatch", "actual": actual, "expected": expected}

    return {
        "status": "match" if actual_int == expected else "mismatch",
        "actual": actual_int,
        "expected": expected,
    }


def compare_course(output_course: dict[str, Any], handbook_course: HandbookCourse | None) -> dict[str, Any]:
    if handbook_course is None:
        return {
            "code": output_course.get("code", ""),
            "handbook_found": False,
            "fields": {
                "code": {"status": "missing_in_handbook", "actual": output_course.get("code", ""), "expected": None},
                "title": {"status": "missing_in_handbook", "actual": output_course.get("title", ""), "expected": None},
                "credits": {"status": "missing_in_handbook", "actual": output_course.get("credits"), "expected": None},
                "nqf_level": {"status": "missing_in_handbook", "actual": output_course.get("nqf_level"), "expected": None},
                "prerequisites": {"status": "missing_in_handbook", "actual": output_course.get("prerequisites", ""), "expected": None},
                "outline": {"status": "missing_in_handbook", "actual": output_course.get("outline_details") or output_course.get("description", ""), "expected": None},
            },
        }

    return {
        "code": output_course.get("code", ""),
        "handbook_found": True,
        "fields": {
            "code": {
                "status": "match" if str(output_course.get("code", "")).upper() == handbook_course.code else "mismatch",
                "actual": output_course.get("code", ""),
                "expected": handbook_course.code,
            },
            "title": compare_text(str(output_course.get("title", "")), handbook_course.title, threshold=0.96),
            "credits": compare_number(output_course.get("credits"), handbook_course.credits),
            "nqf_level": compare_number(output_course.get("nqf_level"), handbook_course.nqf_level),
            "prerequisites": compare_text(str(output_course.get("prerequisites", "")), handbook_course.prerequisites, threshold=0.9),
            "outline": compare_text(
                str(output_course.get("outline_details") or output_course.get("description", "")),
                handbook_course.outline,
                threshold=0.82,
            ),
        },
        "handbook_excerpt": handbook_course.raw_block[:800],
    }


def summarize_field_counts(course_reports: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    field_counts: dict[str, dict[str, int]] = {
        "code": {},
        "title": {},
        "credits": {},
        "nqf_level": {},
        "prerequisites": {},
        "outline": {},
    }
    for report in course_reports:
        for field_name, field_report in report["fields"].items():
            status = field_report["status"]
            field_counts[field_name][status] = field_counts[field_name].get(status, 0) + 1
    return field_counts


def audit_department(handbook_text: str, department: str, courses: list[dict[str, Any]]) -> dict[str, Any]:
    context = extract_department_context(handbook_text, department)
    handbook_courses = parse_handbook_courses(context)
    output_by_code = {
        str(course.get("code", "")).upper(): course
        for course in courses
        if COURSE_CODE_RE.match(str(course.get("code", "")).upper())
    }

    course_reports = [
        compare_course(output_course, handbook_courses.get(code))
        for code, output_course in sorted(output_by_code.items())
    ]
    handbook_only_codes = sorted(code for code in handbook_courses if code not in output_by_code)
    output_only_codes = sorted(code for code in output_by_code if code not in handbook_courses)

    return {
        "department": department,
        "output_course_count": len(output_by_code),
        "handbook_course_count": len(handbook_courses),
        "handbook_context_length": len(context),
        "output_only_codes": output_only_codes,
        "handbook_only_codes": handbook_only_codes,
        "field_counts": summarize_field_counts(course_reports),
        "courses": course_reports,
    }


def discover_latest_run_id(data_dir: Path) -> str:
    manifests = sorted((data_dir / "chunks").glob("*.manifest.json"), key=lambda path: path.stat().st_mtime, reverse=True)
    if not manifests:
        raise FileNotFoundError(f"No chunk manifests found under {data_dir / 'chunks'}")
    manifest = read_json(manifests[0])
    run_id = manifest.get("run_id")
    if not run_id:
        raise ValueError(f"Manifest {manifests[0]} does not contain run_id")
    return str(run_id)


def load_department_courses(data_dir: Path, run_id: str, department: str | None) -> list[tuple[str, Path, list[dict[str, Any]]]]:
    courses_dir = data_dir / "courses"
    results: list[tuple[str, Path, list[dict[str, Any]]]] = []

    if department:
        path = courses_dir / f"{run_id}.dept-{slugify(department)}.verified.json"
        if not path.exists():
            raise FileNotFoundError(f"No verified course file found for {department}: {path}")
        courses = read_json(path)
        actual_department = department
        if courses:
            actual_department = str(courses[0].get("department", department))
        results.append((actual_department, path, courses))
        return results

    for path in sorted(courses_dir.glob(f"{run_id}.dept-*.verified.json")):
        courses = read_json(path)
        if courses:
            actual_department = str(courses[0].get("department", path.stem))
        else:
            actual_department = path.stem.split(".dept-", 1)[-1].replace("-", " ").title()
        results.append((actual_department, path, courses))

    if not results:
        raise FileNotFoundError(f"No verified department files found for run_id={run_id} under {courses_dir}")
    return results


def print_summary(report: dict[str, Any]) -> None:
    print(f"Run ID: {report['run_id']}")
    print(f"Handbook title: {report['handbook_title']}")
    print(f"Report path: {report['report_path']}")
    print()

    for department_report in report["departments"]:
        print(f"[{department_report['department']}]")
        print(
            f"  output={department_report['output_course_count']} | "
            f"handbook={department_report['handbook_course_count']} | "
            f"output_only={len(department_report['output_only_codes'])} | "
            f"handbook_only={len(department_report['handbook_only_codes'])}"
        )
        for field_name in ("title", "credits", "nqf_level", "prerequisites", "outline"):
            counts = department_report["field_counts"][field_name]
            compact = ", ".join(f"{status}={count}" for status, count in sorted(counts.items())) or "no-data"
            print(f"  {field_name}: {compact}")
        if department_report["output_only_codes"]:
            print(f"  output_only_codes: {', '.join(department_report['output_only_codes'][:12])}")
        if department_report["handbook_only_codes"]:
            print(f"  handbook_only_codes: {', '.join(department_report['handbook_only_codes'][:12])}")
        print()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Deterministically audit verified department course output against raw handbook text.",
    )
    parser.add_argument("--backend-dir", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--run-id", help="Pipeline run id. Defaults to the latest chunk manifest.")
    parser.add_argument("--handbook-title", default="2026 Science-Handbook-UCT")
    parser.add_argument("--department", help="Audit only one department instead of all cached departments for the run.")
    parser.add_argument("--output", type=Path, help="Optional JSON report path. Defaults to data/audits/<run_id>.handbook-audit.json")
    parser.add_argument("--fail-on-mismatch", action="store_true", help="Exit non-zero when any mismatch/output-only/handbook-only item is found.")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    backend_dir = args.backend_dir.resolve()
    data_dir = backend_dir / "data"
    run_id = args.run_id or discover_latest_run_id(data_dir)
    handbook_text = read_chunks(data_dir / "chunks" / f"{run_id}.jsonl", args.handbook_title)
    if not handbook_text:
        raise FileNotFoundError(
            f"No handbook chunks found in {data_dir / 'chunks' / f'{run_id}.jsonl'} for title={args.handbook_title!r}"
        )

    output_path = args.output or (data_dir / "audits" / f"{run_id}.handbook-audit.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    departments: list[dict[str, Any]] = []
    for department, path, courses in load_department_courses(data_dir, run_id, args.department):
        department_report = audit_department(handbook_text, department, courses)
        department_report["verified_path"] = str(path)
        departments.append(department_report)

    report = {
        "run_id": run_id,
        "handbook_title": args.handbook_title,
        "report_path": str(output_path),
        "departments": departments,
    }

    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)

    print_summary(report)

    if args.fail_on_mismatch:
        has_issues = any(
            department_report["output_only_codes"]
            or department_report["handbook_only_codes"]
            or any(
                field_report["status"] not in {"match", "close", "partial", "missing_both"}
                for course_report in department_report["courses"]
                for field_report in course_report["fields"].values()
            )
            for department_report in departments
        )
        return 1 if has_issues else 0

    return 0


if __name__ == "__main__":
    raise SystemExit(main())