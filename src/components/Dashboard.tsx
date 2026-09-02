"use client";

import { useMemo, useState } from "react";
import type { FeatureCollection, Geometry } from "geojson";

import BarCharts from "./BarCharts";
import Correlations from "./Correlations";
import DataTable from "./DataTable";
import MapPanel from "./MapPanel";
import MethodDrawer from "./MethodDrawer";
import SubPlots from "./SubPlots";
import { PRESETS } from "@/lib/indicators";
import { SERIES_COLOURS } from "@/lib/format";
import { defaultWeights, runModel } from "@/lib/model";
import type { Area, ContextData, Weights } from "@/lib/types";

export interface DashboardProps {
  areas: Area[];
  geo: FeatureCollection<Geometry, { code: string; name: string }>;
  context: ContextData;
}

const MAX_SELECTION = 5;

export default function Dashboard({ areas, geo, context }: DashboardProps) {
  const [mapPreset, setMapPreset] = useState<string>("baseline");
  const [selected, setSelected] = useState<string[]>(() =>
    areas.filter((a) => a.isStudyArea).map((a) => a.code),
  );
  const [hovered, setHovered] = useState<string | null>(null);
  const [showMethod, setShowMethod] = useState(false);

  const defaults = useMemo(() => defaultWeights(), []);

  // The map (and the table that reads out its numbers) follows the preset.
  const mapWeights: Weights = useMemo(() => {
    const p = PRESETS.find((x) => x.id === mapPreset) ?? PRESETS[0];
    return { domains: { ...p.domains }, indicators: { ...defaults.indicators } };
  }, [mapPreset, defaults]);

  const mapModel = useMemo(() => runModel(areas, mapWeights), [areas, mapWeights]);

  // The fixed baseline specification — reference for the sub-plots and bar charts.
  const baseModel = useMemo(() => runModel(areas, defaults), [areas, defaults]);

  const toggle = (code: string) =>
    setSelected((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code].slice(-MAX_SELECTION),
    );

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-[1180px] px-5 py-6">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight">
              Food Inequality Score — Shoreditch &amp; Brick Lane
            </h1>
            <p className="mt-0.5 text-[12.5px] text-muted">
              A weighted factor model across the 64 MSOAs of Hackney and Tower Hamlets.
            </p>
          </div>
          <button
            onClick={() => setShowMethod(true)}
            className="rounded-md border border-line px-3 py-1.5 text-[12px] font-medium transition hover:border-line-strong"
          >
            Methodology &amp; sources
          </button>
        </header>

        {/* pinned areas */}
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            Pinned
          </span>
          {selected.length === 0 && (
            <span className="text-[11px] text-muted">
              none — click the map or a table row (up to {MAX_SELECTION})
            </span>
          )}
          {selected.map((code, idx) => {
            const a = mapModel.byCode[code]?.area;
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

        <div className="space-y-5">
          <MapPanel
            geo={geo}
            model={mapModel}
            preset={mapPreset}
            onPreset={setMapPreset}
            selected={selected}
            hovered={hovered}
            onSelect={toggle}
            onHover={setHovered}
          />

          <BarCharts
            areas={areas}
            baseModel={baseModel}
            altClassGrade={context.altClassGrade}
          />

          <SubPlots
            areas={areas}
            baseModel={baseModel}
            hovered={hovered}
            onHover={setHovered}
          />

          <Correlations baseModel={baseModel} />

          <DataTable
            areas={areas}
            model={mapModel}
            baseModel={baseModel}
            weights={mapWeights}
            preset={mapPreset}
            selected={selected}
            onSelect={toggle}
            hovered={hovered}
            onHover={setHovered}
          />
        </div>

        <footer className="mt-6 text-[10.5px] leading-relaxed text-muted">
          Sources: ONS Census 2021 (approximated social grade SG002 / SG006 / SG013, tenure TS054,
          qualifications TS067), ONS small area income estimates FYE 2023, ONS UK Business Counts
          2025, DWP Stat-Xplore children in low-income families FYE 2025 (ward, area-apportioned to
          MSOA), ONS Open Geography Portal boundaries. The score is a comparative instrument within
          this study area, not an absolute measure transferable elsewhere.
        </footer>
      </div>

      {showMethod && <MethodDrawer onClose={() => setShowMethod(false)} />}
    </div>
  );
}
