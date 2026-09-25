"""Canonical, provenance-first records used by the training pipeline."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SensorObservation(BaseModel):
    """One measured temperature value and its source context.

    ``observed_at`` may be null only for a source that publishes aggregate case
    statistics without timestamps. Adapters never invent a timestamp or label.
    """

    model_config = ConfigDict(extra="forbid")

    dataset_id: str = Field(min_length=1)
    shipment_id: str = Field(min_length=1)
    sensor_id: str = Field(min_length=1)
    observed_at: datetime | None
    temperature_c: float = Field(ge=-80, le=80)
    relative_humidity_pct: float | None = Field(default=None, ge=0, le=100)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    product: str = Field(min_length=1)
    stage: str | None = None
    measurement_type: Literal["air", "product", "surface", "aggregate"]
    is_observed: Literal[True] = True
    source_row: str = Field(min_length=1)
    quality_targets: dict[str, float | int | str | bool | None] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("dataset_id", "shipment_id", "sensor_id", "product", "source_row")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class QualityMeasurement(BaseModel):
    """A measured product-quality endpoint kept separate from sensor telemetry."""

    model_config = ConfigDict(extra="forbid")

    dataset_id: str = Field(min_length=1)
    batch_id: str = Field(min_length=1)
    measured_at: datetime | None
    product: str = Field(min_length=1)
    metric: str = Field(min_length=1)
    value: float
    unit: str = Field(min_length=1)
    source_row: str = Field(min_length=1)
    metadata: dict[str, Any] = Field(default_factory=dict)

