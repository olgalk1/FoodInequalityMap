# Food Inequality Score — Shoreditch & Brick Lane

A weighted factor model of food inequality across the 64 Middle Layer Super Output Areas
(MSOAs) of Hackney and Tower Hamlets, with an interactive map for exploring how the score
responds to changes in the weighting.

The point of the instrument is methodological. The food-justice literature this project sits
in argues about distribution, entitlement, class and recognition largely without area-level
measurement. This model makes those arguments into something a map can be wrong about, and
makes every judgement in it adjustable and exportable.

## The score

```
FIS_a = Σ_d  w_d · ( Σ_{i ∈ d}  v_i · n( x_ia · s_i ) )
```

- `w_d` — domain weights, rescaled to sum to 1
- `v_i` — within-domain indicator weights, rescaled to sum to 1
- `s_i` — indicator direction, +1 or −1, so a higher normalised value always means more
  food inequality
- `n` — normalisation across all 64 MSOAs: min–max, percentile rank, or clipped z-score

Default specification, argued for in the methodology chapter:

| Domain | Weight | Indicators |
| --- | --- | --- |
| Income | 40% | Net household income after housing costs (reverse-scored) |
| Class | 25% | Social grade DE 60%, C2+DE 20%, AB 20% (reverse-scored) |
| Deprivation | 25% | Child poverty AHC 50%, social rented 25%, private rented 25% |
| Education | 10% | No qualifications 50%, Level 4+ 50% (reverse-scored) |
| Food environment | 0% | Licensed food outlets /1k 60%, takeaways /1k 40% |

Food environment is off by default so the headline model stays 40/25/25/10. It exists so the
hooks and Rhys-Taylor arguments can be brought in and tested rather than assumed.

### Cultural designation gap

A separate diagnostic, not part of the score:

```
gap_a = normalised licensed-food-outlet density  −  ( 100 − normalised income position )
```

Read as "how far an area's visitor-facing food economy runs ahead of the material position of
the people who live in it". This is the Fraser recognition/distribution split and the hooks
"eating the other" claim expressed as a single number, and it is the main empirical
contribution of the dataset.

## Data

Everything MSOA-level in the model comes from `method data.xlsx` except two supplements that
the workbook only holds for the two study sites, which are fetched from public APIs:

| Indicator | Source | Geography |
| --- | --- | --- |
| Approximated social grade AB/C1/C2/DE | Nomis SG002, Census 2021 | MSOA (workbook) |
| Net annual income after housing costs | ONS small area income estimates, FYE 2023 | MSOA (workbook) |
| Tenure: owned / social / private rented | Census 2021 TS054 | MSOA (workbook) |
| Food outlet counts, SIC 56101/56102/56103/56301/56302 | ONS UK Business Counts 2025 | MSOA (workbook) |
| Children in relative low income families, AHC and BHC | DWP Stat-Xplore, FYE 2022–2025 | Ward (workbook), apportioned |
| Borough median and mean pay, monthly | Workbook income sheet | Borough (context only) |
| Highest level of qualification | Nomis TS067, Census 2021 | MSOA (fetched) |
| MSOA 2021 boundaries; ward 2024 boundaries | ONS Open Geography Portal | fetched |
| Neighbourhood names | House of Commons Library MSOA names v2.2 | fetched |

Study sites: **Shoreditch** is `E02007111` (Hackney 033); **Brick Lane North** is `E02000872`
(Tower Hamlets 009). **Spitalfields**, `E02000878`, is where the Banglatown restaurant strip
mostly falls, so it is worth selecting alongside them.

### Ward to MSOA apportionment

DWP publishes child poverty by ward, and wards do not nest inside MSOAs. For each
ward–MSOA pair the ETL takes the share of the ward's area falling inside the MSOA, splits the
ward's poor-child count and its implied child population by that share, and recombines them
into an MSOA rate. Area weighting rather than population weighting is the main known source of
error in the deprivation domain.

