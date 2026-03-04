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

function subtractHours(time: string, hours: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m - hours * 60;
  const hh = Math.floor(((total % 1440) + 1440) % 1440 / 60);
  const mm = ((total % 60) + 60) % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

interface Props {
  initialSchedule: CESchedule;
}

export function CEScheduleModal({ initialSchedule }: Props) {
  const [open, setOpen] = useState(true);
  const [times, setTimes] = useState<Record<string, string>>(
    () => {
      const init: Record<string, string> = {};
      for (const d of DAYS) init[d.key] = initialSchedule.value?.[d.key] || "";
      return init;
    }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveCESchedule(times);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Horarios de entrega — Centro de Envíos
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Ingresa los horarios de corte de esta semana antes de continuar.
          Puedes verlos en{" "}
          <a
            href="https://www.mercadolibre.cl/preferencias-de-venta/horarios-de-envio"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            Preferencias de venta → Horarios de envío
          </a>
          .
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
                  Venta hasta las {subtractHours(times[d.key], 6)}
                </span>
              )}
            </div>
          ))}
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-500">{error}</p>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-6 w-full px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Guardando..." : "Guardar horarios y continuar"}
        </button>
      </div>
    </div>
  );
}
