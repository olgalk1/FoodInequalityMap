"use client";

import { useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { DOMAIN_MAP } from "@/lib/indicators";
import { SERIES_COLOURS } from "@/lib/format";
import { downloadCsv, downloadPng, findSvg } from "@/lib/exporters";
import { defaultWeights, runModelWith } from "@/lib/model";
import type { ModelResult } from "@/lib/model";
import type { Area, DomainKey, Unit } from "@/lib/types";

interface Props {
  areas: Area[];
  baseModel: ModelResult;
  hovered: string | null;
  onHover: (code: string | null) => void;
}

const SITES = ["E02007111", "E02000872"]; // Shoreditch, Brick Lane North

/** headline raw indicator swept in each panel; weighting is held at baseline */
const PANELS: { domain: DomainKey; key: string; unit: Unit; label: string }[] = [
  { domain: "income", key: "income_ahc", unit: "gbp", label: "Net household income (AHC)" },
  { domain: "class", key: "class_de_pct", unit: "pct", label: "Social grade DE share" },
  {
    domain: "deprivation",
    key: "child_poverty_ahc_pct",
    unit: "pct",
    label: "Child poverty (AHC)",
  },
  { domain: "education", key: "no_quals_pct", unit: "pct", label: "Residents with no qualifications" },
];

const AXIS = { fontSize: 10, fill: "#98a2b3" };

export default function SubPlots({ areas, baseModel, hovered, onHover }: Props) {
  return (
    <section className="card">
      <header className="border-b border-line px-4 py-3">
        <h2 className="text-[13px] font-semibold tracking-tight">
          Input sensitivity — Shoreditch &amp; Brick Lane
        </h2>
        <p className="max-w-[95ch] text-[11px] leading-relaxed text-muted">
          Each panel flexes one raw input for the two study areas while the weighting stays at the
          baseline specification (40 / 25 / 25 / 10, min–max). The line is the Food Inequality Score
          as that figure varies for one area, holding the other 63 fixed; the hollow marker is the
          real value, the filled marker your what-if. Panels are independent — changing income here
          does not touch the class panel.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-px bg-line lg:grid-cols-2">
        {PANELS.map((p) => (
          <Panel
            key={p.domain}
            panel={p}
            areas={areas}
            baseModel={baseModel}
            hovered={hovered}
            onHover={onHover}
          />
        ))}
      </div>
    </section>
  );
}

interface PanelProps {
  panel: (typeof PANELS)[number];
  areas: Area[];
  baseModel: ModelResult;
  hovered: string | null;
  onHover: (code: string | null) => void;
}

function Panel({ panel, areas, baseModel, hovered, onHover }: PanelProps) {
  const { domain, key, unit, label } = panel;
  const dm = DOMAIN_MAP[domain];
  const chartRef = useRef<HTMLDivElement>(null);
  const base = useMemo(() => defaultWeights(), []);

  const actual = useMemo(
    () =>
      Object.fromEntries(
        SITES.map((c) => [c, num((baseModel.byCode[c].area as Area)[key])]),
      ) as Record<string, number>,
    [baseModel, key],
  );

  const [whatIf, setWhatIf] = useState<Record<string, number>>(actual);

  // static response curves — one per site, FIS vs the swept raw value
  const { data, xDomain } = useMemo(() => {
    const all = areas
      .map((a) => num(a[key]))
      .filter((v) => Number.isFinite(v));
    let lo = Math.min(...all);
    let hi = Math.max(...all);
    const pad = (hi - lo) * 0.15 || 1;
    lo = unit === "pct" ? Math.max(0, lo - pad) : lo - pad;
    hi = hi + pad;
    const steps = 40;
    const xs = Array.from({ length: steps + 1 }, (_, i) => lo + ((hi - lo) * i) / steps);

    const rows = xs.map((x) => {
      const row: Record<string, number> = { x };
      for (const c of SITES) {
        row[c] = runModelWith(areas, base, { [c]: { [key]: x } }).byCode[c].score;
      }
      return row;
    });
    return { data: rows, xDomain: [lo, hi] as [number, number] };
  }, [areas, base, key, unit]);

  const whatIfScore = useMemo(
    () =>
      Object.fromEntries(
        SITES.map((c) => [
          c,
          runModelWith(areas, base, { [c]: { [key]: whatIf[c] } }).byCode[c].score,
        ]),
      ) as Record<string, number>,
    [areas, base, key, whatIf],
  );

  const fmtX = (v: number) =>
    unit === "gbp" ? `£${Math.round(v / 1000)}k` : `${v.toFixed(0)}%`;
  const fmtVal = (v: number) =>
    unit === "gbp" ? `£${Math.round(v).toLocaleString("en-GB")}` : `${v.toFixed(1)}%`;

  const nameOf = (c: string) => baseModel.byCode[c].area.name.replace(" North", "");

  const exportCsv = () => {
    downloadCsv(
      [
        [`# ${dm.label} · ${label} — Food Inequality Score vs input value`],
        ["input_value", ...SITES.map(nameOf)],
        ...data.map((r) => [
          unit === "gbp" ? Math.round(r.x) : r.x.toFixed(2),
          ...SITES.map((c) => r[c].toFixed(3)),
        ]),
      ],
      `input-sensitivity-${domain}.csv`,
    );
  };

  return (
    <div className="bg-white px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dm.colour }} />
        <div className="text-[12px] font-medium">
          {dm.label}
          <span className="ml-1.5 text-[10.5px] font-normal text-muted">{label}</span>
        </div>
        <div className="no-print ml-auto flex items-center gap-1">
          <button
            onClick={() => setWhatIf(actual)}
            className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted transition hover:text-text"
          >
            reset
          </button>
          <button
            onClick={() => chartRef.current && exportPng(chartRef.current, domain)}
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

      <div ref={chartRef} className="mt-2 h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 12, bottom: 2, left: -18 }}>
            <CartesianGrid stroke="#eef0f2" />
            <XAxis
              dataKey="x"
              type="number"
              domain={xDomain}
              tick={AXIS}
              stroke="#cdd3db"
              tickFormatter={fmtX}
            />
            <YAxis tick={AXIS} stroke="#cdd3db" domain={["auto", "auto"]} width={42} />
            <Tooltip
              contentStyle={{
                background: "#fff",
                border: "1px solid #e4e7ec",
                borderRadius: 8,
                fontSize: 11,
                boxShadow: "0 4px 16px rgba(16,24,40,0.10)",
              }}
              formatter={((val: number, code: string) => [
                Number(val).toFixed(1),
                nameOf(code),
              ]) as never}
              labelFormatter={(v) => `${label}: ${fmtVal(Number(v))}`}
            />
            {SITES.map((c, i) => (
              <Line
                key={c}
                type="monotone"
                dataKey={c}
                stroke={SERIES_COLOURS[i % SERIES_COLOURS.length]}
                strokeWidth={hovered === c ? 3 : 2}
                dot={false}
                isAnimationActive={false}
                onMouseEnter={() => onHover(c)}
                onMouseLeave={() => onHover(null)}
              />
            ))}
            {SITES.map((c, i) => (
              <ReferenceDot
                key={`act-${c}`}
                x={actual[c]}
                y={baseModel.byCode[c].score}
                r={4}
                fill="#fff"
                stroke={SERIES_COLOURS[i % SERIES_COLOURS.length]}
                strokeWidth={2}
                // isFront removed
              />
            ))}
            {SITES.map((c, i) =>
              Math.abs(whatIf[c] - actual[c]) > 1e-9 ? (
                <ReferenceDot
                  key={`wi-${c}`}
                  x={whatIf[c]}
                  y={whatIfScore[c]}
                  r={4.5}
                  fill={SERIES_COLOURS[i % SERIES_COLOURS.length]}
                  stroke="#fff"
                  strokeWidth={1.5}
                  // isFront removed
                />
              ) : null,
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 space-y-1.5">
        {SITES.map((c, i) => {
          const d = whatIfScore[c] - baseModel.byCode[c].score;
          return (
            <div
              key={c}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px]"
              onMouseEnter={() => onHover(c)}
              onMouseLeave={() => onHover(null)}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: SERIES_COLOURS[i % SERIES_COLOURS.length] }}
              />
              <span className="w-[86px] shrink-0 font-medium">{nameOf(c)}</span>
              <input
                type={unit === "gbp" ? "number" : "number"}
                step={unit === "gbp" ? 500 : 0.5}
                value={round(whatIf[c], unit)}
                onChange={(e) =>
                  setWhatIf((w) => ({ ...w, [c]: Number(e.target.value) || 0 }))
                }
                className="tabular w-24 rounded border border-line px-1.5 py-0.5 text-right focus:border-line-strong focus:outline-none"
              />
              <span className="text-muted">{unit === "gbp" ? "£/yr" : "%"}</span>
              <span className="tabular text-muted">
                actual {fmtVal(actual[c])} · FIS {baseModel.byCode[c].score.toFixed(1)} →{" "}
                <span className="text-text">{whatIfScore[c].toFixed(1)}</span>{" "}
                <span className={d >= 0 ? "text-accent" : "text-[#1d4ed8]"}>
                  ({d >= 0 ? "+" : ""}
                  {d.toFixed(1)})
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : NaN;
}
function round(v: number, unit: Unit): number {
  return unit === "gbp" ? Math.round(v) : Math.round(v * 10) / 10;
}
function exportPng(container: HTMLDivElement, key: string) {
  const svg = findSvg(container);
  if (svg) downloadPng(svg, `input-sensitivity-${key}.png`, 2);
}
