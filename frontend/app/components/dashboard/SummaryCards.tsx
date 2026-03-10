"use client";

import { useState } from "react";
import { DashboardSummary, BreakdownItem, Perspective } from "@/app/types";
import { formatRelative, SOURCE_LABEL } from "@/app/lib/utils";

interface Props {
  summary: DashboardSummary;
  perspective?: Perspective;
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

export function SummaryCards({ summary, perspective = "bodega" }: Props) {
  const [openCard, setOpenCard] = useState<string | null>(null);

  const overdueLabel = perspective === "bodega" ? "Atrasado Bodega" : "Atrasado Transportista";
  const overdueColor = perspective === "bodega"
    ? "border-orange-500 text-orange-600"
    : "border-purple-500 text-purple-600";
  const overdueBg = perspective === "bodega" ? "bg-orange-50" : "bg-purple-50";

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
      label: "Entregar hoy",
      value: summary.due_today_count,
      breakdownKey: "due_today",
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
    {
      label: "Total paquetes",
      value: summary.overdue_count + summary.due_today_count + summary.tomorrow_count + summary.two_or_more_days_count,
      breakdownKey: "total",
      color: "border-gray-400 text-gray-600",
      bg: "bg-gray-50",
      icon: "📦",
    },
  ];

  const breakdown = summary.breakdown || {};

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-2">
        {cards.map((card) => {
          const isOpen = openCard === card.breakdownKey;
          const items = breakdown[card.breakdownKey] || [];
          const hasBreakdown = items.length > 0 && card.value > 0;

          return (
            <div
              key={card.label}
              className={`${card.bg} border-l-4 ${card.color.split(" ")[0]} rounded-lg p-4 ${hasBreakdown ? "cursor-pointer" : ""}`}
              onClick={() => hasBreakdown && setOpenCard(isOpen ? null : card.breakdownKey)}
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">{card.icon}</span>
                {hasBreakdown && (
                  <span className="text-gray-400 text-xs">{isOpen ? "▲" : "▼"}</span>
                )}
              </div>
              <div className={`text-3xl font-bold mt-2 ${card.color.split(" ")[1]}`}>
                {card.value}
              </div>
              <div className="text-sm text-gray-600 mt-1">{card.label}</div>
              {isOpen && <BreakdownDetail items={items} />}
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
