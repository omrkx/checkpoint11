"""Shared adapter interface."""

from abc import ABC, abstractmethod
from collections.abc import Iterator
from pathlib import Path

from ..schema import QualityMeasurement, SensorObservation


class DatasetAdapter(ABC):
    dataset_id: str

    def __init__(self, source: str | Path) -> None:
        self.source = Path(source)

    @abstractmethod
    def iter_observations(self) -> Iterator[SensorObservation]:
        """Yield validated measured observations without fabricated values."""

    def iter_quality_measurements(self) -> Iterator[QualityMeasurement]:
        return iter(())

    def sample(self, limit: int = 10) -> list[SensorObservation]:
        rows: list[SensorObservation] = []
        for row in self.iter_observations():
            rows.append(row)
            if len(rows) >= limit:
                break
        return rows

