"""Adapter for commercial apple cold-room air, surface, and humidity data."""

import csv
import io
import math
import re
import zipfile
from collections.abc import Iterator
from datetime import UTC, datetime

from .base import DatasetAdapter
from ..schema import SensorObservation


class AppleColdStorageAdapter(DatasetAdapter):
    dataset_id = "commercial_apple_cold_storage_v2"

    def iter_observations(self) -> Iterator[SensorObservation]:
        with zipfile.ZipFile(self.source) as archive:
            members = sorted(
                name for name in archive.namelist()
                if re.search(r"/t[2-5]/t[2-5]\.Lora[A-Z]\.txt$", name)
            )
            if not members:
                raise ValueError("No LoRa temperature files found in apple archive")
            for member in members:
                text = archive.read(member).decode("utf-8-sig", errors="replace")
                lines = [line for line in text.splitlines() if line.strip() and not line.lstrip().startswith("%")]
                if not lines:
                    continue
                reader = csv.DictReader(io.StringIO("\n".join(lines)), delimiter="\t", skipinitialspace=True)
                test_id = member.split("/")[-2]
                device = member.rsplit("/", 1)[-1].split(".")[1]
                for row_index, raw in enumerate(reader, start=2):
                    row = {key.strip(): (value.strip() if value else "") for key, value in raw.items() if key}
                    try:
                        observed_at = datetime.fromtimestamp(float(row["seconds1970"]), tz=UTC)
                    except (KeyError, ValueError):
                        continue
                    humidity = float(row["H_Air"]) if row.get("H_Air") else None
                    if humidity is not None and (not math.isfinite(humidity) or not 0 <= humidity <= 100):
                        humidity = None
                    for column, suffix, kind in (("T_Air", "air", "air"), ("T_Surf", "surface", "surface")):
                        if not row.get(column):
                            continue
                        temperature = float(row[column])
                        if not math.isfinite(temperature) or not -80 <= temperature <= 80:
                            continue
                        yield SensorObservation(
                            dataset_id=self.dataset_id,
                            shipment_id=f"DE-APPLE-COLDROOM-{test_id.upper()}",
                            sensor_id=f"{device}-{suffix}",
                            observed_at=observed_at,
                            temperature_c=temperature,
                            relative_humidity_pct=humidity if kind == "air" else None,
                            product="apple",
                            stage="commercial cold storage",
                            measurement_type=kind,
                            source_row=f"{member}:{row_index}:{column}",
                            metadata={
                                "test_id": test_id,
                                "source_local_datetime": row.get("DateTime", ""),
                                "epoch_timestamp_used": True,
                            },
                        )

