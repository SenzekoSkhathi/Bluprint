from typing import Iterable, List

from google import genai

from src.config import Settings
from src.models import PipelineState, VectorIndexEntry
from src.storage import IndexStore


class GeminiIndexingAgent:
    name = "gemini_indexing"

    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.index_store = IndexStore(settings.resolved_data_dir, settings=settings)

    def _coerce_embedding_vectors(self, response: object) -> list[list[float]]:
        embeddings = getattr(response, "embeddings", None)
        if embeddings is None and isinstance(response, dict):
            embeddings = response.get("embeddings")

        vectors: list[list[float]] = []
        for item in embeddings or []:
            values = getattr(item, "values", None)
            if values is None and isinstance(item, dict):
                values = item.get("values", [])
            if not values:
                continue
            vectors.append([float(value) for value in values])

        return vectors

    def _build_fallback_vector(self, text: str, width: int = 64) -> list[float]:
        # Deterministic fallback keeps indexing non-blocking if embedding API is unavailable.
        buckets = [0.0] * width
        if not text:
            return buckets

        for idx, byte in enumerate(text.encode("utf-8", errors="ignore")):
            buckets[idx % width] += float(byte)

        norm = sum(value * value for value in buckets) ** 0.5
        if norm == 0:
            return buckets

        return [value / norm for value in buckets]

    def _embed_text_batch(self, texts: list[str]) -> list[list[float]]:
        response = self.client.models.embed_content(
            model=self.settings.gemini_embedding_model,
            contents=texts,
        )
        vectors = self._coerce_embedding_vectors(response)

        if len(vectors) != len(texts):
            raise ValueError("Gemini embedding response count mismatch")

        return vectors

    def _batched(self, items: list[str], size: int) -> Iterable[list[str]]:
        for start in range(0, len(items), size):
            yield items[start : start + size]

    def run(self, state: PipelineState) -> PipelineState:
        state.emit(self.name, "started", "Generating Gemini embeddings and retrieval index")

        if not state.chunks:
            state.artifacts["index_count"] = 0
            state.emit(self.name, "completed", "No chunks available to index")
            return state

        index_entries: list[VectorIndexEntry] = []
        texts = [chunk.text for chunk in state.chunks]
        batch_size = max(1, self.settings.embedding_batch_size)

        try:
            all_vectors: list[list[float]] = []
            for batch in self._batched(texts, batch_size):
                all_vectors.extend(self._embed_text_batch(batch))
        except Exception:
            all_vectors = [self._build_fallback_vector(text) for text in texts]
            state.artifacts["embedding_fallback_used"] = True

        for chunk, vector in zip(state.chunks, all_vectors, strict=True):
            index_entries.append(
                VectorIndexEntry(
                    chunk_id=chunk.chunk_id,
                    s3_key=chunk.s3_key,
                    title=chunk.title,
                    tags=list(chunk.tags),
                    text=chunk.text,
                    vector=vector,
                    vector_dimensions=len(vector),
                    retrieval_weight=chunk.science_weight,
                )
            )

        persisted = self.index_store.save_run_index(state.run_id, index_entries)

        state.artifacts["index_count"] = len(index_entries)
        state.artifacts["index_jsonl"] = persisted["index_jsonl"]
        state.artifacts["index_manifest"] = persisted["manifest_json"]
        state.artifacts["embedding_model"] = self.settings.gemini_embedding_model

        state.emit(self.name, "completed", f"Indexed {len(index_entries)} chunk vectors")
        return state
