"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Band } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";

export type StatusFilter = "OPEN" | "REVIEWED" | "ALL";
export type BandFilter = Extract<Band, "MEDIUM" | "HIGH"> | "ALL";

export interface AlertFilterState {
  status: StatusFilter;
  band: BandFilter;
  page: number;
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex h-8 items-center rounded-lg bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 rounded-md px-2.5 text-xs font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === o.value && "bg-surface text-foreground shadow-sm",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "OPEN", label: "Open" },
  { value: "REVIEWED", label: "Reviewed" },
  { value: "ALL", label: "All" },
];

const BAND_OPTIONS: { value: BandFilter; label: string }[] = [
  { value: "ALL", label: "All risk" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
];

/** Status, band and pagination in a single row above the queue. */
export function AlertFilters({
  value,
  onChange,
  totalPages,
}: {
  value: AlertFilterState;
  onChange: (next: AlertFilterState) => void;
  totalPages: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented label="Alert status" value={value.status} options={STATUS_OPTIONS} onChange={(status) => onChange({ ...value, status, page: 1 })} />
      <Segmented label="Risk band" value={value.band} options={BAND_OPTIONS} onChange={(band) => onChange({ ...value, band, page: 1 })} />
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="px-2"
          disabled={value.page <= 1}
          onClick={() => onChange({ ...value, page: value.page - 1 })}
          aria-label="Previous page"
        >
          <ChevronLeft />
        </Button>
        <span className="tabular text-xs text-muted-foreground">
          {value.page} / {Math.max(totalPages, 1)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="px-2"
          disabled={value.page >= totalPages}
          onClick={() => onChange({ ...value, page: value.page + 1 })}
          aria-label="Next page"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
