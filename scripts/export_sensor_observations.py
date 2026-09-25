"""Export canonical SensorObservation records as newline-delimited JSON."""

import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from coldchain.data.catalog import adapter_catalog


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset", choices=sorted(adapter_catalog(ROOT)))
    parser.add_argument("output", type=Path)
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be positive")

    adapter = adapter_catalog(ROOT)[args.dataset]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with args.output.open("w", encoding="utf-8") as handle:
        for record in adapter.iter_observations():
            handle.write(record.model_dump_json() + "\n")
            count += 1
            if args.limit is not None and count >= args.limit:
                break
    print(f"Exported {count} validated {args.dataset} observations to {args.output}")


if __name__ == "__main__":
    main()

