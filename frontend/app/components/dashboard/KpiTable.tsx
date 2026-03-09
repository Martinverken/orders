"use client";

import { useState } from "react";
import { KpiMetrics, KpiPeriod } from "@/app/types";

interface Props {
  metrics: KpiMetrics;
}

function formatMonth(period: string): string {
  const [year, m] = period.split("-");
  const date = new Date(Number(year), Number(m) - 1);
  return date.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
}

function formatWeek(period: string): string {
  const monday = new Date(period + "T00:00:00");
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("es-CL", { day: "numeric", month: "short" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

function PctBadge({ pct }: { pct: number }) {
  const cls =
    pct <= 5
      ? "bg-green-100 text-green-700"
      : pct <= 15
      ? "bg-amber-100 text-amber-700"
      : "bg-red-100 text-red-700";
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {pct}%
    </span>
  );
}

function PctBar({ pct }: { pct: number }) {
  const color =
    pct <= 5 ? "bg-green-500" : pct <= 15 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

function MetricsTable({ data, formatPeriod }: { data: KpiPeriod[]; formatPeriod: (p: string) => string }) {
  // Show most recent first
  const rows = [...data].reverse();

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
          <th className="pb-3 font-medium pr-6">Periodo</th>
          <th className="pb-3 font-medium text-right pr-4">Total</th>
          <th className="pb-3 font-medium text-right pr-4">A tiempo</th>
          <th className="pb-3 font-medium text-right pr-4">Atrasados</th>
          <th className="pb-3 font-medium text-right pr-4">% Atraso</th>
          <th className="pb-3 font-medium pr-4"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {rows.map((row) => (
          <tr key={row.period} className="hover:bg-gray-50">
            <td className="py-3 text-gray-700 whitespace-nowrap pr-6 capitalize">
              {formatPeriod(row.period)}
            </td>
            <td className="py-3 text-right font-medium text-gray-700 pr-4">{row.total}</td>
            <td className="py-3 text-right text-green-700 font-medium pr-4">{row.total - row.delayed}</td>
            <td className="py-3 text-right text-red-600 font-medium pr-4">{row.delayed}</td>
            <td className="py-3 text-right pr-4">
              <PctBadge pct={row.pct_delayed} />
            </td>
            <td className="py-3 pr-4">
              <PctBar pct={row.pct_delayed} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function KpiTable({ metrics }: Props) {
  const [view, setView] = useState<"monthly" | "weekly">("monthly");

  if (!metrics.monthly.length && !metrics.weekly.length) {
    return (
      <p className="text-sm text-gray-400 py-4 text-center">
        Sin datos suficientes para mostrar KPIs.
      </p>
    );
  }

  return (
    <div>
      <div className="flex gap-1 mb-4">
        <button
          onClick={() => setView("monthly")}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            view === "monthly"
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Mensual
        </button>
        <button
          onClick={() => setView("weekly")}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            view === "weekly"
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Semanal
        </button>
      </div>

      <div className="overflow-x-auto">
        {view === "monthly" ? (
          <MetricsTable data={metrics.monthly} formatPeriod={formatMonth} />
        ) : (
          <MetricsTable data={metrics.weekly} formatPeriod={formatWeek} />
        )}
      </div>
    </div>
  );
}
