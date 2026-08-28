"use client";

import { useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { downloadCsv, downloadPng, findSvg } from "@/lib/exporters";
import { defaultWeights, runModelWith } from "@/lib/model";
import type { ModelResult } from "@/lib/model";
import type { Area, AltClassGrade, AltClassShares } from "@/lib/types";

interface Props {
  areas: Area[];
  baseModel: ModelResult;
  altClassGrade: AltClassGrade;
}

const SITES = ["E02007111", "E02000872"] as const; // Shoreditch, Brick Lane North
const CLASS_KEYS = ["class_ab_pct", "class_c2_pct", "class_de_pct", "class_c2de_pct"] as const;
type Borough = "Hackney" | "Tower Hamlets";

export default function BarCharts({ areas, baseModel, altClassGrade }: Props) {
  const ethnicOptions = Object.keys(altClassGrade.ethnicGroup.Hackney);

  return (
    <section className="card">
      <header className="border-b border-line px-4 py-3">
        <h2 className="text-[13px] font-semibold tracking-tight">Class-measure substitution</h2>
        <p className="text-[11px] text-muted">
          Each study area&apos;s class domain swapped for a borough sub-population&apos;s social
          grade. Grey bar = baseline, coloured bar = substituted; lines = actual borough mean.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-px bg-line lg:grid-cols-2">
        <Panel
          areas={areas}
          baseModel={baseModel}
          title="By ethnic group"
          csvKey="ethnic-group"
          options={ethnicOptions}
          initial={ethnicOptions.includes("Bangladeshi") ? "Bangladeshi" : ethnicOptions[0]}
          variant={altClassGrade.ethnicGroup}
        />
        <Panel
          areas={areas}
          baseModel={baseModel}
          title="By sex"
          csvKey="sex"
          options={["Female", "Male"]}
          initial="Female"
          variant={altClassGrade.sex}
        />
      </div>
    </section>
  );
}

interface PanelProps {
  areas: Area[];
  baseModel: ModelResult;
  title: string;
  csvKey: string;
  options: string[];
  initial: string;
  variant: {
    source: string;
    Hackney: Record<string, AltClassShares>;
    "Tower Hamlets": Record<string, AltClassShares>;
  };
}

function Panel({ areas, baseModel, title, csvKey, options, initial, variant }: PanelProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [choice, setChoice] = useState(initial);
  const base = useMemo(() => defaultWeights(), []);

  // actual borough means (baseline) — the fixed comparison points
  const boroughMean = useMemo(() => {
    const acc: Record<Borough, number[]> = { Hackney: [], "Tower Hamlets": [] };
    for (const sc of baseModel.scored)
      if (sc) acc[sc.area.localAuthority as Borough].push(sc.score);
    return { Hackney: mean(acc.Hackney), "Tower Hamlets": mean(acc["Tower Hamlets"]) };
  }, [baseModel]);

  const { rows, shares } = useMemo(() => {
    const shares: Record<Borough, AltClassShares> = {
      Hackney: variant.Hackney[choice],
      "Tower Hamlets": variant["Tower Hamlets"][choice],
    };
    // swap only the two study areas' class inputs; the other 62 keep their own,
    // so the normalisation across the 64 keeps its spread
    const overrides: Record<string, Record<string, number>> = {};
    for (const code of SITES) {
      const b = baseModel.byCode[code].area.localAuthority as Borough;
      overrides[code] = Object.fromEntries(CLASS_KEYS.map((k) => [k, shares[b][k]]));
    }
    const m = runModelWith(areas, base, overrides);

    const rows = SITES.map((code) => ({
      code,
      name: baseModel.byCode[code].area.name.replace(" North", ""),
      borough: baseModel.byCode[code].area.localAuthority as Borough,
      baseline: baseModel.byCode[code].score,
      substituted: m.byCode[code].score,
    }));
    return { rows, shares };
  }, [areas, base, baseModel, choice, variant]);

  const dom = niceDomain([
    ...rows.flatMap((r) => [r.baseline, r.substituted]),
    boroughMean.Hackney,
    boroughMean["Tower Hamlets"],
  ]);

  const exportCsv = () =>
    downloadCsv(
      [
        [`# Class-measure substitution — ${title.toLowerCase()}: ${choice}`],
        ["area", "borough", "fis_baseline", "fis_substituted", "delta", "class_de_pct_applied"],
        ...rows.map((r) => [
          r.name,
          r.borough,
          r.baseline.toFixed(3),
          r.substituted.toFixed(3),
          (r.substituted - r.baseline).toFixed(3),
          shares[r.borough].class_de_pct.toFixed(2),
        ]),
        [],
        ["Hackney mean", boroughMean.Hackney.toFixed(3)],
        ["Tower Hamlets mean", boroughMean["Tower Hamlets"].toFixed(3)],
      ],
      `class-substitution-${csvKey}.csv`,
    );

  return (
    <div className="bg-white px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-medium">{title}</span>
        <select
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className="rounded-md border border-line bg-white px-1.5 py-1 text-[12px] focus:border-line-strong focus:outline-none"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <div className="no-print ml-auto flex items-center gap-1">
          <button
            onClick={() => chartRef.current && exportPng(chartRef.current, csvKey)}
            className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted transition hover:text-text"
          >
            PNG
          </button>
          <button
            onClick={exportCsv}
            className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted transition hover:text-text"
          >
            CSV
          </button>
        </div>
      </div>

      <div ref={chartRef} className="mt-2 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 16, right: 12, bottom: 2, left: -18 }} barGap={4}>
            <CartesianGrid stroke="#eef0f2" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#475467" }} stroke="#cdd3db" />
            <YAxis tick={{ fontSize: 10, fill: "#98a2b3" }} stroke="#cdd3db" domain={dom} width={44} />
            <Tooltip
              cursor={{ fill: "rgba(16,24,40,0.04)" }}
              contentStyle={{
                background: "#fff",
                border: "1px solid #e4e7ec",
                borderRadius: 8,
                fontSize: 11,
                boxShadow: "0 4px 16px rgba(16,24,40,0.10)",
              }}
              formatter={
                ((v: number, k: string) => [
                  Number(v).toFixed(1),
                  k === "baseline" ? "Baseline" : `Substituted (${choice})`,
                ]) as never
              }
            />
            <ReferenceLine
              y={boroughMean.Hackney}
              stroke="#1d4ed8"
              strokeDasharray="4 3"
              label={{
                value: `Hackney ${boroughMean.Hackney.toFixed(1)}`,
                position: "insideTopLeft",
                fill: "#1d4ed8",
                fontSize: 9,
              }}
            />
            <ReferenceLine
              y={boroughMean["Tower Hamlets"]}
              stroke="#c2410c"
              strokeDasharray="4 3"
              label={{
                value: `Tower Hamlets ${boroughMean["Tower Hamlets"].toFixed(1)}`,
                position: "insideBottomLeft",
                fill: "#c2410c",
                fontSize: 9,
              }}
            />
            <Bar dataKey="baseline" fill="#cbd5e1" radius={[3, 3, 0, 0]} maxBarSize={52}>
              <LabelList
                dataKey="baseline"
                position="top"
                formatter={((x: number) => Number(x).toFixed(1)) as never}
                style={{ fontSize: 9, fill: "#667085" }}
              />
            </Bar>
            <Bar dataKey="substituted" radius={[3, 3, 0, 0]} maxBarSize={52}>
              {rows.map((r) => (
                <Cell key={r.code} fill={r.borough === "Hackney" ? "#1d4ed8" : "#c2410c"} />
              ))}
              <LabelList
                dataKey="substituted"
                position="top"
                formatter={((x: number) => Number(x).toFixed(1)) as never}
                style={{ fontSize: 9, fill: "#344054" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-1.5 space-y-0.5">
        {rows.map((r) => {
          const d = r.substituted - r.baseline;
          return (
            <div key={r.code} className="tabular text-[10.5px] text-muted">
              <span className="text-text">{r.name}</span> · DE {shares[r.borough].class_de_pct.toFixed(1)}%
              · {r.baseline.toFixed(1)} →{" "}
              <span className="text-text">{r.substituted.toFixed(1)}</span>{" "}
              <span className={d >= 0 ? "text-accent" : "text-[#1d4ed8]"}>
                ({d >= 0 ? "+" : ""}
                {d.toFixed(1)})
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function niceDomain(values: number[]): [number, number] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max(2, (hi - lo) * 0.25);
  return [Math.floor(lo - pad), Math.ceil(hi + pad)];
}
function exportPng(container: HTMLDivElement, key: string) {
  const svg = findSvg(container);
  if (svg) downloadPng(svg, `class-substitution-${key}.png`, 2);
}
