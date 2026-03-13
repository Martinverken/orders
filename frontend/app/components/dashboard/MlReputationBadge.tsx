"use client";

import { useEffect, useState } from "react";
import { getMlReputation } from "@/app/lib/api";
import type { MlReputation } from "@/app/types";

const LEVEL_CONFIG: Record<string, { label: string; score: string | null; color: string; dot: string }> = {
  "5_green":       { label: "Líder",   score: "4/4", color: "text-green-700 bg-green-50 border-green-200", dot: "bg-green-500" },
  "4_light_green": { label: "Platino", score: "3/4", color: "text-emerald-700 bg-emerald-50 border-emerald-200", dot: "bg-emerald-400" },
  "3_yellow":      { label: "Oro",     score: "2/4", color: "text-yellow-700 bg-yellow-50 border-yellow-200", dot: "bg-yellow-400" },
  "2_orange":      { label: "Plata",   score: "1/4", color: "text-orange-700 bg-orange-50 border-orange-200", dot: "bg-orange-400" },
  "1_red":         { label: "Bronce",  score: null,  color: "text-red-700 bg-red-50 border-red-200", dot: "bg-red-500" },
};

// ML Líder thresholds (as fractions)
const THRESHOLDS = {
  delayed:       0.10,   // 10%
  claims:        0.025,  // 2.5%
  mediations:    0.02,   // 2%
  cancellations: 0.005,  // 0.5%
};

function fmt(rate: number | null): string {
  if (rate == null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

function MetricRow({
  label,
  rate,
  value,
  threshold,
}: {
  label: string;
  rate: number | null;
  value: number | null;
  threshold: number;
}) {
  if (rate == null) return null;
  const ok = rate <= threshold;
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-gray-600">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={`font-semibold tabular-nums ${ok ? "text-green-700" : "text-red-600"}`}>
          {fmt(rate)}
          {value != null && <span className="font-normal text-gray-400 ml-1">({value})</span>}
        </span>
        <span className="text-gray-300">·</span>
        <span className="text-gray-400">lím. {fmt(threshold)}</span>
      </div>
    </div>
  );
}

export function MlReputationBadge() {
  const [data, setData] = useState<MlReputation | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getMlReputation()
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (error || !data) return null;
  if (!data.level_id) return null;

  const cfg = LEVEL_CONFIG[data.level_id] ?? {
    label: data.level_id,
    score: null,
    color: "text-gray-600 bg-gray-50 border-gray-200",
    dot: "bg-gray-400",
  };

  return (
    <div className="relative hidden sm:block">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${cfg.color}`}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
        <span className="font-semibold">ML</span>
        <span>{cfg.label}</span>
        {cfg.score && <span className="opacity-60 font-normal">({cfg.score})</span>}
        {data.delayed_rate != null && (
          <span className="opacity-70 font-normal">· {fmt(data.delayed_rate)} tardíos</span>
        )}
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-600 ml-0.5">
          detalle
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-64 rounded-lg border border-gray-200 bg-white shadow-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-700 pb-1 border-b border-gray-100">
              Reputación MercadoLibre
            </p>
            <MetricRow
              label="Envíos tardíos"
              rate={data.delayed_rate}
              value={data.delayed_value}
              threshold={THRESHOLDS.delayed}
            />
            <MetricRow
              label="Reclamos"
              rate={data.claims_rate}
              value={data.claims_value}
              threshold={THRESHOLDS.claims}
            />
            <MetricRow
              label="Mediaciones"
              rate={data.mediations_rate}
              value={data.mediations_value}
              threshold={THRESHOLDS.mediations}
            />
            <MetricRow
              label="Canceladas por ti"
              rate={data.cancellations_rate}
              value={data.cancellations_value}
              threshold={THRESHOLDS.cancellations}
            />
            {data.transactions_completed != null && (
              <p className="text-xs text-gray-400 pt-1 border-t border-gray-100">
                {data.transactions_completed.toLocaleString()} ventas completadas
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
