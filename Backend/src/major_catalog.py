import json
from pathlib import Path

from src.config import Settings


class ScienceMajorCatalog:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.base_dir = settings.resolved_data_dir

    def _majors_dir(self) -> Path:
        return self.base_dir / "majors"

    def _resolve_run_id(self, run_id: str | None) -> str:
        if run_id:
            return run_id

        majors_dir = self._majors_dir()
        if not majors_dir.exists():
            raise FileNotFoundError("No majors artifacts found in data/majors.")

        files = sorted(
            majors_dir.glob("*.majors.verified.json"),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        if not files:
            raise FileNotFoundError("No majors verified files found. Run majors extraction first.")

        return files[0].name.split(".majors.verified.json", 1)[0]

    def _majors_path(self, run_id: str) -> Path:
        return self._majors_dir() / f"{run_id}.majors.verified.json"

    @staticmethod
    def _extract_majors_payload(payload: object) -> dict:
        if isinstance(payload, dict):
            majors = payload.get("majors")
            if isinstance(majors, list):
                return {
                    "section": str(payload.get("section") or "").strip(),
                    "faculty": str(payload.get("faculty") or "").strip(),
                    "institution": str(payload.get("institution") or "").strip(),
                    "degree": str(payload.get("degree") or "").strip(),
                    "notes": str(payload.get("notes") or "").strip(),
                    "majors": [item for item in majors if isinstance(item, dict)],
                }

        if isinstance(payload, list):
            return {
                "section": "",
                "faculty": "",
                "institution": "",
                "degree": "",
                "notes": "",
                "majors": [item for item in payload if isinstance(item, dict)],
            }

        return {
            "section": "",
            "faculty": "",
            "institution": "",
            "degree": "",
            "notes": "",
            "majors": [],
        }

    def list_majors(self, run_id: str | None = None) -> dict:
        resolved_run_id = self._resolve_run_id(run_id)
        path = self._majors_path(resolved_run_id)

        if not path.exists():
            raise FileNotFoundError(
                f"Majors file not found for run_id={resolved_run_id}. Expected {path.name}."
            )

        with path.open("r", encoding="utf-8") as fh:
            payload = json.load(fh)

        normalized = self._extract_majors_payload(payload)

        return {
            "run_id": resolved_run_id,
            "section": normalized["section"],
            "faculty": normalized["faculty"],
            "institution": normalized["institution"],
            "degree": normalized["degree"],
            "notes": normalized["notes"],
            "count": len(normalized["majors"]),
            "majors": normalized["majors"],
        }
