"""Adapter for the real Thailand-to-France mango air-cargo dataset."""

import csv
import io
import re
import zipfile
from collections.abc import Iterator
from datetime import datetime, timedelta
from pathlib import Path

from .base import DatasetAdapter
from ..schema import QualityMeasurement, SensorObservation


THERMAL_DIR = "01_src_subset_dataset_T_H"
QUALITY_DIRS = {
    "03_src_subset_dataset_W": ("mass", "g"),
    "07_src_subset_dataset_PH": ("ph", "pH"),
    "09_src_subset_dataset_TSS": ("total_soluble_solids", "°Brix"),
}


def _records(source: Path, directory: str) -> Iterator[tuple[str, str]]:
    if source.is_file():
        with zipfile.ZipFile(source) as archive:
            for name in sorted(archive.namelist()):
                if f"{directory}/" in name and name.lower().endswith(".txt") and "read.me" not in name.lower():
                    yield name, archive.read(name).decode("utf-8-sig", errors="replace")
    else:
        for path in sorted((source / directory).glob("*.txt")):
            if "read.me" not in path.name.lower():
                yield str(path), path.read_text(encoding="utf-8-sig", errors="replace")


def _table(text: str) -> csv.DictReader:
    return csv.DictReader(io.StringIO(text), delimiter="\t")


def _as_float(value: str) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _stage_and_box(filename: str) -> tuple[str, str]:
    stem = Path(filename).name.removesuffix(".txt")
    match = re.match(r"(?P<stage>.+)_(?P<i>\d+)_(?P<j>\d+)_(?P<k>\d+)_Temp(?:_Hum)?$", stem)
    if not match:
        return stem, "unknown"
    return match.group("stage").replace("_", " "), f"{match.group('i')}_{match.group('j')}_{match.group('k')}"


class MangoAirCargoAdapter(DatasetAdapter):
    dataset_id = "mango_air_cargo_thailand_france_v1"

    def iter_observations(self) -> Iterator[SensorObservation]:
        for name, text in _records(self.source, THERMAL_DIR):
            if Path(name).name.startswith("00_All_Recording"):
                continue
            stage, box = _stage_and_box(name)
            # The release contains both one continuous file per logger and the
            # same readings segmented by route stage. Use the stage files only
            # so observations are not duplicated and every row has a stage.
            for row_index, raw in enumerate(_table(text), start=2):
                row = {str(key).strip(): (value.strip() if value else "") for key, value in raw.items() if key}
                if not row.get("Time"):
                    continue
                observed_at = datetime.strptime(row["Time"], "%d/%m/%Y %H:%M")
                humidity = float(row["RH_Air"]) if row.get("RH_Air") else None
                for column, suffix, kind in (("T_mangoes", "mango", "product"), ("T_Air", "air", "air")):
                    if not row.get(column):
                        continue
                    value = _as_float(row[column])
                    if value is None:
                        continue
                    yield SensorObservation(
                        dataset_id=self.dataset_id,
                        shipment_id="TH-FR-MANGO-2023-04",
                        sensor_id=f"box-{box}-{suffix}",
                        observed_at=observed_at,
                        temperature_c=value,
                        relative_humidity_pct=humidity if kind == "air" else None,
                        product="Nam Dok Mai Si-Thong mango",
                        stage=stage,
                        measurement_type=kind,
                        source_row=f"{name}:{row_index}:{column}",
                        metadata={
                            "box_position": box,
                            "timestamp_basis": "local source time; timezone changes with route stage",
                            "route": "Bangkok, Thailand to Paris, France",
                        },
                    )

    def iter_quality_measurements(self) -> Iterator[QualityMeasurement]:
        for directory, (metric, unit) in QUALITY_DIRS.items():
            for name, text in _records(self.source, directory):
                reader = _table(text)
                for row_index, raw in enumerate(reader, start=2):
                    row = {str(key).strip(): (value.strip() if value else "") for key, value in raw.items() if key}
                    if not row.get("Time"):
                        continue
                    measured_at = datetime.strptime(row.pop("Time"), "%d/%m/%Y %H:%M")
                    for sample_id, raw_value in row.items():
                        if not raw_value:
                            continue
                        value = _as_float(raw_value)
                        if value is None:
                            continue
                        yield QualityMeasurement(
                            dataset_id=self.dataset_id,
                            batch_id=sample_id,
                            measured_at=measured_at,
                            product="Nam Dok Mai Si-Thong mango",
                            metric=metric,
                            value=value,
                            unit=unit,
                            source_row=f"{name}:{row_index}:{sample_id}",
                            metadata={"source_file": Path(name).name},
                        )

        base_date = datetime(2023, 4, 18, 10, 0)
        for name, text in _records(self.source, "05_src_subset_dataset_C"):
            for row_index, raw in enumerate(_table(text), start=2):
                row = {str(key).strip(): (value.strip() if value else "") for key, value in raw.items() if key}
                sample_id = row.pop("BOX_NAME", f"row-{row_index}")
                for column, raw_value in row.items():
                    match = re.match(r"(?P<metric>[Lab])_D(?P<day>\d+)$", column)
                    if not match or not raw_value:
                        continue
                    value = _as_float(raw_value)
                    if value is None:
                        continue
                    yield QualityMeasurement(
                        dataset_id=self.dataset_id,
                        batch_id=sample_id,
                        measured_at=base_date + timedelta(days=int(match.group("day"))),
                        product="Nam Dok Mai Si-Thong mango",
                        metric=f"cie_lab_{match.group('metric').lower()}",
                        value=value,
                        unit="CIE L*a*b*",
                        source_row=f"{name}:{row_index}:{column}",
                        metadata={"storage_day": int(match.group("day")), "source_file": Path(name).name},
                    )

