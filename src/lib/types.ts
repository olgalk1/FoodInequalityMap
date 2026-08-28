export type Direction = 1 | -1;

export type Unit = "gbp" | "pct" | "per1k" | "count";

export interface IndicatorDef {
  /** key into the raw area record */
  key: string;
  label: string;
  short: string;
  unit: Unit;
  /** 1 = a higher raw value means more food inequality */
  direction: Direction;
  /** default weight *within* its domain, in percentage points */
  defaultWeight: number;
  source: string;
  note: string;
}

export interface DomainDef {
  key: DomainKey;
  label: string;
  /** default weight in the headline model, in percentage points */
  defaultWeight: number;
  colour: string;
  claim: string;
  gap: string;
  indicators: IndicatorDef[];
}

export type DomainKey =
  | "income"
  | "class"
  | "deprivation"
  | "education"
  | "foodEnvironment";

export type NormMode = "minmax" | "rank" | "z";

export interface Area {
  code: string;
  name: string;
  msoaName: string;
  localAuthority: "Hackney" | "Tower Hamlets";
  isStudyArea: boolean;
  studyLabel: string | null;
  centroid: [number, number] | null;
  [indicator: string]: unknown;
}

export interface Weights {
  domains: Record<DomainKey, number>;
  indicators: Record<string, number>;
}

export interface ScoredArea {
  area: Area;
  /** 0-100, higher = greater modelled food inequality */
  score: number;
  rank: number;
  /** 1-5, 5 = most unequal quintile */
  quintile: number;
  /** normalised 0-100 value per indicator key */
  indicator: Record<string, number>;
  /** 0-100 domain sub-score */
  domain: Record<DomainKey, number>;
  /** points of the final score contributed by each domain */
  contribution: Record<DomainKey, number>;
  designationGap: number;
}

export interface BoroughPay {
  date: string;
  median_hackney_newham: number | null;
  median_tower_hamlets: number | null;
  mean_hackney_newham: number | null;
  mean_tower_hamlets: number | null;
}

export interface WardPoverty {
  ward_code: string;
  ward_name: string;
  local_authority: string;
  child_poverty_ahc_pct: number;
  child_poverty_bhc_pct: number;
  child_poverty_bhc_pct_2022: number;
  children_ahc_2025: number;
}

export interface AltClassShares {
  class_ab_pct: number;
  class_c2_pct: number;
  class_de_pct: number;
  class_c2de_pct: number;
  population_in_households: number;
}

export interface AltClassVariant {
  source: string;
  Hackney: AltClassShares;
  "Tower Hamlets": AltClassShares;
}

export interface AltClassGrade {
  note: string;
  ethnicGroup: AltClassVariant;
  sexAge: AltClassVariant;
}

export interface ContextData {
  boroughPay: BoroughPay[];
  altClassGrade: AltClassGrade;
  wardChildPoverty: WardPoverty[];
  studyAreas: Record<string, string>;
}
