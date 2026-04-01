from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from io import BytesIO
import boto3
import botocore.exceptions
import hashlib
import hmac
import json
from pathlib import Path
import re
from pypdf import PdfReader
from typing import Any, Iterator, Literal

from src.advisor import ScienceAdvisor
from src.academic_rules import ScienceHandbookRulesService
from src.auth_storage import AuthSessionStore, StudentCredentialStore
from src.course_catalog import ScienceCourseCatalog
from src.advisor_catalog import ScienceAdvisorCatalog
from src.handbook_store import HandbookStore
from src.handbook_validator import HandbookValidator
from src.major_catalog import ScienceMajorCatalog
from src.config import get_settings
from src.models import (
    PlannedCourse,
    ScheduleSession,
    ScheduleTodo,
    StudentProfile,
    StudentSchedule,
    StudyPlan,
)
from src.orchestrator import HandbookPipelineOrchestrator
from src.retrieval import ScienceRetriever
from src.student_storage import StudentStore

settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0")
student_store = StudentStore(settings.resolved_data_dir)
auth_session_store = AuthSessionStore(settings.resolved_data_dir)
student_credential_store = StudentCredentialStore(settings.resolved_data_dir)
science_advisor = ScienceAdvisor(settings)

allow_all_origins = settings.frontend_allowed_origins == ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_allowed_origins,
    allow_credentials=not allow_all_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RetrievalRequest(BaseModel):
    query: str = Field(min_length=1)
    top_k: int = Field(default=5, ge=1, le=20)
    run_id: str | None = None


class HandbookRetrievalRequest(BaseModel):
    query: str = Field(min_length=1)
    top_k: int = Field(default=5, ge=1, le=20)
    run_id: str | None = None
    faculty_slug: str = Field(default="science", min_length=2)


class ConversationTurnInput(BaseModel):
    role: Literal["user", "assistant"]
    text: str


class AdvisorRequest(BaseModel):
    query: str = Field(min_length=1)
    top_k: int = Field(default=5, ge=1, le=20)
    run_id: str | None = None
    model_profile: Literal["fast", "thinking"] | None = None
    # Full academic profile of the asking student.
    # When present, BluBot cross-references their course history against
    # handbook prerequisites to give personalised, accurate guidance.
    student_context: dict | None = None
    # Recent conversation turns for multi-turn context.
    conversation_history: list[ConversationTurnInput] | None = None


class HandbookAdvisorRequest(BaseModel):
    query: str = Field(min_length=1)
    top_k: int = Field(default=5, ge=1, le=20)
    run_id: str | None = None
    model_profile: Literal["fast", "thinking"] | None = None
    student_context: dict | None = None
    faculty_slug: str = Field(default="science", min_length=2)
    # Recent conversation turns for multi-turn context.
    conversation_history: list[ConversationTurnInput] | None = None


class AdvisorChatListRequest(BaseModel):
    faculty_slug: str = Field(default="science", min_length=2)
    student_number: str | None = None


class AdvisorChatMessageInput(BaseModel):
    id: str = Field(min_length=1)
    text: str
    sender: Literal["user", "bot", "system"]
    timestamp_iso: str = Field(min_length=1)


