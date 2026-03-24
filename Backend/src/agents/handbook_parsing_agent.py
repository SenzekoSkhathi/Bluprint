from pathlib import Path

from pypdf import PdfReader

from src.config import Settings
from src.models import HandbookChunk, PipelineState
from src.storage import ChunkStore


class HandbookParsingAgent:
    name = "handbook_parsing"

    def __init__(self, settings: Settings):
        self.settings = settings
        self.chunk_store = ChunkStore(settings.resolved_data_dir, settings=settings)

    def _extract_text(self, path: Path, content_type: str) -> str:
        if content_type == "application/pdf":
            reader = PdfReader(str(path))
            pages = [page.extract_text() or "" for page in reader.pages]
            return "\n".join(pages).strip()

        return path.read_text(encoding="utf-8", errors="ignore").strip()

    def _chunk_text(self, text: str) -> list[str]:
        size = self.settings.chunk_size_chars
        overlap = self.settings.chunk_overlap_chars

        if not text:
            return []

        text = " ".join(text.split())
        chunks: list[str] = []
        start = 0

        while start < len(text):
            end = min(start + size, len(text))
            chunks.append(text[start:end])
            if end == len(text):
                break
            start = max(0, end - overlap)

        return chunks

    def run(self, state: PipelineState) -> PipelineState:
        state.emit(self.name, "started", "Extracting and chunking handbook text")

        all_chunks: list[HandbookChunk] = []
        parsed_docs = 0

        for doc_index, doc in enumerate(state.documents):
            if not doc.local_path:
                continue

            doc_path = Path(doc.local_path)
            if not doc_path.exists():
                continue

            text = self._extract_text(doc_path, doc.content_type)
            chunks = self._chunk_text(text)
            if not chunks:
                continue

            parsed_docs += 1
            boost = 1.3 if "science" in doc.tags else 1.0

            for chunk_index, chunk_text in enumerate(chunks):
                all_chunks.append(
                    HandbookChunk(
                        chunk_id=f"{state.run_id}-{doc_index}-{chunk_index}",
                        s3_key=doc.s3_key,
                        title=doc.title,
                        tags=list(doc.tags),
                        chunk_index=chunk_index,
                        text=chunk_text,
                        char_count=len(chunk_text),
                        science_weight=boost,
                    )
                )

        state.chunks = all_chunks
        persisted = self.chunk_store.save_run_chunks(state.run_id, all_chunks)

        state.artifacts["parsed_document_count"] = parsed_docs
        state.artifacts["chunk_count"] = len(all_chunks)
        state.artifacts["chunks_jsonl"] = persisted["chunks_jsonl"]
        state.artifacts["chunks_manifest"] = persisted["manifest_json"]

        state.emit(self.name, "completed", f"Parsed {parsed_docs} docs into {len(all_chunks)} chunks")
        return state
