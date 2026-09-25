"""Registry connecting dataset names to their local adapter instances."""

from pathlib import Path

from .adapters import (
    AppleColdStorageAdapter,
    BulkMilkTankAdapter,
    MangoAirCargoAdapter,
    RetailProduceCasesAdapter,
    StrawberryTransportAdapter,
)


def adapter_catalog(project_root: str | Path) -> dict[str, object]:
    root = Path(project_root)
    return {
        "mango": MangoAirCargoAdapter(root / "data/external/mango-air-cargo/mango-air-cargo-complete.zip"),
        "milk": BulkMilkTankAdapter(root / "data/external/bulk-milk-tank"),
        "strawberry": StrawberryTransportAdapter(root / "data/public-strawberry/benchmark.json.gz"),
        "apple": AppleColdStorageAdapter(root / "data/external/apple-cold-storage/TTH_ColdRoom_June19.zip"),
        "retail": RetailProduceCasesAdapter(root / "data/external/retail-produce-cases/retail data FC.xlsx"),
    }

