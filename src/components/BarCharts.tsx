"use client";

import { useMemo, useRef } from "react";
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
import { runModelWith } from "@/lib/model";
import type { ModelResult } from "@/lib/model";
import type { Area, AltClassGrade, AltClassShares } from "@/lib/types";

interface Props {
  areas: Area[];
  baseModel: ModelResult;
  altClassGrade: AltClassGrade;
}

const SHOREDITCH = "E02007111";
const BRICK_LANE = "E02000872";
const CLASS_KEYS = ["class_ab_pct", "class_c2_pct", "class_de_pct", "class_c2de_pct"] as const;

type Borough = "Hackney" | "Tower Hamlets";

interface VariantResult {
  key: "ethnicGroup" | "sexAge";
  label: string;
  source: string;
  boroughMean: Record<Borough, number>;
  shares: Record<Borough, AltClassShares>;
  rows: {
    code: string;
    name: string;
    borough: Borough;
    baseline: number;
    substituted: number;
  }[];
}

export default function BarCharts({ areas, baseModel, altClassGrade }: Props) {
  const variants: VariantResult[] = useMemo(() => {
    const build = (
      key: "ethnicGroup" | "sexAge",
      label: string,
    ): VariantResult => {
      const variant = altClassGrade[key];
      const shares: Record<Borough, AltClassShares> = {
        Hackney: variant.Hackney,
        "Tower Hamlets": variant["Tower Hamlets"],
      };
      // apply each borough's social-grade shares to every MSOA in that borough
      const overrides: Record<string, Record<string, number>> = {};
      for (const a of areas) {
        const b = a.localAuthority as Borough;
        const s = shares[b];
        overrides[a.code] = Object.fromEntries(CLASS_KEYS.map((k) => [k, s[k]]));
      }
      const model = runModelWith(areas, defaultsProxy(), overrides);

      const boroughMean = boroughMeans(model);
      const rows = [SHOREDITCH, BRICK_LANE].map((code) => {
        const s = model.byCode[code];
        return {
          code,
          name: s.area.name,
          borough: s.area.localAuthority as Borough,
          baseline: baseModel.byCode[code].score,
          substituted: s.score,
        };
      });
      return { key, label, source: variant.source, boroughMean, shares, rows };
    };

    return [
      build("ethnicGroup", "Class from social grade by ethnic group (SG006)"),
      build("sexAge", "Class from social grade by sex & age (SG013)"),
    ];
  }, [areas, baseModel, altClassGrade]);

  return (
    <section className="card">
      <header className="border-b border-line px-4 py-3">
        <h2 className="text-[13px] font-semibold tracking-tight">
          Class-measure substitution — Shoreditch &amp; Brick Lane
        </h2>
        <p className="max-w-[95ch] text-[11px] leading-relaxed text-muted">
          The class domain (25%, min–max) is rebuilt from two alternative Census tables. Both are
          published only to local-authority level, so each borough&apos;s approximated social grade
          is applied to every MSOA in it — Shoreditch takes Hackney&apos;s profile, Brick Lane North
          takes Tower Hamlets&apos;. Bars are the resulting Food Inequality Score against the
          baseline (each area&apos;s own MSOA social grade); the two dots are the borough-wide mean
          score under the same substitution.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-px bg-line lg:grid-cols-2">
        {variants.map((v) => (
          <Panel key={v.key} v={v} />
        ))}
      </div>

      <p className="border-t border-line px-4 py-2 text-[10.5px] leading-relaxed text-muted">
        SG006 and SG013 resolve to the same borough social-grade distribution, so the two panels
        should read almost identically — that agreement is the robustness check. The visible shift
        is baseline (local, MSOA-level class) versus borough-level class.
      </p>
    </section>
  );
}

