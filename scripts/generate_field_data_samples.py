"""Build a small, provenance-preserving browser sample from the local datasets.

The complete source records stay in the Python adapter layer. This command writes
bounded chart/table examples for the read-only Field data explorer; it never
turns these examples into RSL or food-safety labels.
"""

from __future__ import annotations

import json
import random
from collections import Counter, defaultdict
from datetime import date
from hashlib import sha256
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from coldchain.data.catalog import adapter_catalog


OUTPUT = ROOT / "public" / "field-data-samples.json"
SAMPLE_LIMIT = 240

SOURCES = {
    "mango": {
        "title": "Mango air cargo · Thailand to France",
        "region": "One international shipment · 2023",
        "citation": "Paviet-Salomon et al., Dataset of Air Cargo Supply Chain and Fruit Quality",
        "url": "https://doi.org/10.57745/F9UJGQ",
        "license": "CC BY-NC-SA 4.0 · noncommercial use under the repository terms",
        "what": "Mango product temperature, surrounding-air temperature, humidity, shipment stage, and selected physical/chemical fruit measurements.",
        "use": "Explore how measured temperature changes across one logged route stage; measured quality values are shown separately.",
        "limit": "One shipment. Logger timestamps are local to their route stage and the timezone changes by stage. This sample plots only one stage. The measurements have not calibrated the app’s RSL model.",
    },
    "milk": {
        "title": "Bulk milk tank · Spain",
        "region": "Farm tank storage · 2024",
        "citation": "Cantarero Navarro et al., Dataset on Bulk Milk Tank Performance",
        "url": "https://doi.org/10.17632/2sw758pw38.2",
        "license": "CC BY 4.0",
        "what": "Tank-surface and near-surface temperatures plus separately collected laboratory composition and bacteriology measurements.",
        "use": "Inspect a measured tank-day trace and see the kinds of lab measurements the source contains.",
        "limit": "This is raw farm-tank milk, not pasteurized retail milk or a shipment route. Lab samples are not joined to the displayed sensor trace, and these measurements are not a food-safety clearance.",
    },
    "apple": {
        "title": "Apple commercial cold storage · Germany",
        "region": "Four cold-room tests · 2024",
        "citation": "Jedermann et al., Air, surface and dew point temperature under high humidity conditions during commercial cold storage of apples",
        "url": "https://doi.org/10.17632/h4sghvyjyt.2",
        "license": "CC BY 4.0",
        "what": "High-volume cold-room air and apple-surface temperatures, with relative humidity and logger/test context.",
        "use": "Compare measured air and surface temperature histories and explore storage sensor variation.",
        "limit": "The dataset has no direct measured spoilage, sensory rejection, or remaining-shelf-life endpoint. This bounded trace is sampled from one test and one logger pair.",
    },
    "retail": {
        "title": "Retail produce display cases",
        "region": "Published case-position aggregates",
        "citation": "Monge et al., Temperature profiling of open- and closed-doored produce cases in retail grocery stores",
        "url": "https://doi.org/10.17632/vdt2n9sygc.1",
        "license": "CC BY 4.0",
        "what": "224 case-position summaries with average/minimum/maximum temperature, moisture, and source-reported high-temperature summaries.",
        "use": "Compare retail display conditions by case and position; useful for context, not time-series modeling.",
        "limit": "Rows have no timestamps and do not identify the produce in each case. Source-reported abuse statistics are not universal safety limits or spoilage labels.",
    },
}


def point(observation) -> dict[str, object]:
    return {
        "t": observation.observed_at.isoformat() if observation.observed_at else None,
        "v": round(float(observation.temperature_c), 3),
        "humidity": round(float(observation.relative_humidity_pct), 2)
        if observation.relative_humidity_pct is not None
        else None,
    }


