# External measured datasets

These files are downloaded by `scripts/download_open_datasets.py`. The raw data keep their upstream licenses; the project MIT license does not replace those terms.

| Local folder | Source and persistent identifier | Upstream terms | Included material |
|---|---|---|---|
| `mango-air-cargo/` | Paviet-Salomon et al., *Dataset of Air Cargo Supply Chain and Fruit Quality*, [doi:10.57745/F9UJGQ](https://doi.org/10.57745/F9UJGQ) | CC BY-NC-SA 4.0 stated by the repository; research/science-fair use only unless commercial permission is obtained | Complete source archive; the adapter reads measured thermal and quality tables and ignores photos/derived plots |
| `bulk-milk-tank/` | Cantarero Navarro et al., *Dataset on Bulk Milk Tank Performance*, [doi:10.17632/2sw758pw38.2](https://doi.org/10.17632/2sw758pw38.2) | CC BY 4.0 | Tank temperature probe CSV files plus laboratory and weather tables; IMU files excluded |
| `apple-cold-storage/` | Jedermann et al., *Air, surface and dew point temperature under high humidity conditions during commercial cold storage of apples*, [doi:10.17632/h4sghvyjyt.2](https://doi.org/10.17632/h4sghvyjyt.2) | CC BY 4.0 | Complete 16.4 MB source archive |
| `retail-produce-cases/` | Monge et al., *Temperature profiling of open- and closed-doored produce cases in retail grocery stores*, [doi:10.17632/vdt2n9sygc.1](https://doi.org/10.17632/vdt2n9sygc.1) | CC BY 4.0 | Published workbook of case-position aggregates |

The strawberry transportation files remain under `data/public-strawberry/` because the app already used that release. Its upstream card declares Apache-2.0 and its notice is stored beside the data.

`manifest.json` records the downloaded files, byte sizes, and SHA-256 hashes. Run the downloader again to verify expected sizes and refresh the manifest. Raw downloads are excluded from Git by default; this README, the manifest, adapters, and citations are intended to be committed.

