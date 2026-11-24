import { useState } from "react";
import type { MonteCarloResult } from "@jantt/core";

const PERCENTILES = ["P50", "P80", "P90"] as const;

export function FinishConfidence({ result }: { result: MonteCarloResult }) {
  const [confidence, setConfidence] = useState<typeof PERCENTILES[number]>("P80");
  const selected = result.percentiles[confidence];
  if (!selected || !result.histogram.length) return null;
  const bins = result.histogram;
  const min = Math.min(bins[0].minDurationDays, selected.durationDays);
  const max = Math.max(bins[bins.length - 1].maxDurationDays, selected.durationDays);
  const x = (days: number) => 6 + 288 * (days - min) / Math.max(1, max - min);
  const y = (fraction: number) => 82 - 72 * fraction;
  const curve = bins.reduce((path, bin) => `${path} H ${x(bin.maxDurationDays)} V ${y(bin.cumulativeFrequency)}`, `M 6 ${y(0)}`);
  return <section className="finish-confidence">
    <h3>Finish-date confidence</h3>
    <div className="confidence-buttons" role="group" aria-label="Finish confidence">
      {PERCENTILES.map(key => <button type="button" key={key} aria-pressed={key === confidence}
        onClick={() => setConfidence(key)}>{key}</button>)}
    </div>
    <svg viewBox="0 0 300 90" role="img" aria-label="Cumulative distribution of simulated project durations">
      {[0, .5, 1].map(value => <line key={value} x1="6" x2="294" y1={y(value)} y2={y(value)} className="confidence-grid" />)}
      <path d={curve} className="confidence-curve" />
      <line x1={x(selected.durationDays)} x2={x(selected.durationDays)} y1="6" y2="82" className="confidence-mark" />
      <circle cx={x(selected.durationDays)} cy={y(selected.percentile / 100)} r="3.5" className="confidence-dot" />
    </svg>
    <div className="confidence-axis"><span>{min} days</span><span>{max} days</span></div>
    <p aria-live="polite"><strong>{selected.completionDate}</strong> · {selected.percentile}% confidence · {selected.durationDays} days</p>
  </section>;
}
