"use client";

import { useEffect, useState } from "react";
import type { Band } from "@/lib/types";
import { BAND_META } from "./band-badge";

const BAND_COLOR: Record<Band, string> = {
  LOW: "var(--good)",
  MEDIUM: "var(--warning-mark)",
  HIGH: "var(--critical-mark)",
};

/**
 * Semicircular 0-100 risk gauge. The needle animates from the previous score, so a re-score after the
 * questionnaire visibly moves. Band thresholds are drawn as ticks so the user can see why a band was chosen.
 */
export function RiskMeter({
  score,
  band,
  thresholds = { medium: 35, high: 70 },
  scanning = false,
  size = 220,
}: {
  score: number;
  band: Band;
  thresholds?: { medium: number; high: number };
  scanning?: boolean;
  size?: number;
}) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (scanning) return;
    let raf = 0;
    const from = shown;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 900);
      const eased = 1 - (1 - k) ** 3;
      setShown(from + (score - from) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, scanning]);

  const r = 80;
  const cx = 100;
  const cy = 95;
  const point = (v: number, radius = r) => {
    const a = Math.PI * (1 - v / 100);
    return [cx + radius * Math.cos(a), cy - radius * Math.sin(a)] as const;
  };
  const arc = (from: number, to: number) => {
    const [x1, y1] = point(from);
    const [x2, y2] = point(to);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  const [nx, ny] = point(shown, r - 18);
  const meta = BAND_META[band];
  const color = scanning ? "var(--subtle)" : BAND_COLOR[band];

  return (
    <div className="flex flex-col items-center" role="img" aria-label={scanning ? "Checking payment risk" : `Risk score ${Math.round(score)} out of 100, ${meta.label}`}>
      <svg viewBox="0 0 200 110" width={size} height={(size * 110) / 200}>
        <path d={arc(0, 100)} fill="none" stroke="var(--surface-2)" strokeWidth={14} strokeLinecap="round" />
        {!scanning && <path d={arc(0, Math.max(0.5, shown))} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round" />}
        {scanning && (
          <path d={arc(0, 100)} fill="none" stroke="var(--primary)" strokeWidth={14} strokeLinecap="round" strokeDasharray="40 250" className="animate-[dash_1.1s_linear_infinite]" />
        )}
        {[thresholds.medium, thresholds.high].map((t) => {
          const [x1, y1] = point(t, r + 9);
          const [x2, y2] = point(t, r - 9);
          return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--surface)" strokeWidth={2} />;
        })}
        {!scanning && (
          <>
            <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--foreground)" strokeWidth={2.5} strokeLinecap="round" />
            <circle cx={cx} cy={cy} r={5} fill="var(--foreground)" />
          </>
        )}
      </svg>
      <div className="-mt-1 text-center">
        {scanning ? (
          <p className="text-sm text-muted-foreground">Checking this payment…</p>
        ) : (
          <>
            <p className="tabular text-4xl font-semibold leading-none">{Math.round(shown)}</p>
            <p className="mt-1 inline-flex items-center gap-1 text-sm font-medium" style={{ color: band === "MEDIUM" ? "var(--warning)" : color }}>
              <meta.Icon className="size-4" aria-hidden />
              {meta.label}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
