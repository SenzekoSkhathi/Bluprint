import hashlib
import hmac
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


class StudentCredentialStore:
    """Stores per-student hashed passwords. Falls back to the global shared
    password when no per-student record exists (backward compatible)."""

    _SALT_BYTES = 16

    def __init__(self, base_dir: Path) -> None:
        self.base_dir = base_dir
        self._creds_path = base_dir / "auth" / "credentials.json"
        self._creds_path.parent.mkdir(parents=True, exist_ok=True)

    def _load(self) -> dict[str, dict]:
        if not self._creds_path.exists():
            return {}
        try:
            return json.loads(self._creds_path.read_text(encoding="utf-8"))
        except Exception:
            return {}

    def _save(self, data: dict[str, dict]) -> None:
        tmp = self._creds_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=True, indent=2), encoding="utf-8")
        tmp.replace(self._creds_path)

    @staticmethod
    def _hash(password: str, salt: str) -> str:
        return hashlib.sha256(f"{salt}{password}".encode("utf-8")).hexdigest()

    def set_password(self, student_number: str, password: str) -> None:
        data = self._load()
        salt = secrets.token_hex(self._SALT_BYTES)
        data[student_number.strip().upper()] = {
            "salt": salt,
            "hash": self._hash(password, salt),
        }
        self._save(data)

    def verify_password(self, student_number: str, password: str) -> bool:
        data = self._load()
        record = data.get(student_number.strip().upper())
        if not record:
            return False
        expected = self._hash(password, record["salt"])
        return hmac.compare_digest(expected, record["hash"])

    def has_credential(self, student_number: str) -> bool:
        return student_number.strip().upper() in self._load()
