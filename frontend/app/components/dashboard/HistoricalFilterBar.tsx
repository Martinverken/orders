"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { getDistinctHistoricalCommunes } from "@/app/lib/api";
import { MultiSelectDropdown } from "@/app/components/ui/MultiSelectDropdown";

const SOURCES = [
  { value: "", label: "Todas las fuentes" },
  { value: "falabella", label: "Falabella" },
  { value: "mercadolibre", label: "Mercado Libre" },
  { value: "walmart", label: "Walmart" },
  { value: "paris", label: "Paris" },
  { value: "shopify_verken", label: "Shopify Verken" },
  { value: "shopify_kaut", label: "Shopify Kaut" },
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
  { value: "Transporte Interno", label: "Transporte Interno (Walmart)" },
  { value: "Enviame", label: "Enviame (Paris)" },
];

export function HistoricalFilterBar({ cities = [] }: { cities?: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [communes, setCommunes] = useState<string[]>([]);

  const currentCity = params.get("h_city") || "";
  useEffect(() => {
    getDistinctHistoricalCommunes(currentCity || undefined)
      .then(setCommunes)
      .catch(() => setCommunes([]));
  }, [currentCity]);

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
    ["h_source", "h_urgency", "h_logistics_operator", "h_city", "h_commune", "h_page"].forEach(
      (k) => next.delete(k)
    );
    router.push(`/dashboard?${next.toString()}`);
  }

  const hasFilters =
    params.get("h_source") ||
    params.get("h_urgency") ||
    params.get("h_logistics_operator") ||
    params.get("h_city") ||
    params.get("h_commune");

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

      {cities.length > 0 && (
        <select
          value={params.get("h_city") || ""}
          onChange={(e) => update("h_city", e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todas las ciudades</option>
          {cities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      )}

      <select
        value={params.get("h_commune") || ""}
        onChange={(e) => update("h_commune", e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Todas las comunas</option>
        {communes.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

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
