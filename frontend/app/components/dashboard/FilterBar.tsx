"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { getDistinctCommunes } from "@/app/lib/api";
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
  { value: "overdue", label: "Atrasados" },
  { value: "due_today", label: "Entregar hoy" },
  { value: "tomorrow", label: "Para mañana" },
  { value: "two_or_more_days", label: "2+ días" },
];

const STATUSES = [
  { value: "pending", label: "Pendiente" },
  { value: "ready_to_ship", label: "Listo para enviar" },
  { value: "paid", label: "Pagado" },
  { value: "shipped", label: "En camino" },
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

export function FilterBar({ cities = [] }: { cities?: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [productInput, setProductInput] = useState(params.get("product_name") || "");
  const [communes, setCommunes] = useState<string[]>([]);

  const currentCity = params.get("city") || "";
  useEffect(() => {
    getDistinctCommunes(currentCity || undefined).then(setCommunes).catch(() => setCommunes([]));
  }, [currentCity]);

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    next.delete("page");
    router.push(`/dashboard?${next.toString()}`);
  }

  function applyProductName() {
    update("product_name", productInput.trim());
  }

  function clearAll() {
    setProductInput("");
    router.push("/dashboard");
  }

  const hasFilters =
    params.get("source") ||
    params.get("urgency") ||
    params.get("status") ||
    params.get("product_name") ||
    params.get("logistics_operator") ||
    params.get("city") ||
    params.get("commune");

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <select
        value={params.get("source") || ""}
        onChange={(e) => update("source", e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {SOURCES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      <MultiSelectDropdown
        label="Urgencia"
        options={URGENCIES}
        paramKey="urgency"
        params={params}
        onUpdate={update}
      />

      <MultiSelectDropdown
        label="Estado"
        options={STATUSES}
        paramKey="status"
        params={params}
        onUpdate={update}
      />

      <MultiSelectDropdown
        label="Operador logístico"
        options={LOGISTICS_OPERATORS}
        paramKey="logistics_operator"
        params={params}
        onUpdate={update}
      />

      {cities.length > 0 && (
        <select
          value={params.get("city") || ""}
          onChange={(e) => update("city", e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todas las ciudades</option>
          {cities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      )}

      <select
        value={params.get("commune") || ""}
        onChange={(e) => update("commune", e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Todas las comunas</option>
        {communes.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      <input
        type="text"
        placeholder="Buscar producto..."
        value={productInput}
        onChange={(e) => setProductInput(e.target.value)}
        onBlur={applyProductName}
        onKeyDown={(e) => e.key === "Enter" && applyProductName()}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
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
