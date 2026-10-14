/** Legend rendered as HTML above a chart: swatch (or dash sample) + label in ink. */
export function ChartLegend({ items }: { items: { label: string; color: string; dash?: string }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((it) => (
        <li key={it.label} className="inline-flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden>
            <line x1="1" y1="4" x2="17" y2="4" stroke={it.color} strokeWidth={2} strokeDasharray={it.dash} strokeLinecap="round" />
          </svg>
          {it.label}
        </li>
      ))}
    </ul>
  );
}
