"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getWarehouseSummary } from "@/app/lib/api";
import type { WarehouseSummaryData, WarehouseDaySummary } from "@/app/types";

const SOURCE_LABELS: Record<string, string> = {
  falabella: "Falabella",
  mercadolibre: "Mercado Libre",
  walmart: "Walmart",
  paris: "Paris",
  shopify_verken: "Shopify Verken",
  shopify_kaut: "Shopify Kaut",
};

function fmtDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" });
}

function getTodayIso(): string {
  return new Date().toLocaleDateString("sv-SE");
}
function getTomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("sv-SE");
}

function DayAccordion({ row, expanded, onToggle, onFilter }: {
  row: WarehouseDaySummary;
  expanded: boolean;
  onToggle: () => void;
  onFilter: () => void;
}) {
  const todayIso = getTodayIso();
  const isToday = row.date === todayIso;
  const isPast = row.date < todayIso;
  const isFuture = row.date > todayIso;

  const label = isToday ? "Hoy" : fmtDate(row.date);
  const labelClass = isToday ? "text-blue-700 font-semibold" : isPast ? "text-red-600 font-medium" : "text-gray-500";

  return (
    <li className="border border-blue-100 rounded-lg overflow-hidden">
      {/* Day header row */}
      <div
        className={`flex items-center gap-3 px-3 py-2 cursor-pointer select-none ${expanded ? "bg-blue-50" : "hover:bg-blue-50"} transition-colors`}
        onClick={onToggle}
      >
        {/* Date label */}
        <span className={`w-24 shrink-0 text-sm ${labelClass}`}>{label}</span>

        {/* Count + urgency badges */}
        <span
          className="flex-1 flex items-center gap-2 text-sm"
          onClick={(e) => { e.stopPropagation(); onFilter(); }}
        >
          <span className={`font-semibold tabular-nums ${isFuture ? "text-gray-400" : "text-gray-900"}`}>
            {row.count} bulto{row.count !== 1 ? "s" : ""}
          </span>
          {row.overdue > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-xs font-semibold">
              {row.overdue} atrasado{row.overdue !== 1 ? "s" : ""}
            </span>
          )}
          {row.due_today > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-xs font-semibold">
              {row.due_today} de hoy
            </span>
          )}
        </span>

        {/* Expand chevron */}
        <svg
          xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`w-4 h-4 shrink-0 text-blue-400 transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 pt-2 bg-white border-t border-blue-100 space-y-3">
          {/* Por Operador */}
          {row.by_carrier.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Por Operador</p>
              <ul className="space-y-1.5">
                {row.by_carrier.map((c) => (
                  <li key={c.carrier} className="flex items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{c.carrier}</span>
                      {c.pickup_window_start && c.pickup_cutoff
                        ? <span className="text-xs font-mono text-blue-600">{c.pickup_window_start} - {c.pickup_cutoff}</span>
                        : c.pickup_cutoff
                        ? <span className="text-xs font-mono text-blue-600">≤ {c.pickup_cutoff}</span>
                        : null
                      }
                    </div>
                    <span className="text-xs font-semibold text-gray-700 shrink-0">
                      {c.count} bulto{c.count !== 1 ? "s" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Por Plataforma */}
          {row.by_platform.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Por Plataforma</p>
              <ul className="space-y-1.5">
                {row.by_platform.map((p) => (
                  <li key={p.source} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-900">{SOURCE_LABELS[p.source] || p.source}</span>
                    <span className="text-xs font-semibold text-gray-700">
                      {p.count} bulto{p.count !== 1 ? "s" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function WarehouseDailySummary() {
  const [data, setData] = useState<WarehouseSummaryData | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    getWarehouseSummary()
      .then((d) => {
        setData(d);
        // Auto-expand today if it has orders
        const todayIso = getTodayIso();
        if (d.by_day.some((r) => r.date === todayIso)) {
          setExpandedDate(todayIso);
        }
      })
      .catch((e) => console.error("[WarehouseDailySummary] API error:", e));
  }, []);

  if (!data) return null;

  const todayIso = getTodayIso();
  const tomorrowIso = getTomorrowIso();

  const totalOverdue = data.by_day.reduce((s, r) => s + r.overdue, 0);
  const totalToday = data.by_day.reduce((s, r) => s + r.due_today, 0);
  const grand = totalOverdue + totalToday;

  if (grand === 0 && data.by_day.every((r) => r.date > todayIso)) return null;

  function navigateTo(urgency?: string, source?: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", "pedidos");
    if (urgency) next.set("urgency", urgency); else next.delete("urgency");
    if (source) next.set("source", source); else next.delete("source");
    next.delete("page");
    router.push(`/dashboard?${next.toString()}`);
  }

  function urgencyForDate(row: WarehouseDaySummary): string {
    if (row.date < todayIso) return "overdue";
    if (row.date === todayIso) {
      // Show today + all overdue so nothing urgent is missed
      return totalOverdue > 0 ? "due_today,overdue" : "due_today";
    }
    return row.date === tomorrowIso ? "tomorrow" : "two_or_more_days";
  }

  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
      {/* Header */}
      {grand > 0 && (
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-blue-900">Bultos a entregar</h3>
          <p className="text-xs text-blue-600 mt-0.5">
            {totalToday} de hoy
            {totalOverdue > 0 && <span className="text-red-600 font-medium"> · {totalOverdue} atrasado{totalOverdue !== 1 ? "s" : ""}</span>}
          </p>
        </div>
      )}

      <ul className="space-y-1.5">
        {data.by_day.map((row) => (
          <DayAccordion
            key={row.date}
            row={row}
            expanded={expandedDate === row.date}
            onToggle={() => setExpandedDate(expandedDate === row.date ? null : row.date)}
            onFilter={() => navigateTo(urgencyForDate(row))}
          />
        ))}
      </ul>
    </div>
  );
}
