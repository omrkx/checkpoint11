"""Download the measured tables used by the open-data adapter suite.

Run from the repository root. Existing files with the expected size are kept.
Large photos, rendered plots, and milk IMU files are intentionally excluded.
"""

from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import json
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "external"
MENDELEY_ACCEPT = "application/vnd.mendeley-public-dataset.1+json"


def read_json(url: str, accept: str = "application/json") -> object:
    request = Request(url, headers={"Accept": accept, "User-Agent": "ColdChain-Guardian/0.3"})
    with urlopen(request, timeout=60) as response:
        return json.load(response)


def download(url: str, target: Path, expected_size: int | None = None) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and (expected_size is None or target.stat().st_size == expected_size):
        return target
    request = Request(url, headers={"User-Agent": "ColdChain-Guardian/0.3"})
    with urlopen(request, timeout=180) as response, target.open("wb") as handle:
        while chunk := response.read(1024 * 1024):
            handle.write(chunk)
    if expected_size is not None and target.stat().st_size != expected_size:
        raise RuntimeError(f"Size mismatch for {target}")
    return target


def mendeley_files(dataset: str, version: int, folder: str = "root") -> list[dict]:
    url = (
        f"https://data.mendeley.com/public-api/datasets/{dataset}/files"
        f"?folder_id={folder}&version={version}&$start=0&$limit=1000"
    )
    return read_json(url, MENDELEY_ACCEPT)  # type: ignore[return-value]


def file_hash(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    downloads: list[tuple[str, Path, int | None]] = [
        (
            "https://entrepot.recherche.data.gouv.fr/api/access/dataset/:persistentId/?persistentId=doi:10.57745/F9UJGQ",
            DATA / "mango-air-cargo" / "mango-air-cargo-complete.zip",
            None,
        ),
        (
            "https://data.mendeley.com/public-files/datasets/h4sghvyjyt/files/b96006a8-8f7b-4179-8748-4ad9171e35c5/file_downloaded",
            DATA / "apple-cold-storage" / "TTH_ColdRoom_June19.zip",
            16_381_850,
        ),
        (
            "https://data.mendeley.com/public-files/datasets/vdt2n9sygc/files/3dfa216c-baa1-41a8-9746-c8dfe05c7110/file_downloaded",
            DATA / "retail-produce-cases" / "retail data FC.xlsx",
            36_684,
        ),
    ]

    milk_root = DATA / "bulk-milk-tank"
    for item in mendeley_files("2sw758pw38", 2):
        details = item["content_details"]
        downloads.append((details["download_url"], milk_root / item["filename"], details["size"]))
    tank_folder = "2d587a8f-d8d0-4d45-920c-cb8f9781c23c"
    for item in mendeley_files("2sw758pw38", 2, tank_folder):
        details = item["content_details"]
        downloads.append((
            details["download_url"],
            milk_root / "tank_temperature_probes" / item["filename"],
            details["size"],
        ))

    with ThreadPoolExecutor(max_workers=8) as executor:
        paths = list(executor.map(lambda item: download(*item), downloads))

    strawberry = ROOT / "data" / "public-strawberry" / "benchmark.json.gz"
    if not strawberry.exists():
        raise FileNotFoundError("Run scripts/prepare_public_strawberry.py first")
    paths.append(strawberry)

    manifest = {
        "generated_by": "scripts/download_open_datasets.py",
        "files": [
            {
                "path": str(path.relative_to(ROOT)).replace("\\", "/"),
                "bytes": path.stat().st_size,
                "sha256": file_hash(path),
            }
            for path in sorted(paths)
        ],
    }
    manifest_path = DATA / "manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"downloaded_or_verified": len(paths), "manifest": str(manifest_path)}, indent=2))


if __name__ == "__main__":
    main()

