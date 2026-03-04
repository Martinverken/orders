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

const MONTH_SHORT = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const DAY_OFFSET: Record<string, number> = { monday:0, tuesday:1, wednesday:2, thursday:3, friday:4, saturday:5 };

function getWeekDates(): Record<string, { date: Date; isPast: boolean }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  const result: Record<string, { date: Date; isPast: boolean }> = {};
  for (const [key, offset] of Object.entries(DAY_OFFSET)) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + offset);
    result[key] = { date: d, isPast: d < today };
  }
  return result;
}

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

  const weekDates = getWeekDates();

  return (
    <div className="max-w-lg">
      <p className="text-sm text-gray-500 mb-6">
        Ingresa los horarios de corte del Centro de Envíos en formato 24h (ej: 14:45).
        El horario de venta cierra 6 horas antes del corte.
        {updatedAt && (
          <span className="block mt-1 text-xs text-gray-400">Última actualización: {updatedAt}</span>
        )}
      </p>

      <div className="space-y-3">
        {DAYS.map((d) => {
          const { date, isPast } = weekDates[d.key];
          const dateLabel = `${d.label} ${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`;
          return (
          <div key={d.key} className="flex items-center gap-4">
            <span className={`w-40 text-sm font-medium ${isPast ? "text-gray-400" : "text-gray-700"}`}>{dateLabel}</span>
            <input
              type="text"
              value={times[d.key]}
              onChange={(e) => setTimes((prev) => ({ ...prev, [d.key]: e.target.value }))}
              disabled={isPast}
              placeholder="HH:MM"
              maxLength={5}
              className={`w-20 px-3 py-1.5 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${isPast ? "border-gray-100 text-gray-400 cursor-not-allowed" : "border-gray-200 text-gray-900"}`}
            />
            {times[d.key] && !isPast && (
              <span className="text-xs text-gray-400">
                Venta cierra a las {subtractHours(times[d.key], 6)}
              </span>
            )}
          </div>
          );
        })}
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