## Running it

The Next.js app is at the repository root. The dataset it needs (`public/data/*.json`) is
committed, so it builds and runs without Python.

```bash
npm install
npm run dev        # http://localhost:3000
```

`npm run build` is a fully static export with no server-side dependencies.

### Deploy (Vercel / v0)

Import the repository as-is — no configuration. Framework auto-detects as Next.js, build
`next build`, no environment variables, root directory is the repo root.

### Rebuilding the dataset (only if `research/method data.xlsx` changes)

```bash
cd research/etl
python3 -m pip install -r requirements.txt
python3 fetch_geo.py        # boundaries + qualifications, cached in research/etl/data/raw
python3 build_dataset.py    # rewrites public/data/{areas,msoa.geojson,context}.json
```

`build_dataset.py` prints a summary for the two study sites and a missing-value report; there
should be no missing values across the 64 areas.

## Using the interface

The page is a single white column: a fixed map, four weight-sensitivity sub-plots, and the
scored data table.

- **Specification bar** — literature presets, the normalisation toggle (min–max / percentile /
  z-score), reset, and a disclosure for the within-domain indicator weights. Entered weights
  are rescaled to 100. Pinned areas (up to four) show as chips.
- **Map** — a static SVG choropleth of the score at the **baseline specification**
  (40/25/25/10, min–max). It never moves when the sliders do — it is the reference. Shaded in
  equal-count quantile bands (ColorBrewer YlOrRd) so all 64 areas stay distinguishable. Click
  an area to pin it. Exports as SVG or PNG.
- **Sub-plots** — one per domain, each with its own domain selector and weight slider. Each
  sweeps that domain's weight 0 → 100% holding the others in ratio, and draws, per pinned
  area, a faint dashed *baseline* curve and a solid *current* curve, with a marker at the live
  weight. Dragging any slider recomputes every sub-plot and the table; the map stays fixed.
  Per-panel PNG and CSV export.
- **Data table** — the 64 scored areas under the current specification: FIS and its change
  against baseline, the five domain sub-scores, key raw indicators, and the designation gap.
  Sortable by any column, rows pin areas. The header strip carries the effective weights,
  normalisation mode, and Spearman ρ against both the equal-weight and baseline
  specifications. **Export scored CSV** writes scores, ranks, sub-scores, contributions, and
  raw and normalised indicator values, with the full spec in header comments.
- **Methodology** — the formula, the domain definitions with sources, and the author-by-author
  mapping of position, gap, and what the model adds.

## Repository layout

```
/                         Next.js app (repository root — deploy target)
  src/app/                page, layout, global styles
  src/components/         Dashboard, MapPanel, SubPlots, DataTable, MethodDrawer
  src/lib/model.ts        scoring engine, weight sweep, rank correlation
  src/lib/indicators.ts   domain and indicator definitions, presets
  src/lib/literature.ts   author-by-author gap mapping
  src/lib/format.ts       score palette and quantile shading
  src/lib/projection.ts   geojson → SVG projection for the map
  src/lib/exporters.ts    CSV / SVG / PNG download helpers
  public/data/            generated dataset consumed by the app (committed)

research/                 not deployed — how the dataset is produced
  method data.xlsx        source workbook
  etl/fetch_geo.py        boundaries, qualifications, neighbourhood names
  etl/build_dataset.py    workbook parsing, apportionment, dataset assembly
  etl/data/raw/           cached downloads
```

## Known limits

- Business counts are rounded to the nearest five at source, so outlet densities in
  small-population MSOAs are coarse.
- Income is a modelled ONS estimate; the published confidence interval is carried in
  `areas.json` but is not currently shown as error bars.
- Approximated social grade is derived from occupation, not self-reported.
- The score is a comparative instrument within this study area. It is normalised against
  these 64 neighbourhoods and is not an absolute measure transferable elsewhere.
