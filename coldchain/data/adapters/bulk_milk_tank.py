"""Adapter for real dairy-farm bulk-tank telemetry and laboratory results."""

import csv
import re
from collections.abc import Iterator
from datetime import UTC, datetime

from .base import DatasetAdapter
from ..schema import QualityMeasurement, SensorObservation


def _float(value: str | None) -> float | None:
    if value is None or not value.strip():
        return None
    match = re.search(r"[-+]?\d+(?:[.,]\d+)?", value)
    return float(match.group(0).replace(",", ".")) if match else None


class BulkMilkTankAdapter(DatasetAdapter):
    dataset_id = "bulk_milk_tank_spain_v2"

    def iter_observations(self) -> Iterator[SensorObservation]:
        folder = self.source / "tank_temperature_probes"
        files = sorted(folder.glob("tank_temperature_probes_data.*.csv"))
        if not files:
            raise FileNotFoundError(f"No tank probe CSV files found under {folder}")
        for path in files:
            with path.open("r", encoding="utf-8-sig", newline="") as handle:
                reader = csv.DictReader(handle, delimiter=";")
                for row_index, row in enumerate(reader, start=2):
                    epoch = float(row["Epoch timestamp (UTC)"])
                    observed_at = datetime.fromtimestamp(epoch, tz=UTC)
                    source = row["Source"].strip()
                    values = (
                        ("surface", row.get("Surface temperature (ºC)"), "surface"),
                        ("over_surface", row.get("Over surface temperature (ºC)"), "air"),
                    )
                    for suffix, raw_value, kind in values:
                        value = _float(raw_value)
                        if value is None or not -80 <= value <= 80:
                            continue
                        yield SensorObservation(
                            dataset_id=self.dataset_id,
                            shipment_id=f"ES-MILK-TANK-{observed_at:%Y%m%d}",
                            sensor_id=f"{source}-{suffix}",
                            observed_at=observed_at,
                            temperature_c=value,
                            product="raw bulk milk",
                            stage="farm bulk tank storage",
                            measurement_type=kind,
                            source_row=f"{path.name}:{row_index}:{suffix}",
                            metadata={"source_file": path.name, "source_device": source},
                        )

    def iter_quality_measurements(self) -> Iterator[QualityMeasurement]:
        path = self.source / "laboratory_sample_analysis.csv"
        units = {
            "Fat": "%", "Protein": "%", "Casein": "%", "Total Solids": "%",
            "Fat-Free Dry Extract": "%", "Bacteriology": "source-reported count",
            "Somatic Cell Count": "source-reported count", "Freezing Point Depression": "source unit",
            "Urea": "source unit",
        }
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle, delimiter=";")
            for row_index, row in enumerate(reader, start=2):
                cleaned = {key.strip(): value for key, value in row.items() if key is not None}
                measured_at = datetime.strptime(cleaned["Collection Date"].strip(), "%d/%m/%Y")
                batch_id = cleaned.get("Sample ID", "").strip() or f"row-{row_index}"
                for metric, unit in units.items():
                    value = _float(cleaned.get(metric))
                    if value is None:
                        continue
                    yield QualityMeasurement(
                        dataset_id=self.dataset_id,
                        batch_id=batch_id,
                        measured_at=measured_at,
                        product="raw bulk milk",
                        metric=metric.lower().replace(" ", "_"),
                        value=value,
                        unit=unit,
                        source_row=f"{path.name}:{row_index}:{metric}",
                        metadata={"analysis_date": cleaned.get("Analysis Date", "").strip()},
                    )

