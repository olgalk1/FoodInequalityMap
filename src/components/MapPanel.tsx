"use client";

import { useMemo, useRef, useState } from "react";
import type { FeatureCollection, Geometry } from "geojson";

import { downloadPng, downloadSvg } from "@/lib/exporters";
import { SERIES_COLOURS, quantileColour, quantileStops } from "@/lib/format";
import { DOMAINS, PRESETS } from "@/lib/indicators";
import type { ModelResult } from "@/lib/model";
import { projectFeatures } from "@/lib/projection";

interface Props {
  geo: FeatureCollection<Geometry, { code: string; name: string }>;
  /** the model the map draws — follows the selected preset */
  model: ModelResult;
  preset: string;
  onPreset: (id: string) => void;
  selected: string[];
  hovered: string | null;
  onSelect: (code: string) => void;
  onHover: (code: string | null) => void;
}

const W = 960;
const H = 600;

export default function MapPanel({
  geo,
  model,
  preset,
  onPreset,
  selected,
  hovered,
  onSelect,
  onHover,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [labels, setLabels] = useState(false);

  const { paths, centroids } = useMemo(() => projectFeatures(geo, W, H, 16), [geo]);

  const sortedScores = useMemo(
    () =>
      model.scored
        .filter(Boolean)
        .map((s) => s.score)
        .sort((a, b) => a - b),
    [model],
  );
  const stops = quantileStops(sortedScores);

  const selIndex = (code: string) => selected.indexOf(code);
  const hov = hovered && model.byCode[hovered];

  const activePreset = PRESETS.find((p) => p.id === preset) ?? PRESETS[0];
  const weightSummary = DOMAINS.filter((d) => (activePreset.domains[d.key] ?? 0) > 0)
    .map((d) => `${d.label.toLowerCase()} ${Math.round(activePreset.domains[d.key])}`)
    .join(" · ");

  return (
    <section className="card overflow-hidden">
      <header className="border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold tracking-tight">
              Food Inequality Score — {activePreset.label}
            </h2>
            <p className="text-[11px] text-muted">
              64 MSOAs · {weightSummary} · min–max normalised. Click an area to pin it.
            </p>
          </div>
          <div className="no-print ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setLabels((v) => !v)}
              className="rounded-md border border-line px-2.5 py-1 text-[11px] text-muted transition hover:border-line-strong hover:text-text"
            >
              {labels ? "Hide codes" : "Show codes"}
            </button>
            <button
              onClick={() => svgRef.current && downloadSvg(svgRef.current, "food-inequality-map.svg")}
              className="rounded-md border border-line px-2.5 py-1 text-[11px] text-muted transition hover:border-line-strong hover:text-text"
            >
              SVG
            </button>
            <button
              onClick={() =>
                svgRef.current && downloadPng(svgRef.current, "food-inequality-map.png", 2)
              }
              className="rounded-md border border-line px-2.5 py-1 text-[11px] text-muted transition hover:border-line-strong hover:text-text"
            >
              PNG
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            Specification
          </span>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => onPreset(p.id)}
              title={p.rationale}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                preset === p.id
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line text-muted hover:border-line-strong hover:text-text"
              }`}
            >
              {p.label.split(":")[0]}
            </button>
          ))}
        </div>
        {activePreset.id !== "baseline" && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{activePreset.rationale}</p>
        )}
      </header>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          className="block h-auto w-full"
          role="img"
          aria-label="Choropleth map of the Food Inequality Score across 64 neighbourhoods"
        >
          <rect x={0} y={0} width={W} height={H} fill="#ffffff" />
          {geo.features.map((f) => {
            const code = f.properties.code;
            const s = model.byCode[code];
            const idx = selIndex(code);
            const isSel = idx >= 0;
            const isHov = hovered === code;
            return (
              <path
                key={code}
                d={paths[code]}
                className="map-region"
                fillRule="evenodd"
                fill={s ? quantileColour(s.score, sortedScores) : "#eef0f2"}
                fillOpacity={isHov ? 1 : isSel ? 0.96 : 0.9}
                stroke={
                  isSel
                    ? SERIES_COLOURS[idx % SERIES_COLOURS.length]
                    : isHov
                      ? "#14181f"
                      : "#ffffff"
                }
                strokeWidth={isSel ? 2.4 : isHov ? 1.4 : 0.7}
                onClick={() => onSelect(code)}
                onMouseEnter={() => onHover(code)}
                onMouseLeave={() => onHover(null)}
              >
                <title>
                  {`${f.properties.name} · FIS ${s ? s.score.toFixed(1) : "—"} · rank ${
                    s ? s.rank : "—"
                  }/64`}
                </title>
              </path>
            );
          })}

          {geo.features
            .filter((f) => model.byCode[f.properties.code]?.area.isStudyArea)
            .map((f) => {
              const [cx, cy] = centroids[f.properties.code];
              return (
                <g key={`site-${f.properties.code}`} pointerEvents="none">
                  <circle cx={cx} cy={cy} r={6} fill="#ffffff" stroke="#14181f" strokeWidth={1.5} />
                  <circle cx={cx} cy={cy} r={2.2} fill="#14181f" />
                </g>
              );
            })}

          {labels &&
            geo.features.map((f) => {
              const [cx, cy] = centroids[f.properties.code];
              return (
                <text
                  key={`t-${f.properties.code}`}
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={8}
                  fill="#1f2933"
                  pointerEvents="none"
                >
                  {f.properties.code.replace("E020", "")}
                </text>
              );
            })}
        </svg>

        {hov && (
          <div className="pointer-events-none absolute left-4 top-4 rounded-lg border border-line bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
            <div className="text-[12px] font-semibold">{hov.area.name}</div>
            <div className="text-[10.5px] text-muted">
              {hov.area.msoaName} · {hov.area.localAuthority}
            </div>
            <div className="tabular mt-1 text-[11px]">
              FIS <span className="font-semibold">{hov.score.toFixed(1)}</span> · rank {hov.rank}/64
              {hov.area.isStudyArea && (
                <span className="ml-1.5 rounded bg-accent-soft px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wide text-accent">
                  study site
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-end gap-x-5 gap-y-2 border-t border-line px-4 py-3">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              less unequal
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              more unequal
            </span>
          </div>
          <div className="flex">
            {stops.map((s) => (
              <div key={s.colour} className="flex w-9 flex-col items-start">
                <span className="h-3 w-full" style={{ background: s.colour }} />
                <span className="tabular mt-1 text-[9px] text-muted">{s.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-0.5 text-[9.5px] text-muted">
            Food Inequality Score · equal-count bands (~7 of 64 areas each)
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-[10.5px] text-muted">
          <span className="inline-block h-2.5 w-2.5 rounded-full border border-[#14181f] bg-white" />
          study site (Shoreditch, Brick Lane North)
        </div>
      </footer>
    </section>
  );
}
