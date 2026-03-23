import json
import re
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

from src.models import (
    PlannedCourse,
    ScheduleSession,
    ScheduleTodo,
    StudentProfile,
    StudentRecord,
    StudentSchedule,
    StudyPlan,
)

STUDENT_NUMBER_PATTERN = re.compile(r"^[A-Z]{6}\d{3}$")


class StudentStore:
    def __init__(self, base_dir: Path):
        self.base_dir = base_dir
        self.students_dir = self.base_dir / "students"
        self.students_dir.mkdir(parents=True, exist_ok=True)

    def _normalize_student_number(self, student_number: str) -> str:
        normalized = student_number.strip().upper()
        if not STUDENT_NUMBER_PATTERN.fullmatch(normalized):
            raise ValueError("Student number must match format XYZABC123")
        return normalized

    def _record_path(self, student_number: str) -> Path:
        return self.students_dir / f"{student_number}.json"

    def _atomic_write_json(self, path: Path, payload: dict) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = path.with_suffix(path.suffix + ".tmp")
        with tmp_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=True, indent=2)
        tmp_path.replace(path)

    def _deserialize_record(self, payload: dict) -> StudentRecord:
        profile_payload = payload.get("profile", {})
        plan_payload = payload.get("plan", {})
        schedule_payload = payload.get("schedule", {})

        profile = StudentProfile(
            student_number=str(profile_payload.get("student_number", "")).strip().upper(),
            name=str(profile_payload.get("name", "Bluprint Student")),
            degree=str(profile_payload.get("degree", "BSc Programme")),
            year=int(profile_payload.get("year", 1) or 1),
            majors=list(profile_payload.get("majors", []) or []),
            updated_at_iso=str(
                profile_payload.get("updated_at_iso")
                or datetime.now(timezone.utc).isoformat()
            ),
        )

        planned_courses_payload = list(plan_payload.get("planned_courses", []) or [])
        planned_courses: list[PlannedCourse] = []
        for item in planned_courses_payload:
            planned_courses.append(
                PlannedCourse(
                    code=str(item.get("code", "")).strip().upper(),
                    year=str(item.get("year", "")).strip(),
                    semester=str(item.get("semester", "")).strip(),
                    credits=int(item.get("credits", 0) or 0),
                )
            )

        plan = StudyPlan(
            planned_courses=planned_courses,
            selected_majors=list(plan_payload.get("selected_majors", []) or []),
            updated_at_iso=str(
                plan_payload.get("updated_at_iso") or datetime.now(timezone.utc).isoformat()
            ),
        )

        sessions_payload = list(schedule_payload.get("sessions", []) or [])
        sessions: list[ScheduleSession] = []
        for item in sessions_payload:
            sessions.append(
                ScheduleSession(
                    id=str(item.get("id", "")),
                    title=str(item.get("title", "")),
                    day=str(item.get("day", "")),
                    start_time=str(item.get("start_time", "")),
                    end_time=str(item.get("end_time", "")),
                    course_code=(
                        str(item.get("course_code"))
                        if item.get("course_code") is not None
                        else None
                    ),
                    location=(
                        str(item.get("location"))
                        if item.get("location") is not None
                        else None
                    ),
                )
            )

        todos_payload = list(schedule_payload.get("todos", []) or [])
        todos: list[ScheduleTodo] = []
        for item in todos_payload:
            todos.append(
                ScheduleTodo(
                    id=str(item.get("id", "")),
                    title=str(item.get("title", "")),
                    due_iso=(str(item.get("due_iso")) if item.get("due_iso") is not None else None),
                    done=bool(item.get("done", False)),
                    course_code=(
                        str(item.get("course_code"))
                        if item.get("course_code") is not None
                        else None
                    ),
                )
            )

        schedule = StudentSchedule(
            sessions=sessions,
            todos=todos,
            updated_at_iso=str(
                schedule_payload.get("updated_at_iso")
                or datetime.now(timezone.utc).isoformat()
            ),
        )

        return StudentRecord(profile=profile, plan=plan, schedule=schedule)

    def load(self, student_number: str) -> StudentRecord | None:
        normalized = self._normalize_student_number(student_number)
        path = self._record_path(normalized)
        if not path.exists():
            return None

        payload = json.loads(path.read_text(encoding="utf-8"))
        return self._deserialize_record(payload)

    def save(self, record: StudentRecord) -> StudentRecord:
        record.profile.student_number = self._normalize_student_number(
            record.profile.student_number
        )
        path = self._record_path(record.profile.student_number)
        self._atomic_write_json(path, asdict(record))
        return record

    def load_or_create_profile(self, default_profile: StudentProfile) -> StudentProfile:
        existing = self.load(default_profile.student_number)
        if existing is not None:
            return existing.profile

        default_profile.student_number = self._normalize_student_number(
            default_profile.student_number
        )
        self.save(StudentRecord(profile=default_profile))
        return default_profile

    def upsert_profile(self, profile: StudentProfile) -> StudentProfile:
        profile.student_number = self._normalize_student_number(profile.student_number)
        profile.updated_at_iso = datetime.now(timezone.utc).isoformat()

        existing = self.load(profile.student_number)
        if existing is None:
            self.save(StudentRecord(profile=profile))
            return profile

        existing.profile = profile
        self.save(existing)
        return profile

    def get_plan(self, student_number: str) -> StudyPlan:
        existing = self.load(student_number)
        if existing is None:
            return StudyPlan()
        return existing.plan

    def upsert_plan(self, student_number: str, plan: StudyPlan) -> StudyPlan:
        normalized = self._normalize_student_number(student_number)
        plan.updated_at_iso = datetime.now(timezone.utc).isoformat()

        existing = self.load(normalized)
        if existing is None:
            default_profile = StudentProfile(
                student_number=normalized,
                name="Bluprint Student",
                degree="BSc Programme",
                year=1,
                majors=list(plan.selected_majors),
            )
            existing = StudentRecord(profile=default_profile)

        existing.plan = plan
        self.save(existing)
        return plan

    def get_schedule(self, student_number: str) -> StudentSchedule:
        existing = self.load(student_number)
        if existing is None:
            return StudentSchedule()
        return existing.schedule

    def upsert_schedule(self, student_number: str, schedule: StudentSchedule) -> StudentSchedule:
        normalized = self._normalize_student_number(student_number)
        schedule.updated_at_iso = datetime.now(timezone.utc).isoformat()

        existing = self.load(normalized)
        if existing is None:
            default_profile = StudentProfile(
                student_number=normalized,
                name="Bluprint Student",
                degree="BSc Programme",
                year=1,
                majors=[],
            )
            existing = StudentRecord(profile=default_profile)

        existing.schedule = schedule
        self.save(existing)
        return schedule
