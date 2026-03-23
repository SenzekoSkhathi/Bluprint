from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List


@dataclass
class HandbookDocument:
    s3_key: str
    title: str
    content_type: str
    bytes_size: int
    local_path: str | None = None
    tags: List[str] = field(default_factory=list)


@dataclass
class HandbookChunk:
    chunk_id: str
    s3_key: str
    title: str
    tags: List[str]
    chunk_index: int
    text: str
    char_count: int
    science_weight: float


@dataclass
class VectorIndexEntry:
    chunk_id: str
    s3_key: str
    title: str
    tags: List[str]
    text: str
    vector: List[float]
    vector_dimensions: int
    retrieval_weight: float


@dataclass
class AgentEvent:
    agent: str
    status: str
    detail: str
    timestamp_iso: str


@dataclass
class PipelineState:
    run_id: str
    target_domain: str = "science"
    documents: List[HandbookDocument] = field(default_factory=list)
    chunks: List[HandbookChunk] = field(default_factory=list)
    index_entries: List[VectorIndexEntry] = field(default_factory=list)
    events: List[AgentEvent] = field(default_factory=list)
    artifacts: Dict[str, Any] = field(default_factory=dict)

    def emit(self, agent: str, status: str, detail: str) -> None:
        self.events.append(
            AgentEvent(
                agent=agent,
                status=status,
                detail=detail,
                timestamp_iso=datetime.now(timezone.utc).isoformat(),
            )
        )


@dataclass
class StudentProfile:
    student_number: str
    name: str
    degree: str
    year: int
    majors: List[str] = field(default_factory=list)
    updated_at_iso: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


@dataclass
class PlannedCourse:
    code: str
    year: str
    semester: str
    credits: int = 0


@dataclass
class StudyPlan:
    planned_courses: List[PlannedCourse] = field(default_factory=list)
    selected_majors: List[str] = field(default_factory=list)
    updated_at_iso: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


@dataclass
class ScheduleSession:
    id: str
    title: str
    day: str
    start_time: str
    end_time: str
    course_code: str | None = None
    location: str | None = None


@dataclass
class ScheduleTodo:
    id: str
    title: str
    due_iso: str | None = None
    done: bool = False
    course_code: str | None = None


@dataclass
class StudentSchedule:
    sessions: List[ScheduleSession] = field(default_factory=list)
    todos: List[ScheduleTodo] = field(default_factory=list)
    updated_at_iso: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


@dataclass
class StudentRecord:
    profile: StudentProfile
    plan: StudyPlan = field(default_factory=StudyPlan)
    schedule: StudentSchedule = field(default_factory=StudentSchedule)
