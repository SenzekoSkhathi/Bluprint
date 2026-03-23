from abc import ABC, abstractmethod

from src.models import PipelineState


class PipelineAgent(ABC):
    name: str

    @abstractmethod
    def run(self, state: PipelineState) -> PipelineState:
        raise NotImplementedError
