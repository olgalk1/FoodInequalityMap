import { DOMAINS, DOMAIN_KEYS } from "./indicators";
import type {
  Area,
  DomainKey,
  IndicatorDef,
  NormMode,
  ScoredArea,
  Weights,
} from "./types";

export const ALL_INDICATORS: IndicatorDef[] = DOMAINS.flatMap((d) => d.indicators);

export function defaultWeights(): Weights {
  return {
    domains: Object.fromEntries(
      DOMAINS.map((d) => [d.key, d.defaultWeight]),
    ) as Record<DomainKey, number>,
    indicators: Object.fromEntries(
      ALL_INDICATORS.map((i) => [i.key, i.defaultWeight]),
    ),
  };
}

function raw(area: Area, key: string): number | null {
  const v = area[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Normalise one indicator across the whole study area onto 0-100, where 100
 * always means "most food-inequality-prone", regardless of the raw direction.
 */
function normaliseIndicator(
  areas: Area[],
  def: IndicatorDef,
  mode: NormMode,
): Record<string, number> {
  const oriented = areas.map((a) => {
    const v = raw(a, def.key);
    return { code: a.code, v: v === null ? null : v * def.direction };
  });
  const values = oriented.map((o) => o.v).filter((v): v is number => v !== null);
  const out: Record<string, number> = {};

  if (values.length === 0) {
    oriented.forEach((o) => (out[o.code] = 50));
    return out;
  }

  if (mode === "minmax") {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    oriented.forEach((o) => {
      out[o.code] = o.v === null ? 50 : ((o.v - min) / span) * 100;
    });
    return out;
  }

  if (mode === "rank") {
    const sorted = [...values].sort((a, b) => a - b);
    oriented.forEach((o) => {
      if (o.v === null) {
        out[o.code] = 50;
        return;
      }
      const lower = sorted.findIndex((s) => s >= o.v!);
      const upper = sorted.filter((s) => s <= o.v!).length - 1;
      out[o.code] = ((lower + upper) / 2 / (sorted.length - 1 || 1)) * 100;
    });
    return out;
  }

  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const sd =
    Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length) || 1;
  oriented.forEach((o) => {
    if (o.v === null) {
      out[o.code] = 50;
      return;
    }
    const z = Math.max(-2.5, Math.min(2.5, (o.v - mean) / sd));
    out[o.code] = ((z + 2.5) / 5) * 100;
  });
  return out;
}

function share(values: Record<string, number>): Record<string, number> {
  const total = Object.values(values).reduce((s, v) => s + Math.max(0, v), 0);
  if (total <= 0) {
    const n = Object.keys(values).length || 1;
    return Object.fromEntries(Object.keys(values).map((k) => [k, 1 / n]));
  }
  return Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, Math.max(0, v) / total]),
  );
}

export interface ModelResult {
  scored: ScoredArea[];
  byCode: Record<string, ScoredArea>;
  /** effective domain weights after renormalising to 100 */
  effectiveDomainWeights: Record<DomainKey, number>;
  /** normalised indicator matrix, reused by the sensitivity sweep */
  normalised: Record<string, Record<string, number>>;
  range: { min: number; max: number };
}

export function runModel(
  areas: Area[],
  weights: Weights,
  mode: NormMode = "minmax",
): ModelResult {
  const normalised: Record<string, Record<string, number>> = {};
  for (const def of ALL_INDICATORS) {
    normalised[def.key] = normaliseIndicator(areas, def, mode);
  }
  return assemble(areas, weights, normalised);
}

/**
 * Run the model after overriding specific raw indicator values for specific
 * areas. `overrides` is keyed by area code, then by indicator key. Used by the
 * sub-plots to ask "what would the score be if this neighbourhood's actual
 * figure were X", with the weighting method held constant.
 */
export function runModelWith(
  areas: Area[],
  weights: Weights,
  overrides: Record<string, Record<string, number>>,
): ModelResult {
  const patched = areas.map((a) =>
    overrides[a.code] ? { ...a, ...overrides[a.code] } : a,
  );
  return runModel(patched, weights, "minmax");
}

