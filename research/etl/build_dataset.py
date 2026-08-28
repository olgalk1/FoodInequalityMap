"""Build the Food Inequality Score modelling dataset.

Reads `method data.xlsx` (plus two fetched supplements) and writes raw,
un-normalised indicators for every MSOA in Hackney and Tower Hamlets.
Normalisation and weighting deliberately happen in the browser so that the
weights stay live and auditable.

Outputs into web/public/data:
  areas.json     raw indicator values per MSOA
  msoa.geojson   simplified boundary geometry keyed on MSOA code
  context.json   borough-level pay time series and study-area reference points
  meta.json      indicator definitions, sources, default weights
"""

from __future__ import annotations

import json
import math
import pathlib
import ssl
import urllib.parse
import urllib.request

import certifi
import pandas as pd
from shapely.geometry import shape
from shapely.ops import transform

HERE = pathlib.Path(__file__).parent          # research/etl
RESEARCH = HERE.parent                         # research
REPO = RESEARCH.parent                          # repo root (the Next.js app)
RAW = HERE / "data" / "raw"
OUT = REPO / "public" / "data"
WORKBOOK = RESEARCH / "method data.xlsx"
SSL_CTX = ssl.create_default_context(cafile=certifi.where())

STUDY_AREAS = {"E02007111": "Shoreditch", "E02000872": "Brick Lane North"}

