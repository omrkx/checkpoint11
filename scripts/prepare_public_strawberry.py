#!/usr/bin/env python3
"""Normalize the upstream strawberry benchmark into the app's compact JSON.GZ.

Optional preparation tool. The running app reads the prepared file and needs only
Node.js; regenerating it requires Python 3, pandas, and openpyxl.
"""

from __future__ import annotations

import gzip
import json
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "public-strawberry" / "ALL_benchmark_W60.xlsx"
OUTPUT = ROOT / "data" / "public-strawberry" / "benchmark.json.gz"
SENSOR_COLUMNS = [
    "Front_Top", "Front_Middle", "Front_Bottom",
    "Middle_Top", "Middle_Middle", "Middle_Bottom",
    "Rear_Top", "Rear_Middle", "Rear_Bottom",
]


def finite_number(value):
    if pd.isna(value):
        return None
    number = float(value)
    return number if number == number and abs(number) != float("inf") else None


def main() -> None:
    frame = pd.read_excel(SOURCE, sheet_name="data", engine="openpyxl")
    required = {"Time", "shipment_id", "is_trainable", "y_next_120_R2", *SENSOR_COLUMNS}
    missing = sorted(required.difference(frame.columns))
    if missing:
        raise SystemExit(f"Upstream workbook is missing required columns: {', '.join(missing)}")

    rows = []
    for row in frame.to_dict(orient="records"):
        stamp = row.get("Time")
        if hasattr(stamp, "isoformat"):
            stamp = stamp.isoformat()
        target = finite_number(row.get("y_next_120_R2"))
        risk = finite_number(row.get("risk_level"))
        eta = finite_number(row.get("eta_to_R2_120"))
        rows.append({
            "shipmentId": str(row["shipment_id"]),
            "timestamp": str(stamp),
            "temperaturesC": [finite_number(row.get(column)) for column in SENSOR_COLUMNS],
            "trainable": bool(row.get("is_trainable")),
            "targetNext120": int(target) if target is not None else None,
            "currentRiskLevel": int(risk) if risk is not None else None,
            "etaToR2Minutes": eta,
        })

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(OUTPUT, "wt", encoding="utf-8", newline="") as stream:
        json.dump(rows, stream, separators=(",", ":"), allow_nan=False)
    groups = sorted({row["shipmentId"] for row in rows})
    print(f"Wrote {len(rows):,} rows from {len(groups)} shipments to {OUTPUT}")


if __name__ == "__main__":
    main()
