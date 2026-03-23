import json
from pathlib import Path
from typing import Dict

from src.models import HandbookChunk, VectorIndexEntry


class ChunkStore:
    def __init__(self, base_dir: Path):
        self.base_dir = base_dir

    def save_run_chunks(self, run_id: str, chunks: list[HandbookChunk]) -> Dict[str, str]:
        chunks_dir = self.base_dir / "chunks"
        chunks_dir.mkdir(parents=True, exist_ok=True)

        jsonl_path = chunks_dir / f"{run_id}.jsonl"
        manifest_path = chunks_dir / f"{run_id}.manifest.json"

        with jsonl_path.open("w", encoding="utf-8") as handle:
            for chunk in chunks:
                handle.write(json.dumps(chunk.__dict__, ensure_ascii=True) + "\n")

        manifest = {
            "run_id": run_id,
            "chunk_count": len(chunks),
            "files": {
                "chunks_jsonl": str(jsonl_path),
            },
        }
        with manifest_path.open("w", encoding="utf-8") as handle:
            json.dump(manifest, handle, ensure_ascii=True, indent=2)

        return {
            "chunks_jsonl": str(jsonl_path),
            "manifest_json": str(manifest_path),
        }


class IndexStore:
    def __init__(self, base_dir: Path):
        self.base_dir = base_dir
        self._entries_cache: dict[str, tuple[float, list[VectorIndexEntry]]] = {}

    def save_run_index(self, run_id: str, entries: list[VectorIndexEntry]) -> Dict[str, str]:
        index_dir = self.base_dir / "index"
        index_dir.mkdir(parents=True, exist_ok=True)

        jsonl_path = index_dir / f"{run_id}.jsonl"
        manifest_path = index_dir / f"{run_id}.manifest.json"

        with jsonl_path.open("w", encoding="utf-8") as handle:
            for entry in entries:
                handle.write(json.dumps(entry.__dict__, ensure_ascii=True) + "\n")

        vector_dimensions = entries[0].vector_dimensions if entries else 0
        manifest = {
            "run_id": run_id,
            "index_count": len(entries),
            "vector_dimensions": vector_dimensions,
            "files": {
                "index_jsonl": str(jsonl_path),
            },
        }
        with manifest_path.open("w", encoding="utf-8") as handle:
            json.dump(manifest, handle, ensure_ascii=True, indent=2)

        return {
            "index_jsonl": str(jsonl_path),
            "manifest_json": str(manifest_path),
        }

    def get_manifest_path(self, run_id: str) -> Path:
        return self.base_dir / "index" / f"{run_id}.manifest.json"

    def load_manifest(self, run_id: str) -> dict:
        path = self.get_manifest_path(run_id)
        if not path.exists():
            raise FileNotFoundError(f"Index manifest not found for run_id={run_id}")
        return json.loads(path.read_text(encoding="utf-8"))

    def load_index_entries(self, run_id: str) -> list[VectorIndexEntry]:
        manifest = self.load_manifest(run_id)
        jsonl_file = manifest.get("files", {}).get("index_jsonl")
        if not jsonl_file:
            raise FileNotFoundError(f"Index JSONL path missing in manifest for run_id={run_id}")

        path = Path(jsonl_file)
        if not path.exists():
            raise FileNotFoundError(f"Index file does not exist for run_id={run_id}")

        entries: list[VectorIndexEntry] = []
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                payload = json.loads(line)
                entries.append(VectorIndexEntry(**payload))

        return entries

    def load_index_entries_cached(self, run_id: str) -> list[VectorIndexEntry]:
        manifest = self.load_manifest(run_id)
        jsonl_file = manifest.get("files", {}).get("index_jsonl")
        if not jsonl_file:
            raise FileNotFoundError(f"Index JSONL path missing in manifest for run_id={run_id}")

        path = Path(jsonl_file)
        if not path.exists():
            raise FileNotFoundError(f"Index file does not exist for run_id={run_id}")

        modified_at = path.stat().st_mtime
        cached = self._entries_cache.get(run_id)
        if cached and cached[0] == modified_at:
            return cached[1]

        entries = self.load_index_entries(run_id)
        self._entries_cache[run_id] = (modified_at, entries)
        return entries

    def latest_run_id(self) -> str | None:
        index_dir = self.base_dir / "index"
        if not index_dir.exists():
            return None

        manifests = sorted(index_dir.glob("*.manifest.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not manifests:
            return None

        return manifests[0].name.replace(".manifest.json", "")
