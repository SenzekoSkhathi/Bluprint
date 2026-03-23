from google import genai

from src.config import Settings
from src.models import PipelineState


class GeminiTrainingAgent:
    name = "gemini_training"

    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = genai.Client(api_key=settings.gemini_api_key)

    def run(self, state: PipelineState) -> PipelineState:
        state.emit(self.name, "started", "Preparing Gemini grounding artifacts")

        # This step creates a model-facing corpus summary for future indexing.
        # True model training is not required for handbook QA; grounding via retrieval is safer and updatable.
        corpus = [
            {
                "s3_key": doc.s3_key,
                "title": doc.title,
                "tags": doc.tags,
                "bytes_size": doc.bytes_size,
            }
            for doc in state.documents
        ]

        chunk_count = len(state.chunks)
        science_chunk_count = sum(1 for chunk in state.chunks if "science" in chunk.tags)
        index_count = int(state.artifacts.get("index_count", 0))

        prompt = (
            "Create a compact schema for university handbook retrieval. "
            "Return only JSON with fields: domain, priority_topics, query_patterns. "
            "Prioritize science handbook language and prerequisite patterns. "
            f"Use domain 'science'. Document count: {len(corpus)}. "
            f"Chunk count: {chunk_count}. Science chunk count: {science_chunk_count}. "
            f"Indexed vectors: {index_count}."
        )

        response = self.client.models.generate_content(
            model=self.settings.gemini_model,
            contents=prompt,
        )

        state.artifacts["gemini_retrieval_schema"] = response.text
        state.artifacts["gemini_corpus_preview"] = corpus[:20]
        state.artifacts["gemini_chunk_count"] = chunk_count
        state.artifacts["gemini_index_count"] = index_count
        state.emit(self.name, "completed", "Gemini grounding schema generated")
        return state
