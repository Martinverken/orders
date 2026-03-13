"use client";

import { useState } from "react";
import type { Courier } from "@/app/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const SUGGESTED_NAMES = [
  "Welivery",
  "Bluexpress",
  "Chilexpress",
  "Starken",
  "Walmart",
  "Mercado Libre",
];

function TimeInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-28 px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
    />
  );
}

interface RowState {
  pickup_cutoff: string;
  saving: boolean;
  dirty: boolean;
}

export function CourierScheduleManager({ initialData }: { initialData: Courier[] }) {
  const [couriers, setCouriers] = useState<Courier[]>(initialData);
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const s: Record<string, RowState> = {};
    for (const c of initialData) {
      s[c.id] = {
        pickup_cutoff: c.pickup_cutoff ?? "",
        saving: false,
        dirty: false,
      };
    }
    return s;
  });

  // Add new courier form
  const [addName, setAddName] = useState("");
  const [addCutoff, setAddCutoff] = useState("");
  const [adding, setAdding] = useState(false);

  function updateRow(id: string, field: keyof RowState, value: string | boolean) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value, dirty: field !== "saving" && field !== "dirty" ? true : prev[id].dirty } }));
  }

  async function save(id: string) {
    const row = rows[id];
    updateRow(id, "saving", true);
    try {
      const res = await fetch(`${API_URL}/api/couriers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickup_cutoff: row.pickup_cutoff || null,
        }),
      });
      if (res.ok) {
        setRows((prev) => ({ ...prev, [id]: { ...prev[id], saving: false, dirty: false } }));
      }
    } catch {
      updateRow(id, "saving", false);
    }
  }

  async function addCourier() {
    if (!addName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`${API_URL}/api/couriers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addName.trim(),
          pickup_cutoff: addCutoff || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const newC: Courier = data.data;
        setCouriers((prev) => [...prev, newC]);
        setRows((prev) => ({
          ...prev,
          [newC.id]: {
            pickup_cutoff: newC.pickup_cutoff ?? "",
            saving: false,
            dirty: false,
          },
        }));
        setAddName("");
        setAddCutoff("");
      }
    } finally {
      setAdding(false);
    }
  }

  async function deleteCourier(id: string) {
    const res = await fetch(`${API_URL}/api/couriers/${id}`, { method: "DELETE" });
    if (res.ok) {
      setCouriers((prev) => prev.filter((c) => c.id !== id));
      setRows((prev) => { const next = { ...prev }; delete next[id]; return next; });
    }
  }

  const unusedSuggestions = SUGGESTED_NAMES.filter(
    (n) => !couriers.some((c) => c.name.toLowerCase() === n.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Existing couriers */}
      {couriers.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="pb-2 pr-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Operador</th>
                <th className="pb-2 pr-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Hora límite</th>
                <th className="pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {couriers.map((c) => {
                const row = rows[c.id];
                if (!row) return null;
                return (
                  <tr key={c.id}>
                    <td className="py-2.5 pr-4 font-medium text-gray-900">{c.name}</td>
                    <td className="py-2.5 pr-4">
                      <TimeInput
                        value={row.pickup_cutoff}
                        onChange={(v) => updateRow(c.id, "pickup_cutoff", v)}
                      />
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        {row.dirty && (
                          <button
                            onClick={() => save(c.id)}
                            disabled={row.saving}
                            className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          >
                            {row.saving ? "Guardando…" : "Guardar"}
                          </button>
                        )}
                        {!row.dirty && (
                          <span className="text-xs text-gray-300">✓</span>
                        )}
                        <button
                          onClick={() => deleteCourier(c.id)}
                          className="text-gray-300 hover:text-red-500 transition-colors text-xs"
                          title="Eliminar"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {couriers.length === 0 && (
        <p className="text-sm text-gray-400">No hay operadores configurados.</p>
      )}

      {/* Add new courier */}
      <div className="pt-2 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Agregar operador</p>

        {/* Quick-add suggestions */}
        {unusedSuggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {unusedSuggestions.map((name) => (
              <button
                key={name}
                onClick={() => setAddName(name)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  addName === name
                    ? "bg-blue-50 border-blue-300 text-blue-700"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                + {name}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Nombre</label>
            <input
              type="text"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="ej. Bluexpress"
              className="w-40 px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Hora límite</label>
            <TimeInput value={addCutoff} onChange={setAddCutoff} />
          </div>
          <button
            onClick={addCourier}
            disabled={!addName.trim() || adding}
            className="px-4 py-1.5 text-sm font-medium bg-gray-900 text-white rounded-md hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            {adding ? "Agregando…" : "Agregar"}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          El nombre debe coincidir con el operador que aparece en el resumen de bodega (ej. &quot;Bluexpress&quot;, &quot;Welivery&quot;).
        </p>
      </div>
    </div>
  );
}