def downsample(points: list[dict[str, object]], limit: int = SAMPLE_LIMIT) -> list[dict[str, object]]:
    if len(points) <= limit:
        return points
    # Reserve two slots for actual observed extremes, then keep a regular sample.
    indices = {
        round(index * (len(points) - 1) / max(limit - 3, 1))
        for index in range(limit - 2)
    }
    indices.add(min(range(len(points)), key=lambda index: points[index]["v"]))
    indices.add(max(range(len(points)), key=lambda index: points[index]["v"]))
    return [points[index] for index in sorted(indices)]


def measurement_record(measurement) -> dict[str, object]:
    day = measurement.metadata.get("storage_day")
    measured_at = f"Storage day {day}" if day is not None else (
        measurement.measured_at.isoformat() if measurement.measured_at else "Date not supplied"
    )
    return {
        "sample": measurement.batch_id,
        "measuredAt": measured_at,
        "metric": measurement.metric,
        "value": round(float(measurement.value), 4),
        "unit": measurement.unit,
        "sourceRow": measurement.source_row,
    }


def quality_summary(adapter) -> dict[str, object]:
    counts: Counter[str] = Counter()
    examples_by_metric: dict[str, list[dict[str, object]]] = defaultdict(list)
    total = 0
    for measurement in adapter.iter_quality_measurements():
        total += 1
        counts[measurement.metric] += 1
        if len(examples_by_metric[measurement.metric]) < 2:
            examples_by_metric[measurement.metric].append(measurement_record(measurement))
    # Show a spread across measured metric groups without implying these values
    # were collected from the plotted temperature logger.
    selected = [row for metric in sorted(counts) for row in examples_by_metric[metric]]
    selected.sort(key=lambda row: (str(row["metric"]), str(row["measuredAt"]), str(row["sample"])))
    return {
        "count": total,
        "metrics": [{"name": metric, "count": count} for metric, count in sorted(counts.items())],
        "examples": selected[:18],
    }


def build_milk(adapter) -> dict[str, object]:
    day_counts: Counter[str] = Counter()
    observation_count = 0
    for observation in adapter.iter_observations():
        observation_count += 1
        if observation.observed_at:
            day_counts[observation.observed_at.date().isoformat()] += 1
    selected_day = max(day_counts, key=lambda day: (day_counts[day], day))

    rows = []
    device_counts: Counter[str] = Counter()
    for observation in adapter.iter_observations():
        if observation.observed_at and observation.observed_at.date().isoformat() == selected_day:
            suffix = next((ending for ending in ("-over_surface", "-surface", "-air") if observation.sensor_id.endswith(ending)), "")
            device = observation.sensor_id.removesuffix(suffix)
            device_counts[device] += 1
            rows.append((device, observation.measurement_type, point(observation), observation.source_row))
    device = max(device_counts, key=lambda candidate: (device_counts[candidate], candidate))
    series = []
    source_examples = []
    for kind, label in (("surface", "Tank surface"), ("air", "Air above tank")):
        selected = [row for row in rows if row[0] == device and row[1] == kind]
        selected.sort(key=lambda row: row[2]["t"] or "")
        values = [row[2] for row in selected]
        if values:
            series.append({"name": label, "count": len(values), "points": downsample(values)})
            source_examples.extend(row[3] for row in selected[:3])
    return {
        "observationCount": observation_count,
        "quality": quality_summary(adapter),
        "sample": {
            "kind": "time-series",
            "label": f"Most densely recorded tank day · {selected_day} UTC",
            "timeBasis": "Source epoch timestamps converted to UTC.",
            "group": "Selected tank probe pair",
            "series": series,
            "sourceRows": source_examples[:6],
        },
    }


