"use client";

import { useEffect, useState } from "react";
import { getMlReputation, MlReputation } from "@/app/lib/api";

const LEVEL_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  "5_green":       { label: "Líder", color: "text-green-700 bg-green-50 border-green-200", dot: "bg-green-500" },
  "4_light_green": { label: "Platino", color: "text-emerald-700 bg-emerald-50 border-emerald-200", dot: "bg-emerald-400" },
  "3_yellow":      { label: "Oro", color: "text-yellow-700 bg-yellow-50 border-yellow-200", dot: "bg-yellow-400" },
  "2_orange":      { label: "Plata", color: "text-orange-700 bg-orange-50 border-orange-200", dot: "bg-orange-400" },
  "1_red":         { label: "Bronce", color: "text-red-700 bg-red-50 border-red-200", dot: "bg-red-500" },
};

function fmt(rate: number | null): string {
  if (rate == null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

export function MlReputationBadge() {
  const [data, setData] = useState<MlReputation | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getMlReputation()
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (error || !data) return null;
  if (!data.level_id) return null;

  const cfg = LEVEL_CONFIG[data.level_id] ?? { label: data.level_id, color: "text-gray-600 bg-gray-50 border-gray-200", dot: "bg-gray-400" };

  return (
    <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${cfg.color}`}
      title={`Reputación MercadoLibre\nEnvíos tardíos: ${fmt(data.delayed_rate)}\nReclamos: ${fmt(data.claims_rate)}\nCancelaciones: ${fmt(data.cancellations_rate)}`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
      <span className="font-semibold">ML</span>
      <span>{cfg.label}</span>
      {data.delayed_rate != null && (
        <span className="opacity-70 font-normal">· {fmt(data.delayed_rate)} tardíos</span>
      )}
    </div>
  );
}
