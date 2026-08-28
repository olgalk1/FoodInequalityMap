"use client";

import { useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { DOMAINS, DOMAIN_MAP } from "@/lib/indicators";
import { SERIES_COLOURS } from "@/lib/format";
import { downloadCsv, downloadPng, findSvg } from "@/lib/exporters";
import { sweepDomainCurve } from "@/lib/model";
import type { ModelResult } from "@/lib/model";
import type { Area, DomainKey, Weights } from "@/lib/types";

interface Props {
  areas: Area[];
  model: ModelResult;
  baseModel: ModelResult;
  baselineDomains: Record<DomainKey, number>;
  weights: Weights;
  setDomainWeight: (key: DomainKey, value: number) => void;
  selected: string[];
  hovered: string | null;
  onHover: (code: string | null) => void;
}

const AXIS = { stroke: "#98a2b3", fontSize: 10 };
const GRID = "#eef0f2";

export default function SubPlots({
  areas,
  model,
  baseModel,
  baselineDomains,
  weights,
  setDomainWeight,
  selected,
  hovered,
  onHover,
}: Props) {
  const [plotDomains, setPlotDomains] = useState<DomainKey[]>([
    "income",
    "class",
    "deprivation",
    "education",
  ]);

  const codes = useMemo(() => {
    if (selected.length) return selected.slice(0, 4);
    return areas.filter((a) => a.isStudyArea).map((a) => a.code);
  }, [selected, areas]);

  const nameOf = (code: string) =>
    model.byCode[code]?.area.name ?? baseModel.byCode[code]?.area.name ?? code;

  return (
    <section className="card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-[13px] font-semibold tracking-tight">
            Weight sensitivity — how the score responds to each domain
          </h2>
          <p className="text-[11px] text-muted">
            Each panel sweeps one domain&apos;s weight from 0 to 100%, holding the others in ratio.
            The faint dashed line is the baseline specification; the solid line is your current
            adjustment. Drag a slider to move the score for the pinned areas — the map above stays
            fixed.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-px bg-line lg:grid-cols-2">
        {plotDomains.map((dk, i) => (
          <Panel
            key={i}
            slot={i}
            areas={areas}
            model={model}
            baseModel={baseModel}
            baselineDomains={baselineDomains}
            weights={weights}
            domainKey={dk}
            onChangeDomain={(next) =>
              setPlotDomains((p) => p.map((d, idx) => (idx === i ? next : d)))
            }
            setDomainWeight={setDomainWeight}
            codes={codes}
            nameOf={nameOf}
            hovered={hovered}
            onHover={onHover}
          />
        ))}
      </div>
    </section>
  );
}

interface PanelProps {
  slot: number;
  areas: Area[];
  model: ModelResult;
  baseModel: ModelResult;
  baselineDomains: Record<DomainKey, number>;
  weights: Weights;
  domainKey: DomainKey;
  onChangeDomain: (k: DomainKey) => void;
  setDomainWeight: (key: DomainKey, value: number) => void;
  codes: string[];
  nameOf: (code: string) => string;
  hovered: string | null;
  onHover: (code: string | null) => void;
}

function Panel({
  areas,
  model,
  baseModel,
  baselineDomains,
  weights,
  domainKey,
  onChangeDomain,
  setDomainWeight,
  codes,
  nameOf,
  hovered,
  onHover,
}: PanelProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const domain = DOMAIN_MAP[domainKey];
  const currentWeight = Math.round(weights.domains[domainKey] ?? 0);
  const baselineWeight = Math.round(baselineDomains[domainKey] ?? 0);

  const data = useMemo(() => {
    const base = sweepDomainCurve(
      areas,
      model.normalised,
      weights.indicators,
      baselineDomains,
      domainKey,
      codes,
      100,
      2,
    );
    const cur = sweepDomainCurve(
      areas,
      model.normalised,
      weights.indicators,
      weights.domains,
      domainKey,
      codes,
      100,
      2,
    );
    return base.map((row, i) => {
      const merged: Record<string, number> = { weight: row.weight };
      for (const code of codes) {
        merged[`base_${code}`] = row[code];
        merged[`cur_${code}`] = cur[i][code];
      }
      return merged;
    });
  }, [areas, model.normalised, weights.indicators, weights.domains, baselineDomains, domainKey, codes]);

  const exportCsv = () => {
    const header = [
      `${domain.label}_weight`,
      ...codes.flatMap((c) => [`${nameOf(c)}__baseline`, `${nameOf(c)}__current`]),
    ];
    const rows = data.map((r) => [
      r.weight,
      ...codes.flatMap((c) => [r[`base_${c}`].toFixed(3), r[`cur_${c}`].toFixed(3)]),
    ]);
    downloadCsv(
      [
        [`# ${domain.label} weight sweep · baseline vs current specification`],
        header,
        ...rows,
      ],
      `sweep-${domainKey}.csv`,
    );
  };

  return (
    <div className="bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: domain.colour }} />
        <select
          value={domainKey}
          onChange={(e) => onChangeDomain(e.target.value as DomainKey)}
          className="rounded-md border border-line bg-white px-1.5 py-1 text-[12px] font-medium focus:border-line-strong focus:outline-none"
        >
          {DOMAINS.map((d) => (
            <option key={d.key} value={d.key}>
              {d.label}
            </option>
          ))}
        </select>
        <span className="tabular text-[11px] text-muted">
          baseline {baselineWeight}% → now {currentWeight}%
        </span>
        <div className="no-print ml-auto flex items-center gap-1">
          <button
            onClick={() => setDomainWeight(domainKey, baselineWeight)}
            className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted transition hover:text-text"
          >
            reset
          </button>
          <button
            onClick={() => chartRef.current && exportPng(chartRef.current, domainKey)}
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

      <div ref={chartRef} className="mt-2 h-[190px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 10, bottom: 2, left: -20 }}>
            <CartesianGrid stroke={GRID} />
            <XAxis
              dataKey="weight"
              type="number"
              domain={[0, 100]}
              ticks={[0, 20, 40, 60, 80, 100]}
              tick={AXIS}
              stroke="#cdd3db"
            />
            <YAxis tick={AXIS} stroke="#cdd3db" domain={["auto", "auto"]} width={44} />
            <Tooltip
              contentStyle={{
                background: "#ffffff",
                border: "1px solid #e4e7ec",
                borderRadius: 8,
                fontSize: 11,
                boxShadow: "0 4px 16px rgba(16,24,40,0.10)",
              }}
              labelFormatter={(v) => `${domain.label} weight ${v}%`}
              formatter={
                ((value: number, key: string) => {
                  const [kind, ...rest] = key.split("_");
                  const code = rest.join("_");
                  return [
                    Number(value).toFixed(1),
                    `${nameOf(code)} · ${kind === "cur" ? "current" : "baseline"}`,
                  ];
                }) as never
              }
            />
            <ReferenceLine x={baselineWeight} stroke="#98a2b3" strokeDasharray="2 3" />
            <ReferenceLine
              x={currentWeight}
              stroke={domain.colour}
              strokeWidth={1.5}
              label={{ value: `${currentWeight}%`, position: "top", fill: domain.colour, fontSize: 9 }}
            />
            {codes.flatMap((code, idx) => {
              const colour = SERIES_COLOURS[idx % SERIES_COLOURS.length];
              const active = hovered === code;
              return [
                <Line
                  key={`base_${code}`}
                  type="monotone"
                  dataKey={`base_${code}`}
                  stroke={colour}
                  strokeOpacity={0.35}
                  strokeDasharray="4 3"
                  strokeWidth={1.4}
                  dot={false}
                  isAnimationActive={false}
                />,
                <Line
                  key={`cur_${code}`}
                  type="monotone"
                  dataKey={`cur_${code}`}
                  stroke={colour}
                  strokeWidth={active ? 3 : 2}
                  dot={false}
                  isAnimationActive={false}
                  onMouseEnter={() => onHover(code)}
                  onMouseLeave={() => onHover(null)}
                />,
              ];
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={currentWeight}
        onChange={(e) => setDomainWeight(domainKey, Number(e.target.value))}
        style={{ ["--knob" as string]: domain.colour }}
        className="mt-2"
      />

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {codes.map((code, idx) => {
          const cur = model.byCode[code]?.score ?? 0;
          const base = baseModel.byCode[code]?.score ?? 0;
          const delta = cur - base;
          return (
            <span
              key={code}
              className="tabular text-[10.5px]"
              style={{ color: SERIES_COLOURS[idx % SERIES_COLOURS.length] }}
              onMouseEnter={() => onHover(code)}
              onMouseLeave={() => onHover(null)}
            >
              {nameOf(code)}: {cur.toFixed(1)}{" "}
              <span className="text-muted">
                ({delta >= 0 ? "+" : ""}
                {delta.toFixed(1)} vs baseline)
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function exportPng(container: HTMLDivElement, key: string) {
  const svg = findSvg(container);
  if (svg) downloadPng(svg, `sweep-${key}.png`, 2);
}
