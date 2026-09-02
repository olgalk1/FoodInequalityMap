"use client";

import { useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatValue } from "@/lib/format";
import { downloadCsv, downloadPng, findSvg } from "@/lib/exporters";
import type { ModelResult } from "@/lib/model";
import type { ScoredArea, Unit } from "@/lib/types";

interface Props {
  baseModel: ModelResult;
}

type Borough = "Hackney" | "Tower Hamlets";
type VarUnit = Unit | "score";

interface VarDef {
  key: string;
  label: string;
  unit: VarUnit;
  group: string;
}

/** The two study MSOAs and the borough each one anchors. */
const SITES: { code: string; label: string; borough: Borough; colour: string }[] = [
  { code: "E02007111", label: "Shoreditch", borough: "Hackney", colour: "#1d4ed8" },
  { code: "E02000872", label: "Brick Lane", borough: "Tower Hamlets", colour: "#c2410c" },
];

const VARS: VarDef[] = [
  { key: "__fis", label: "Food Inequality Score (baseline)", unit: "score", group: "Model output" },
  { key: "income_ahc", label: "Net household income (AHC)", unit: "gbp", group: "Income" },
  { key: "class_ab_pct", label: "Social grade AB share", unit: "pct", group: "Class" },
  { key: "class_c1_pct", label: "Social grade C1 share", unit: "pct", group: "Class" },
  { key: "class_c2_pct", label: "Social grade C2 share", unit: "pct", group: "Class" },
  { key: "class_de_pct", label: "Social grade DE share", unit: "pct", group: "Class" },
  { key: "class_c2de_pct", label: "Social grade C2 + DE share", unit: "pct", group: "Class" },
  { key: "owned_pct", label: "Owner-occupied households", unit: "pct", group: "Tenure" },
  { key: "social_rent_pct", label: "Social rented households", unit: "pct", group: "Tenure" },
  { key: "private_rent_pct", label: "Private rented households", unit: "pct", group: "Tenure" },
  { key: "child_poverty_ahc_pct", label: "Child poverty (AHC)", unit: "pct", group: "Deprivation" },
  { key: "child_poverty_bhc_pct", label: "Child poverty (BHC)", unit: "pct", group: "Deprivation" },
  { key: "no_quals_pct", label: "No qualifications (16+)", unit: "pct", group: "Education" },
  { key: "low_quals_pct", label: "Low qualifications (16+)", unit: "pct", group: "Education" },
  { key: "level4plus_pct", label: "Level 4+ qualifications (16+)", unit: "pct", group: "Education" },
  { key: "cultural_food_density", label: "Licensed food outlets / 1k", unit: "per1k", group: "Food environment" },
  { key: "takeaway_density", label: "Takeaways & cafes / 1k", unit: "per1k", group: "Food environment" },
  { key: "food_outlet_density", label: "All food outlets / 1k", unit: "per1k", group: "Food environment" },
  { key: "population_in_households", label: "Population in households", unit: "count", group: "Context" },
];

const VAR_GROUPS = [...new Set(VARS.map((v) => v.group))];
const varOf = (key: string) => VARS.find((v) => v.key === key) ?? VARS[0];

const AXIS = { fontSize: 10, fill: "#98a2b3" };

export default function Correlations({ baseModel }: Props) {
  const [xKey, setXKey] = useState("income_ahc");
  const [yKey, setYKey] = useState("__fis");

  const xVar = varOf(xKey);
  const yVar = varOf(yKey);

  const swap = () => {
    setXKey(yKey);
    setYKey(xKey);
  };

  return (
    <section className="card">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3">
        <div className="min-w-[220px]">
          <h2 className="text-[13px] font-semibold tracking-tight">Variable relationships</h2>
          <p className="text-[11px] text-muted">
            Two variables scattered across each borough&apos;s MSOAs, with an OLS fit, Pearson r and
            Spearman ρ. The study neighbourhood is ringed in each panel.
          </p>
        </div>

        <div className="no-print ml-auto flex flex-wrap items-center gap-2 text-[12px]">
          <label className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">x</span>
            <VarSelect value={xKey} onChange={setXKey} />
          </label>
          <button
            onClick={swap}
            className="rounded-md border border-line px-2 py-1.5 text-muted transition hover:border-line-strong hover:text-text"
            aria-label="Swap x and y"
            title="Swap axes"
          >
            ⇄
          </button>
          <label className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">y</span>
            <VarSelect value={yKey} onChange={setYKey} />
          </label>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-px bg-line lg:grid-cols-2">
        {SITES.map((site) => (
          <Panel
            key={site.code}
            site={site}
            xVar={xVar}
            yVar={yVar}
            baseModel={baseModel}
          />
        ))}
      </div>
    </section>
  );
}

function VarSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="max-w-[210px] rounded-md border border-line bg-white px-1.5 py-1 text-[12px] focus:border-line-strong focus:outline-none"
    >
      {VAR_GROUPS.map((g) => (
        <optgroup key={g} label={g}>
          {VARS.filter((v) => v.group === g).map((v) => (
            <option key={v.key} value={v.key}>
              {v.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

interface PanelProps {
  site: (typeof SITES)[number];
  xVar: VarDef;
  yVar: VarDef;
  baseModel: ModelResult;
}

interface Point {
  code: string;
  name: string;
  x: number;
  y: number;
}

function Panel({ site, xVar, yVar, baseModel }: PanelProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  const { points, study, fit, rho } = useMemo(() => {
    const rows: Point[] = [];
    let study: Point | null = null;
    for (const s of baseModel.scored) {
      if (!s || (s.area.localAuthority as Borough) !== site.borough) continue;
      const x = readVar(s, xVar);
      const y = readVar(s, yVar);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const p: Point = { code: s.area.code, name: s.area.name, x, y };
      if (s.area.code === site.code) study = p;
      else rows.push(p);
    }
    const all = study ? [...rows, study] : rows;
    const xs = all.map((p) => p.x);
    const ys = all.map((p) => p.y);
    return { points: rows, study, fit: linreg(xs, ys), rho: spearman(xs, ys) };
  }, [baseModel, site, xVar, yVar]);

  const n = points.length + (study ? 1 : 0);
  const allPoints = study ? [...points, study] : points;
  const xs = allPoints.map((p) => p.x);
  const [xLo, xHi] = xs.length ? [Math.min(...xs), Math.max(...xs)] : [0, 1];
  const segment: [{ x: number; y: number }, { x: number; y: number }] | null = Number.isFinite(
    fit.slope,
  )
    ? [
        { x: xLo, y: fit.intercept + fit.slope * xLo },
        { x: xHi, y: fit.intercept + fit.slope * xHi },
      ]
    : null;

  const tickX = (v: number) => fmtTick(v, xVar.unit);
  const tickY = (v: number) => fmtTick(v, yVar.unit);

  const exportCsv = () => {
    downloadCsv(
      [
        [`# ${site.label} — ${site.borough}: ${yVar.label} vs ${xVar.label}`],
        [
          `# Pearson r=${fmt(fit.r)} · Spearman rho=${fmt(rho)} · R2=${fmt(fit.r2)} · ` +
            `slope=${fmt(fit.slope, 4)} · n=${n}`,
        ],
        ["code", "neighbourhood", "is_study_area", xVar.key, yVar.key],
        ...allPoints.map((p) => [
          p.code,
          p.name,
          p.code === site.code ? 1 : 0,
          p.x,
          p.y,
        ]),
      ],
      `relationship-${site.label.toLowerCase().replace(/\s+/g, "-")}-${xVar.key}-${yVar.key}.csv`,
    );
  };

  return (
    <div className="bg-white px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: site.colour }} />
        <div className="text-[12px] font-medium">
          {site.label}
          <span className="ml-1.5 text-[10.5px] font-normal text-muted">
            {site.borough} · n = {n}
          </span>
        </div>
        <div className="no-print ml-auto flex items-center gap-1">
          <button
            onClick={() => chartRef.current && exportPng(chartRef.current, site.label)}
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

      <div ref={chartRef} className="mt-2 h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 14, bottom: 14, left: -6 }}>
            <CartesianGrid stroke="#eef0f2" />
            <XAxis
              type="number"
              dataKey="x"
              name={xVar.label}
              domain={["auto", "auto"]}
              tick={AXIS}
              stroke="#cdd3db"
              tickFormatter={tickX}
              height={28}
              label={{
                value: xVar.label,
                position: "insideBottom",
                offset: -6,
                fontSize: 10,
                fill: "#98a2b3",
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={yVar.label}
              domain={["auto", "auto"]}
              tick={AXIS}
              stroke="#cdd3db"
              tickFormatter={tickY}
              width={52}
            />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<PointTip xVar={xVar} yVar={yVar} />} />
            {segment && (
              <ReferenceLine
                segment={segment}
                stroke={site.colour}
                strokeWidth={1.5}
                strokeDasharray="5 4"
                ifOverflow="hidden"
              />
            )}
            <Scatter data={points} shape={<Dot />} isAnimationActive={false} />
            {study && <Scatter data={[study]} shape={<Ring colour={site.colour} />} isAnimationActive={false} />}
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[10.5px]">
        <span className="tabular">
          Pearson <span className="font-medium text-text">r = {fmt(fit.r)}</span>
        </span>
        <span className="tabular text-muted">
          Spearman ρ = {fmt(rho)}
        </span>
        <span className="tabular text-muted">R² = {fmt(fit.r2)}</span>
        <span className="tabular text-muted">
          slope = {fmt(fit.slope, 4)} {slopeUnit(xVar, yVar)}
        </span>
        <span className="text-muted">{describe(fit.r)}</span>
      </div>

      <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">
        {plainSummary(xVar, yVar, fit.r)}
      </p>

      {study && (
        <div className="mt-1 text-[10.5px] text-muted">
          <span style={{ color: site.colour }}>●</span>{" "}
          <span className="text-text">{study.name}</span> · {xVar.label.toLowerCase()}{" "}
          {fmtFull(study.x, xVar.unit)} · {yVar.label.toLowerCase()} {fmtFull(study.y, yVar.unit)}
        </div>
      )}
    </div>
  );
}

/* ---------- marks ---------- */

interface DotShapeProps {
  cx?: number;
  cy?: number;
  colour?: string;
}

function Dot({ cx, cy }: DotShapeProps) {
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={3.2} fill="#98a2b3" fillOpacity={0.55} />;
}

function Ring({ cx, cy, colour }: DotShapeProps) {
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={7} fill={colour} fillOpacity={0.16} />
      <circle cx={cx} cy={cy} r={4} fill={colour} stroke="#fff" strokeWidth={1.5} />
    </g>
  );
}

interface TipProps {
  active?: boolean;
  payload?: { payload: Point }[];
  xVar: VarDef;
  yVar: VarDef;
}

function PointTip({ active, payload, xVar, yVar }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e4e7ec",
        borderRadius: 8,
        fontSize: 11,
        padding: "6px 8px",
        boxShadow: "0 4px 16px rgba(16,24,40,0.10)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{p.name}</div>
      <div style={{ color: "#667085" }}>
        {xVar.label}: {fmtFull(p.x, xVar.unit)}
      </div>
      <div style={{ color: "#667085" }}>
        {yVar.label}: {fmtFull(p.y, yVar.unit)}
      </div>
    </div>
  );
}

/* ---------- stats ---------- */

function readVar(s: ScoredArea, v: VarDef): number {
  if (v.unit === "score") return s.score;
  const raw = s.area[v.key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : NaN;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return NaN;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const d = Math.sqrt(sxx * syy);
  return d === 0 ? NaN : sxy / d;
}

/** Fractional ranks with ties averaged. */
function ranks(xs: number[]): number[] {
  const order = xs.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(xs.length).fill(0);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k][1]] = r;
    i = j + 1;
  }
  return out;
}

function spearman(xs: number[], ys: number[]): number {
  if (xs.length < 2) return NaN;
  return pearson(ranks(xs), ranks(ys));
}

function linreg(xs: number[], ys: number[]): { slope: number; intercept: number; r: number; r2: number } {
  const n = xs.length;
  if (n < 2) return { slope: NaN, intercept: NaN, r: NaN, r2: NaN };
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    sxy += dx * (ys[i] - my);
    sxx += dx * dx;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  const r = pearson(xs, ys);
  return { slope, intercept, r, r2: Number.isFinite(r) ? r * r : NaN };
}

function describe(r: number): string {
  if (!Number.isFinite(r)) return "";
  const a = Math.abs(r);
  const strength =
    a >= 0.7 ? "strong" : a >= 0.4 ? "moderate" : a >= 0.2 ? "weak" : "negligible";
  if (strength === "negligible") return "negligible association";
  return `${strength} ${r < 0 ? "negative" : "positive"} association`;
}

/** One plain-English line for readers who don't work in r and R². */
function plainSummary(xVar: VarDef, yVar: VarDef, r: number): string {
  if (!Number.isFinite(r)) return "Highlight Summary: not enough data to compare these two here.";
  const x = xVar.label.toLowerCase();
  const y = yVar.label.toLowerCase();
  const a = Math.abs(r);
  if (a < 0.2) {
    return `Highlight Summary: an area's ${x} barely relates to its ${y} here — the dots show little pattern.`;
  }
  const tightness = a >= 0.7 ? "strong" : a >= 0.4 ? "moderate" : "weak";
  const move = r < 0 ? `lower ${y}` : `higher ${y}`;
  return `Highlight Summary: areas with higher ${x} tend to have ${move}, and it's a ${tightness} pattern (closer r to ±1 = tighter fit).`;
}

/* ---------- formatting ---------- */

function unitSuffix(u: VarUnit): string {
  if (u === "gbp") return "£";
  if (u === "pct") return "pp";
  if (u === "per1k") return "/1k";
  if (u === "score") return "pts";
  return "";
}

function slopeUnit(xVar: VarDef, yVar: VarDef): string {
  const yu = unitSuffix(yVar.unit);
  const xu = xVar.unit === "gbp" ? "£" : unitSuffix(xVar.unit) || "unit";
  return yu && xu ? `${yu} per ${xu}` : "";
}

function fmt(v: number, dp = 2): string {
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(dp);
}

function fmtTick(v: number, unit: VarUnit): string {
  if (unit === "gbp") return `£${Math.round(v / 1000)}k`;
  if (unit === "pct") return `${v.toFixed(0)}%`;
  if (unit === "per1k") return v.toFixed(1);
  if (unit === "score") return v.toFixed(0);
  return Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : `${Math.round(v)}`;
}

function fmtFull(v: number, unit: VarUnit): string {
  if (unit === "score") return `${v.toFixed(1)} pts`;
  return formatValue(v, unit as Unit);
}

/* ---------- export ---------- */

function exportPng(container: HTMLDivElement, label: string) {
  const svg = findSvg(container);
  if (svg) downloadPng(svg, `relationship-${label.toLowerCase().replace(/\s+/g, "-")}.png`, 2);
}
