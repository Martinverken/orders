"use client";

import { useState } from "react";
import { DashboardSummary, BreakdownItem, Perspective } from "@/app/types";
import { formatRelative, SOURCE_LABEL } from "@/app/lib/utils";

interface Props {
  summary: DashboardSummary;
  perspective?: Perspective;
  filterHrefs?: Record<string, string>;
}

function BreakdownDetail({ items }: { items: BreakdownItem[] }) {
  if (!items.length) return null;

  // Group by method, then by source
  const flexItems = items.filter(i => i.method === "Express" || i.method === "Direct/Flex");
  const regularItems = items.filter(i => i.method === "Regular/Centro Envíos");
  const flexTotal = flexItems.reduce((s, i) => s + i.count, 0);
  const regularTotal = regularItems.reduce((s, i) => s + i.count, 0);

  const renderGroup = (label: string, total: number, groupItems: BreakdownItem[]) => {
    if (!groupItems.length) return null;
    return (
      <div className="mb-2 last:mb-0">
        <div className="font-semibold text-gray-700 text-xs mb-1">
          {total} {label}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 pl-2">
          {groupItems.map((item) => (
            <span key={`${item.source}-${item.method}`} className="text-gray-500 text-xs">
              {item.count} {SOURCE_LABEL[item.source] || item.source}
              {item.method === "Express" ? " (express)" : item.method === "Direct/Flex" ? " (flex)" : ""}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-2 pt-2 border-t border-gray-200">
      {renderGroup("Flex/Express", flexTotal, flexItems)}
      {renderGroup("Regular/Centro Envíos", regularTotal, regularItems)}
    </div>
  );
}

export function SummaryCards({ summary, perspective = "bodega", filterHrefs }: Props) {
  const [openCard, setOpenCard] = useState<string | null>(null);

  const overdueLabel = perspective === "bodega" ? "Atrasado Bodega" : "Atrasado Transportista";
  const overdueColor = perspective === "bodega"
    ? "border-orange-500 text-orange-600"
    : "border-purple-500 text-purple-600";
  const overdueBg = perspective === "bodega" ? "bg-orange-50" : "bg-purple-50";

  // In bodega: due_today = pending orders due today. In cliente: delivered_today = shipped orders due today.
  const todayCount = summary.due_today_count + summary.delivered_today_count;
  const todayBreakdown = perspective === "bodega" ? "due_today" : "delivered_today";

  const cards = [
    {
      label: overdueLabel,
      value: summary.overdue_count,
      breakdownKey: "overdue",
      color: overdueColor,
      bg: overdueBg,
      icon: "🔴",
    },
    {
      label: perspective === "bodega" ? "Entregar hoy" : "Entrega hoy",
      value: todayCount,
      breakdownKey: todayBreakdown,
      color: "border-amber-500 text-amber-600",
      bg: "bg-amber-50",
      icon: "🟡",
    },
    {
      label: "Para mañana",
      value: summary.tomorrow_count,
      breakdownKey: "tomorrow",
      color: "border-blue-500 text-blue-600",
      bg: "bg-blue-50",
      icon: "📅",
    },
    {
      label: "2+ días",
      value: summary.two_or_more_days_count,
      breakdownKey: "two_or_more_days",
      color: "border-purple-500 text-purple-600",
      bg: "bg-purple-50",
      icon: "🗓️",
    },
    ...(perspective === "cliente" ? [{
      label: "A tiempo",
      sublabel: "Sin fecha confirmada",
      value: summary.on_time_count,
      breakdownKey: "on_time",
      color: "border-green-400 text-green-600",
      bg: "bg-green-50",
      icon: "✅",
    }] : []),
    {
      label: "Total paquetes",
      value: summary.overdue_count + todayCount + summary.tomorrow_count + summary.two_or_more_days_count + (perspective === "cliente" ? summary.on_time_count : 0),
      breakdownKey: "total",
      color: "border-gray-400 text-gray-600",
      bg: "bg-gray-50",
      icon: "📦",
    },
  ];

  const breakdown = summary.breakdown || {};

  return (
    <div>
      <div className={`grid grid-cols-2 gap-4 mb-2 ${perspective === "cliente" ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
        {cards.map((card) => {
          const isOpen = openCard === card.breakdownKey;
          const items = breakdown[card.breakdownKey] || [];
          const hasBreakdown = items.length > 0 && card.value > 0;

          const href = filterHrefs?.[card.breakdownKey];
          const cardClass = `${card.bg} border-l-4 ${card.color.split(" ")[0]} rounded-lg p-4 ${href ? "cursor-pointer hover:brightness-95 transition-all" : hasBreakdown ? "cursor-pointer" : ""}`;

          const inner = (
            <>
              <div className="flex items-center justify-between">
                <span className="text-2xl">{card.icon}</span>
                {!href && hasBreakdown && (
                  <span className="text-gray-400 text-xs">{isOpen ? "▲" : "▼"}</span>
                )}
              </div>
              <div className={`text-3xl font-bold mt-2 ${card.color.split(" ")[1]}`}>
                {card.value}
              </div>
              <div className="text-sm text-gray-600 mt-1">{card.label}</div>
              {"sublabel" in card && card.sublabel && (
                <div className="text-xs text-gray-400 mt-0.5">{card.sublabel}</div>
              )}
              {!href && isOpen && <BreakdownDetail items={items} />}
            </>
          );

          return href ? (
            <a key={card.label} href={href} className={`block ${cardClass}`}>
              {inner}
            </a>
          ) : (
            <div
              key={card.label}
              className={cardClass}
              onClick={() => hasBreakdown && setOpenCard(isOpen ? null : card.breakdownKey)}
            >
              {inner}
            </div>
          );
        })}
      </div>
      {summary.last_sync_at && (
        <p className="text-xs text-gray-400 mt-1">
          Última sincronización: {formatRelative(summary.last_sync_at)}
        </p>
      )}
    </div>
  );
}
