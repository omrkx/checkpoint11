"""Adapter for the six-shipment strawberry transportation release."""

import gzip
import json
from collections.abc import Iterator
from datetime import datetime

from .base import DatasetAdapter
from ..schema import SensorObservation


class StrawberryTransportAdapter(DatasetAdapter):
    dataset_id = "strawberry_transport_us_v2026"
    SENSOR_IDS = (
        "front_top", "front_middle", "front_bottom",
        "middle_top", "middle_middle", "middle_bottom",
        "rear_top", "rear_middle", "rear_bottom",
    )

    def iter_observations(self) -> Iterator[SensorObservation]:
        opener = gzip.open if self.source.suffix == ".gz" else open
        with opener(self.source, "rt", encoding="utf-8") as handle:
            rows = json.load(handle)
        for row_index, row in enumerate(rows, start=1):
            observed_at = datetime.fromisoformat(row["timestamp"])
            targets = {
                "future_r2_within_120_min_weak_label": row.get("targetNext120"),
                "current_risk_level_weak_label": row.get("currentRiskLevel"),
                "eta_to_r2_minutes_weak_label": row.get("etaToR2Minutes"),
                "source_trainable_flag": row.get("trainable"),
            }
            for sensor_id, value in zip(self.SENSOR_IDS, row["temperaturesC"], strict=True):
                if value is None:
                    continue
                yield SensorObservation(
                    dataset_id=self.dataset_id,
                    shipment_id=row["shipmentId"],
                    sensor_id=sensor_id,
                    observed_at=observed_at,
                    temperature_c=value,
                    product="strawberry",
                    stage="transport",
                    measurement_type="product",
                    source_row=f"{row['shipmentId']}:{row_index}:{sensor_id}",
                    quality_targets=targets,
                    metadata={
                        "timestamp_timezone": "not specified by bundled source",
                        "target_provenance": "rule-derived weak supervision; not spoilage or RSL",
                    },
                )

