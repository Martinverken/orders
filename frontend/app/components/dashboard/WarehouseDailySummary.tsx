"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getWarehouseSummary } from "@/app/lib/api";
import type { WarehouseSummaryData } from "@/app/types";

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

export function WarehouseDailySummary() {
  const [data, setData] = useState<WarehouseSummaryData | null>(null);
  const [tab, setTab] = useState<"dia" | "operador" | "plataforma">("dia");
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    getWarehouseSummary()
      .then(setData)
      .catch((e) => console.error("[WarehouseDailySummary] API error:", e));
  }, []);

  if (!data) return null;

  const totalToday = data.by_carrier.reduce((s, r) => s + r.due_today, 0);
  const totalOverdue = data.by_carrier.reduce((s, r) => s + r.overdue, 0);
  const grand = totalToday + totalOverdue;

  if (grand === 0) return null;

  const todayIso = getTodayIso();
  const tomorrowIso = getTomorrowIso();

  function navigateTo(urgency?: string, source?: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", "pedidos");
    if (urgency) next.set("urgency", urgency); else next.delete("urgency");
    if (source) next.set("source", source); else next.delete("source");
    next.delete("page");
    router.push(`/dashboard?${next.toString()}`);
  }

  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-blue-900">Bultos a entregar hoy</h3>
          <p className="text-xs text-blue-600 mt-0.5">
            {grand} total
            {totalOverdue > 0 && <span className="text-red-600 font-medium"> · {totalOverdue} atrasado{totalOverdue !== 1 ? "s" : ""}</span>}
            {" · "}{totalToday} de hoy
          </p>
        </div>
        {/* Tabs */}
        <div className="flex rounded-lg border border-blue-200 overflow-hidden text-xs font-medium">
          <button
            onClick={() => setTab("dia")}
            className={`px-3 py-1.5 ${tab === "dia" ? "bg-blue-600 text-white" : "text-blue-700 hover:bg-blue-100"}`}
          >
            Por Día
          </button>
          <button
            onClick={() => setTab("operador")}
            className={`px-3 py-1.5 border-l border-blue-200 ${tab === "operador" ? "bg-blue-600 text-white" : "text-blue-700 hover:bg-blue-100"}`}
          >
            Por Operador
          </button>
          <button
            onClick={() => setTab("plataforma")}
            className={`px-3 py-1.5 border-l border-blue-200 ${tab === "plataforma" ? "bg-blue-600 text-white" : "text-blue-700 hover:bg-blue-100"}`}
          >
            Por Plataforma
          </button>
        </div>
      </div>

      {/* By Day */}
      {tab === "dia" && (
        <ul className="space-y-1.5">
          {data.by_day.map((row) => {
            const isToday = row.date === todayIso;
            const isFuture = row.date > todayIso;
            const urgencyFilter = isToday
              ? "due_today"
              : isFuture
              ? row.date === tomorrowIso
                ? "tomorrow"
                : "two_or_more_days"
              : "overdue";
            return (
              <li
                key={row.date}
                className="flex items-center gap-3 text-sm cursor-pointer hover:bg-blue-100 rounded px-1 -mx-1 transition-colors"
                onClick={() => navigateTo(urgencyFilter)}
              >
                <span className={`w-28 shrink-0 text-xs font-medium ${isToday ? "text-blue-700" : isFuture ? "text-gray-400" : "text-gray-500"}`}>
                  {isToday ? "Hoy" : fmtDate(row.date)}
                </span>
                <span className={`flex-1 font-semibold tabular-nums ${isFuture ? "text-gray-400" : "text-gray-900"}`}>
                  {row.count} bulto{row.count !== 1 ? "s" : ""}
                </span>
                <span className="flex items-center gap-1.5 text-xs">
                  {row.overdue > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">
                      {row.overdue} atrasado{row.overdue !== 1 ? "s" : ""}
                    </span>
                  )}
                  {row.due_today > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold">
                      {row.due_today} de hoy
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* By Carrier */}
      {tab === "operador" && (
        <ul className="space-y-2">
          {data.by_carrier.map((row) => {
            const total = row.due_today + row.overdue;
            if (total === 0) return null;
            const countText = row.overdue > 0 && row.due_today > 0
              ? `${row.overdue} atrasado${row.overdue !== 1 ? "s" : ""} + ${row.due_today} de hoy = ${total} bultos`
              : row.overdue > 0
              ? `${row.overdue} bulto${row.overdue !== 1 ? "s" : ""} atrasado${row.overdue !== 1 ? "s" : ""}`
              : `${row.due_today} bulto${row.due_today !== 1 ? "s" : ""} de hoy`;
            return (
              <li key={row.carrier} className="flex items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-gray-900 shrink-0">{row.carrier}</span>
                  {row.pickup_cutoff
                    ? <span className="text-xs font-mono text-blue-600 shrink-0">hoy ≤ {row.pickup_cutoff}</span>
                    : <span className="text-xs text-gray-400 shrink-0">sin hora</span>
                  }
                </div>
                <span className={`text-xs font-semibold shrink-0 ${row.overdue > 0 ? "text-red-600" : "text-blue-700"}`}>
                  {countText}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* By Platform */}
      {tab === "plataforma" && (
        <ul className="space-y-2">
          {data.by_platform.map((row) => {
            const total = row.due_today + row.overdue;
            if (total === 0) return null;
            const countText = row.overdue > 0 && row.due_today > 0
              ? `${row.overdue} atrasado${row.overdue !== 1 ? "s" : ""} + ${row.due_today} de hoy = ${total} bultos`
              : row.overdue > 0
              ? `${row.overdue} bulto${row.overdue !== 1 ? "s" : ""} atrasado${row.overdue !== 1 ? "s" : ""}`
              : `${row.due_today} bulto${row.due_today !== 1 ? "s" : ""} de hoy`;
            return (
              <li
                key={row.source}
                className="flex items-center justify-between gap-2 text-sm cursor-pointer hover:bg-blue-100 rounded px-1 -mx-1 transition-colors"
                onClick={() => navigateTo(undefined, row.source)}
              >
                <span className="font-medium text-gray-900">{SOURCE_LABELS[row.source] || row.source}</span>
                <span className={`text-xs font-semibold shrink-0 ${row.overdue > 0 ? "text-red-600" : "text-blue-700"}`}>
                  {countText}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
