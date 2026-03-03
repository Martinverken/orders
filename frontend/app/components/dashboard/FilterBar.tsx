"use client";

import { useRouter, useSearchParams } from "next/navigation";

const SOURCES = [
  { value: "", label: "Todas las fuentes" },
  { value: "falabella", label: "Falabella" },
  { value: "mercadolibre", label: "Mercado Libre" },
];

const URGENCIES = [
  { value: "", label: "Todas las urgencias" },
  { value: "overdue", label: "Atrasados" },
  { value: "due_today", label: "Entregar hoy" },
  { value: "delivered_today", label: "Entregados hoy" },
  { value: "tomorrow", label: "Para mañana" },
  { value: "on_time", label: "A tiempo" },
];

export function FilterBar() {
  const router = useRouter();
  const params = useSearchParams();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    next.delete("page"); // Reset pagination on filter change
    router.push(`/dashboard?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-3">
      <select
        value={params.get("source") || ""}
        onChange={(e) => update("source", e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {SOURCES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      <select
        value={params.get("urgency") || ""}
        onChange={(e) => update("urgency", e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {URGENCIES.map((u) => (
          <option key={u.value} value={u.value}>{u.label}</option>
        ))}
      </select>
    </div>
  );
}
