"use client";

import { useEffect, useState } from "react";
import { getWarehouseSummary } from "@/app/lib/api";
import { WarehouseCarrierSummary } from "@/app/types";

export function WarehouseDailySummary() {
  const [data, setData] = useState<WarehouseCarrierSummary[] | null>(null);

  useEffect(() => {
    getWarehouseSummary().then(setData).catch(() => setData([]));
  }, []);

  if (!data || data.length === 0) return null;

  const totalToday = data.reduce((s, r) => s + r.due_today, 0);
  const totalOverdue = data.reduce((s, r) => s + r.overdue, 0);
  const grand = totalToday + totalOverdue;

  if (grand === 0) return null;

  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 mb-2">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-blue-900">Paquetes a entregar hoy</h3>
          <p className="text-xs text-blue-600 mt-0.5">
            {grand} total · {totalOverdue > 0 && <span className="text-red-600 font-medium">{totalOverdue} atrasado{totalOverdue !== 1 ? "s" : ""} · </span>}
            {totalToday} de hoy
          </p>
        </div>
      </div>

      <ul className="space-y-1.5">
        {data.map((row) => {
          const total = row.due_today + row.overdue;
          if (total === 0) return null;
          return (
            <li key={row.carrier} className="flex items-center gap-3 text-sm">
              {/* Cutoff badge */}
              <span className="w-16 shrink-0 text-right text-xs font-mono font-semibold text-blue-700">
                {row.pickup_cutoff ? `≤ ${row.pickup_cutoff}` : <span className="text-gray-400 font-normal">sin hora</span>}
              </span>
              {/* Carrier name */}
              <span className="font-medium text-gray-900 flex-1">{row.carrier}</span>
              {/* Counts */}
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
    </div>
  );
}
