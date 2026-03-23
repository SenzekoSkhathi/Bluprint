import json
from pathlib import Path

from src.config import Settings


class ScienceAdvisorCatalog:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.base_dir = settings.resolved_data_dir

    def _advisors_dir(self) -> Path:
        return self.base_dir / "advisors"

    def _resolve_file(self) -> Path:
        advisors_dir = self._advisors_dir()
        if not advisors_dir.exists():
            raise FileNotFoundError("No advisors directory found in data/advisors.")

        files = sorted(
            advisors_dir.glob("*.verified.json"),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        if not files:
            raise FileNotFoundError(
                "No advisors verified files found in data/advisors."
            )

        return files[0]

    @staticmethod
    def _normalize_advisor(entry: dict, tier: str) -> dict:
        note = str(entry.get("note") or "").strip()
        return {
            "name": str(entry.get("name") or "").strip(),
            "area": str(entry.get("area") or "").strip(),
            "room": str(entry.get("room") or "").strip(),
            "email": str(entry.get("email") or "").strip(),
            "note": note if note else None,
            "tier": tier,
        }

    def list_advisors(self) -> dict:
        path = self._resolve_file()

        with path.open("r", encoding="utf-8") as fh:
            payload = json.load(fh)

        if not isinstance(payload, dict):
            raise ValueError("Unexpected advisors file format — expected a JSON object.")

        faculty = str(payload.get("faculty") or "").strip()
        university = str(payload.get("university") or "").strip()
        year = payload.get("year")

        senior_raw = payload.get("senior_student_advisors") or []
        student_raw = payload.get("student_advisors") or []

        all_advisors: list[dict] = []

        for entry in senior_raw:
            if isinstance(entry, dict):
                all_advisors.append(self._normalize_advisor(entry, "senior"))

        for entry in student_raw:
            if isinstance(entry, dict):
                all_advisors.append(self._normalize_advisor(entry, "regular"))

        return {
            "faculty": faculty,
            "university": university,
            "year": year,
            "count": len(all_advisors),
            "advisors": all_advisors,
        }
