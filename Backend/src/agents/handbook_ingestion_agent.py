from pathlib import Path
from typing import List

import boto3

from src.config import Settings
from src.models import HandbookDocument, PipelineState


class HandbookIngestionAgent:
    name = "handbook_ingestion"

    def __init__(self, settings: Settings):
        self.settings = settings
        self.s3 = boto3.client(
            "s3",
            region_name=settings.aws_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
        )

    def _is_supported(self, key: str) -> bool:
        lowered = key.lower()
        return lowered.endswith(".pdf") or lowered.endswith(".txt")

    def _build_doc_title(self, key: str) -> str:
        filename = key.split("/")[-1]
        return filename.rsplit(".", 1)[0].replace("_", " ").strip()

    def _safe_local_path(self, raw_dir: Path, s3_key: str) -> Path:
        safe_parts = [part for part in Path(s3_key).parts if part not in ("", ".", "..")]
        if not safe_parts:
            safe_parts = ["unknown.bin"]
        local_path = raw_dir.joinpath(*safe_parts)
        local_path.parent.mkdir(parents=True, exist_ok=True)
        return local_path

    def _list_all_keys(self) -> List[dict]:
        all_contents: List[dict] = []
        continuation_token: str | None = None

        while True:
            params = {
                "Bucket": self.settings.aws_s3_handbook_bucket,
                "Prefix": self.settings.aws_s3_handbook_prefix,
                "MaxKeys": 1000,
            }
            if continuation_token:
                params["ContinuationToken"] = continuation_token

            response = self.s3.list_objects_v2(**params)
            all_contents.extend(response.get("Contents", []))

            if not response.get("IsTruncated"):
                break

            continuation_token = response.get("NextContinuationToken")

        return all_contents

    def run(self, state: PipelineState) -> PipelineState:
        state.emit(self.name, "started", "Listing and downloading handbooks from S3")

        contents = self._list_all_keys()
        docs: List[HandbookDocument] = []
        downloaded = 0
        skipped_large = 0
        raw_dir = self.settings.resolved_data_dir / "raw" / state.run_id
        raw_dir.mkdir(parents=True, exist_ok=True)

        for item in contents:
            key = item.get("Key", "")
            if not key or not self._is_supported(key):
                continue

            bytes_size = int(item.get("Size", 0))
            if bytes_size > self.settings.max_handbook_bytes:
                skipped_large += 1
                continue

            body = self.s3.get_object(
                Bucket=self.settings.aws_s3_handbook_bucket,
                Key=key,
            )["Body"].read()
            local_path = self._safe_local_path(raw_dir, key)
            local_path.write_bytes(body)
            downloaded += 1

            docs.append(
                HandbookDocument(
                    s3_key=key,
                    title=self._build_doc_title(key),
                    content_type="application/pdf" if key.lower().endswith(".pdf") else "text/plain",
                    bytes_size=bytes_size,
                    local_path=str(local_path),
                )
            )

        state.documents = docs
        state.artifacts["s3_scan_count"] = len(contents)
        state.artifacts["downloaded_document_count"] = downloaded
        state.artifacts["skipped_large_document_count"] = skipped_large
        state.emit(self.name, "completed", f"Downloaded {downloaded} handbook documents")
        return state
