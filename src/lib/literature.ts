export interface LiteratureEntry {
  author: string;
  position: string;
  gap: string;
  answer: string;
  /** which parts of the model discharge the gap */
  hooks: string[];
}

export const LITERATURE: LiteratureEntry[] = [
  {
    author: "Rousseau",
    position:
      "Inequality is a product of convention rather than nature, but the argument is set out in the eighteenth century with no criterion for judging a given inequality and no account of race or empire.",
    gap: "No criterion of judgement; race and colonialism absent.",
    answer:
      "The model supplies an explicit, auditable criterion: a stated set of variables, stated directions, stated weights, applied to a place whose population is majority-minority and whose food culture is a colonial inheritance. Every judgement in the score can be contested by moving a slider.",
    hooks: ["All domains", "Weight sliders", "Normalisation toggle"],
  },
  {
    author: "Sen",
    position:
      "Famine is a failure of entitlement, not of supply. What matters is a household's command over food, not the quantity present.",
    gap:
      "Argued through famine. Not tested where supply is abundant and the failure is purely one of command.",
    answer:
      "The study area has no supply failure at all — Shoreditch carries the densest licensed food economy in the dataset — while child poverty after housing costs runs above 38 per cent there and above 51 per cent in Brick Lane North. Income after housing costs at 40 per cent operationalises entitlement in a place of surplus.",
    hooks: ["Income domain", "Child poverty AHC", "Designation gap"],
  },
  {
    author: "Fraser",
    position:
      "Injustice has a distributive face and a recognition face; both must be addressed at once.",
    gap: "Distribution and access are argued for without area-level measurement.",
    answer:
      "Banglatown's cultural designation is set directly against its social grade and income position. The designation gap is the recognition/distribution split expressed as a single number: cultural supply percentile minus material position percentile.",
    hooks: ["Deprivation domain", "Class domain", "Designation gap"],
  },
  {
    author: "Young",
    position:
      "Injustice is structural: it follows from the positions people occupy rather than from anyone's intent.",
    gap: "No indicators of exploitation or powerlessness.",
    answer:
      "Approximated social grade DE, social and private tenure shares and qualification levels stand in for position rather than for intent. No actor in the model does anything wrong; the score is produced by structure alone.",
    hooks: ["Class domain", "Tenure indicators", "Education domain"],
  },
  {
    author: "bell hooks",
    position:
      "Consuming another culture's food can be a way of enjoying difference while leaving power relations untouched — eating the other.",
    gap: "Philosophical. No sample, no site, no fieldwork.",
    answer:
      "Given a site and a denominator. Licensed restaurants, pubs and bars per thousand residents, set against resident income and social grade, tests whether the food economy an area is celebrated for is oriented towards the people who live in it. The claim becomes falsifiable.",
    hooks: ["Food environment domain", "Designation gap", "Scatter sub-plot"],
  },
  {
    author: "Bourdieu",
    position:
      "Taste is a class relation; the classification of food classifies the classifier.",
    gap:
      "Class is primary and race and gender secondary; the field is a white French one, and the unit is the person rather than the territory.",
    answer:
      "Class is retained as a 25 per cent domain but read through a majority-minority London geography, with the classifying act relocated to a planning designation. Cultural capital enters separately as education, so class position and capital can be moved against each other.",
    hooks: ["Class domain", "Education domain", "Bourdieu preset"],
  },
  {
    author: "Rhys-Taylor",
    position:
      "The multi-ethnic street is known through smell, sound and texture; the sensory is where difference is negotiated.",
    gap: "Sensory account without quantitative anchoring.",
    answer:
      "Outlet counts by SIC code give the sensory street a denominator, so sensory description can be sited against the measured composition of the neighbourhood it describes.",
    hooks: ["Food environment domain", "Full ranking table"],
  },
  {
    author: "Pink; Télémaque",
    position:
      "Visual and sensory ethnography is a way of knowing, not an illustration of knowledge produced elsewhere.",
    gap:
      "Method is established but not applied to food inequality in this site, and not integrated with area statistics.",
    answer:
      "The score is designed to be read alongside sensory and visual fieldwork rather than instead of it: each neighbourhood is a selectable unit whose quantitative profile can be set against material gathered in the same polygon.",
    hooks: ["Selection and comparison", "Per-area indicator profile"],
  },
];

export const METHOD_NOTES = [
  {
    heading: "Unit of analysis",
    body:
      "The 2021 Middle Layer Super Output Area, of which there are 64 across Hackney and Tower Hamlets, averaging roughly 8,000 residents. This is the smallest geography at which income, social grade, tenure and business counts are all published, which is what makes the four domains commensurable at all.",
  },
  {
    heading: "Construction",
    body:
      "Each indicator is oriented so that a higher value means more food inequality, normalised across the 64 areas, combined into a domain score by within-domain weights, then combined into the headline score by domain weights. Weights are rescaled to sum to 100, so entering 30 for class rather than 25 does not silently shrink the other domains.",
  },
  {
    heading: "Ward to MSOA apportionment",
    body:
      "DWP child poverty is published by ward, and wards do not nest inside MSOAs. Each ward's poor-child count and implied child population are split by the share of the ward's area falling inside each MSOA and recombined into an MSOA rate. Area weighting rather than population weighting is the main known source of error in the deprivation domain.",
  },
  {
    heading: "Known limits",
    body:
      "Business counts are rounded to the nearest five at source, so densities in small-population MSOAs are coarse. Income is a modelled ONS estimate with published confidence intervals. Social grade is approximated from occupation, not self-reported. The score is a comparative instrument within this study area, not an absolute measure transferable elsewhere.",
  },
];
