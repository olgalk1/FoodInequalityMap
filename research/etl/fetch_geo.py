"""Fetch boundary geometry and the two MSOA-level indicators that the
workbook only supplies for Shoreditch / Brick Lane North.

Outputs (etl/data/raw):
  msoa_boundaries.geojson   MSOA 2021 BGC polygons, Hackney + Tower Hamlets
  ward_boundaries.geojson   Ward Dec 2024 BGC polygons, Hackney + Tower Hamlets
  qualifications_msoa.csv   Census 2021 TS067 highest qualification, all E&W MSOAs
"""

import json
import pathlib
import ssl
import urllib.parse
import urllib.request

import certifi

RAW = pathlib.Path(__file__).parent / "data" / "raw"
RAW.mkdir(parents=True, exist_ok=True)

ARCGIS = "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services"
LADS = ("Hackney", "Tower Hamlets")
SSL_CTX = ssl.create_default_context(cafile=certifi.where())


def get(url: str, params: dict) -> bytes:
    full = f"{url}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(full, timeout=180, context=SSL_CTX) as r:
        return r.read()


def arcgis_query(service: str, where: str) -> dict:
    payload = get(
        f"{ARCGIS}/{service}/FeatureServer/0/query",
        {
            "where": where,
            "outFields": "*",
            "returnGeometry": "true",
            "outSR": 4326,
            "f": "geojson",
        },
    )
    return json.loads(payload)


def fetch_msoa_boundaries() -> None:
    where = " OR ".join(f"MSOA21NM LIKE '{lad}%'" for lad in LADS)
    fc = arcgis_query("Middle_layer_Super_Output_Areas_December_2021_Boundaries_EW_BGC_V3", where)
    print("msoa features:", len(fc["features"]))
    (RAW / "msoa_boundaries.geojson").write_text(json.dumps(fc))


def fetch_ward_boundaries() -> None:
    # Ward layers carry the parent local authority name in LAD24NM.
    where = " OR ".join(f"LAD24NM = '{lad}'" for lad in LADS)
    fc = arcgis_query("Wards_December_2024_Boundaries_UK_BGC", where)
    print("ward features:", len(fc["features"]))
    (RAW / "ward_boundaries.geojson").write_text(json.dumps(fc))


def fetch_qualifications() -> None:
    """Census 2021 TS067 (NM_2084_1), highest level of qualification by MSOA."""
    payload = get(
        "https://www.nomisweb.co.uk/api/v01/dataset/NM_2084_1.data.csv",
        {
            "date": "latest",
            "geography": "TYPE152",  # 2021 MSOAs
            "c2021_hiqual_8": "0,1,2,3,4,5,6,7",
            "measures": "20100",
            "select": "geography_code,geography_name,c2021_hiqual_8_name,obs_value",
        },
    )
    (RAW / "qualifications_msoa.csv").write_bytes(payload)
    print("qualifications rows:", payload.count(b"\n"))


if __name__ == "__main__":
    fetch_msoa_boundaries()
    fetch_ward_boundaries()
    fetch_qualifications()
