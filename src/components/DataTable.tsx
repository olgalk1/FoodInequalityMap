"use client";

import { useMemo, useState } from "react";

import { DOMAINS } from "@/lib/indicators";
import { quantileColour } from "@/lib/format";
import { downloadCsv } from "@/lib/exporters";
import { rankCorrelation, assemble } from "@/lib/model";
import type { ModelResult } from "@/lib/model";
import type { Area, Weights } from "@/lib/types";
import { PRESETS } from "@/lib/indicators";

interface Props {
  areas: Area[];
  model: ModelResult;
  baseModel: ModelResult;
  weights: Weights;
  preset: string;
  selected: string[];
  onSelect: (code: string) => void;
  hovered: string | null;
  onHover: (code: string | null) => void;
}

interface Col {
  key: string;
  label: string;
  group?: string;
  get: (s: ModelResult["scored"][number]) => number | string;
  fmt?: (v: number) => string;
  align?: "left" | "right";
  /** shown in the "Map data" view (the four domains that drive the map); all columns show in "All data" */
  core?: boolean;
}

const num = (a: Area, k: string) => (typeof a[k] === "number" ? (a[k] as number) : NaN);

const COLS: Col[] = [
  { key: "rank", label: "#", get: (s) => s.rank, align: "left", core: true },
  { key: "name", label: "Neighbourhood", get: (s) => s.area.name, align: "left", core: true },
  { key: "la", label: "Borough", get: (s) => s.area.localAuthority, align: "left", core: true },
  {
    key: "fis",
    label: "FIS",
    group: "score",
    get: (s) => s.score,
    fmt: (v) => v.toFixed(1),
    core: true,
  },
  {
    key: "income_sub",
    label: "Income idx",
    group: "domain index 0–100 · 100 = most food-inequality-prone (reverse-scored indicators already flipped)",
    get: (s) => s.domain.income,
    fmt: (v) => v.toFixed(0),
    core: true,
  },
  {
    key: "class_sub",
    label: "Class idx",
    group: "domain index 0–100 · 100 = most food-inequality-prone (reverse-scored indicators already flipped)",
    get: (s) => s.domain.class,
    fmt: (v) => v.toFixed(0),
    core: true,
  },
  {
    key: "dep_sub",
    label: "Deprivation idx",
    group: "domain index 0–100 · 100 = most food-inequality-prone (reverse-scored indicators already flipped)",
    get: (s) => s.domain.deprivation,
    fmt: (v) => v.toFixed(0),
    core: true,
  },
  {
    key: "edu_sub",
    label: "Education idx",
    group:
      "domain index 0–100 · 100 = most food-inequality-prone. Reverse-scored: a high graduate share pushes this DOWN, so a highly-educated area like Shoreditch scores near 0.",
    get: (s) => s.domain.education,
    fmt: (v) => v.toFixed(0),
    core: true,
  },
  {
    key: "food_sub",
    label: "Food env. idx",
    group: "domain index 0–100 · 100 = most food-inequality-prone (reverse-scored indicators already flipped)",
    get: (s) => s.domain.foodEnvironment,
    fmt: (v) => v.toFixed(0),
  },
  {
    key: "income_ahc",
    label: "Income AHC",
    group: "raw input · Income domain",
    get: (s) => num(s.area as Area, "income_ahc"),
    fmt: (v) => `£${Math.round(v).toLocaleString("en-GB")}`,
    core: true,
  },
  {
    key: "class_de_pct",
    label: "DE %",
    group: "raw input · Class domain",
    get: (s) => num(s.area as Area, "class_de_pct"),
    fmt: (v) => v.toFixed(1),
    core: true,
  },
  {
    key: "child_poverty_ahc_pct",
    label: "Child pov AHC %",
    group: "raw input · Deprivation domain",
    get: (s) => num(s.area as Area, "child_poverty_ahc_pct"),
    fmt: (v) => v.toFixed(1),
    core: true,
  },
  {
    key: "no_quals_pct",
    label: "No quals %",
    group: "raw input · Education domain · Census 2021 TS067, 16+",
    get: (s) => num(s.area as Area, "no_quals_pct"),
    fmt: (v) => v.toFixed(1),
    core: true,
  },
  {
    key: "level4plus_pct",
    label: "Level 4+ %",
    group: "raw indicators · Census 2021 TS067, 16+ (graduate share)",
    get: (s) => num(s.area as Area, "level4plus_pct"),
    fmt: (v) => v.toFixed(1),
  },
  {
    key: "cultural_food_density",
    label: "Licensed food /1k",
    group: "raw indicators",
    get: (s) => num(s.area as Area, "cultural_food_density"),
    fmt: (v) => v.toFixed(1),
  },
  {
    key: "gap",
    label: "Designation gap",
    group: "diagnostic",
    get: (s) => s.designationGap,
    fmt: (v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}`,
  },
];

export default function DataTable({
  areas,
  model,
  baseModel,
  weights,
  preset,
  selected,
  onSelect,
  hovered,
  onHover,
}: Props) {
  const presetLabel = (PRESETS.find((p) => p.id === preset) ?? PRESETS[0]).label;
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "rank", dir: 1 });
  const [view, setView] = useState<"map" | "all">("map");
  const cols = view === "all" ? COLS : COLS.filter((c) => c.core);

  const sortedScores = useMemo(
    () =>
      model.scored
        .filter(Boolean)
        .map((s) => s.score)
        .sort((a, b) => a - b),
    [model],
  );

  const rows = useMemo(() => {
    const list = model.scored.filter(Boolean);
    const col = COLS.find((c) => c.key === sort.key) ?? COLS[0];
    return [...list].sort((a, b) => {
      const va = col.get(a);
      const vb = col.get(b);
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb)) * sort.dir;
      }
      return (va - vb) * sort.dir;
    });
  }, [model, sort]);

  const equalModel = useMemo(
    () =>
      assemble(
        areas,
        { ...weights, domains: { income: 25, class: 25, deprivation: 25, education: 25, foodEnvironment: 0 } },
        model.normalised,
      ),
    [areas, weights, model.normalised],
  );

  const rhoEqual = rankCorrelation(model.scored.filter(Boolean), equalModel.scored.filter(Boolean));
  const rhoBaseline = rankCorrelation(
    model.scored.filter(Boolean),
    baseModel.scored.filter(Boolean),
  );

  const eff = model.effectiveDomainWeights;

  const exportFullCsv = () => {
    const indicatorKeys = DOMAINS.flatMap((d) => d.indicators.map((i) => i.key));
    const header = [
      "msoa_code",
      "neighbourhood",
      "msoa_name",
      "local_authority",
      "is_study_site",
      "fis_current",
      "fis_baseline",
      "rank_current",
      "rank_baseline",
      "quintile",
      "designation_gap",
      ...DOMAINS.map((d) => `domain_${d.key}`),
      ...DOMAINS.map((d) => `contribution_${d.key}`),
      ...indicatorKeys.map((k) => `raw_${k}`),
      ...indicatorKeys.map((k) => `norm_${k}`),
    ];
    const body = model.scored
      .filter(Boolean)
      .sort((a, b) => a.rank - b.rank)
      .map((s) => {
        const a = s.area as Area;
        const bm = baseModel.byCode[s.area.code];
        return [
          s.area.code,
          s.area.name,
          s.area.msoaName,
          s.area.localAuthority,
          s.area.isStudyArea ? 1 : 0,
          s.score.toFixed(3),
          bm ? bm.score.toFixed(3) : "",
          s.rank,
          bm ? bm.rank : "",
          s.quintile,
          s.designationGap.toFixed(3),
          ...DOMAINS.map((d) => s.domain[d.key].toFixed(3)),
          ...DOMAINS.map((d) => s.contribution[d.key].toFixed(3)),
          ...indicatorKeys.map((k) => (typeof a[k] === "number" ? (a[k] as number) : "")),
          ...indicatorKeys.map((k) => s.indicator[k].toFixed(3)),
        ];
      });
    const spec = [
      ["# Food Inequality Score — scored dataset export"],
      [`# specification: ${presetLabel}`],
      [`# normalisation: min-max across the 64 MSOAs`],
      [
        `# effective domain weights: ${DOMAINS.map(
          (d) => `${d.key}=${eff[d.key].toFixed(2)}`,
        ).join(" ")}`,
      ],
      [
        `# within-domain weights: ${DOMAINS.flatMap((d) =>
          d.indicators.map((i) => `${i.key}=${weights.indicators[i.key] ?? 0}`),
        ).join(" ")}`,
      ],
      [`# Spearman rho vs equal-weight: ${rhoEqual.toFixed(4)}; vs baseline: ${rhoBaseline.toFixed(4)}`],
    ];
    downloadCsv([...spec, header, ...body], "food-inequality-scored.csv");
  };

  const th = (c: Col) => {
    const activeSort = sort.key === c.key;
    return (
      <th
        key={c.key}
        onClick={() =>
          setSort((s) =>
            s.key === c.key ? { key: c.key, dir: (s.dir * -1) as 1 | -1 } : { key: c.key, dir: c.key === "name" || c.key === "la" ? 1 : -1 },
          )
        }
        className={`cursor-pointer whitespace-nowrap px-2 py-1.5 font-medium select-none ${
          c.align === "left" ? "text-left" : "text-right"
        } ${activeSort ? "text-text" : "text-muted"} hover:text-text`}
        title={c.group ? `${c.group} — click to sort` : "Click to sort"}
      >
        {c.label}
        {activeSort ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
      </th>
    );
  };

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-[13px] font-semibold tracking-tight">Scored dataset</h2>
          <p className="text-[11px] text-muted">
            The numbers behind the map ({presetLabel}); Δ is against baseline. Click a row to pin, a
            column to sort.
          </p>
        </div>
        <div className="no-print ml-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-line text-[11px]">
            {(
              [
                ["map", "Map data"],
                ["all", "All data"],
              ] as const
            ).map(([id, lbl]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                title={
                  id === "map"
                    ? "Just the four domains that drive the map, with their headline raw inputs"
                    : "Every column: food environment, all raw indicators, designation gap"
                }
                className={`px-2.5 py-1.5 font-medium transition ${
                  view === id
                    ? "bg-text text-white"
                    : "bg-white text-muted hover:text-text"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
          <button
            onClick={exportFullCsv}
            className="rounded-md border border-line px-3 py-1.5 text-[11px] font-medium text-text transition hover:border-line-strong"
          >
            Export scored CSV
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-x-5 gap-y-1.5 border-b border-line bg-panel2 px-4 py-2.5 text-[10.5px] text-muted">
        <span>
          Effective weights:{" "}
          {DOMAINS.map((d) => (
            <span key={d.key} className="tabular">
              <span
                className="mx-0.5 inline-block h-2 w-2 rounded-full align-middle"
                style={{ background: d.colour }}
              />
              {d.label} {eff[d.key].toFixed(1)}%{"  "}
            </span>
          ))}
        </span>
        <span className="tabular">min–max normalised</span>
        <span className="tabular">ρ vs equal {rhoEqual.toFixed(3)}</span>
        <span className="tabular">ρ vs baseline {rhoBaseline.toFixed(3)}</span>
        <span>&ldquo;idx&rdquo; = 0–100 domain index (100 = most deprived); &ldquo;%&rdquo; / &ldquo;£&rdquo; = raw values</span>
      </div>

      <div className="max-h-[520px] overflow-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_var(--line)]">
            <tr>{cols.map(th)}</tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const active = selected.includes(s.area.code) || hovered === s.area.code;
              const bm = baseModel.byCode[s.area.code];
              return (
                <tr
                  key={s.area.code}
                  onClick={() => onSelect(s.area.code)}
                  onMouseEnter={() => onHover(s.area.code)}
                  onMouseLeave={() => onHover(null)}
                  className={`cursor-pointer border-t border-line transition ${
                    active ? "bg-accent-soft" : "hover:bg-panel2"
                  }`}
                >
                  {cols.map((c) => {
                    const v = c.get(s);
                    const display =
                      typeof v === "number" ? (c.fmt ? c.fmt(v) : String(v)) : v;
                    if (c.key === "name") {
                      return (
                        <td key={c.key} className="whitespace-nowrap px-2 py-1.5">
                          <span
                            className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle"
                            style={{ background: quantileColour(s.score, sortedScores) }}
                          />
                          {s.area.name}
                          {s.area.isStudyArea && (
                            <span className="ml-1.5 text-[9px] font-medium uppercase tracking-wide text-accent">
                              site
                            </span>
                          )}
                        </td>
                      );
                    }
                    if (c.key === "fis") {
                      const delta = bm ? s.score - bm.score : 0;
                      return (
                        <td key={c.key} className="tabular whitespace-nowrap px-2 py-1.5 text-right font-semibold">
                          {display}
                          <span className="ml-1 text-[9.5px] font-normal text-muted">
                            {bm ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}` : ""}
                          </span>
                        </td>
                      );
                    }
                    return (
                      <td
                        key={c.key}
                        className={`tabular whitespace-nowrap px-2 py-1.5 ${
                          c.align === "left" ? "text-left" : "text-right"
                        } ${c.group?.startsWith("domain") || c.key === "rank" || c.key === "la" ? "text-muted" : ""}`}
                      >
                        {display}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
