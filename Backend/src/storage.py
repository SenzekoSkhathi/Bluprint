import json
import logging
from pathlib import Path
from typing import Dict

import boto3
import botocore.exceptions

from src.models import HandbookChunk, VectorIndexEntry

logger = logging.getLogger(__name__)


class _S3Sync:
    """Uploads and downloads individual pipeline artifact files to/from S3."""

    def __init__(self, settings) -> None:
        self.s3 = boto3.client(
            "s3",
            region_name=settings.aws_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
        )
        self.bucket = settings.aws_s3_handbook_bucket
        self.prefix = settings.aws_s3_artifacts_prefix.rstrip("/")

    def _key(self, subfolder: str, filename: str) -> str:
        return f"{self.prefix}/{subfolder}/{filename}"

    def upload(self, local_path: Path, subfolder: str) -> None:
        key = self._key(subfolder, local_path.name)
        try:
            self.s3.upload_file(str(local_path), self.bucket, key)
            logger.info("Uploaded %s to s3://%s/%s", local_path.name, self.bucket, key)
        except Exception as exc:
            logger.warning("S3 upload failed for %s: %s", key, exc)

    def download(self, subfolder: str, filename: str, local_path: Path) -> bool:
        key = self._key(subfolder, filename)
        try:
            local_path.parent.mkdir(parents=True, exist_ok=True)
            self.s3.download_file(self.bucket, key, str(local_path))
            logger.info("Downloaded s3://%s/%s", self.bucket, key)
            return True
        except botocore.exceptions.ClientError as exc:
            if exc.response["Error"]["Code"] in ("404", "NoSuchKey"):
                return False
            logger.warning("S3 download failed for %s: %s", key, exc)
            return False
        except Exception as exc:
            logger.warning("S3 download failed for %s: %s", key, exc)
            return False

    def latest_key_prefix(self, subfolder: str, suffix: str) -> str | None:
        """Return the filename (without path) of the most recently modified S3
        object whose key ends with *suffix* under *subfolder*."""
        prefix = f"{self.prefix}/{subfolder}/"
        try:
            paginator = self.s3.get_paginator("list_objects_v2")
            all_objects = []
            for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
                all_objects.extend(page.get("Contents", []))
            matching = [obj for obj in all_objects if obj["Key"].endswith(suffix)]
            if not matching:
                return None
            latest = max(matching, key=lambda obj: obj["LastModified"])
            return latest["Key"].split("/")[-1]
        except Exception as exc:
            logger.warning("S3 list failed for %s/%s: %s", self.prefix, subfolder, exc)
            return None


class ChunkStore:
    def __init__(self, base_dir: Path, settings=None):
        self.base_dir = base_dir
        self._s3: _S3Sync | None = _S3Sync(settings) if settings is not None else None

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

        if self._s3:
            self._s3.upload(jsonl_path, "chunks")
            self._s3.upload(manifest_path, "chunks")

        return {
            "chunks_jsonl": str(jsonl_path),
            "manifest_json": str(manifest_path),
        }

    def latest_run_id(self) -> str | None:
        """Return the run_id of the most recent chunk manifest, checking local
        disk first and falling back to S3 if none are found locally."""
        chunks_dir = self.base_dir / "chunks"
        if chunks_dir.exists():
            manifests = sorted(
                chunks_dir.glob("*.manifest.json"),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            if manifests:
                return manifests[0].name.replace(".manifest.json", "")

        if self._s3:
            filename = self._s3.latest_key_prefix("chunks", ".manifest.json")
            if filename:
                run_id = filename.replace(".manifest.json", "")
                self._ensure_local(run_id)
                return run_id

        return None

    def _ensure_local(self, run_id: str) -> bool:
        """Download chunks JSONL + manifest from S3 if not present locally."""
        if not self._s3:
            return False

        chunks_dir = self.base_dir / "chunks"
        chunks_dir.mkdir(parents=True, exist_ok=True)

        jsonl_path = chunks_dir / f"{run_id}.jsonl"
        manifest_path = chunks_dir / f"{run_id}.manifest.json"

        ok = True
        if not jsonl_path.exists():
            ok = self._s3.download("chunks", f"{run_id}.jsonl", jsonl_path) and ok
        if not manifest_path.exists():
            ok = self._s3.download("chunks", f"{run_id}.manifest.json", manifest_path) and ok

        return ok

    def ensure_local_and_load(self, run_id: str) -> list[dict]:
        """Guarantee the chunks JSONL is on disk (downloading from S3 if needed)
        then return the parsed rows."""
        chunks_dir = self.base_dir / "chunks"
        chunks_dir.mkdir(parents=True, exist_ok=True)
        jsonl_path = chunks_dir / f"{run_id}.jsonl"

        if not jsonl_path.exists():
            if not self._ensure_local(run_id):
                raise FileNotFoundError(
                    f"Chunk file not found for run_id={run_id}. Run /pipelines/science/run first."
                )

        rows: list[dict] = []
        with jsonl_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if line:
                    rows.append(json.loads(line))
        return rows


class IndexStore:
    def __init__(self, base_dir: Path, settings=None):
        self.base_dir = base_dir
        self._s3: _S3Sync | None = _S3Sync(settings) if settings is not None else None
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

        if self._s3:
            self._s3.upload(jsonl_path, "index")
            self._s3.upload(manifest_path, "index")

        return {
            "index_jsonl": str(jsonl_path),
            "manifest_json": str(manifest_path),
        }

    def get_manifest_path(self, run_id: str) -> Path:
        return self.base_dir / "index" / f"{run_id}.manifest.json"

    def _ensure_local(self, run_id: str) -> bool:
        if not self._s3:
            return False

        index_dir = self.base_dir / "index"
        index_dir.mkdir(parents=True, exist_ok=True)

        jsonl_path = index_dir / f"{run_id}.jsonl"
        manifest_path = index_dir / f"{run_id}.manifest.json"

        ok = True
        if not jsonl_path.exists():
            ok = self._s3.download("index", f"{run_id}.jsonl", jsonl_path) and ok
        if not manifest_path.exists():
            ok = self._s3.download("index", f"{run_id}.manifest.json", manifest_path) and ok

        return ok

    def load_manifest(self, run_id: str) -> dict:
        path = self.get_manifest_path(run_id)
        if not path.exists():
            self._ensure_local(run_id)
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
            self._ensure_local(run_id)
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
            self._ensure_local(run_id)
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
        if index_dir.exists():
            manifests = sorted(
                index_dir.glob("*.manifest.json"),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            if manifests:
                return manifests[0].name.replace(".manifest.json", "")

        if self._s3:
            filename = self._s3.latest_key_prefix("index", ".manifest.json")
            if filename:
                run_id = filename.replace(".manifest.json", "")
                self._ensure_local(run_id)
                return run_id

        return None
