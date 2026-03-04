"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { MultiSelectDropdown } from "@/app/components/ui/MultiSelectDropdown";

const SOURCES = [
  { value: "", label: "Todas las fuentes" },
  { value: "falabella", label: "Falabella" },
  { value: "mercadolibre", label: "Mercado Libre" },
];

const URGENCIES = [
  { value: "", label: "Todos" },
  { value: "a_tiempo", label: "A tiempo" },
  { value: "atrasado", label: "Atrasado" },
];

const LOGISTICS_OPERATORS = [
  { value: "Flex", label: "Flex (ML)" },
  { value: "Centro de Envíos", label: "Centro de Envíos (ML)" },
  { value: "direct", label: "Direct (Falabella)" },
  { value: "regular - blue express", label: "Blue Express" },
  { value: "regular - chilexpress", label: "Chilexpress" },
];

export function HistoricalFilterBar() {
  const router = useRouter();
  const params = useSearchParams();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    next.delete("h_page");
    router.push(`/dashboard?${next.toString()}`);
  }

  function clearAll() {
    const next = new URLSearchParams(params.toString());
    next.delete("h_source");
    next.delete("h_urgency");
    next.delete("h_logistics_operator");
    next.delete("h_page");
    router.push(`/dashboard?${next.toString()}`);
  }

  const hasFilters =
    params.get("h_source") ||
    params.get("h_urgency") ||
    params.get("h_logistics_operator");

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <select
        value={params.get("h_source") || ""}
        onChange={(e) => update("h_source", e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {SOURCES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      <select
        value={params.get("h_urgency") || ""}
        onChange={(e) => update("h_urgency", e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {URGENCIES.map((u) => (
          <option key={u.value} value={u.value}>{u.label}</option>
        ))}
      </select>

      <MultiSelectDropdown
        label="Operador logístico"
        options={LOGISTICS_OPERATORS}
        paramKey="h_logistics_operator"
        params={params}
        onUpdate={update}
      />

      {hasFilters && (
        <button
          onClick={clearAll}
          className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Limpiar
        </button>
      )}
    </div>
  );
}
