from src.config import Settings
from src.models import PipelineState


class ScienceFocusAgent:
    name = "science_focus"

    def __init__(self, settings: Settings):
        self.settings = settings

    def run(self, state: PipelineState) -> PipelineState:
        state.emit(self.name, "started", "Filtering science handbooks")

        keywords = self.settings.science_handbook_keywords
        prioritized = []

        for doc in state.documents:
            haystack = f"{doc.s3_key} {doc.title}".lower()
            if any(keyword in haystack for keyword in keywords):
                doc.tags.append("science")
                prioritized.append(doc)

        if prioritized:
            state.documents = prioritized
            state.emit(self.name, "completed", f"Science-focused set: {len(prioritized)} documents")
        else:
            state.emit(
                self.name,
                "completed",
                "No strict science match found. Keeping full handbook set as fallback",
            )

        return state
