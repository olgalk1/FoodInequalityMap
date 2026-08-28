"use client";

import { DOMAINS } from "@/lib/indicators";
import { LITERATURE, METHOD_NOTES } from "@/lib/literature";

export default function MethodDrawer({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[1000] flex justify-end bg-black/60 backdrop-blur-sm">
      <button
        className="flex-1 cursor-default"
        onClick={onClose}
        aria-label="Close methodology panel"
      />
      <aside className="flex h-full w-full max-w-[640px] flex-col border-l border-line bg-panel">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <h2 className="text-[15px] font-semibold">Methodology</h2>
            <p className="text-[11px] text-muted">
              What the score is, and which gap in the literature each part of it fills
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-line px-2.5 py-1 text-[11.5px] text-muted transition hover:text-text"
          >
            Close
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              The score
            </h3>
            <div className="mt-2 rounded-lg border border-line bg-panel2/60 p-3 font-mono text-[11.5px] leading-relaxed">
              FIS<sub>a</sub> = Σ<sub>d</sub> w<sub>d</sub> · ( Σ<sub>i∈d</sub> v
              <sub>i</sub> · n(x<sub>ia</sub> · s<sub>i</sub>) )
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
              where <span className="text-text">w</span> are domain weights rescaled to sum to 1,{" "}
              <span className="text-text">v</span> are within-domain indicator weights,{" "}
              <span className="text-text">s</span> is the indicator&apos;s direction (+1 or −1) and{" "}
              <span className="text-text">n</span> is the chosen normalisation across all 64
              neighbourhoods. Higher means more modelled food inequality.
            </p>
          </section>

          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Domains and default weights
            </h3>
            <div className="mt-2 space-y-2">
              {DOMAINS.map((d) => (
                <div key={d.key} className="rounded-lg border border-line bg-panel2/60 p-3">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: d.colour }}
                    />
                    <span className="text-[12.5px] font-medium">{d.label}</span>
                    <span className="tabular ml-auto text-[11.5px] text-muted">
                      {d.defaultWeight}%
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{d.claim}</p>
                  <ul className="mt-2 space-y-1">
                    {d.indicators.map((i) => (
                      <li key={i.key} className="text-[11px] text-muted">
                        <span className="text-text">{i.short}</span>
                        <span className="ml-1.5 text-[10px]">
                          {i.defaultWeight}% within domain ·{" "}
                          {i.direction === 1 ? "raises score" : "reverse-scored"}
                        </span>
                        <div className="text-[10px] text-muted/70">{i.source}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Literature: position, gap, answer
            </h3>
            <div className="mt-2 space-y-2">
              {LITERATURE.map((l) => (
                <details
                  key={l.author}
                  className="rounded-lg border border-line bg-panel2/60 p-3"
                >
                  <summary className="cursor-pointer list-none text-[12.5px] font-medium">
                    {l.author}
                    <span className="ml-2 text-[10.5px] font-normal text-muted">{l.gap}</span>
                  </summary>
                  <div className="mt-2 space-y-2">
                    <p className="text-[11px] leading-relaxed text-muted">
                      <span className="text-text">Position.</span> {l.position}
                    </p>
                    <p className="text-[11px] leading-relaxed text-muted">
                      <span className="text-text">What this model adds.</span> {l.answer}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {l.hooks.map((h) => (
                        <span
                          key={h}
                          className="rounded-full border border-line px-2 py-0.5 text-[10px] text-muted"
                        >
                          {h}
                        </span>
                      ))}
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Notes and limits
            </h3>
            <div className="mt-2 space-y-2.5">
              {METHOD_NOTES.map((n) => (
                <div key={n.heading}>
                  <div className="text-[12px] font-medium">{n.heading}</div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{n.body}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
