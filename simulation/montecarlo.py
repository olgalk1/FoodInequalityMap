#!/usr/bin/env python3
"""Food Inequality Score — data-ageing simulation (plain-script version of montecarlo.ipynb).

Drags every model input forward from its real vintage to 2026 with plausible year-by-year
drift, N times, and reports the gap between the published score and the simulated-2026 score
for Shoreditch and Brick Lane North as an error rate.

    python3 montecarlo.py        # needs numpy; use the notebook for the figures
"""
from __future__ import annotations
import json
import pathlib

import numpy as np

HERE = pathlib.Path(__file__).parent
AREAS = json.loads((HERE / "areas.json").read_text())

SHOREDITCH, BRICK_LANE = "E02007111", "E02000872"
N_PATHS, YEARS, STEPS, SEED = 20_000, 5, 5, 20260829

DOMAINS = {
    "income":      (40, [("income_ahc", -1, 100)]),
    "class":       (25, [("class_de_pct", 1, 60), ("class_c2de_pct", 1, 20), ("class_ab_pct", -1, 20)]),
    "deprivation": (25, [("child_poverty_ahc_pct", 1, 50), ("social_rent_pct", 1, 25), ("private_rent_pct", 1, 25)]),
    "education":   (10, [("no_quals_pct", 1, 50), ("level4plus_pct", -1, 50)]),
    "food":        (0,  [("cultural_food_density", 1, 60), ("takeaway_density", 1, 40)]),
}
IND = [k for _, xs in DOMAINS.values() for (k, _, _) in xs]
CODES = [a["code"] for a in AREAS]
IX = {c: i for i, c in enumerate(CODES)}
i_sh, i_bl = IX[SHOREDITCH], IX[BRICK_LANE]
BASE = {k: np.array([a[k] for a in AREAS], float)
        for k in set(IND) | {"income_ahc_ci_lower", "income_ahc_ci_upper"}}

# per-year drift; *_study_extra applies only to the two study areas
A = dict(
    income_growth=(0.035, 0.020),   income_study_extra=(0.040, 0.030),
    upgrade_national=(0.35, 0.15),   upgrade_study_extra=(0.60, 0.30),
    childpov_drift=(0.20, 0.30),
    social_rent_drift=(-0.20, 0.20),
    private_rent_drift=(0.15, 0.25), private_rent_study_extra=(0.30, 0.30),
    l4_drift=(0.70, 0.25),           l4_study_extra=(0.40, 0.30),
    noqual_drift=(-0.40, 0.20),      noqual_study_extra=(-0.20, 0.20),
)
STALE = dict(income=3, grade=5, tenure=5, quals=5, childpov=1, food=0)   # years to 2026


def _share(w):
    t = sum(max(0.0, v) for v in w.values()) or 1.0
    return {k: max(0.0, v) / t for k, v in w.items()}


def score(smp):
    dS = _share({d: DOMAINS[d][0] for d in DOMAINS})
    fis = 0
    for d, (_, xs) in DOMAINS.items():
        iS = _share({k: w for (k, _, w) in xs})
        sub = 0
        for k, direction, _ in xs:
            o = smp[k] * direction
            mn, mx = o.min(1, keepdims=True), o.max(1, keepdims=True)
            sub = sub + (o - mn) / np.where(mx - mn == 0, 1, mx - mn) * 100 * iS[k]
        fis = fis + sub * dS[d]
    return fis


