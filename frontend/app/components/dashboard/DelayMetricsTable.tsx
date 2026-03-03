import { DelayMetric } from "@/app/types";

interface Props {
  metrics: DelayMetric[];
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

export function DelayMetricsTable({ metrics }: Props) {
  if (metrics.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-4 text-center">
        Sin atrasos registrados aún.
      </p>
    );
  }

  // Group by month
  const byMonth = metrics.reduce<Record<string, DelayMetric[]>>((acc, m) => {
    if (!acc[m.month]) acc[m.month] = [];
    acc[m.month].push(m);
    return acc;
  }, {});

  const months = Object.keys(byMonth).sort().reverse();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
            <th className="pb-3 font-medium">Mes</th>
            <th className="pb-3 font-medium">Marketplace</th>
            <th className="pb-3 font-medium text-right">Pedidos atrasados</th>
            <th className="pb-3 font-medium text-right">Días de atraso prom.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {months.map((month) =>
            byMonth[month].map((row, i) => (
              <tr key={`${month}-${row.source}`} className="hover:bg-gray-50">
                <td className="py-3 text-gray-700">
                  {i === 0 ? formatMonth(month) : ""}
                </td>
                <td className="py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    row.source === "falabella"
                      ? "bg-orange-100 text-orange-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}>
                    {SOURCE_LABEL[row.source] ?? row.source}
                  </span>
                </td>
                <td className="py-3 text-right font-semibold text-red-600">
                  {row.count}
                </td>
                <td className="py-3 text-right text-gray-600">
                  {row.avg_days_delayed.toFixed(1)} días
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