class AdvisorChatThreadInput(BaseModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    custom_title: str | None = None
    preview: str = Field(default="")
    updated_at_iso: str = Field(min_length=1)
    messages: list[AdvisorChatMessageInput] = Field(default_factory=list)


class AdvisorChatSyncRequest(BaseModel):
    current_thread_id: str | None = None
    threads: list[AdvisorChatThreadInput] = Field(default_factory=list)
    faculty_slug: str = Field(default="science", min_length=2)
    student_number: str | None = None


class AdvisorChatRenameRequest(BaseModel):
    thread_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    faculty_slug: str = Field(default="science", min_length=2)
    student_number: str | None = None


class AdvisorChatDeleteRequest(BaseModel):
    thread_id: str = Field(min_length=1)
    faculty_slug: str = Field(default="science", min_length=2)
    student_number: str | None = None


class CourseCatalogRequest(BaseModel):
    run_id: str | None = None


class HandbookFacultyRequest(BaseModel):
    faculty_slug: str = Field(default="science", min_length=2)
    run_id: str | None = None


class DepartmentCollectionRequest(BaseModel):
    department: str = Field(min_length=2)
    handbook_title: str = Field(default="2026 Science-Handbook-UCT", min_length=3)
    run_id: str | None = None
    force_refresh: bool = False


class HandbookRulesRequest(BaseModel):
    run_id: str | None = None
    handbook_title: str = Field(default="2026 Science-Handbook-UCT", min_length=3)
    force_refresh: bool = False


class PlannedCourseInput(BaseModel):
    code: str = Field(min_length=3)
    year: str = Field(min_length=3)
    semester: str = Field(min_length=3)
    credits: int = Field(default=0, ge=0)


class PlanRulesValidationRequest(BaseModel):
    planned_courses: list[PlannedCourseInput] = Field(default_factory=list)
    selected_majors: list[str] = Field(default_factory=list)
    selected_major_pathways: dict[str, dict[str, str]] = Field(default_factory=dict)
    attempt_history: list[dict[str, Any]] = Field(default_factory=list)
    readmission_pathway: Literal["auto", "sb001", "sb016"] = "auto"
    plan_intent: Literal["snapshot", "graduation_candidate"] = "snapshot"
    validation_mode: Literal["advisory", "strict_graduation"] = "advisory"
    run_id: str | None = None
    handbook_title: str = Field(default="2026 Science-Handbook-UCT", min_length=3)


class HandbookPlanValidationRequest(BaseModel):
    planned_courses: list[PlannedCourseInput] = Field(default_factory=list)
    selected_majors: list[str] = Field(default_factory=list)
    target_faculty: str = Field(default="science", min_length=2)


def _resolve_advisor_faculty(requested: str | None) -> tuple[str, str, bool]:
    requested_slug = str(requested or "science").strip().lower() or "science"
    # Advisor runtime remains science-grounded for now; non-science requests
    # are allowed and transparently routed through science policy guidance.
    resolved_slug = "science"
    used_fallback = requested_slug != resolved_slug
    return requested_slug, resolved_slug, used_fallback


def _resolve_retrieval_faculty(requested: str | None) -> tuple[str, str, bool]:
    requested_slug = str(requested or "science").strip().lower() or "science"
    # Retrieval currently uses the science index while handbook-wide indexing
    # is expanded in later Phase 3 slices.
    resolved_slug = "science"
    used_fallback = requested_slug != resolved_slug
    return requested_slug, resolved_slug, used_fallback


def _resolve_chat_faculty(requested: str | None) -> str:
    normalized = _normalize_faculty_slug(requested or "science")
    allowed = {
        "science",
        "commerce",
        "engineering",
        "health-sciences",
        "humanities",
        "law",
    }
    return normalized if normalized in allowed else "science"


def _chat_history_path(faculty_slug: str, student_number: str | None = None) -> Path:
    chats_dir = settings.resolved_data_dir / "advisor-chats"
    if student_number:
        chats_dir = chats_dir / student_number.strip().upper()
    chats_dir.mkdir(parents=True, exist_ok=True)
    return chats_dir / f"{faculty_slug}.json"


def _default_chat_payload() -> dict[str, Any]:
    return {
        "current_thread_id": None,
        "threads": [],
    }


def _load_chat_payload(faculty_slug: str, student_number: str | None = None) -> dict[str, Any]:
    path = _chat_history_path(faculty_slug, student_number)
    if not path.exists():
        return _default_chat_payload()
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return _default_chat_payload()
    if not isinstance(payload, dict):
        return _default_chat_payload()

    current_thread_id = payload.get("current_thread_id")
    threads = payload.get("threads")
    if not isinstance(threads, list):
        threads = []
    return {
        "current_thread_id": current_thread_id if isinstance(current_thread_id, str) else None,
        "threads": [row for row in threads if isinstance(row, dict)],
    }


def _save_chat_payload(faculty_slug: str, payload: dict[str, Any], student_number: str | None = None) -> dict[str, Any]:
    safe_payload = {
        "current_thread_id": payload.get("current_thread_id")
        if isinstance(payload.get("current_thread_id"), str)
        else None,
        "threads": payload.get("threads") if isinstance(payload.get("threads"), list) else [],
    }
    path = _chat_history_path(faculty_slug, student_number)
    path.write_text(json.dumps(safe_payload, ensure_ascii=True, indent=2), encoding="utf-8")
    return safe_payload


def _answer_handbook_advisor(
    *,
    query: str,
    top_k: int,
    run_id: str | None,
    model_profile: Literal["fast", "thinking"] | None,
    student_context: dict | None,
    faculty_slug: str,
    conversation_history: list | None = None,
) -> dict:
    requested_slug, resolved_slug, used_fallback = _resolve_advisor_faculty(faculty_slug)
    response = science_advisor.answer(
        query=query,
        top_k=top_k,
        run_id=run_id,
        model_profile=model_profile,
        student_context=student_context,
        faculty_slug=resolved_slug,
        conversation_history=conversation_history,
    )

    if isinstance(response, dict):
        response["requested_faculty"] = requested_slug
        response["advisor_faculty"] = resolved_slug
        response["faculty_fallback"] = used_fallback

    return response


def _normalize_faculty_slug(value: str) -> str:
    return str(value or "").strip().lower()


def _normalize_course_group_from_year_level(year_level: Any) -> str:
    text = str(year_level or "").strip().lower()
    if isinstance(year_level, int):
        if year_level <= 1:
            return "Year 1"
        if year_level == 2:
            return "Year 2"
        if year_level == 3:
            return "Year 3"
        return "Postgrad"
    if "first" in text or text in {"1", "year 1"}:
        return "Year 1"
    if "second" in text or text in {"2", "year 2"}:
        return "Year 2"
    if "third" in text or text in {"3", "year 3"}:
        return "Year 3"
    if text.isdigit():
        level = int(text)
        if level <= 1:
            return "Year 1"
        if level == 2:
            return "Year 2"
        if level == 3:
            return "Year 3"
    return "Postgrad"


def _build_handbook_courses_response(store: HandbookStore, faculty_slug: str) -> dict[str, Any]:
    slug = _normalize_faculty_slug(faculty_slug)
    meta = store.load_faculty_meta(slug)
    raw_courses = store.list_courses(slug)

    courses: list[dict[str, Any]] = []
    for row in raw_courses:
        code = str(row.get("code") or "").strip().upper()
        if not code:
            continue
        title = str(row.get("title") or code).strip()
        department = str(row.get("department") or "not-specified").strip() or "not-specified"
        year_level = row.get("year_level")
        course_group = _normalize_course_group_from_year_level(year_level)
        prerequisites = row.get("prerequisites")
        if isinstance(prerequisites, dict):
            prerequisites_text = str(prerequisites.get("text") or "").strip()
        else:
            prerequisites_text = str(prerequisites or "").strip()

        courses.append(
            {
                "id": str(row.get("id") or code.lower()).strip(),
                "code": code,
                "title": title,
                "group": course_group,
                "credits": int(row.get("credits") or row.get("nqf_credits") or 0),
                "nqf_level": int(row.get("nqf_level", 0) or 0),
                "semester": str(row.get("semester") or "Not specified").strip() or "Not specified",
                "department": department,
                "delivery": str(row.get("delivery") or "Not specified").strip() or "Not specified",
                "prerequisites": prerequisites_text or "Not specified",
                "description": str(row.get("outline") or row.get("description") or "No course description available.").strip(),
                "outcomes": row.get("outcomes") if isinstance(row.get("outcomes"), list) else [],
                "source": str(row.get("source") or "structured_handbook_json").strip() or "structured_handbook_json",
                "convener_details": str(row.get("convener") or row.get("convener_details") or "").strip() or None,
                "entry_requirements": str(row.get("entry_requirements") or "").strip() or None,
                "outline_details": str(row.get("outline") or "").strip() or None,
                "lecture_times": str(row.get("lecture_times") or "").strip() or None,
                "dp_requirements": str(row.get("dp_requirements") or "").strip() or None,
                "assessment": str(row.get("assessment") or "").strip() or None,
            }
        )

    return {
        "run_id": "handbook-static",
        "section": str(meta.get("faculty_name") or slug.replace("-", " ").title()),
        "faculty": slug,
        "institution": str(meta.get("institution") or "University of Cape Town"),
        "degree": str(meta.get("degree") or "Various"),
        "notes": str(meta.get("notes") or ""),
        "count": len(courses),
        "courses": courses,
    }


def _build_handbook_majors_response(store: HandbookStore, faculty_slug: str) -> dict[str, Any]:
    slug = _normalize_faculty_slug(faculty_slug)
    meta = store.load_faculty_meta(slug)
    majors_dir = settings.resolved_data_dir / "handbook" / "faculties" / slug / "majors"
    if not majors_dir.exists():
        raise FileNotFoundError(f"Majors directory not found for faculty: {slug}")

    majors: list[dict[str, Any]] = []
    for major_file in sorted(majors_dir.glob("*.json")):
        if major_file.name.startswith("_"):
            continue
        try:
            payload = json.loads(major_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        if not isinstance(payload, dict):
            continue

        major_name = str(
            payload.get("major_name")
            or payload.get("specialisation")
            or payload.get("programme_name")
            or payload.get("name")
            or major_file.stem
        ).strip()
        major_code = str(
            payload.get("major_code")
            or payload.get("programme_code")
            or payload.get("id")
            or major_file.stem
        ).strip().upper()

        years = payload.get("years") if isinstance(payload.get("years"), list) else []
        curriculum = payload.get("curriculum")
        if not years and isinstance(curriculum, list):
            normalized_years: list[dict[str, Any]] = []
            for row in curriculum:
                if not isinstance(row, dict):
                    continue
                year = row.get("year")
                courses = row.get("courses") if isinstance(row.get("courses"), list) else []
                normalized_years.append(
                    {
                        "year": year if isinstance(year, int) else 1,
                        "label": str(row.get("label") or f"Year {year or 1}").strip(),
                        "combinations": [
                            {
                                "combination_id": f"{major_code}-Y{year or 1}-A",
                                "description": "Programme curriculum pathway",
                                "courses": courses,
                                "required_core": [],
                                "choose_one_of": [],
                                "choose_two_of": [],
                                "choose_three_of": [],
                            }
                        ],
                    }
                )
            years = normalized_years
        elif not years and isinstance(curriculum, dict):
            import re as _re
            normalized_years_dict: list[dict[str, Any]] = []
            for year_key in sorted(curriculum.keys()):
                m = _re.match(r"year[_\s]*(\d+)", year_key.lower())
                if not m:
                    continue
                year_num = int(m.group(1))
                year_data = curriculum[year_key]
                if not isinstance(year_data, dict):
                    continue
                core_codes = year_data.get("core") if isinstance(year_data.get("core"), list) else []
                courses_raw = [
                    {"code": c, "title": c, "credits": 0, "nqf_level": 0}
                    for c in core_codes
                    if isinstance(c, str)
                ]
                normalized_years_dict.append(
                    {
                        "year": year_num,
                        "label": str(year_data.get("label") or f"Year {year_num}").strip(),
                        "combinations": [
                            {
                                "combination_id": f"{major_code}-Y{year_num}-A",
                                "description": "Programme curriculum pathway",
                                "courses": courses_raw,
                                "required_core": [],
                                "choose_one_of": [],
                                "choose_two_of": [],
                                "choose_three_of": [],
                            }
                        ],
                    }
                )
            years = normalized_years_dict

        majors.append(
            {
                "major_name": major_name,
                "major_code": major_code,
                "department": str(payload.get("department") or "").strip() or None,
                "notes": str(payload.get("notes") or "").strip() or None,
                "years": years,
            }
        )

    return {
        "run_id": "handbook-static",
        "section": str(meta.get("faculty_name") or slug.replace("-", " ").title()),
        "faculty": slug,
        "institution": str(meta.get("institution") or "University of Cape Town"),
        "degree": str(meta.get("degree") or "Various"),
        "notes": str(meta.get("notes") or ""),
        "count": len(majors),
        "majors": majors,
    }


class StudentLoginRequest(BaseModel):
    student_number: str = Field(min_length=9, max_length=9)
    password: str = Field(min_length=1)


class SetPasswordRequest(BaseModel):
    student_number: str = Field(min_length=9, max_length=9)
    password: str = Field(min_length=6)
    admin_key: str = Field(min_length=1)


class StudentProfileRequest(BaseModel):
    student_number: str = Field(min_length=9, max_length=9)


class SessionRequest(BaseModel):
    access_token: str = Field(min_length=16)


class StudentProfileUpdateRequest(BaseModel):
    student_number: str = Field(min_length=9, max_length=9)
    name: str = Field(min_length=1)
    degree: str = Field(min_length=1)
    year: int = Field(default=1, ge=1, le=8)
    majors: list[str] = Field(default_factory=list)


class StudentPlanRequest(BaseModel):
    student_number: str = Field(min_length=9, max_length=9)


class StudentPlanUpdateRequest(BaseModel):
    student_number: str = Field(min_length=9, max_length=9)
    planned_courses: list[PlannedCourseInput] = Field(default_factory=list)
    selected_majors: list[str] = Field(default_factory=list)


class ScheduleSessionInput(BaseModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    day: str = Field(min_length=1)
    start_time: str = Field(min_length=1)
    end_time: str = Field(min_length=1)
    course_code: str | None = None
    location: str | None = None


class ScheduleTodoInput(BaseModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    due_iso: str | None = None
    done: bool = False
    course_code: str | None = None


class StudentScheduleRequest(BaseModel):
    student_number: str = Field(min_length=9, max_length=9)


class StudentScheduleUpdateRequest(BaseModel):
    student_number: str = Field(min_length=9, max_length=9)
    sessions: list[ScheduleSessionInput] = Field(default_factory=list)
    todos: list[ScheduleTodoInput] = Field(default_factory=list)


STUDENT_NUMBER_PATTERN = re.compile(r"^[A-Z]{6}\d{3}$")
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
TEXT_PREVIEW_LIMIT = 3000
PDF_PAGE_LIMIT = 10
TEXT_FILE_EXTENSIONS = {
    ".txt",
    ".md",
    ".csv",
    ".json",
    ".xml",
    ".yaml",
    ".yml",
    ".log",
    ".ini",
    ".toml",
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
}

TEST_STUDENT_PROFILES: dict[str, dict] = {
    "GMDBAN001": {
        "name": "Bandile Gumede",
        "student_number": "GMDBAN001",
        "degree": "BSc Computer Science",
        "year": 2,
        "majors": ["Computer Science"],
    },
    "SNGNIK002": {
        "name": "Nikhar Singh",
        "student_number": "SNGNIK002",
        "degree": "BSc Biology and Genetics",
        "year": 2,
        "majors": ["Biology", "Genetics"],
    },
    "MSNJOR003": {
        "name": "Jordan Masencamp",
        "student_number": "MSNJOR003",
        "degree": "BSc Computer Science, Artificial Intelligence (AI), and Mathematics",
        "year": 3,
        "majors": ["Computer Science", "Artificial Intelligence", "Mathematics"],
    },
    "KHZTHA004": {
        "name": "Thandolwenkosi Khoza",
        "student_number": "KHZTHA004",
        "degree": "BSc Physics and Astrophysics",
        "year": 3,
        "majors": ["Physics", "Astrophysics"],
    },
    "SSHNOS005": {
        "name": "Nosihle Sishi",
        "student_number": "SSHNOS005",
        "degree": "BSc Applied Statistics and Finance",
        "year": 1,
        "majors": ["Applied Statistics"],
    },
}


def _verify_password(password: str) -> bool:
    if settings.auth_password_hash_sha256:
        digest = hashlib.sha256(
            f"{settings.auth_password_salt}{password}".encode("utf-8")
        ).hexdigest()
        return hmac.compare_digest(digest, settings.auth_password_hash_sha256)

    if settings.auth_shared_password:
        return hmac.compare_digest(password, settings.auth_shared_password)

    return False


def _is_pdf_upload(filename: str, content_type: str | None) -> bool:
    extension = Path(filename).suffix.lower()
    if extension == ".pdf":
        return True
    return content_type == "application/pdf"


def _extract_pdf_preview(data: bytes) -> str:
    try:
        reader = PdfReader(BytesIO(data))
    except Exception:
        return ""

    text_segments: list[str] = []
    for index, page in enumerate(reader.pages):
        if index >= PDF_PAGE_LIMIT:
            break

        try:
            page_text = (page.extract_text() or "").strip()
        except Exception:
            continue

        if page_text:
            text_segments.append(page_text)

    if not text_segments:
        return ""

    merged = "\n\n".join(text_segments)
    preview = merged[:TEXT_PREVIEW_LIMIT]
    if len(merged) > TEXT_PREVIEW_LIMIT:
        preview += "\n[truncated]"
    return preview


def _is_text_upload(filename: str, content_type: str | None) -> bool:
    extension = Path(filename).suffix.lower()
    if extension in TEXT_FILE_EXTENSIONS:
        return True
    if not content_type:
        return False
    return content_type.startswith("text/") or content_type in {
        "application/json",
        "application/xml",
    }


def _build_upload_context(
    *,
    filename: str,
    content_type: str | None,
    size_bytes: int,
    data: bytes,
) -> str:
    summary = (
        f"Uploaded file: {filename}"
        f" | type: {content_type or 'unknown'}"
        f" | size: {size_bytes} bytes"
    )

    if not _is_text_upload(filename, content_type):
        if _is_pdf_upload(filename, content_type):
            pdf_preview = _extract_pdf_preview(data)
            if pdf_preview:
                return f"{summary}\n\nPDF text preview:\n{pdf_preview}"
        return summary

    decoded = data.decode("utf-8", errors="ignore").strip()
    if not decoded:
        return summary

    preview = decoded[:TEXT_PREVIEW_LIMIT]
    if len(decoded) > TEXT_PREVIEW_LIMIT:
        preview += "\n[truncated]"

    return f"{summary}\n\nText preview:\n{preview}"


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "app": settings.app_name,
        "env": settings.app_env,
        "target_domain": "science",
    }


@app.post("/auth/login")
def login_student(request: StudentLoginRequest) -> dict:
    normalized_student_number = request.student_number.strip().upper()

    if not STUDENT_NUMBER_PATTERN.fullmatch(normalized_student_number):
        raise HTTPException(
            status_code=400,
            detail="Student number must match format XYZABC123",
        )

    # Per-student credential check (takes priority over shared password)
    if student_credential_store.has_credential(normalized_student_number):
        if not student_credential_store.verify_password(normalized_student_number, request.password):
            raise HTTPException(status_code=401, detail="Invalid student number or password")
    else:
        # Fall back to global shared password
        if not settings.auth_shared_password and not settings.auth_password_hash_sha256:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Backend auth is not configured. "
                    "Set AUTH_PASSWORD_HASH_SHA256 or AUTH_SHARED_PASSWORD."
                ),
            )
        if not _verify_password(request.password):
            raise HTTPException(status_code=401, detail="Invalid student number or password")

    session_record = auth_session_store.create_session(
        student_number=normalized_student_number,
        ttl_minutes=settings.auth_session_ttl_minutes,
    )

    return {
        "authenticated": True,
        "student_number": normalized_student_number,
        "access_token": session_record.access_token,
        "token_type": "bearer",
        "expires_at_iso": session_record.expires_at_iso,
    }


@app.post("/auth/set-password")
def set_student_password(request: SetPasswordRequest) -> dict:
    """Set or update a per-student password. Requires the admin key (AUTH_SHARED_PASSWORD)."""
    if not hmac.compare_digest(request.admin_key, settings.auth_shared_password or ""):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    normalized = request.student_number.strip().upper()
    if not STUDENT_NUMBER_PATTERN.fullmatch(normalized):
        raise HTTPException(status_code=400, detail="Student number must match format XYZABC123")

    student_credential_store.set_password(normalized, request.password)
    return {"student_number": normalized, "password_set": True}


@app.post("/auth/session")
def validate_auth_session(request: SessionRequest) -> dict:
    session_record = auth_session_store.validate_session(request.access_token)
    if session_record is None:
        raise HTTPException(status_code=401, detail="Session is invalid or expired")

    return {
        "authenticated": True,
        "student_number": session_record.student_number,
        "access_token": session_record.access_token,
        "token_type": "bearer",
        "expires_at_iso": session_record.expires_at_iso,
    }


@app.post("/auth/logout")
def logout_auth_session(request: SessionRequest) -> dict:
    revoked = auth_session_store.revoke_session(request.access_token)
    return {"logged_out": revoked}


@app.post("/students/profile")
def get_student_profile(request: StudentProfileRequest) -> dict:
    normalized_student_number = request.student_number.strip().upper()

    if not STUDENT_NUMBER_PATTERN.fullmatch(normalized_student_number):
        raise HTTPException(
            status_code=400,
            detail="Student number must match format XYZABC123",
        )

    seeded_profile = TEST_STUDENT_PROFILES.get(normalized_student_number)
    if seeded_profile:
        profile = student_store.load_or_create_profile(
            StudentProfile(
                student_number=normalized_student_number,
                name=seeded_profile.get("name", "Bluprint Student"),
                degree=seeded_profile.get("degree", "BSc Programme"),
                year=int(seeded_profile.get("year", 1) or 1),
                majors=list(seeded_profile.get("majors", []) or []),
            )
        )
    else:
        profile = student_store.load_or_create_profile(
            StudentProfile(
                student_number=normalized_student_number,
                name="Bluprint Student",
                degree="BSc Programme",
                year=1,
                majors=[],
            )
        )

    return {
        "name": profile.name,
        "student_number": profile.student_number,
        "degree": profile.degree,
        "year": profile.year,
        "majors": profile.majors,
    }


@app.put("/students/profile")
def update_student_profile(request: StudentProfileUpdateRequest) -> dict:
    normalized_student_number = request.student_number.strip().upper()

    if not STUDENT_NUMBER_PATTERN.fullmatch(normalized_student_number):
        raise HTTPException(
            status_code=400,
            detail="Student number must match format XYZABC123",
        )

    try:
        updated = student_store.upsert_profile(
            StudentProfile(
                student_number=normalized_student_number,
                name=request.name.strip(),
                degree=request.degree.strip(),
                year=request.year,
                majors=[major.strip() for major in request.majors if major.strip()],
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "name": updated.name,
        "student_number": updated.student_number,
        "degree": updated.degree,
        "year": updated.year,
        "majors": updated.majors,
    }


@app.post("/students/plan")
def get_student_plan(request: StudentPlanRequest) -> dict:
    normalized_student_number = request.student_number.strip().upper()

    if not STUDENT_NUMBER_PATTERN.fullmatch(normalized_student_number):
        raise HTTPException(
            status_code=400,
            detail="Student number must match format XYZABC123",
        )

    try:
        plan = student_store.get_plan(normalized_student_number)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "student_number": normalized_student_number,
        "planned_courses": [course.__dict__ for course in plan.planned_courses],
        "selected_majors": plan.selected_majors,
        "updated_at_iso": plan.updated_at_iso,
    }


@app.put("/students/plan")
def update_student_plan(request: StudentPlanUpdateRequest) -> dict:
    normalized_student_number = request.student_number.strip().upper()

    if not STUDENT_NUMBER_PATTERN.fullmatch(normalized_student_number):
        raise HTTPException(
            status_code=400,
            detail="Student number must match format XYZABC123",
        )

    try:
        plan = student_store.upsert_plan(
            student_number=normalized_student_number,
            plan=StudyPlan(
                planned_courses=[
                    PlannedCourse(
                        code=course.code.strip().upper(),
                        year=course.year.strip(),
                        semester=course.semester.strip(),
                        credits=course.credits,
                    )
                    for course in request.planned_courses
                ],
                selected_majors=[major.strip() for major in request.selected_majors if major.strip()],
            ),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "student_number": normalized_student_number,
        "planned_courses": [course.__dict__ for course in plan.planned_courses],
        "selected_majors": plan.selected_majors,
        "updated_at_iso": plan.updated_at_iso,
    }


@app.post("/students/schedule")
def get_student_schedule(request: StudentScheduleRequest) -> dict:
    normalized_student_number = request.student_number.strip().upper()

    if not STUDENT_NUMBER_PATTERN.fullmatch(normalized_student_number):
        raise HTTPException(
            status_code=400,
            detail="Student number must match format XYZABC123",
        )

    try:
        schedule = student_store.get_schedule(normalized_student_number)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "student_number": normalized_student_number,
        "sessions": [session.__dict__ for session in schedule.sessions],
        "todos": [todo.__dict__ for todo in schedule.todos],
        "updated_at_iso": schedule.updated_at_iso,
    }


