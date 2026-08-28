"use client";

import { useMemo, useState } from "react";
import type { FeatureCollection, Geometry } from "geojson";

import DataTable from "./DataTable";
import MapPanel from "./MapPanel";
import MethodDrawer from "./MethodDrawer";
import SubPlots from "./SubPlots";
import { DOMAINS, PRESETS } from "@/lib/indicators";
import { SERIES_COLOURS } from "@/lib/format";
import { defaultWeights, runModel } from "@/lib/model";
import type { Area, ContextData, DomainKey, NormMode, Weights } from "@/lib/types";

export interface DashboardProps {
  areas: Area[];
  geo: FeatureCollection<Geometry, { code: string; name: string }>;
  context: ContextData;
}

const MAX_SELECTION = 4;

const NORM_LABEL: Record<NormMode, string> = {
  minmax: "Min–max",
  rank: "Percentile",
  z: "Z-score",
};

export default function Dashboard({ areas, geo }: DashboardProps) {
  const [weights, setWeights] = useState<Weights>(defaultWeights);
  const [mode, setMode] = useState<NormMode>("minmax");
  const [preset, setPreset] = useState<string>("baseline");
  const [selected, setSelected] = useState<string[]>(() =>
    areas.filter((a) => a.isStudyArea).map((a) => a.code),
  );
  const [hovered, setHovered] = useState<string | null>(null);
  const [showMethod, setShowMethod] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const baselineDomains = useMemo(
    () =>
      Object.fromEntries(DOMAINS.map((d) => [d.key, d.defaultWeight])) as Record<
        DomainKey,
        number
      >,
    [],
  );

  // truly fixed reference the map draws — never moves
  const mapModel = useMemo(
    () => runModel(areas, defaultWeights(), "minmax"),
    [areas],
  );
  // default weights under the chosen normalisation — the Δ reference
  const baseModel = useMemo(
    () => runModel(areas, defaultWeights(), mode),
    [areas, mode],
  );
  // live specification
  const model = useMemo(() => runModel(areas, weights, mode), [areas, weights, mode]);

  const setDomainWeight = (key: DomainKey, value: number) => {
    setPreset("custom");
    setWeights((w) => ({ ...w, domains: { ...w.domains, [key]: value } }));
  };

  const setIndicatorWeight = (key: string, value: number) => {
    setPreset("custom");
    setWeights((w) => ({ ...w, indicators: { ...w.indicators, [key]: value } }));
  };

  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setPreset(id);
    setWeights((w) => ({ ...w, domains: { ...p.domains } }));
  };

  const resetAll = () => {
    setWeights(defaultWeights());
    setMode("minmax");
    setPreset("baseline");
  };

  const toggle = (code: string) =>
    setSelected((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code].slice(-MAX_SELECTION),
    );

  const total = DOMAINS.reduce((s, d) => s + (weights.domains[d.key] ?? 0), 0);

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-[1180px] px-5 py-6">
        {/* ---- title ---- */}
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight">
              Food Inequality Score — Shoreditch &amp; Brick Lane
            </h1>
            <p className="mt-0.5 max-w-[70ch] text-[12.5px] leading-relaxed text-muted">
              A weighted factor model of food inequality across the 64 MSOAs of Hackney and Tower
              Hamlets, built to test where the food-justice literature stops short of area-level
              measurement. Every judgement in the score is an adjustable, exportable weight.
            </p>
          </div>
          <button
            onClick={() => setShowMethod(true)}
            className="rounded-md border border-line px-3 py-1.5 text-[12px] font-medium transition hover:border-line-strong"
          >
            Methodology &amp; sources
          </button>
        </header>

        {/* ---- specification bar ---- */}
        <div className="card mb-5 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                Preset
              </span>
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id)}
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

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                Normalise
              </span>
              {(Object.keys(NORM_LABEL) as NormMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                    mode === m
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line text-muted hover:border-line-strong hover:text-text"
                  }`}
                >
                  {NORM_LABEL[m]}
                </button>
              ))}
            </div>

            <button
              onClick={resetAll}
              className="rounded-full border border-line px-2.5 py-1 text-[11px] text-muted transition hover:border-line-strong hover:text-text"
            >
              Reset to baseline
            </button>

            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-[11px] text-muted underline-offset-2 transition hover:text-text hover:underline"
            >
              {showAdvanced ? "Hide" : "Show"} within-domain weights
            </button>

            <div className="ml-auto flex items-center gap-2 text-[11px] text-muted">
              <span className="tabular">
                entered {total.toFixed(0)}
                {Math.abs(total - 100) > 0.5 && <span className="text-accent"> → rescaled 100</span>}
              </span>
            </div>
          </div>

          {/* selected areas */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              Pinned
            </span>
            {selected.length === 0 && (
              <span className="text-[11px] text-muted">
                none — click the map or a table row (up to {MAX_SELECTION})
              </span>
            )}
            {selected.map((code, idx) => {
              const a = model.byCode[code]?.area;
              return (
                <span
                  key={code}
                  className="flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[11px]"
                  onMouseEnter={() => setHovered(code)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: SERIES_COLOURS[idx % SERIES_COLOURS.length] }}
                  />
                  {a?.name ?? code}
                  <button
                    onClick={() => toggle(code)}
                    className="text-muted transition hover:text-accent"
                    aria-label={`Unpin ${a?.name ?? code}`}
                  >
                    ×
                  </button>
                </span>
              );
            })}
            {selected.length > 0 && (
              <button
                onClick={() => setSelected([])}
                className="ml-1 text-[11px] text-muted transition hover:text-accent"
              >
                clear
              </button>
            )}
          </div>

          {showAdvanced && (
            <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-line pt-3 sm:grid-cols-2 lg:grid-cols-3">
              {DOMAINS.map((d) => (
                <div key={d.key}>
                  <div className="flex items-center gap-1.5 text-[11px] font-medium">
                    <span className="h-2 w-2 rounded-full" style={{ background: d.colour }} />
                    {d.label}
                  </div>
                  <div className="mt-1 space-y-1.5">
                    {d.indicators.map((i) => (
                      <label key={i.key} className="block">
                        <div className="flex items-baseline justify-between text-[10.5px] text-muted">
                          <span>
                            {i.short}{" "}
                            <span className={i.direction === 1 ? "text-accent" : "text-[#1d4ed8]"}>
                              {i.direction === 1 ? "↑" : "↓"}
                            </span>
                          </span>
                          <span className="tabular">{Math.round(weights.indicators[i.key] ?? 0)}</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={weights.indicators[i.key] ?? 0}
                          onChange={(e) => setIndicatorWeight(i.key, Number(e.target.value))}
                          style={{ ["--knob" as string]: d.colour }}
                          className="mt-0.5"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <MapPanel
            geo={geo}
            baseModel={mapModel}
            selected={selected}
            hovered={hovered}
            onSelect={toggle}
            onHover={setHovered}
          />

          <SubPlots
            areas={areas}
            model={model}
            baseModel={baseModel}
            baselineDomains={baselineDomains}
            weights={weights}
            setDomainWeight={setDomainWeight}
            selected={selected}
            hovered={hovered}
            onHover={setHovered}
          />

          <DataTable
            areas={areas}
            model={model}
            baseModel={baseModel}
            weights={weights}
            mode={mode}
            selected={selected}
            onSelect={toggle}
            hovered={hovered}
            onHover={setHovered}
          />
        </div>

        <footer className="mt-6 text-[10.5px] leading-relaxed text-muted">
          Sources: ONS Census 2021 (approximated social grade SG002, tenure TS054, qualifications
          TS067), ONS small area income estimates FYE 2023, ONS UK Business Counts 2025, DWP
          Stat-Xplore children in low-income families FYE 2025 (ward, area-apportioned to MSOA),
          ONS Open Geography Portal boundaries. The score is a comparative instrument within this
          study area, not an absolute measure transferable elsewhere.
        </footer>
      </div>

      {showMethod && <MethodDrawer onClose={() => setShowMethod(false)} />}
    </div>
  );
}
