"""Stream every selected source through its Pydantic adapter and report counts."""

from collections import Counter
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from coldchain.data.adapters import (
    AppleColdStorageAdapter,
    BulkMilkTankAdapter,
    MangoAirCargoAdapter,
    RetailProduceCasesAdapter,
    StrawberryTransportAdapter,
)


def verify(adapter) -> dict:
    observations = 0
    measurements = Counter()
    first = None
    for row in adapter.iter_observations():
        observations += 1
        measurements[row.measurement_type] += 1
        if first is None:
            first = row.model_dump(mode="json")
    quality = sum(1 for _ in adapter.iter_quality_measurements())
    if observations == 0:
        raise RuntimeError(f"{adapter.dataset_id} yielded no observations")
    return {
        "dataset_id": adapter.dataset_id,
        "observations": observations,
        "measurement_types": dict(measurements),
        "quality_measurements": quality,
        "first_record": first,
    }


def main() -> None:
    adapters = [
        MangoAirCargoAdapter(ROOT / "data/external/mango-air-cargo/mango-air-cargo-complete.zip"),
        BulkMilkTankAdapter(ROOT / "data/external/bulk-milk-tank"),
        StrawberryTransportAdapter(ROOT / "data/public-strawberry/benchmark.json.gz"),
        AppleColdStorageAdapter(ROOT / "data/external/apple-cold-storage/TTH_ColdRoom_June19.zip"),
        RetailProduceCasesAdapter(ROOT / "data/external/retail-produce-cases/retail data FC.xlsx"),
    ]
    report = [verify(adapter) for adapter in adapters]
    output = ROOT / "artifacts/data-adapters/verification.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