def build_mango(adapter) -> dict[str, object]:
    stage_counts: Counter[str] = Counter()
    stage_box_counts: Counter[tuple[str, str]] = Counter()
    observation_count = 0
    for observation in adapter.iter_observations():
        observation_count += 1
        stage = observation.stage or "Unknown stage"
        box = str(observation.metadata.get("box_position", "unknown"))
        stage_counts[stage] += 1
        stage_box_counts[(stage, box)] += 1
    stage = max(stage_counts, key=lambda value: (stage_counts[value], value))
    box = max(
        (candidate for candidate_stage, candidate in stage_box_counts if candidate_stage == stage),
        key=lambda candidate: (stage_box_counts[(stage, candidate)], candidate),
    )
    grouped: dict[str, list[tuple[dict[str, object], str]]] = defaultdict(list)
    for observation in adapter.iter_observations():
        if observation.stage == stage and str(observation.metadata.get("box_position", "unknown")) == box:
            grouped[observation.measurement_type].append((point(observation), observation.source_row))
    series = []
    source_examples = []
    for kind, label in (("product", "Mango temperature"), ("air", "Air temperature")):
        rows = sorted(grouped.get(kind, []), key=lambda row: row[0]["t"] or "")
        if rows:
            series.append({"name": label, "count": len(rows), "points": downsample([row[0] for row in rows])})
            source_examples.extend(row[1] for row in rows[:3])
    return {
        "observationCount": observation_count,
        "quality": quality_summary(adapter),
        "sample": {
            "kind": "time-series",
            "label": f"Most densely recorded route stage · {stage}",
            "timeBasis": "Original local timestamps, kept within this one route stage; not converted across stages.",
            "group": f"Logger box {box}",
            "series": series,
            "sourceRows": source_examples[:6],
        },
    }


class Reservoir:
    def __init__(self, key: str, limit: int) -> None:
        seed = int(sha256(key.encode("utf-8")).hexdigest()[:16], 16)
        self.rng = random.Random(seed)
        self.limit = limit
        self.count = 0
        self.values: list[tuple[dict[str, object], str]] = []
        self.minimum: tuple[dict[str, object], str] | None = None
        self.maximum: tuple[dict[str, object], str] | None = None

    def add(self, value: tuple[dict[str, object], str]) -> None:
        self.count += 1
        if self.minimum is None or value[0]["v"] < self.minimum[0]["v"]:
            self.minimum = value
        if self.maximum is None or value[0]["v"] > self.maximum[0]["v"]:
            self.maximum = value
        if len(self.values) < self.limit:
            self.values.append(value)
            return
        index = self.rng.randrange(self.count)
        if index < self.limit:
            self.values[index] = value

    def sample_values(self) -> list[tuple[dict[str, object], str]]:
        selected = list(self.values)
        source_rows = {row[1] for row in selected}
        for extreme in (self.minimum, self.maximum):
            if extreme is not None and extreme[1] not in source_rows:
                selected.append(extreme)
                source_rows.add(extreme[1])
        return selected


def build_apple(adapter) -> dict[str, object]:
    totals: Counter[str] = Counter()
    device_totals: Counter[tuple[str, str]] = Counter()
    reservoirs: dict[tuple[str, str, str], Reservoir] = {}
    observation_count = 0
    for observation in adapter.iter_observations():
        observation_count += 1
        test = str(observation.metadata.get("test_id", "unknown"))
        suffix = "-surface" if observation.sensor_id.endswith("-surface") else "-air"
        device = observation.sensor_id.removesuffix(suffix)
        totals[test] += 1
        device_totals[(test, device)] += 1
        key = (test, device, observation.measurement_type)
        if key not in reservoirs:
            reservoirs[key] = Reservoir("|".join(key), SAMPLE_LIMIT - 2)
        reservoirs[key].add((point(observation), observation.source_row))
    test = max(totals, key=lambda candidate: (totals[candidate], candidate))
    device = max((candidate for group, candidate in device_totals if group == test), key=lambda candidate: (device_totals[(test, candidate)], candidate))
    series = []
    source_examples = []
    for kind, label in (("air", "Cold-room air"), ("surface", "Apple surface")):
        bucket = reservoirs.get((test, device, kind))
        if bucket and bucket.count:
            rows = sorted(bucket.sample_values(), key=lambda row: row[0]["t"] or "")
            series.append({"name": label, "count": bucket.count, "points": [row[0] for row in rows]})
            source_examples.extend(row[1] for row in rows[:3])
    return {
        "observationCount": observation_count,
        "quality": {"count": 0, "metrics": [], "examples": []},
        "sample": {
            "kind": "time-series",
            "label": f"Cold-room test {test.upper()} · one paired logger",
            "timeBasis": "UTC timestamps. The displayed points are a deterministic sample of the measured trace; values retain the observed low and high in each series.",
            "group": device,
            "series": series,
            "sourceRows": source_examples[:6],
        },
    }