function Panel({ v }: { v: VariantResult }) {
  const chartRef = useRef<HTMLDivElement>(null);

  const data = v.rows.map((r) => ({
    name: r.name.replace(" North", ""),
    baseline: r.baseline,
    substituted: r.substituted,
    delta: r.substituted - r.baseline,
    borough: r.borough,
  }));

  const exportCsv = () => {
    downloadCsv(
      [
        [`# ${v.label}`],
        [`# ${v.source}`],
        ["area", "borough", "fis_baseline", "fis_substituted", "delta"],
        ...v.rows.map((r) => [
          r.name,
          r.borough,
          r.baseline.toFixed(3),
          r.substituted.toFixed(3),
          (r.substituted - r.baseline).toFixed(3),
        ]),
        [],
        ["borough_mean_under_substitution", "", ""],
        ["Hackney", v.boroughMean.Hackney.toFixed(3)],
        ["Tower Hamlets", v.boroughMean["Tower Hamlets"].toFixed(3)],
      ],
      `class-substitution-${v.key}.csv`,
    );
  };

  const dom = niceDomain([
    ...data.flatMap((d) => [d.baseline, d.substituted]),
    v.boroughMean.Hackney,
    v.boroughMean["Tower Hamlets"],
  ]);

  return (
    <div className="bg-white px-4 py-3">
      <div className="flex items-start gap-2">
        <div className="text-[12px] font-medium leading-snug">{v.label}</div>
        <div className="no-print ml-auto flex items-center gap-1">
          <button
            onClick={() => chartRef.current && exportPng(chartRef.current, v.key)}
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

      <div ref={chartRef} className="mt-2 h-[230px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 14, right: 12, bottom: 2, left: -18 }} barGap={4}>
            <CartesianGrid stroke="#eef0f2" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#475467" }} stroke="#cdd3db" />
            <YAxis
              tick={{ fontSize: 10, fill: "#98a2b3" }}
              stroke="#cdd3db"
              domain={dom}
              width={46}
            />
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
                ((val: number, key: string) => [
                  Number(val).toFixed(1),
                  key === "baseline" ? "Baseline (MSOA class)" : "Substituted (borough class)",
                ]) as never
              }
            />
            <ReferenceLine
              y={v.boroughMean.Hackney}
              stroke="#1d4ed8"
              strokeDasharray="4 3"
              label={{
                value: `Hackney mean ${v.boroughMean.Hackney.toFixed(1)}`,
                position: "insideTopLeft",
                fill: "#1d4ed8",
                fontSize: 9,
              }}
            />
            <ReferenceLine
              y={v.boroughMean["Tower Hamlets"]}
              stroke="#c2410c"
              strokeDasharray="4 3"
              label={{
                value: `Tower Hamlets mean ${v.boroughMean["Tower Hamlets"].toFixed(1)}`,
                position: "insideBottomLeft",
                fill: "#c2410c",
                fontSize: 9,
              }}
            />
            <Bar dataKey="baseline" fill="#cbd5e1" radius={[3, 3, 0, 0]} maxBarSize={54}>
              <LabelList
                dataKey="baseline"
                position="top"
                formatter={((x: number) => Number(x).toFixed(1)) as never}
                style={{ fontSize: 9, fill: "#667085" }}
              />
            </Bar>
            <Bar dataKey="substituted" radius={[3, 3, 0, 0]} maxBarSize={54}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.borough === "Hackney" ? "#1d4ed8" : "#c2410c"} />
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
        {v.rows.map((r) => {
          const d = r.substituted - r.baseline;
          return (
            <div key={r.code} className="tabular text-[10.5px] text-muted">
              <span className="text-text">{r.name}</span> · {r.borough} class DE{" "}
              {v.shares[r.borough].class_de_pct.toFixed(1)}% · FIS {r.baseline.toFixed(1)} →{" "}
              {r.substituted.toFixed(1)}{" "}
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

function boroughMeans(model: ModelResult): Record<Borough, number> {
  const acc: Record<Borough, number[]> = { Hackney: [], "Tower Hamlets": [] };
  for (const s of model.scored) {
    if (!s) continue;
    acc[s.area.localAuthority as Borough].push(s.score);
  }
  return {
    Hackney: mean(acc.Hackney),
    "Tower Hamlets": mean(acc["Tower Hamlets"]),
  };
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

// defaultWeights() imported lazily to avoid a circular-looking import in the header
import { defaultWeights } from "@/lib/model";
function defaultsProxy() {
  return defaultWeights();
}
