import type { DomainDef, DomainKey } from "./types";

const NOMIS = "Nomis / Census 2021";

export const DOMAINS: DomainDef[] = [
  {
    key: "income",
    label: "Income",
    defaultWeight: 40,
    colour: "#f59e0b",
    claim:
      "Sen's entitlement argument, made spatial. Food access here is not a supply problem but a question of command over resources.",
    gap:
      "Sen theorises entitlement through famine. This applies the same logic where there is no supply failure at all — an area saturated with food where households cannot command it.",
    indicators: [
      {
        key: "income_ahc",
        label: "Disposable household income after housing costs",
        short: "Net income AHC",
        unit: "gbp",
        direction: -1,
        defaultWeight: 100,
        source: "ONS small area income estimates, FYE 2023 (MSOA)",
        note:
          "Equivalised net annual household income after housing costs. Reverse-scored: lower income means higher food inequality. AHC is used deliberately because rent is the first claim on a food budget.",
      },
    ],
  },
  {
    key: "class",
    label: "Class",
    defaultWeight: 25,
    colour: "#38bdf8",
    claim:
      "Bourdieu's taste-as-class, relocated from the person to the postcode and from a white French sample to a majority-minority London one.",
    gap:
      "Bourdieu reads class through individual habitus in a white French field. Measuring approximated social grade by area lets class be tested where the population is not white and where the classifying gaze is a planning designation rather than a dinner party.",
    indicators: [
      {
        key: "class_de_pct",
        label: "Social grade DE (semi-skilled, unskilled, state dependent)",
        short: "DE share",
        unit: "pct",
        direction: 1,
        defaultWeight: 60,
        source: `${NOMIS} SG002 approximated social grade`,
        note:
          "The share of residents in the lowest approximated social grade. This is the variable that sits directly against a neighbourhood's cultural designation as a food destination.",
      },
      {
        key: "class_c2de_pct",
        label: "Social grade C2 + DE (all manual occupations)",
        short: "C2+DE share",
        unit: "pct",
        direction: 1,
        defaultWeight: 20,
        source: `${NOMIS} SG002`,
        note:
          "A wider working-class definition that captures skilled manual work. Raise this sub-weight to test whether findings depend on where the class line is drawn.",
      },
      {
        key: "class_ab_pct",
        label: "Social grade AB (higher and intermediate managerial)",
        short: "AB share",
        unit: "pct",
        direction: -1,
        defaultWeight: 20,
        source: `${NOMIS} SG002`,
        note:
          "Reverse-scored, so a large professional-managerial presence lowers the score. Captures the incoming class fraction that consumes the area's food culture.",
      },
    ],
  },
  {
    key: "deprivation",
    label: "Deprivation",
    defaultWeight: 25,
    colour: "#f472b6",
    claim:
      "Fraser's distribution claim given a measurement. Young's structural injustice given indicators of constrained position rather than intent.",
    gap:
      "Fraser and Young argue about maldistribution and structural position without area data. Child poverty after housing costs plus tenure insecurity turn those arguments into something a map can be wrong about.",
    indicators: [
      {
        key: "child_poverty_ahc_pct",
        label: "Children under 16 in relative low income families (AHC)",
        short: "Child poverty AHC",
        unit: "pct",
        direction: 1,
        defaultWeight: 50,
        source: "DWP Stat-Xplore, FYE 2025, ward level apportioned to MSOA",
        note:
          "Wards do not nest inside MSOAs, so each ward's poor-child count and child population are split by the share of its area falling in each MSOA and recombined into an MSOA rate.",
      },
      {
        key: "social_rent_pct",
        label: "Households in social rented housing",
        short: "Social rented",
        unit: "pct",
        direction: 1,
        defaultWeight: 25,
        source: `${NOMIS} TS054 tenure`,
        note:
          "Council and housing association tenancies combined. A marker of low and fixed income rather than of housing insecurity as such.",
      },
      {
        key: "private_rent_pct",
        label: "Households in private rented housing",
        short: "Private rented",
        unit: "pct",
        direction: 1,
        defaultWeight: 25,
        source: `${NOMIS} TS054 tenure`,
        note:
          "Insecure tenure at market rent. In a gentrifying area this cuts both ways: it captures displacement pressure but also incoming higher-income renters, so it is worth testing at a low sub-weight.",
      },
    ],
  },
  {
    key: "education",
    label: "Education",
    defaultWeight: 10,
    colour: "#a78bfa",
    claim:
      "The cultural capital component of the model: who is positioned to be read as a legitimate producer of food culture rather than its raw material.",
    gap:
      "Treated as a capital measure rather than a competence measure. Low qualification levels are not read as a deficit but as a marker of exclusion from the professional food economy the area hosts.",
    indicators: [
      {
        key: "no_quals_pct",
        label: "Residents 16+ with no qualifications",
        short: "No qualifications",
        unit: "pct",
        direction: 1,
        defaultWeight: 50,
        source: `${NOMIS} TS067 highest level of qualification`,
        note: "Share of the 16+ population reporting no qualifications at Census 2021.",
      },
      {
        key: "level4plus_pct",
        label: "Residents 16+ with Level 4 or above",
        short: "Level 4+",
        unit: "pct",
        direction: -1,
        defaultWeight: 50,
        source: `${NOMIS} TS067`,
        note:
          "Reverse-scored graduate share. Separates areas that are poor and non-graduate from areas that are non-graduate but adjacent to a graduate influx.",
      },
    ],
  },
  {
    key: "foodEnvironment",
    label: "Food environment",
    defaultWeight: 0,
    colour: "#34d399",
    claim:
      "hooks' 'eating the other' and Rhys-Taylor's sensory street, given a denominator. Off by default so the headline model stays 40/25/25/10.",
    gap:
      "hooks has no sample and no site; Rhys-Taylor has the street but no counts. Outlet density per thousand residents tests whether the food economy an area is famous for is oriented towards the people who live in it.",
    indicators: [
      {
        key: "cultural_food_density",
        label: "Licensed restaurants, pubs, bars and clubs per 1,000 residents",
        short: "Cultural food supply",
        unit: "per1k",
        direction: 1,
        defaultWeight: 60,
        source: "ONS UK Business Counts 2025, SIC 56101 / 56301 / 56302 (MSOA)",
        note:
          "The visitor-facing food economy. Direction is contested and deliberately exposed: high supply alongside low income is the designation gap, not abundance. Counts are rounded to the nearest 5 at source.",
      },
      {
        key: "takeaway_density",
        label: "Takeaways and unlicensed cafes per 1,000 residents",
        short: "Takeaway supply",
        unit: "per1k",
        direction: 1,
        defaultWeight: 40,
        source: "ONS UK Business Counts 2025, SIC 56102 / 56103 (MSOA)",
        note:
          "The everyday, resident-facing end of the food economy. Reads as a proxy for cheap calorie availability rather than for choice.",
      },
    ],
  },
];

