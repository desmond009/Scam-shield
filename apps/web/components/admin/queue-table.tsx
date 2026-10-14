import type { QueueCounts } from "@/lib/types";

const COLUMNS: { key: keyof QueueCounts; label: string }[] = [
  { key: "waiting", label: "Waiting" },
  { key: "active", label: "Active" },
  { key: "delayed", label: "Delayed" },
  { key: "failed", label: "Failed" },
];

export function QueueTable({ queues }: { queues: { name: string; counts: QueueCounts }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[360px] text-left text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="py-2 pr-3 font-medium">
              Queue
            </th>
            {COLUMNS.map((c) => (
              <th key={c.key} scope="col" className="px-3 py-2 text-right font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {queues.map((q) => (
            <tr key={q.name}>
              <th scope="row" className="py-2 pr-3 font-medium">
                {q.name}
              </th>
              {COLUMNS.map((c) => (
                <td key={c.key} className="tabular px-3 py-2 text-right">
                  {q.counts[c.key] ?? <span className="text-subtle" title="Not tracked for this queue">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
