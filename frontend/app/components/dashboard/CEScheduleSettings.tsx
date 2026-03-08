"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveCESchedule } from "@/app/lib/api";
import { CESchedule } from "@/app/types";

const FULL_DAY = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MONTH_SHORT = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const WEEKDAY_KEYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

function getBusinessWeeks(): { title: string; days: { isoDate: string; label: string; isPast: boolean; weekdayKey: string }[] }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));

  return [1, 0].map((weekOffset) => {
    const weekStart = new Date(currentMonday);
    weekStart.setDate(currentMonday.getDate() + weekOffset * 7);
    const days = Array.from({ length: 5 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const isoDate = d.toLocaleDateString("sv"); // "YYYY-MM-DD" in local time
      const label = `${FULL_DAY[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
      return { isoDate, label, isPast: d < today, weekdayKey: WEEKDAY_KEYS[d.getDay()] };
    });
    return { title: weekOffset === 0 ? "Esta semana" : "Próxima semana", days };
  });
}

interface Props {
  initialSchedule: CESchedule;
}

export function CEScheduleSettings({ initialSchedule }: Props) {
  const router = useRouter();
  const weeks = getBusinessWeeks();

  const [times, setTimes] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const week of weeks)
      for (const day of week.days)
        init[day.isoDate] =
          initialSchedule.value?.[day.isoDate] ||
          initialSchedule.value?.[day.weekdayKey] ||
          "";
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const toSave = Object.fromEntries(Object.entries(times).filter(([, v]) => v.trim()));
      const savedData = await saveCESchedule(toSave);
      setTimes(() => {
        const next: Record<string, string> = {};
        for (const week of weeks)
          for (const day of week.days)
            next[day.isoDate] = savedData[day.isoDate] || savedData[day.weekdayKey] || "";
        return next;
      });
      setSaved(true);
      router.refresh();
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
    <div className="max-w-lg">
      <p className="text-sm text-gray-500 mb-6">
        Ingresa los horarios de corte del Centro de Envíos en formato 24h (ej: 14:45).
        Consúltalos en{" "}
        <a
          href="https://www.mercadolibre.cl/preferencias-de-venta/horarios-de-envio"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          Preferencias de venta → Horarios de envío
        </a>
        . El horario de venta cierra 6 horas antes del corte.
        {updatedAt && (
          <span className="block mt-1 text-xs text-gray-400">Última actualización: {updatedAt}</span>
        )}
      </p>

      <div className="space-y-6">
        {weeks.map((week) => (
          <div key={week.title}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
              {week.title}
            </h3>
            <div className="space-y-3">
              {week.days.map((day) => (
                <div key={day.isoDate} className="flex items-center gap-4">
                  <span className={`w-40 text-sm font-medium ${day.isPast ? "text-gray-400" : "text-gray-700"}`}>
                    {day.label}
                  </span>
                  <input
                    type="text"
                    value={times[day.isoDate] ?? ""}
                    onChange={(e) => setTimes((prev) => ({ ...prev, [day.isoDate]: e.target.value }))}
                    disabled={day.isPast}
                    placeholder="HH:MM"
                    maxLength={5}
                    className={`w-20 px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      day.isPast
                        ? "bg-white border-gray-100 text-gray-400 cursor-not-allowed"
                        : times[day.isoDate]
                        ? "bg-gray-100 border-gray-200 text-gray-500"
                        : "bg-white border-gray-200 text-gray-900"
                    }`}
                  />
                  {times[day.isoDate] && !day.isPast && (
                    <span className="text-xs text-gray-400">
                      Venta cierra a las {subtractHours(times[day.isoDate], 6)}
                    </span>
                  )}
                </div>
              ))}
            </div>
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
  const hh = Math.floor((((total % 1440) + 1440) % 1440) / 60);
  const mm = ((total % 60) + 60) % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