export const DOMAIN_MAP: Record<DomainKey, DomainDef> = Object.fromEntries(
  DOMAINS.map((d) => [d.key, d]),
) as Record<DomainKey, DomainDef>;

export const DOMAIN_KEYS = DOMAINS.map((d) => d.key);

export interface Preset {
  id: string;
  /** short chip label */
  label: string;
  /** one-line note shown on hover */
  rationale: string;
  domains: Record<DomainKey, number>;
}

export const PRESETS: Preset[] = [
  {
    id: "baseline",
    label: "Baseline",
    rationale: "40 / 25 / 25 / 10. Entitlement first, class and deprivation joint second, capital a modifier.",
    domains: { income: 40, class: 25, deprivation: 25, education: 10, foodEnvironment: 0 },
  },
  {
    id: "equal",
    label: "Equal",
    rationale: "25 each. A null check: does the ranking survive dropping the chosen weights?",
    domains: { income: 25, class: 25, deprivation: 25, education: 25, foodEnvironment: 0 },
  },
  {
    id: "sen",
    label: "Sen",
    rationale: "Income only. How much of the pattern is command over resources alone?",
    domains: { income: 100, class: 0, deprivation: 0, education: 0, foodEnvironment: 0 },
  },
  {
    id: "bourdieu",
    label: "Bourdieu",
    rationale: "Class and capital led, income demoted to a constraint.",
    domains: { income: 20, class: 45, deprivation: 10, education: 25, foodEnvironment: 0 },
  },
  {
    id: "fraser",
    label: "Fraser",
    rationale: "Distribution and access foregrounded, recognition demoted.",
    domains: { income: 35, class: 15, deprivation: 45, education: 5, foodEnvironment: 0 },
  },
  {
    id: "hooks",
    label: "hooks",
    rationale: "Food environment in at full strength alongside class.",
    domains: { income: 25, class: 25, deprivation: 20, education: 5, foodEnvironment: 25 },
  },
];
