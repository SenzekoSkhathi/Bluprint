import json
import secrets
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path


@dataclass
class AuthSessionRecord:
    access_token: str
    student_number: str
    created_at_iso: str
    expires_at_iso: str


class AuthSessionStore:
    def __init__(self, base_dir: Path):
        self.base_dir = base_dir
        self.auth_dir = self.base_dir / "auth"
        self.auth_dir.mkdir(parents=True, exist_ok=True)
        self.sessions_path = self.auth_dir / "sessions.json"

    def _load_sessions(self) -> dict[str, AuthSessionRecord]:
        if not self.sessions_path.exists():
            return {}

        payload = json.loads(self.sessions_path.read_text(encoding="utf-8"))
        sessions_payload = payload.get("sessions", {})
        sessions: dict[str, AuthSessionRecord] = {}
        for token, value in sessions_payload.items():
            sessions[token] = AuthSessionRecord(
                access_token=token,
                student_number=str(value.get("student_number", "")).strip().upper(),
                created_at_iso=str(value.get("created_at_iso", "")),
                expires_at_iso=str(value.get("expires_at_iso", "")),
            )
        return sessions

    def _atomic_write_sessions(self, sessions: dict[str, AuthSessionRecord]) -> None:
        payload = {
            "sessions": {token: asdict(record) for token, record in sessions.items()}
        }
        tmp_path = self.sessions_path.with_suffix(self.sessions_path.suffix + ".tmp")
        with tmp_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=True, indent=2)
        tmp_path.replace(self.sessions_path)

    def _is_expired(self, record: AuthSessionRecord) -> bool:
        try:
            expires_at = datetime.fromisoformat(record.expires_at_iso)
        except ValueError:
            return True

        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        return expires_at <= datetime.now(timezone.utc)

    def _prune_expired(self, sessions: dict[str, AuthSessionRecord]) -> dict[str, AuthSessionRecord]:
        return {
            token: record
            for token, record in sessions.items()
            if not self._is_expired(record)
        }

    def create_session(self, student_number: str, ttl_minutes: int) -> AuthSessionRecord:
        sessions = self._load_sessions()
        sessions = self._prune_expired(sessions)

        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(minutes=max(ttl_minutes, 1))
        token = secrets.token_urlsafe(32)

        record = AuthSessionRecord(
            access_token=token,
            student_number=student_number.strip().upper(),
            created_at_iso=now.isoformat(),
            expires_at_iso=expires_at.isoformat(),
        )

        sessions[token] = record
        self._atomic_write_sessions(sessions)
        return record

    def validate_session(self, access_token: str) -> AuthSessionRecord | None:
        token = access_token.strip()
        if not token:
            return None

        sessions = self._load_sessions()
        sessions = self._prune_expired(sessions)

        record = sessions.get(token)
        self._atomic_write_sessions(sessions)
        return record

    def revoke_session(self, access_token: str) -> bool:
        token = access_token.strip()
        if not token:
            return False

        sessions = self._load_sessions()
        sessions = self._prune_expired(sessions)

        existed = token in sessions
        if existed:
            sessions.pop(token, None)
            self._atomic_write_sessions(sessions)
        else:
            self._atomic_write_sessions(sessions)

        return existed
