import type { Unit } from "./types";

export function formatValue(value: number | null | undefined, unit: Unit): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  switch (unit) {
    case "gbp":
      return `£${Math.round(value).toLocaleString("en-GB")}`;
    case "pct":
      return `${value.toFixed(1)}%`;
    case "per1k":
      return `${value.toFixed(1)} /1k`;
    default:
      return value.toLocaleString("en-GB");
  }
}

/**
 * Sequential scale for the Food Inequality Score (ColorBrewer YlOrRd, 9-class).
 * Single emotive direction — more inequality reads hotter and darker — because
 * a red↔green diverging ramp would imply the low end is "good", which it is
 * not, and red/green fails for colour-blind readers. The wide yellow→dark-red
 * span keeps 64 areas distinguishable.
 */
export const SCALE = [
  "#ffffcc",
  "#ffeda0",
  "#fed976",
  "#feb24c",
  "#fd8d3c",
  "#fc4e2a",
  "#e31a1c",
  "#bd0026",
  "#800026",
];

/** Linear map from a value onto the scale, used as a fallback. */
export function scoreColour(score: number, min = 0, max = 100): string {
  const t = Math.max(0, Math.min(1, (score - min) / (max - min || 1)));
  const idx = Math.min(SCALE.length - 1, Math.floor(t * SCALE.length));
  return SCALE[idx];
}

/**
 * Quantile map: colour by an area's rank position within the whole set, so each
 * band holds a roughly equal number of areas and the full palette is always in
 * use regardless of how tightly the scores cluster. `sortedAsc` is every score
 * in the comparison set, ascending.
 */
export function quantileColour(value: number, sortedAsc: number[]): string {
  const n = sortedAsc.length;
  if (n === 0) return SCALE[0];
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  const frac = (lo - 0.5) / n; // midpoint rank in [0, 1)
  const idx = Math.min(SCALE.length - 1, Math.max(0, Math.floor(frac * SCALE.length)));
  return SCALE[idx];
}

function quantile(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return NaN;
  const pos = p * (n - 1);
  const base = Math.floor(pos);
  const rest = pos - base;
  return sortedAsc[base + 1] !== undefined
    ? sortedAsc[base] + rest * (sortedAsc[base + 1] - sortedAsc[base])
    : sortedAsc[base];
}

/** Legend swatches for the quantile scale: each label is the band's lower edge. */
export function quantileStops(sortedAsc: number[]): { colour: string; label: string }[] {
  return SCALE.map((colour, i) => ({
    colour,
    label: quantile(sortedAsc, i / SCALE.length).toFixed(1),
  }));
}

/** Legend swatches for a plain linear scale between two values. */
export function scaleStops(min: number, max: number): { colour: string; label: string }[] {
  return SCALE.map((colour, i) => ({
    colour,
    label: (min + ((max - min) * i) / (SCALE.length - 1)).toFixed(0),
  }));
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Series colours for selected areas across the map and the sub-plots. */
export const SERIES_COLOURS = ["#1d4ed8", "#c2410c", "#047857", "#7c3aed", "#be123c"];