@app.put("/students/schedule")
def update_student_schedule(request: StudentScheduleUpdateRequest) -> dict:
    normalized_student_number = request.student_number.strip().upper()

    if not STUDENT_NUMBER_PATTERN.fullmatch(normalized_student_number):
        raise HTTPException(
            status_code=400,
            detail="Student number must match format XYZABC123",
        )

    try:
        schedule = student_store.upsert_schedule(
            student_number=normalized_student_number,
            schedule=StudentSchedule(
                sessions=[
                    ScheduleSession(
                        id=session.id,
                        title=session.title,
                        day=session.day,
                        start_time=session.start_time,
                        end_time=session.end_time,
                        course_code=session.course_code,
                        location=session.location,
                    )
                    for session in request.sessions
                ],
                todos=[
                    ScheduleTodo(
                        id=todo.id,
                        title=todo.title,
                        due_iso=todo.due_iso,
                        done=todo.done,
                        course_code=todo.course_code,
                    )
                    for todo in request.todos
                ],
            ),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "student_number": normalized_student_number,
        "sessions": [session.__dict__ for session in schedule.sessions],
        "todos": [todo.__dict__ for todo in schedule.todos],
        "updated_at_iso": schedule.updated_at_iso,
    }


@app.post("/pipelines/science/run")
def run_science_pipeline() -> dict:
    try:
        orchestrator = HandbookPipelineOrchestrator(settings)
        state = orchestrator.run_science_pipeline()
        return {
            "run_id": state.run_id,
            "target_domain": state.target_domain,
            "document_count": len(state.documents),
            "events": [event.__dict__ for event in state.events],
            "artifacts": {
                "s3_scan_count": state.artifacts.get("s3_scan_count", 0),
                "downloaded_document_count": state.artifacts.get("downloaded_document_count", 0),
                "parsed_document_count": state.artifacts.get("parsed_document_count", 0),
                "chunk_count": state.artifacts.get("chunk_count", 0),
                "chunks_jsonl": state.artifacts.get("chunks_jsonl", ""),
                "chunks_manifest": state.artifacts.get("chunks_manifest", ""),
                "index_count": state.artifacts.get("index_count", 0),
                "index_jsonl": state.artifacts.get("index_jsonl", ""),
                "index_manifest": state.artifacts.get("index_manifest", ""),
                "embedding_model": state.artifacts.get("embedding_model", ""),
                "gemini_retrieval_schema": state.artifacts.get("gemini_retrieval_schema", ""),
            },
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/retrieval/science/query")
def query_science_retrieval(request: RetrievalRequest) -> dict:
    try:
        retriever = ScienceRetriever(settings)
        response = retriever.search(
            query=request.query,
            top_k=request.top_k,
            run_id=request.run_id,
        )
        if isinstance(response, dict):
            response.setdefault("requested_faculty", "science")
            response.setdefault("retrieval_faculty", "science")
            response.setdefault("faculty_fallback", False)
        return response
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/retrieval/handbook/query")
def query_handbook_retrieval(request: HandbookRetrievalRequest) -> dict:
    try:
        requested_slug, resolved_slug, used_fallback = _resolve_retrieval_faculty(
            request.faculty_slug
        )
        retriever = ScienceRetriever(settings)
        response = retriever.search(
            query=request.query,
            top_k=request.top_k,
            run_id=request.run_id,
        )
        if isinstance(response, dict):
            response["requested_faculty"] = requested_slug
            response["retrieval_faculty"] = resolved_slug
            response["faculty_fallback"] = used_fallback
        return response
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/advisor/science/ask")
def ask_science_advisor(request: AdvisorRequest) -> dict:
    try:
        history = [t.model_dump() for t in request.conversation_history] if request.conversation_history else None
        return _answer_handbook_advisor(
            query=request.query,
            top_k=request.top_k,
            run_id=request.run_id,
            model_profile=request.model_profile,
            student_context=request.student_context,
            faculty_slug="science",
            conversation_history=history,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/advisor/handbook/ask")
def ask_handbook_advisor(request: HandbookAdvisorRequest) -> dict:
    try:
        history = [t.model_dump() for t in request.conversation_history] if request.conversation_history else None
        return _answer_handbook_advisor(
            query=request.query,
            top_k=request.top_k,
            run_id=request.run_id,
            model_profile=request.model_profile,
            student_context=request.student_context,
            faculty_slug=request.faculty_slug,
            conversation_history=history,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/advisor/handbook/ask-stream")
async def ask_handbook_advisor_stream(request: HandbookAdvisorRequest) -> StreamingResponse:
    history = [t.model_dump() for t in request.conversation_history] if request.conversation_history else None

    def _generate() -> Iterator[str]:
        try:
            yield from science_advisor.answer_stream(
                query=request.query,
                run_id=request.run_id,
                top_k=request.top_k,
                model_profile=request.model_profile,
                student_context=request.student_context,
                faculty_slug=request.faculty_slug or "science",
                conversation_history=history,
            )
        except FileNotFoundError as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/advisor/science/ask-upload")
async def ask_science_advisor_with_upload(
    query: str = Form(default=""),
    top_k: int = Form(default=5),
    run_id: str | None = Form(default=None),
    model_profile: Literal["fast", "thinking"] | None = Form(default=None),
    student_context_json: str | None = Form(default=None),
    faculty_slug: str = Form(default="science"),
    file: UploadFile = File(...),
) -> dict:
    import json as _json

    normalized_query = query.strip()
    if not normalized_query and not file.filename:
        raise HTTPException(status_code=400, detail="Query or file is required")

    if top_k < 1 or top_k > 20:
        raise HTTPException(status_code=422, detail="top_k must be between 1 and 20")

    # Parse student context if provided
    student_context: dict | None = None
    if student_context_json:
        try:
            parsed = _json.loads(student_context_json)
            student_context = parsed if isinstance(parsed, dict) else None
        except Exception:
            student_context = None

    upload_bytes = await file.read()
    if len(upload_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds {MAX_UPLOAD_BYTES // (1024 * 1024)}MB limit",
        )

    upload_context = _build_upload_context(
        filename=file.filename or "upload",
        content_type=file.content_type,
        size_bytes=len(upload_bytes),
        data=upload_bytes,
    )

    advisor_query_parts = [normalized_query, upload_context]
    advisor_query = "\n\n".join(
        part for part in advisor_query_parts if part and part.strip()
    )

    try:
        return _answer_handbook_advisor(
            query=advisor_query,
            top_k=top_k,
            run_id=run_id,
            model_profile=model_profile,
            student_context=student_context,
            faculty_slug=faculty_slug,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/advisor/handbook/ask-upload")
async def ask_handbook_advisor_with_upload(
    query: str = Form(default=""),
    top_k: int = Form(default=5),
    run_id: str | None = Form(default=None),
    model_profile: Literal["fast", "thinking"] | None = Form(default=None),
    student_context_json: str | None = Form(default=None),
    faculty_slug: str = Form(default="science"),
    file: UploadFile = File(...),
) -> dict:
    return await ask_science_advisor_with_upload(
        query=query,
        top_k=top_k,
        run_id=run_id,
        model_profile=model_profile,
        student_context_json=student_context_json,
        faculty_slug=faculty_slug,
        file=file,
    )


@app.post("/advisor/handbook/chats/list")
def list_handbook_advisor_chats(request: AdvisorChatListRequest) -> dict:
    faculty_slug = _resolve_chat_faculty(request.faculty_slug)
    return _load_chat_payload(faculty_slug, request.student_number)


@app.post("/advisor/handbook/chats/sync")
def sync_handbook_advisor_chats(request: AdvisorChatSyncRequest) -> dict:
    faculty_slug = _resolve_chat_faculty(request.faculty_slug)
    payload = {
        "current_thread_id": request.current_thread_id,
        "threads": [thread.model_dump() for thread in request.threads],
    }
    return _save_chat_payload(faculty_slug, payload, request.student_number)


@app.post("/advisor/handbook/chats/rename")
def rename_handbook_advisor_chat_thread(request: AdvisorChatRenameRequest) -> dict:
    faculty_slug = _resolve_chat_faculty(request.faculty_slug)
    payload = _load_chat_payload(faculty_slug, request.student_number)
    renamed = False
    for row in payload.get("threads", []):
        if not isinstance(row, dict):
            continue
        if str(row.get("id", "")) != request.thread_id:
            continue
        row["custom_title"] = request.title
        row["title"] = request.title
        renamed = True
        break

    _save_chat_payload(faculty_slug, payload, request.student_number)
    return {"ok": renamed}


@app.post("/advisor/handbook/chats/delete")
def delete_handbook_advisor_chat_thread(request: AdvisorChatDeleteRequest) -> dict:
    faculty_slug = _resolve_chat_faculty(request.faculty_slug)
    payload = _load_chat_payload(faculty_slug, request.student_number)

    original_threads = payload.get("threads", [])
    filtered_threads = [
        row
        for row in original_threads
        if isinstance(row, dict) and str(row.get("id", "")) != request.thread_id
    ]
    deleted = len(filtered_threads) != len(original_threads)
    payload["threads"] = filtered_threads
    if payload.get("current_thread_id") == request.thread_id:
        payload["current_thread_id"] = None

    _save_chat_payload(faculty_slug, payload, request.student_number)
    return {"ok": deleted}


@app.post("/advisor/science/chats/list")
def list_science_advisor_chats() -> dict:
    return list_handbook_advisor_chats(AdvisorChatListRequest(faculty_slug="science"))


@app.post("/advisor/science/chats/sync")
def sync_science_advisor_chats(request: AdvisorChatSyncRequest) -> dict:
    req = request.model_copy(update={"faculty_slug": "science"})
    return sync_handbook_advisor_chats(req)


@app.post("/advisor/science/chats/rename")
def rename_science_advisor_chat_thread(request: AdvisorChatRenameRequest) -> dict:
    req = request.model_copy(update={"faculty_slug": "science"})
    return rename_handbook_advisor_chat_thread(req)


@app.post("/advisor/science/chats/delete")
def delete_science_advisor_chat_thread(request: AdvisorChatDeleteRequest) -> dict:
    req = request.model_copy(update={"faculty_slug": "science"})
    return delete_handbook_advisor_chat_thread(req)


@app.post("/courses/science/list")
def list_science_courses(request: CourseCatalogRequest) -> dict:
    try:
        catalog = ScienceCourseCatalog(settings)
        return catalog.list_courses(run_id=request.run_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/courses/handbook/list")
def list_handbook_courses(request: HandbookFacultyRequest) -> dict:
    try:
        store = HandbookStore(settings.resolved_data_dir)
        return _build_handbook_courses_response(store, request.faculty_slug)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/majors/science/list")
def list_science_majors(request: CourseCatalogRequest) -> dict:
    try:
        catalog = ScienceMajorCatalog(settings)
        return catalog.list_majors(run_id=request.run_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/majors/handbook/list")
def list_handbook_majors(request: HandbookFacultyRequest) -> dict:
    try:
        store = HandbookStore(settings.resolved_data_dir)
        return _build_handbook_majors_response(store, request.faculty_slug)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/advisors/science/list")
def list_science_advisors() -> dict:
    try:
        catalog = ScienceAdvisorCatalog(settings)
        return catalog.list_advisors()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/courses/science/verify")
def verify_science_courses(request: CourseCatalogRequest) -> dict:
    """Run Gemini verification on the extracted catalog and persist the results.

    Subsequent calls to /courses/science/list will automatically serve the
    Gemini-verified data from the on-disk cache rather than redoing the AI pass.
    """
    try:
        catalog = ScienceCourseCatalog(settings)
        return catalog.verify_and_cache(run_id=request.run_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/courses/science/collect")
def collect_science_department_courses(request: DepartmentCollectionRequest) -> dict:
    """Collect and verify courses for a specific department section."""
    try:
        catalog = ScienceCourseCatalog(settings)
        return catalog.collect_department_courses(
            department=request.department,
            handbook_title=request.handbook_title,
            run_id=request.run_id,
            force_refresh=request.force_refresh,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/rules/science/extract")
def extract_science_handbook_rules(request: HandbookRulesRequest) -> dict:
    try:
        service = ScienceHandbookRulesService(settings)
        return service.extract_rules(
            run_id=request.run_id,
            handbook_title=request.handbook_title,
            force_refresh=request.force_refresh,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/rules/science/validate-plan")
def validate_plan_against_science_rules(request: PlanRulesValidationRequest) -> dict:
    """Validate planned courses against extracted handbook rules.

    Each blocker/warning issue includes handbook evidence metadata where available:
    - ruleReference: human-readable rule reference/title (for example, FB7.2)
    - ruleSourceText: source rule text/description used for the validation
    """
    try:
        service = ScienceHandbookRulesService(settings)
        return service.validate_plan(
            planned_courses=[course.model_dump() for course in request.planned_courses],
            selected_majors=request.selected_majors,
            selected_major_pathways=request.selected_major_pathways,
            attempt_history=request.attempt_history,
            readmission_pathway=request.readmission_pathway,
            plan_intent=request.plan_intent,
            validation_mode=request.validation_mode,
            run_id=request.run_id,
            handbook_title=request.handbook_title,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/rules/handbook/faculties")
def list_handbook_faculties() -> dict:
    try:
        store = HandbookStore(settings.resolved_data_dir)
        summaries = [row.__dict__ for row in store.summarize_faculties()]
        return {
            "faculties": summaries,
            "total": len(summaries),
            "data_source": "structured_handbook_json",
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/rules/handbook/validate-plan")
def validate_plan_against_handbook(request: HandbookPlanValidationRequest) -> dict:
    try:
        store = HandbookStore(settings.resolved_data_dir)
        validator = HandbookValidator(store)
        return validator.validate_plan(
            planned_courses=[course.model_dump() for course in request.planned_courses],
            selected_majors=request.selected_majors,
            target_faculty=request.target_faculty,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── Faculty Handbook Files ────────────────────────────────────────────────────

# Each entry is (s3_folder_prefix, filename_keyword_filter).
# folder_prefix: the S3 prefix to list under (exact match, including trailing slash).
# keyword: if non-empty, only include root-level files whose name contains this keyword
#          (used when the PDFs live at the bucket root instead of a dedicated folder).
_FACULTY_FOLDERS: dict[str, tuple[str, str]] = {
    "commerce":        ("Commerce/",                          ""),
    "science":         ("",                                   "science"),   # root-level file
    "humanities":      ("Humanities/",                        ""),
    "health-sciences": ("Health Sciences/",                   ""),
    "engineering":     ("Engineering and Built Enviroment/",  ""),          # S3 folder has typo
    "law":             ("",                                   "law"),       # root-level file
}

PRESIGNED_URL_EXPIRY = 3600  # 1 hour


@app.get("/handbooks/faculty/{faculty_slug}/files")
def list_faculty_handbook_files(faculty_slug: str) -> dict:
    """List PDF files in the S3 folder for a given faculty and return presigned
    view + download URLs (valid for 1 hour)."""
    entry = _FACULTY_FOLDERS.get(faculty_slug)
    if entry is None:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown faculty slug: {faculty_slug}. Valid slugs: {list(_FACULTY_FOLDERS)}",
        )
    folder_prefix, keyword = entry

    s3 = boto3.client(
        "s3",
        region_name=settings.aws_region,
        endpoint_url=f"https://s3.{settings.aws_region}.amazonaws.com",
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
    )

    base_prefix = settings.aws_s3_handbook_prefix.strip("/")
    if base_prefix and folder_prefix:
        prefix = f"{base_prefix}/{folder_prefix}"
    elif base_prefix:
        prefix = f"{base_prefix}/"
    else:
        prefix = folder_prefix  # may be "" (root) or "FolderName/"

    try:
        paginator = s3.get_paginator("list_objects_v2")
        files: list[dict] = []
        for page in paginator.paginate(Bucket=settings.aws_s3_handbook_bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                key: str = obj["Key"]
                filename = key.split("/")[-1]
                if not filename or not filename.lower().endswith(".pdf"):
                    continue
                # For root-level files (no dedicated folder), filter by keyword
                if keyword and keyword.lower() not in filename.lower():
                    continue
                view_url = s3.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": settings.aws_s3_handbook_bucket, "Key": key},
                    ExpiresIn=PRESIGNED_URL_EXPIRY,
                )
                download_url = s3.generate_presigned_url(
                    "get_object",
                    Params={
                        "Bucket": settings.aws_s3_handbook_bucket,
                        "Key": key,
                        "ResponseContentDisposition": f'attachment; filename="{filename}"',
                    },
                    ExpiresIn=PRESIGNED_URL_EXPIRY,
                )
                files.append({
                    "filename": filename,
                    "key": key,
                    "size_bytes": obj.get("Size", 0),
                    "last_modified": obj["LastModified"].isoformat(),
                    "view_url": view_url,
                    "download_url": download_url,
                })

        return {"faculty": folder_prefix, "slug": faculty_slug, "files": files}

    except botocore.exceptions.ClientError as exc:
        raise HTTPException(status_code=500, detail=f"S3 error: {exc}") from exc