/** Rebuilds scores from an already-normalised matrix. Cheap enough to sweep. */
export function assemble(
  areas: Area[],
  weights: Weights,
  normalised: Record<string, Record<string, number>>,
): ModelResult {
  const domainShare = share(
    Object.fromEntries(DOMAIN_KEYS.map((k) => [k, weights.domains[k] ?? 0])),
  );
  const indicatorShare: Record<DomainKey, Record<string, number>> = {} as never;
  for (const d of DOMAINS) {
    indicatorShare[d.key] = share(
      Object.fromEntries(
        d.indicators.map((i) => [i.key, weights.indicators[i.key] ?? 0]),
      ),
    );
  }

  const incomeRank = normalised["income_ahc"];
  const culturalRank = normalised["cultural_food_density"];

  const partial = areas.map((area) => {
    const indicator: Record<string, number> = {};
    const domain = {} as Record<DomainKey, number>;
    const contribution = {} as Record<DomainKey, number>;
    let score = 0;

    for (const d of DOMAINS) {
      let sub = 0;
      for (const i of d.indicators) {
        const v = normalised[i.key][area.code] ?? 50;
        indicator[i.key] = v;
        sub += v * indicatorShare[d.key][i.key];
      }
      domain[d.key] = sub;
      const contrib = sub * domainShare[d.key];
      contribution[d.key] = contrib;
      score += contrib;
    }

    const designationGap =
      (culturalRank?.[area.code] ?? 50) - (100 - (incomeRank?.[area.code] ?? 50));

    return { area, score, indicator, domain, contribution, designationGap };
  });

  const order = [...partial].sort((a, b) => b.score - a.score);
  const scored: ScoredArea[] = order.map((p, idx) => ({
    ...p,
    rank: idx + 1,
    quintile: Math.min(5, Math.floor((idx / order.length) * 5) + 1),
  }));
  const byCode = Object.fromEntries(scored.map((s) => [s.area.code, s]));
  const values = scored.map((s) => s.score);

  return {
    scored: areas.map((a) => byCode[a.code]),
    byCode,
    effectiveDomainWeights: Object.fromEntries(
      DOMAIN_KEYS.map((k) => [k, domainShare[k] * 100]),
    ) as Record<DomainKey, number>,
    normalised,
    range: { min: Math.min(...values), max: Math.max(...values) },
  };
}

export interface SweepPoint {
  weight: number;
  [code: string]: number;
}

/**
 * Sweep one domain's weight from 0 to `max`, holding the *ratios* of the other
 * domains fixed at whatever `baseDomains` specifies, and report the resulting
 * score for each requested area.
 *
 * Call it once with the baseline specification's domain weights to get the
 * "original" response curve, and again with the live weights to get the
 * "adjusted" curve. Where the other domains are untouched the two coincide.
 */
export function sweepDomainCurve(
  areas: Area[],
  normalised: Record<string, Record<string, number>>,
  indicatorWeights: Record<string, number>,
  baseDomains: Record<DomainKey, number>,
  target: DomainKey,
  codes: string[],
  max = 100,
  step = 2,
): SweepPoint[] {
  const others = DOMAIN_KEYS.filter((k) => k !== target);
  const othersTotal = others.reduce((s, k) => s + (baseDomains[k] ?? 0), 0);
  const points: SweepPoint[] = [];

  for (let w = 0; w <= max; w += step) {
    const remaining = Math.max(0, 100 - w);
    const domains = { ...baseDomains, [target]: w } as Record<DomainKey, number>;
    for (const k of others) {
      domains[k] =
        othersTotal > 0
          ? ((baseDomains[k] ?? 0) / othersTotal) * remaining
          : remaining / others.length;
    }
    const res = assemble(areas, { domains, indicators: indicatorWeights }, normalised);
    const point: SweepPoint = { weight: w };
    for (const code of codes) point[code] = res.byCode[code]?.score ?? 0;
    points.push(point);
  }
  return points;
}

/** Spearman rank correlation between two specifications, for robustness notes. */
export function rankCorrelation(a: ScoredArea[], b: ScoredArea[]): number {
  const bRank = Object.fromEntries(b.map((s) => [s.area.code, s.rank]));
  const n = a.length;
  if (n < 2) return 1;
  const dSquared = a.reduce(
    (s, x) => s + (x.rank - (bRank[x.area.code] ?? x.rank)) ** 2,
    0,
  );
  return 1 - (6 * dSquared) / (n * (n * n - 1));
}
