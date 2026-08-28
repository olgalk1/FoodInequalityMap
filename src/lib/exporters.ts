"use client";

/** Trigger a browser download for an arbitrary blob. */
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadCsv(rows: (string | number)[][], filename: string): void {
  const body = rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
  download(new Blob([body], { type: "text/csv;charset=utf-8" }), filename);
}

/** Serialise a live <svg> element to a standalone SVG string. */
export function svgToString(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const rect = svg.getBoundingClientRect();
  if (!clone.getAttribute("width")) clone.setAttribute("width", String(Math.round(rect.width)));
  if (!clone.getAttribute("height")) clone.setAttribute("height", String(Math.round(rect.height)));
  // white ground so exported charts are not transparent
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("x", "0");
  bg.setAttribute("y", "0");
  bg.setAttribute("width", "100%");
  bg.setAttribute("height", "100%");
  bg.setAttribute("fill", "#ffffff");
  clone.insertBefore(bg, clone.firstChild);
  return new XMLSerializer().serializeToString(clone);
}

export function downloadSvg(svg: SVGSVGElement, filename: string): void {
  download(new Blob([svgToString(svg)], { type: "image/svg+xml;charset=utf-8" }), filename);
}

/** Rasterise an <svg> element to a PNG at `scale`× device resolution. */
export async function downloadPng(
  svg: SVGSVGElement,
  filename: string,
  scale = 2,
): Promise<void> {
  const str = svgToString(svg);
  const rect = svg.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  const img = new Image();
  img.crossOrigin = "anonymous";
  const src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(str);

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("SVG rasterisation failed"));
    img.src = src;
  });

  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  await new Promise<void>((resolve) =>
    canvas.toBlob((blob) => {
      if (blob) download(blob, filename);
      resolve();
    }, "image/png"),
  );
}

/** Find the first rendered <svg> inside a container (e.g. a Recharts wrapper). */
export function findSvg(container: HTMLElement | null): SVGSVGElement | null {
  return container?.querySelector("svg") ?? null;
}
