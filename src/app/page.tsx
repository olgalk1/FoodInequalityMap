import fs from "node:fs/promises";
import path from "node:path";

import Dashboard from "@/components/Dashboard";
import type { Area, ContextData } from "@/lib/types";

async function readJson<T>(file: string): Promise<T> {
  const raw = await fs.readFile(path.join(process.cwd(), "public", "data", file), "utf8");
  return JSON.parse(raw) as T;
}

export default async function Page() {
  const [areas, geo, context] = await Promise.all([
    readJson<Area[]>("areas.json"),
    readJson<Parameters<typeof Dashboard>[0]["geo"]>("msoa.geojson"),
    readJson<ContextData>("context.json"),
  ]);

  return <Dashboard areas={areas} geo={geo} context={context} />;
}
