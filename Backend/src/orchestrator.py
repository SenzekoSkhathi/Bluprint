from uuid import uuid4

from src.agents.gemini_indexing_agent import GeminiIndexingAgent
from src.agents.gemini_training_agent import GeminiTrainingAgent
from src.agents.handbook_ingestion_agent import HandbookIngestionAgent
from src.agents.handbook_parsing_agent import HandbookParsingAgent
from src.agents.science_focus_agent import ScienceFocusAgent
from src.config import Settings
from src.models import PipelineState


class HandbookPipelineOrchestrator:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.pipeline = [
            HandbookIngestionAgent(settings),
            ScienceFocusAgent(settings),
            HandbookParsingAgent(settings),
            GeminiIndexingAgent(settings),
            GeminiTrainingAgent(settings),
        ]

    def run_science_pipeline(self) -> PipelineState:
        state = PipelineState(run_id=f"science-{uuid4().hex[:12]}", target_domain="science")

        for agent in self.pipeline:
            state = agent.run(state)

        return state
