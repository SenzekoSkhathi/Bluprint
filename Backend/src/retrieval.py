from dataclasses import dataclass

from google import genai

from src.config import Settings
from src.models import VectorIndexEntry
from src.storage import IndexStore


@dataclass
class RetrievalHit:
    chunk_id: str
    s3_key: str
    title: str
    text: str
    tags: list[str]
    score: float
    retrieval_weight: float


def _dot(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b, strict=False))


def _norm(a: list[float]) -> float:
    return sum(x * x for x in a) ** 0.5


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    denom = _norm(a) * _norm(b)
    if denom == 0:
        return 0.0
    return _dot(a, b) / denom


class ScienceRetriever:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.index_store = IndexStore(settings.resolved_data_dir)

    def _coerce_query_vector(self, response: object) -> list[float] | None:
        embeddings = getattr(response, "embeddings", None)
        if embeddings is None and isinstance(response, dict):
            embeddings = response.get("embeddings")

        if not embeddings:
            return None

        first = embeddings[0]
        values = getattr(first, "values", None)
        if values is None and isinstance(first, dict):
            values = first.get("values", [])

        if not values:
            return None

        return [float(value) for value in values]

    def _fallback_vector(self, text: str, width: int = 64) -> list[float]:
        buckets = [0.0] * width
        for idx, byte in enumerate(text.encode("utf-8", errors="ignore")):
            buckets[idx % width] += float(byte)

        magnitude = _norm(buckets)
        if magnitude == 0:
            return buckets
        return [value / magnitude for value in buckets]

    def _embed_query(self, query: str, *, use_remote_embedding: bool = True) -> list[float]:
        if not use_remote_embedding:
            return self._fallback_vector(query)

        try:
            response = self.client.models.embed_content(
                model=self.settings.gemini_embedding_model,
                contents=[query],
            )
            vector = self._coerce_query_vector(response)
            if vector:
                return vector
        except Exception:
            pass

        return self._fallback_vector(query)

    def _resolve_run_id(self, run_id: str | None) -> str:
        if run_id:
            return run_id

        latest = self.index_store.latest_run_id()
        if not latest:
            raise FileNotFoundError("No index artifacts available. Run /pipelines/science/run first.")

        return latest

    def search(
        self,
        query: str,
        top_k: int = 5,
        run_id: str | None = None,
        fast_mode: bool = False,
    ) -> dict:
        normalized_top_k = max(1, min(int(top_k), 20))
        resolved_run_id = self._resolve_run_id(run_id)
        entries = self.index_store.load_index_entries_cached(resolved_run_id)

        if not entries:
            return {
                "run_id": resolved_run_id,
                "top_k": normalized_top_k,
                "hits": [],
            }

        query_vector = self._embed_query(query, use_remote_embedding=not fast_mode)

        ranked: list[RetrievalHit] = []
        for entry in entries:
            similarity = _cosine_similarity(query_vector, entry.vector)
            weighted = similarity * float(entry.retrieval_weight)
            ranked.append(
                RetrievalHit(
                    chunk_id=entry.chunk_id,
                    s3_key=entry.s3_key,
                    title=entry.title,
                    text=entry.text,
                    tags=list(entry.tags),
                    score=weighted,
                    retrieval_weight=entry.retrieval_weight,
                )
            )

        ranked.sort(key=lambda item: item.score, reverse=True)
        top_hits = ranked[:normalized_top_k]

        return {
            "run_id": resolved_run_id,
            "top_k": normalized_top_k,
            "hits": [hit.__dict__ for hit in top_hits],
        }
