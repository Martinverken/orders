"use client";

import { useEffect, useState } from "react";
import { getWarehouseSummary } from "@/app/lib/api";
import type { WarehouseSummaryData, WarehouseDaySummary } from "@/app/types";

function fmtDate(iso: string): string {
  const d = new Date(iso + "T12:00:00"); // noon to avoid TZ shift
  return d.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" });
}

function isToday(iso: string): boolean {
  return iso === new Date().toLocaleDateString("sv-SE");
}

function DayRow({ row }: { row: WarehouseDaySummary }) {
  const today = isToday(row.date);
  return (
    <li className="flex items-center gap-3 text-sm">
      <span className={`w-28 shrink-0 text-xs font-medium ${today ? "text-blue-700" : "text-gray-500"}`}>
        {today ? "Hoy" : fmtDate(row.date)}
      </span>
      <span className="flex-1 text-gray-900 font-semibold tabular-nums">{row.count} bulto{row.count !== 1 ? "s" : ""}</span>
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
}

export function WarehouseDailySummary() {
  const [data, setData] = useState<WarehouseSummaryData | null>(null);
  const [tab, setTab] = useState<"dia" | "operador">("dia");

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

  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 mb-2">
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
        </div>
      </div>

      {/* By Day */}
      {tab === "dia" && (
        <ul className="space-y-1.5">
          {data.by_day.map((row) => <DayRow key={row.date} row={row} />)}
        </ul>
      )}

      {/* By Carrier */}
      {tab === "operador" && (
        <ul className="space-y-1.5">
          {data.by_carrier.map((row) => {
            const total = row.due_today + row.overdue;
            if (total === 0) return null;
            return (
              <li key={row.carrier} className="flex items-center gap-3 text-sm">
                <span className="w-16 shrink-0 text-right text-xs font-mono font-semibold text-blue-700">
                  {row.pickup_cutoff ? `≤ ${row.pickup_cutoff}` : <span className="text-gray-400 font-normal">sin hora</span>}
                </span>
                <span className="font-medium text-gray-900 flex-1">{row.carrier}</span>
                <span className="flex items-center gap-1.5 text-xs">
                  {row.overdue > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">
                      {row.overdue} atrasado{row.overdue !== 1 ? "s" : ""}
                    </span>
                  )}
                  {row.due_today > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold">
                      {row.due_today} bulto{row.due_today !== 1 ? "s" : ""}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