def build_retail(adapter) -> dict[str, object]:
    rows = list(adapter.iter_observations())
    records = []
    for observation in rows:
        metadata = observation.metadata
        records.append({
            "case": observation.shipment_id,
            "position": observation.sensor_id,
            "meanC": round(observation.temperature_c, 2),
            "humidityPct": round(observation.relative_humidity_pct, 2) if observation.relative_humidity_pct is not None else None,
            "minimumC": metadata.get("minimum_temperature_c"),
            "maximumC": metadata.get("maximum_temperature_c"),
            "percentAboveSourceLimit": metadata.get("percent_above_source_limit"),
            "sourceRow": observation.source_row,
        })
    records.sort(key=lambda row: (row["meanC"], row["case"], row["position"]), reverse=True)
    return {
        "observationCount": len(rows),
        "quality": {"count": 0, "metrics": [], "examples": []},
        "sample": {
            "kind": "aggregate-table",
            "label": "12 case-position summaries with the highest reported mean temperature",
            "timeBasis": "Not a time series: the source does not provide timestamps.",
            "records": records[:12],
        },
    }


def strawberry_entry() -> dict[str, object]:
    verification = json.loads((ROOT / "artifacts" / "data-adapters" / "verification.json").read_text(encoding="utf-8"))
    item = next(row for row in verification if row["dataset_id"] == "strawberry_transport_us_v2026")
    return {
        "id": "strawberry",
        "title": "Strawberry transport · United States",
        "region": "Six observed shipment groups",
        "citation": "Cold-Chain Transportation Strawberry dataset release",
        "url": "https://huggingface.co/datasets/NifferLi/Cold-Chain-Transportation-Strawberry",
        "license": "Apache-2.0 declared by the upstream dataset card",
        "what": "Nine pallet-position temperature readings across six shipments; the release also includes a rule-derived future temperature-risk target.",
        "use": "Already explored above in this Field data view; the separate Evaluation Lab compares a classifier with a temperature rule.",
        "limit": "The future target is a weak temperature-state label, not measured spoilage, food quality, safety, or RSL.",
        "observationCount": item["observations"],
        "qualityCount": item["quality_measurements"],
        "sample": {"kind": "existing-view", "label": "Open the observed strawberry shipment traces above."},
    }


def main() -> None:
    adapters = adapter_catalog(ROOT)
    builders = {"mango": build_mango, "milk": build_milk, "apple": build_apple, "retail": build_retail}
    entries = []
    for name, builder in builders.items():
        result = builder(adapters[name])
        entries.append({
            "id": name,
            **SOURCES[name],
            "observationCount": result["observationCount"],
            "qualityCount": result["quality"]["count"],
            "quality": result["quality"],
            "sample": result["sample"],
        })
    entries.append(strawberry_entry())
    entries.sort(key=lambda row: (0 if row["id"] == "strawberry" else 1, row["title"]))
    payload = {
        "generatedAt": date.today().isoformat(),
        "provenance": "Samples exported by the project’s Pydantic-validated dataset adapters from local upstream downloads.",
        "displayLimitPerSeries": SAMPLE_LIMIT,
        "datasets": entries,
        "notice": "Measured source data shown as examples; these samples do not train the dashboard RSL model, establish food safety, or prove operational accuracy.",
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT.relative_to(ROOT)} ({OUTPUT.stat().st_size:,} bytes) for {len(entries)} dataset sources.")
    for entry in entries:
        sample = entry.get("sample", {})
        point_count = sum(len(series["points"]) for series in sample.get("series", []))
        print(f"{entry['id']}: {entry['observationCount']:,} observations, {entry['qualityCount']:,} quality measurements, {point_count:,} plotted points")


if __name__ == "__main__":
    main()
