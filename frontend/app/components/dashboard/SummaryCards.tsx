import { DashboardSummary } from "@/app/types";
import { formatRelative } from "@/app/lib/utils";

interface Props {
  summary: DashboardSummary;
}

export function SummaryCards({ summary }: Props) {
  const cards = [
    {
      label: "Atrasados",
      value: summary.overdue_count,
      color: "border-red-500 text-red-600",
      bg: "bg-red-50",
      icon: "🔴",
    },
    {
      label: "Entregar hoy",
      value: summary.due_today_count,
      color: "border-amber-500 text-amber-600",
      bg: "bg-amber-50",
      icon: "🟡",
    },
    {
      label: "Entregados hoy",
      value: summary.delivered_today_count,
      color: "border-green-500 text-green-600",
      bg: "bg-green-50",
      icon: "✅",
    },
    {
      label: "Para mañana",
      value: summary.tomorrow_count,
      color: "border-blue-500 text-blue-600",
      bg: "bg-blue-50",
      icon: "📅",
    },
    {
      label: "Total pedidos",
      value: summary.total_orders,
      color: "border-gray-400 text-gray-600",
      bg: "bg-gray-50",
      icon: "📦",
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-2">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`${card.bg} border-l-4 ${card.color.split(" ")[0]} rounded-lg p-4`}
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">{card.icon}</span>
            </div>
            <div className={`text-3xl font-bold mt-2 ${card.color.split(" ")[1]}`}>
              {card.value}
            </div>
            <div className="text-sm text-gray-600 mt-1">{card.label}</div>
          </div>
        ))}
      </div>
      {summary.last_sync_at && (
        <p className="text-xs text-gray-400 mt-1">
          Última sincronización: {formatRelative(summary.last_sync_at)}
        </p>
      )}
    </div>
  );
}
