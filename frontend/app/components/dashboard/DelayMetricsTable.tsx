import { HistoricalMetrics } from "@/app/types";

interface Props {
  metrics: HistoricalMetrics;
}

interface MergedRow {
  month: string;
  source: string;
  logistics_operator: string;
  on_time: number;
  delayed: number;
  avg_days_delayed: number;
}

const SOURCE_LABEL: Record<string, string> = {
  falabella: "Falabella",
  mercadolibre: "Mercado Libre",
};

function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  const date = new Date(Number(year), Number(m) - 1);
  return date.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
}

function pct(part: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

function SourceBadge({ source }: { source: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
      source === "falabella"
        ? "bg-orange-100 text-orange-700"
        : "bg-yellow-100 text-yellow-700"
    }`}>
      {SOURCE_LABEL[source] ?? source}
    </span>
  );
}

function mergeMetrics(metrics: HistoricalMetrics): Map<string, MergedRow> {
  const map = new Map<string, MergedRow>();

  const key = (month: string, source: string, op: string) =>
    `${month}|${source}|${op}`;

  for (const m of metrics.on_time) {
    const k = key(m.month, m.source, m.logistics_operator);
    if (!map.has(k)) {
      map.set(k, { month: m.month, source: m.source, logistics_operator: m.logistics_operator, on_time: 0, delayed: 0, avg_days_delayed: 0 });
    }
    map.get(k)!.on_time += m.count;
  }

  for (const m of metrics.delayed) {
    const k = key(m.month, m.source, m.logistics_operator);
    if (!map.has(k)) {
      map.set(k, { month: m.month, source: m.source, logistics_operator: m.logistics_operator, on_time: 0, delayed: 0, avg_days_delayed: 0 });
    }
    const row = map.get(k)!;
    row.delayed += m.count;
    row.avg_days_delayed = m.avg_days_delayed;
  }

  return map;
}

export function DelayMetricsTable({ metrics }: Props) {
  const rowMap = mergeMetrics(metrics);

  if (rowMap.size === 0) {
    return (
      <p className="text-sm text-gray-400 py-4 text-center">
        Sin datos históricos aún. Los registros aparecerán cuando las órdenes alcancen su fecha límite.
      </p>
    );
  }

  // Sort: most recent month first, then by source
  const rows = Array.from(rowMap.values()).sort((a, b) =>
    b.month.localeCompare(a.month) || a.source.localeCompare(b.source)
  );

  // Group by month for row-spanning the month label
  const byMonth = rows.reduce<Record<string, MergedRow[]>>((acc, r) => {
    if (!acc[r.month]) acc[r.month] = [];
    acc[r.month].push(r);
    return acc;
  }, {});
  const months = Object.keys(byMonth).sort().reverse();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
            <th className="pb-3 font-medium pr-6">Mes</th>
            <th className="pb-3 font-medium pr-4">Marketplace</th>
            <th className="pb-3 font-medium pr-4">Operador logístico</th>
            <th className="pb-3 font-medium text-right pr-4">Total</th>
            <th className="pb-3 font-medium text-right pr-4">A tiempo</th>
            <th className="pb-3 font-medium text-right pr-4">% cumplim.</th>
            <th className="pb-3 font-medium text-right pr-4">Atrasados</th>
            <th className="pb-3 font-medium text-right">Días prom.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {months.map((month) =>
            byMonth[month].map((row, i) => {
              const total = row.on_time + row.delayed;
              const compliance = total > 0 ? Math.round((row.on_time / total) * 100) : null;
              return (
                <tr key={`${month}-${row.source}-${row.logistics_operator}`} className="hover:bg-gray-50">
                  <td className="py-3 text-gray-700 whitespace-nowrap pr-6 capitalize">
                    {i === 0 ? formatMonth(month) : ""}
                  </td>
                  <td className="py-3 pr-4">
                    <SourceBadge source={row.source} />
                  </td>
                  <td className="py-3 text-gray-600 pr-4">{row.logistics_operator}</td>
                  <td className="py-3 text-right font-medium text-gray-700 pr-4">{total}</td>
                  <td className="py-3 text-right text-green-700 font-medium pr-4">{row.on_time}</td>
                  <td className="py-3 text-right pr-4">
                    {compliance !== null && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        compliance >= 90
                          ? "bg-green-100 text-green-700"
                          : compliance >= 70
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                      }`}>
                        {compliance}%
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-right text-red-600 font-medium pr-4">{row.delayed}</td>
                  <td className="py-3 text-right text-gray-500">
                    {row.delayed > 0 ? `${row.avg_days_delayed.toFixed(1)}d` : "—"}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
