import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Numeric columns are right-aligned with tabular figures. */
  numeric?: boolean;
}

/** Compact table that scrolls horizontally inside its card instead of widening the page. */
export function DataTable<T>({ columns, rows, rowKey, caption }: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; caption?: string }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-max border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            {columns.map((c, i) => (
              <th key={i} scope="col" className={cn("px-2 py-2 font-medium", c.numeric && "text-right")}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className="border-b border-border last:border-0">
              {columns.map((c, i) => (
                <td key={i} className={cn("px-2 py-2", c.numeric && "tabular text-right")}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Colour swatch + name, used where a table row stands for a chart series. */
export function SeriesName({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      {children}
    </span>
  );
}