FOOD_INDUSTRIES = {
    "56101": "licensed_restaurants",
    "56102": "unlicensed_restaurants_cafes",
    "56103": "takeaways",
    "56301": "licensed_clubs",
    "56302": "pubs_bars",
}


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def num(v) -> float | None:
    """Coerce a workbook cell to a number, tolerating spaces and commas."""
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(",", "").replace(" ", "").replace("£", "")
    if s in ("", "-", "—", ":", "nan"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def msoa_code(area_label) -> str | None:
    """'msoa2021:E02000345 : Hackney 001' -> 'E02000345'."""
    s = str(area_label)
    if not s.startswith("msoa2021:"):
        return None
    return s.split(":")[1].strip()


def pct(part: float | None, whole: float | None) -> float | None:
    if part is None or not whole:
        return None
    return 100.0 * part / whole


def equal_area(geom):
    """Project WGS84 degrees to a local equal-area-ish plane (metres).

    Only area *ratios* matter here, so a cosine-corrected plane centred on
    the study area is accurate to well under a percent at this extent.
    """
    lat0 = math.radians(51.53)
    k = 111_320.0

    def fn(x, y):
        return (x * k * math.cos(lat0), y * k)

    return transform(fn, geom)


# --------------------------------------------------------------------------
# workbook readers
# --------------------------------------------------------------------------
def read_social_grade(xl: pd.ExcelFile) -> pd.DataFrame:
    df = xl.parse("class - social grade", header=None)
    header_row = df.index[df[0].astype(str).str.strip() == "Area"][0]
    rows = []
    for _, r in df.iloc[header_row + 1 :].iterrows():
        code = msoa_code(r[0])
        if not code:
            continue
        total, ab, c1, c2, de = (num(r[i]) for i in range(1, 6))
        rows.append(
            {
                "code": code,
                "population_in_households": total,
                "class_ab_pct": pct(ab, total),
                "class_c1_pct": pct(c1, total),
                "class_c2_pct": pct(c2, total),
                "class_de_pct": pct(de, total),
                "class_c2de_pct": pct((c2 or 0) + (de or 0), total),
            }
        )
    return pd.DataFrame(rows).set_index("code")


def read_income(xl: pd.ExcelFile) -> pd.DataFrame:
    df = xl.parse("net income after housing costs", header=None)
    header_row = df.index[df[0].astype(str).str.strip() == "MSOA code"][0]
    rows = []
    for _, r in df.iloc[header_row + 1 :].iterrows():
        code = str(r[0]).strip()
        if not code.startswith("E020"):
            continue
        rows.append(
            {
                "code": code,
                "income_ahc": num(r[6]),
                "income_ahc_ci_lower": num(r[8]),
                "income_ahc_ci_upper": num(r[7]),
            }
        )
    return pd.DataFrame(rows).set_index("code")


def read_tenure(xl: pd.ExcelFile) -> pd.DataFrame:
    df = xl.parse("tenure", header=None)
    header_row = df.index[df[0].astype(str).str.strip() == "MSOA code"][0]
    rows = []
    for _, r in df.iloc[header_row + 1 :].iterrows():
        code = str(r[0]).strip()
        if not code.startswith("E020"):
            continue
        households = num(r[3])
        rows.append(
            {
                "code": code,
                "households": households,
                "owned_pct": pct(num(r[4]), households),
                "social_rent_pct": pct(num(r[5]), households),
                "private_rent_pct": pct(num(r[6]), households),
            }
        )
    return pd.DataFrame(rows).set_index("code")


def read_business_counts(xl: pd.ExcelFile) -> pd.DataFrame:
    """The sheet stacks one Nomis table per SIC food industry."""
    df = xl.parse("uk business counts", header=None)
    industry_rows = df.index[df[0].astype(str).str.startswith("Industry")].tolist()
    counts: dict[str, dict[str, float]] = {}
    for start in industry_rows:
        sic = str(df.at[start, 1]).split(":")[0].strip()
        column = FOOD_INDUSTRIES.get(sic)
        if column is None:
            continue
        for _, r in df.iloc[start:].iterrows():
            code = msoa_code(r[0])
            if code is None:
                if str(r[0]).startswith("Industry") and r.name != start:
                    break
                continue
            counts.setdefault(code, {})[column] = num(r[1]) or 0.0

    rows = []
    for code, vals in counts.items():
        row = {"code": code, **{c: vals.get(c, 0.0) for c in FOOD_INDUSTRIES.values()}}
        row["food_outlets_total"] = sum(row[c] for c in FOOD_INDUSTRIES.values())
        rows.append(row)
    return pd.DataFrame(rows).set_index("code")


def read_child_poverty_wards(xl: pd.ExcelFile) -> pd.DataFrame:
    """DWP children in relative low income families, ward level.

    AHC is the headline measure; BHC gives the 2022-2025 trend.
    """
    ahc = xl.parse("deprivation low income fam ahc", header=None)
    h = ahc.index[ahc[0].astype(str).str.startswith("Local Authority")][0]
    ahc_rows = {}
    for _, r in ahc.iloc[h + 1 :].iterrows():
        ward = str(r[3]).strip()
        if not ward.startswith("E05"):
            continue
        ahc_rows[ward] = {
            "ward_code": ward,
            "ward_name": str(r[2]).strip(),
            "local_authority": str(r[0]).strip(),
            "children_ahc_2025": num(r[5]),
            "child_poverty_ahc_pct": (num(r[7]) or 0) * 100,
        }

    bhc = xl.parse("deprivation low income fam bhc", header=None)
    h = bhc.index[bhc[0].astype(str).str.startswith("Local Authority")][0]
    for _, r in bhc.iloc[h + 1 :].iterrows():
        ward = str(r[3]).strip()
        if ward not in ahc_rows:
            continue
        ahc_rows[ward].update(
            {
                "child_poverty_bhc_pct": (num(r[11]) or 0) * 100,
                "child_poverty_bhc_pct_2022": (num(r[8]) or 0) * 100,
            }
        )

    out = pd.DataFrame(ahc_rows.values()).set_index("ward_code")
    # Implied child population under 16, used as the apportionment weight.
    out["child_population"] = out["children_ahc_2025"] / (out["child_poverty_ahc_pct"] / 100)
    return out


def read_alt_class_grade(xl: pd.ExcelFile) -> dict:
    """Borough-level approximated social grade from the two breakdown sheets.

    SG006 (by ethnic group) and SG013 (by sex by age) are published only to
    local-authority level, so there is no MSOA figure. We take the Hackney and
    Tower Hamlets totals for each grade and turn them into shares; the app
    applies each borough's shares to every MSOA in that borough as a
    class-measure substitution check.
    """
    grades = ("Total", "AB", "C1", "C2", "DE")

    def parse(sheet: str) -> dict:
        df = xl.parse(sheet, header=None)
        out: dict[str, dict[str, float]] = {}
        grade = None
        sex = "All persons"
        for _, r in df.iterrows():
            key = str(r[0]).strip()
            val = str(r[1]).strip()
            if key == "approximated social grade":
                grade = next((g for g in grades if val.startswith(g)), None)
            elif key == "sex":
                sex = val
            elif key.startswith(("ladu2023:", "lacu2023:")) and grade and sex == "All persons":
                borough = key.split(":", 1)[1].strip()
                if borough in ("Hackney", "Tower Hamlets"):
                    out.setdefault(borough, {})[grade] = num(r[1]) or 0.0
        result = {}
        for borough, g in out.items():
            total = g.get("Total") or sum(g.get(k, 0) for k in ("AB", "C1", "C2", "DE"))
            result[borough] = {
                "class_ab_pct": pct(g.get("AB"), total),
                "class_c2_pct": pct(g.get("C2"), total),
                "class_de_pct": pct(g.get("DE"), total),
                "class_c2de_pct": pct((g.get("C2") or 0) + (g.get("DE") or 0), total),
                "population_in_households": total,
            }
        return result

    return {
        "note": (
            "ONS approximated social grade is published only to local-authority level for "
            "these two breakdowns. Each borough figure is applied to every MSOA in that "
            "borough. Shoreditch = Hackney 033 (E02007111); Brick Lane North = "
            "Tower Hamlets 009 (E02000872)."
        ),
        "ethnicGroup": {
            "source": "Nomis SG006 approximated social grade by ethnic group, Census 2021",
            **parse("social grade ethnic group"),
        },
        "sexAge": {
            "source": "Nomis SG013 approximated social grade by sex by age (all persons), Census 2021",
            **parse("social grad w sex and age"),
        },
    }


def read_borough_pay(xl: pd.ExcelFile) -> list[dict]:
    df = xl.parse("income ", header=None)
    header_row = df.index[df[0].astype(str).str.strip() == "Date"][0]
    series = []
    for _, r in df.iloc[header_row + 1 :].iterrows():
        date = str(r[0]).strip()
        if date in ("nan", ""):
            continue
        series.append(
            {
                "date": date,
                "median_hackney_newham": num(r[1]),
                "median_tower_hamlets": num(r[2]),
                "mean_hackney_newham": num(r[3]),
                "mean_tower_hamlets": num(r[4]),
            }
        )
    return series


# --------------------------------------------------------------------------
# supplements
# --------------------------------------------------------------------------
def fetch_qualifications(codes: list[str]) -> pd.DataFrame:
    """Census 2021 TS067 for exactly the study MSOAs (Nomis, no key needed)."""
    cache = RAW / "qualifications_study_msoas.csv"
    if not cache.exists():
        params = {
            "date": "latest",
            "geography": ",".join(codes),
            "c2021_hiqual_8": "0,1,2,3,4,5,6,7",
            "measures": "20100",
            "select": "geography_code,c2021_hiqual_8_name,obs_value",
        }
        url = "https://www.nomisweb.co.uk/api/v01/dataset/NM_2084_1.data.csv?" + urllib.parse.urlencode(params)
        with urllib.request.urlopen(url, timeout=180, context=SSL_CTX) as r:
            cache.write_bytes(r.read())

    df = pd.read_csv(cache)
    wide = df.pivot_table(
        index="GEOGRAPHY_CODE", columns="C2021_HIQUAL_8_NAME", values="OBS_VALUE", aggfunc="sum"
    )
    total = wide["Total: All usual residents aged 16 years and over"]
    out = pd.DataFrame(index=wide.index)
    out["adults_16plus"] = total
    out["no_quals_pct"] = 100 * wide["No qualifications"] / total
    out["level4plus_pct"] = 100 * wide["Level 4 qualifications or above"] / total
    out["low_quals_pct"] = (
        100
        * (
            wide["No qualifications"]
            + wide["Level 1 and entry level qualifications"]
            + wide["Other qualifications"]
        )
        / total
    )
    out.index.name = "code"
    return out


def msoa_names() -> dict[str, str]:
    cache = RAW / "msoa_names.csv"
    if not cache.exists():
        url = "https://houseofcommonslibrary.github.io/msoanames/MSOA-Names-2.2.csv"
        with urllib.request.urlopen(url, timeout=120, context=SSL_CTX) as r:
            cache.write_bytes(r.read())
    df = pd.read_csv(cache)
    return dict(zip(df["msoa21cd"], df["msoa21hclnm"]))


# --------------------------------------------------------------------------
# ward -> MSOA apportionment
# --------------------------------------------------------------------------
def apportion_child_poverty(wards: pd.DataFrame) -> pd.DataFrame:
    """Convert ward-level child poverty rates onto MSOA geography.

    Wards and MSOAs do not nest. For each ward-MSOA pair we take the share of
    the ward's area falling inside the MSOA, use it to split the ward's child
    population and its poor-child count, then recombine into an MSOA rate.
    """
    msoa_fc = json.loads((RAW / "msoa_boundaries.geojson").read_text())
    ward_fc = json.loads((RAW / "ward_boundaries.geojson").read_text())

    msoa_geoms = {
        f["properties"]["MSOA21CD"]: equal_area(shape(f["geometry"])).buffer(0)
        for f in msoa_fc["features"]
    }
    ward_geoms = {
        f["properties"]["WD24CD"]: equal_area(shape(f["geometry"])).buffer(0)
        for f in ward_fc["features"]
    }

    acc: dict[str, dict[str, float]] = {
        c: {"children": 0.0, "child_pop": 0.0, "children_bhc": 0.0, "children_bhc_2022": 0.0}
        for c in msoa_geoms
    }
    for ward_code, wgeom in ward_geoms.items():
        if ward_code not in wards.index:
            continue
        w = wards.loc[ward_code]
        ward_area = wgeom.area
        if not ward_area:
            continue
        for code, mgeom in msoa_geoms.items():
            if not wgeom.intersects(mgeom):
                continue
            frac = wgeom.intersection(mgeom).area / ward_area
            if frac < 1e-6:
                continue
            pop = w["child_population"] * frac
            acc[code]["child_pop"] += pop
            acc[code]["children"] += pop * w["child_poverty_ahc_pct"] / 100
            acc[code]["children_bhc"] += pop * (w.get("child_poverty_bhc_pct") or 0) / 100
            acc[code]["children_bhc_2022"] += pop * (w.get("child_poverty_bhc_pct_2022") or 0) / 100

    rows = []
    for code, a in acc.items():
        if a["child_pop"] <= 0:
            rows.append({"code": code})
            continue
        rows.append(
            {
                "code": code,
                "child_population_est": a["child_pop"],
                "child_poverty_ahc_pct": 100 * a["children"] / a["child_pop"],
                "child_poverty_bhc_pct": 100 * a["children_bhc"] / a["child_pop"],
                "child_poverty_bhc_pct_2022": 100 * a["children_bhc_2022"] / a["child_pop"],
            }
        )
    return pd.DataFrame(rows).set_index("code")


# --------------------------------------------------------------------------
# assembly
# --------------------------------------------------------------------------
def build() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    xl = pd.ExcelFile(WORKBOOK)

    grade = read_social_grade(xl)
    income = read_income(xl)
    tenure = read_tenure(xl)
    business = read_business_counts(xl)
    wards = read_child_poverty_wards(xl)
    poverty = apportion_child_poverty(wards)
    quals = fetch_qualifications(sorted(grade.index))
    names = msoa_names()

    df = grade.join([income, tenure, business, poverty, quals], how="outer")
    df.index.name = "code"

    # Food-environment densities, per 1,000 residents.
    pop_k = df["population_in_households"] / 1000
    df["takeaway_density"] = (df["takeaways"] + df["unlicensed_restaurants_cafes"]) / pop_k
    df["cultural_food_density"] = (
        df["licensed_restaurants"] + df["pubs_bars"] + df["licensed_clubs"]
    ) / pop_k
    df["food_outlet_density"] = df["food_outlets_total"] / pop_k

    msoa_fc = json.loads((RAW / "msoa_boundaries.geojson").read_text())
    centroids = {
        f["properties"]["MSOA21CD"]: [f["properties"]["LONG"], f["properties"]["LAT"]]
        for f in msoa_fc["features"]
    }

    areas = []
    for code, r in df.iterrows():
        record = {
            "code": code,
            "name": names.get(code, code),
            "msoaName": next(
                (
                    f["properties"]["MSOA21NM"]
                    for f in msoa_fc["features"]
                    if f["properties"]["MSOA21CD"] == code
                ),
                code,
            ),
            "localAuthority": "Hackney" if code in _hackney_codes(msoa_fc) else "Tower Hamlets",
            "isStudyArea": code in STUDY_AREAS,
            "studyLabel": STUDY_AREAS.get(code),
            "centroid": centroids.get(code),
        }
        for key, val in r.items():
            record[key] = None if pd.isna(val) else round(float(val), 4)
        areas.append(record)

    areas.sort(key=lambda a: (a["localAuthority"], a["name"]))
    (OUT / "areas.json").write_text(json.dumps(areas, indent=1))

    geo = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "code": f["properties"]["MSOA21CD"],
                    "name": names.get(f["properties"]["MSOA21CD"], f["properties"]["MSOA21NM"]),
                },
                "geometry": f["geometry"],
            }
            for f in msoa_fc["features"]
        ],
    }
    (OUT / "msoa.geojson").write_text(json.dumps(geo))

    (OUT / "context.json").write_text(
        json.dumps(
            {
                "boroughPay": read_borough_pay(xl),
                "altClassGrade": read_alt_class_grade(xl),
                "wardChildPoverty": json.loads(
                    wards.reset_index().to_json(orient="records")
                ),
                "studyAreas": STUDY_AREAS,
            },
            indent=1,
        )
    )

    print(f"areas: {len(areas)}")
    for code, label in STUDY_AREAS.items():
        r = df.loc[code]
        print(
            f"  {label:18s} income £{r['income_ahc']:,.0f}  DE {r['class_de_pct']:.1f}%  "
            f"childpov(AHC) {r['child_poverty_ahc_pct']:.1f}%  noquals {r['no_quals_pct']:.1f}%  "
            f"cultural food/1k {r['cultural_food_density']:.2f}"
        )
    missing = df.isna().sum()
    print("missing values by column:\n", missing[missing > 0].to_string() or "none")


def _hackney_codes(msoa_fc) -> set[str]:
    return {
        f["properties"]["MSOA21CD"]
        for f in msoa_fc["features"]
        if f["properties"]["MSOA21NM"].startswith("Hackney")
    }


if __name__ == "__main__":
    build()
