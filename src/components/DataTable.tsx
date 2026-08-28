"use client";

import { useMemo, useState } from "react";

import { DOMAINS } from "@/lib/indicators";
import { quantileColour } from "@/lib/format";
import { downloadCsv } from "@/lib/exporters";
import { rankCorrelation, assemble } from "@/lib/model";
import type { ModelResult } from "@/lib/model";
import type { Area, NormMode, Weights } from "@/lib/types";

interface Props {
  areas: Area[];
  model: ModelResult;
  baseModel: ModelResult;
  weights: Weights;
  mode: NormMode;
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
}

const num = (a: Area, k: string) => (typeof a[k] === "number" ? (a[k] as number) : NaN);

const COLS: Col[] = [
  { key: "rank", label: "#", get: (s) => s.rank, align: "left" },
  { key: "name", label: "Neighbourhood", get: (s) => s.area.name, align: "left" },
  { key: "la", label: "Borough", get: (s) => s.area.localAuthority, align: "left" },
  { key: "fis", label: "FIS", group: "score", get: (s) => s.score, fmt: (v) => v.toFixed(1) },
  {
    key: "income_sub",
    label: "Income",
    group: "domain 0–100",
    get: (s) => s.domain.income,
    fmt: (v) => v.toFixed(0),
  },
  {
    key: "class_sub",
    label: "Class",
    group: "domain 0–100",
    get: (s) => s.domain.class,
    fmt: (v) => v.toFixed(0),
  },
  {
    key: "dep_sub",
    label: "Deprivation",
    group: "domain 0–100",
    get: (s) => s.domain.deprivation,
    fmt: (v) => v.toFixed(0),
  },
  {
    key: "edu_sub",
    label: "Education",
    group: "domain 0–100",
    get: (s) => s.domain.education,
    fmt: (v) => v.toFixed(0),
  },
  {
    key: "food_sub",
    label: "Food env.",
    group: "domain 0–100",
    get: (s) => s.domain.foodEnvironment,
    fmt: (v) => v.toFixed(0),
  },
  {
    key: "income_ahc",
    label: "Income AHC",
    group: "raw indicators",
    get: (s) => num(s.area as Area, "income_ahc"),
    fmt: (v) => `£${Math.round(v).toLocaleString("en-GB")}`,
  },
  {
    key: "class_de_pct",
    label: "DE %",
    group: "raw indicators",
    get: (s) => num(s.area as Area, "class_de_pct"),
    fmt: (v) => v.toFixed(1),
  },
  {
    key: "child_poverty_ahc_pct",
    label: "Child pov AHC %",
    group: "raw indicators",
    get: (s) => num(s.area as Area, "child_poverty_ahc_pct"),
    fmt: (v) => v.toFixed(1),
  },
  {
    key: "no_quals_pct",
    label: "No quals %",
    group: "raw indicators",
    get: (s) => num(s.area as Area, "no_quals_pct"),
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
  mode,
  selected,
  onSelect,
  hovered,
  onHover,
}: Props) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "rank", dir: 1 });

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
      [`# normalisation: ${mode}`],
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
        title="Click to sort"
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
          <h2 className="text-[13px] font-semibold tracking-tight">
            Scored dataset — 64 neighbourhoods, current specification
          </h2>
          <p className="text-[11px] text-muted">
            The table the map and sub-plots are built from. Click a row to pin an area; click a
            column to sort.
          </p>
        </div>
        <button
          onClick={exportFullCsv}
          className="no-print ml-auto rounded-md border border-line px-3 py-1.5 text-[11px] font-medium text-text transition hover:border-line-strong"
        >
          Export scored CSV
        </button>
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
        <span className="tabular">normalisation: {mode}</span>
        <span className="tabular">Spearman ρ vs equal-weight {rhoEqual.toFixed(3)}</span>
        <span className="tabular">ρ vs baseline {rhoBaseline.toFixed(3)}</span>
      </div>

      <div className="max-h-[520px] overflow-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_var(--line)]">
            <tr>{COLS.map(th)}</tr>
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
                  {COLS.map((c) => {
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
