"use client";

import { useState } from "react";
import { saveCESchedule } from "@/app/lib/api";
import { CESchedule } from "@/app/types";

const DAYS = [
  { key: "monday", label: "Lunes" },
  { key: "tuesday", label: "Martes" },
  { key: "wednesday", label: "Miércoles" },
  { key: "thursday", label: "Jueves" },
  { key: "friday", label: "Viernes" },
  { key: "saturday", label: "Sábado" },
];

interface Props {
  initialSchedule: CESchedule;
}

export function CEScheduleSettings({ initialSchedule }: Props) {
  const [times, setTimes] = useState<Record<string, string>>(
    () => {
      const init: Record<string, string> = {};
      for (const d of DAYS) init[d.key] = initialSchedule.value?.[d.key] || "";
      return init;
    }
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await saveCESchedule(times);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const updatedAt = initialSchedule.updated_at
    ? new Date(initialSchedule.updated_at).toLocaleString("es-CL", { timeZone: "America/Santiago" })
    : null;

  return (
    <div className="max-w-md">
      <p className="text-sm text-gray-500 mb-6">
        Ingresa los horarios de corte del Centro de Envíos para cada día de la semana.
        El horario de venta cierra 6 horas antes del corte.
        {updatedAt && (
          <span className="block mt-1 text-xs text-gray-400">Última actualización: {updatedAt}</span>
        )}
      </p>

      <div className="space-y-3">
        {DAYS.map((d) => (
          <div key={d.key} className="flex items-center gap-4">
            <span className="w-28 text-sm text-gray-700 font-medium">{d.label}</span>
            <input
              type="time"
              value={times[d.key]}
              onChange={(e) => setTimes((prev) => ({ ...prev, [d.key]: e.target.value }))}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {times[d.key] && (
              <span className="text-xs text-gray-400">
                Venta cierra a las {subtractHours(times[d.key], 6)}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Guardando..." : "Guardar horarios"}
        </button>
        {saved && <span className="text-sm text-green-600">Guardado correctamente</span>}
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>
    </div>
  );
}

function subtractHours(time: string, hours: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m - hours * 60;
  const hh = Math.floor(((total % 1440) + 1440) % 1440 / 60);
  const mm = ((total % 60) + 60) % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
