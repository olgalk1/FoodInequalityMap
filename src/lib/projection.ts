import type { Feature, FeatureCollection, Geometry, Position } from "geojson";

interface Projected {
  /** SVG path `d` string per feature `code` property */
  paths: Record<string, string>;
  /** centroid (SVG coords) per feature `code` */
  centroids: Record<string, [number, number]>;
  width: number;
  height: number;
}

/**
 * Equirectangular projection with a cosine latitude correction, fitted to a
 * box. Accurate to well under a pixel at borough extent and needs no external
 * projection library, so the choropleth stays a pure static SVG.
 */
export function projectFeatures(
  fc: FeatureCollection<Geometry, { code: string }>,
  width: number,
  height: number,
  padding = 12,
): Projected {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  const lat0 =
    meanLat(fc) * (Math.PI / 180) || 51.53 * (Math.PI / 180);
  const kx = Math.cos(lat0);

  const toPlane = ([lon, lat]: Position): [number, number] => [lon * kx, -lat];

  eachRing(fc, (ring) => {
    for (const pt of ring) {
      const [x, y] = toPlane(pt);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  });

  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min(
    (width - padding * 2) / spanX,
    (height - padding * 2) / spanY,
  );
  const offX = padding + (width - padding * 2 - spanX * scale) / 2;
  const offY = padding + (height - padding * 2 - spanY * scale) / 2;

  const project = (pt: Position): [number, number] => {
    const [x, y] = toPlane(pt);
    return [offX + (x - minX) * scale, offY + (y - minY) * scale];
  };

  const paths: Record<string, string> = {};
  const centroids: Record<string, [number, number]> = {};

  for (const f of fc.features) {
    const code = f.properties.code;
    const { d, cx, cy } = featurePath(f, project);
    paths[code] = d;
    centroids[code] = [cx, cy];
  }

  return { paths, centroids, width, height };
}

function featurePath(
  f: Feature<Geometry, { code: string }>,
  project: (pt: Position) => [number, number],
): { d: string; cx: number; cy: number } {
  const polys = geometryPolygons(f.geometry);
  let d = "";
  let sx = 0,
    sy = 0,
    area2 = 0;

  for (const poly of polys) {
    for (const ring of poly) {
      const pts = ring.map(project);
      d += "M" + pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join("L") + "Z";
    }
    // signed-area centroid of the outer ring
    const outer = poly[0]?.map(project) ?? [];
    for (let i = 0; i < outer.length - 1; i++) {
      const [x0, y0] = outer[i];
      const [x1, y1] = outer[i + 1];
      const cross = x0 * y1 - x1 * y0;
      area2 += cross;
      sx += (x0 + x1) * cross;
      sy += (y0 + y1) * cross;
    }
  }

  if (Math.abs(area2) > 1e-6) {
    return { d, cx: sx / (3 * area2), cy: sy / (3 * area2) };
  }
  // degenerate fallback: average of first ring
  const first = polys[0]?.[0]?.map(project) ?? [[0, 0]];
  const cx = first.reduce((s, p) => s + p[0], 0) / first.length;
  const cy = first.reduce((s, p) => s + p[1], 0) / first.length;
  return { d, cx, cy };
}

function geometryPolygons(g: Geometry): Position[][][] {
  if (g.type === "Polygon") return [g.coordinates];
  if (g.type === "MultiPolygon") return g.coordinates;
  return [];
}

function eachRing(
  fc: FeatureCollection<Geometry, { code: string }>,
  fn: (ring: Position[]) => void,
): void {
  for (const f of fc.features) {
    for (const poly of geometryPolygons(f.geometry)) {
      for (const ring of poly) fn(ring);
    }
  }
}

function meanLat(fc: FeatureCollection<Geometry, { code: string }>): number {
  let sum = 0,
    n = 0;
  eachRing(fc, (ring) => {
    for (const [, lat] of ring) {
      sum += lat;
      n++;
    }
  });
  return n ? sum / n : 0;
}