def simulate(n, seed=SEED):
    rng = np.random.default_rng(seed)
    study = np.zeros(64); study[i_sh] = study[i_bl] = 1.0
    tile = lambda v: np.tile(v, (n, 1))

    g  = rng.normal(*A["income_growth"], (n, 1))
    gx = rng.normal(*A["income_study_extra"], (n, 64)) * study
    u  = rng.normal(*A["upgrade_national"], (n, 1)) + rng.normal(*A["upgrade_study_extra"], (n, 64)) * study
    cp = rng.normal(*A["childpov_drift"], (n, 1))
    sr = rng.normal(*A["social_rent_drift"], (n, 1))
    pr = rng.normal(*A["private_rent_drift"], (n, 1)) + rng.normal(*A["private_rent_study_extra"], (n, 64)) * study
    l4 = rng.normal(*A["l4_drift"], (n, 1)) + rng.normal(*A["l4_study_extra"], (n, 64)) * study
    nq = rng.normal(*A["noqual_drift"], (n, 1)) + rng.normal(*A["noqual_study_extra"], (n, 64)) * study

    inc_sd = (BASE["income_ahc_ci_upper"] - BASE["income_ahc_ci_lower"]) / (2 * 1.645)
    inc_off = rng.normal(0, 1, (n, 64)) * inc_sd * study
    de_off  = rng.normal(0, 1.0, (n, 64)) * study
    cp_off  = (rng.normal(1.0, 0.08, (n, 64)) - 1) * study
    q_off   = rng.normal(0, 1.0, (n, 64)) * study

    sh = np.empty((n, STEPS + 1)); bl = np.empty((n, STEPS + 1))
    for s in range(STEPS + 1):
        f = s / STEPS
        smp = {
            "income_ahc": np.maximum((tile(BASE["income_ahc"]) + f * inc_off)
                                     * (1 + g) ** (f * STALE["income"]) * (1 + f * gx), 1000),
            "class_de_pct":   np.clip(tile(BASE["class_de_pct"])   - f * u * STALE["grade"] + f * de_off, 0.5, 95),
            "class_c2de_pct": np.clip(tile(BASE["class_c2de_pct"]) - f * u * STALE["grade"] + f * de_off, 0.5, 98),
            "class_ab_pct":   np.clip(tile(BASE["class_ab_pct"])   + f * u * STALE["grade"] + f * de_off, 0.5, 95),
            "child_poverty_ahc_pct": np.clip(tile(BASE["child_poverty_ahc_pct"]) * (1 + f * cp_off)
                                             + f * cp * STALE["childpov"], 0.5, 99),
            "social_rent_pct":  np.clip(tile(BASE["social_rent_pct"])  + f * sr * STALE["tenure"], 0.5, 99),
            "private_rent_pct": np.clip(tile(BASE["private_rent_pct"]) + f * pr * STALE["tenure"], 0.5, 99),
            "level4plus_pct":   np.clip(tile(BASE["level4plus_pct"]) + f * l4 * STALE["quals"] + f * q_off, 0.5, 99),
            "no_quals_pct":     np.clip(tile(BASE["no_quals_pct"])   + f * nq * STALE["quals"] + f * q_off, 0.1, 90),
            "cultural_food_density": tile(BASE["cultural_food_density"]),
            "takeaway_density":      tile(BASE["takeaway_density"]),
        }
        fis = score(smp)
        sh[:, s], bl[:, s] = fis[:, i_sh], fis[:, i_bl]
    return sh, bl


def main():
    fis0 = score({k: BASE[k][None, :] for k in IND})[0]
    f_sh, f_bl = fis0[i_sh], fis0[i_bl]
    sh, bl = simulate(N_PATHS)
    e_sh = 100 * (sh[:, -1] - f_sh) / f_sh
    e_bl = 100 * (bl[:, -1] - f_bl) / f_bl
    gap = bl[:, -1] - sh[:, -1]

    print(f"Data-ageing simulation — {N_PATHS:,} paths, seed {SEED}\n")
    print(f"published point   Shoreditch {f_sh:.2f}   Brick Lane North {f_bl:.2f}   gap {f_bl - f_sh:+.2f}\n")
    print("ERROR RATE  (published 2021 -> simulated 2026)")
    print(f"  Shoreditch        mean {e_sh.mean():+.1f}%   90% CI [{np.percentile(e_sh, 5):+.1f}%, {np.percentile(e_sh, 95):+.1f}%]")
    print(f"  Brick Lane North  mean {e_bl.mean():+.1f}%   90% CI [{np.percentile(e_bl, 5):+.1f}%, {np.percentile(e_bl, 95):+.1f}%]")
    print(f"\n  gap stays {gap.mean():+.2f}   P(Brick Lane North higher) = {100 * np.mean(gap > 0):.1f}%")

    (HERE / "summary.txt").write_text(
        f"Data-ageing simulation - {N_PATHS} paths, seed {SEED}\n\n"
        f"published point   Shoreditch {f_sh:.2f}   Brick Lane North {f_bl:.2f}\n\n"
        f"error rate (published 2021 -> simulated 2026)\n"
        f"  Shoreditch        mean {e_sh.mean():+.1f}%   90% CI [{np.percentile(e_sh, 5):+.1f}%, {np.percentile(e_sh, 95):+.1f}%]\n"
        f"  Brick Lane North  mean {e_bl.mean():+.1f}%   90% CI [{np.percentile(e_bl, 5):+.1f}%, {np.percentile(e_bl, 95):+.1f}%]\n"
    )


if __name__ == "__main__":
    main()
