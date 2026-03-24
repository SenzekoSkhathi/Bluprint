from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from io import BytesIO
import hashlib
import hmac
from pathlib import Path
import re
from pypdf import PdfReader
from typing import Literal

from src.advisor import ScienceAdvisor
from src.academic_rules import ScienceHandbookRulesService
from src.auth_storage import AuthSessionStore, StudentCredentialStore
from src.course_catalog import ScienceCourseCatalog
from src.advisor_catalog import ScienceAdvisorCatalog
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


class AdvisorRequest(BaseModel):
    query: str = Field(min_length=1)
    top_k: int = Field(default=5, ge=1, le=20)
    run_id: str | None = None
    model_profile: Literal["fast", "thinking"] | None = None
    # Full academic profile of the asking student.
    # When present, BluBot cross-references their course history against
    # handbook prerequisites to give personalised, accurate guidance.
    student_context: dict | None = None


class CourseCatalogRequest(BaseModel):
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
    run_id: str | None = None
    handbook_title: str = Field(default="2026 Science-Handbook-UCT", min_length=3)


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
        return retriever.search(
            query=request.query,
            top_k=request.top_k,
            run_id=request.run_id,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/advisor/science/ask")
def ask_science_advisor(request: AdvisorRequest) -> dict:
    try:
        return science_advisor.answer(
            query=request.query,
            top_k=request.top_k,
            run_id=request.run_id,
            model_profile=request.model_profile,
            student_context=request.student_context,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/advisor/science/ask-upload")
async def ask_science_advisor_with_upload(
    query: str = Form(default=""),
    top_k: int = Form(default=5),
    run_id: str | None = Form(default=None),
    model_profile: Literal["fast", "thinking"] | None = Form(default=None),
    student_context_json: str | None = Form(default=None),
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
        return science_advisor.answer(
            query=advisor_query,
            top_k=top_k,
            run_id=run_id,
            model_profile=model_profile,
            student_context=student_context,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/courses/science/list")
def list_science_courses(request: CourseCatalogRequest) -> dict:
    try:
        catalog = ScienceCourseCatalog(settings)
        return catalog.list_courses(run_id=request.run_id)
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
            run_id=request.run_id,
            handbook_title=request.handbook_title,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
