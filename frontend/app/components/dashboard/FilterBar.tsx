"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const SOURCES = [
  { value: "", label: "Todas las fuentes" },
  { value: "falabella", label: "Falabella" },
  { value: "mercadolibre", label: "Mercado Libre" },
];

const URGENCIES = [
  { value: "", label: "Todas" },
  { value: "overdue", label: "Atrasados" },
  { value: "due_today", label: "Entregar hoy" },
  { value: "tomorrow", label: "Para mañana" },
  { value: "on_time", label: "A tiempo" },
];

const STATUSES = [
  { value: "", label: "Todos los estados" },
  { value: "pending", label: "Pendiente" },
  { value: "ready_to_ship", label: "Listo para enviar" },
  { value: "paid", label: "Pagado" },
  { value: "shipped", label: "En camino" },
];

const LOGISTICS_OPERATORS = [
  { value: "", label: "Todos los operadores" },
  { value: "Flex", label: "Flex (ML)" },
  { value: "Centro de Envíos", label: "Centro de Envíos (ML)" },
  { value: "direct", label: "Direct (Falabella)" },
  { value: "regular - blue express", label: "Blue Express" },
  { value: "regular - chilexpress", label: "Chilexpress" },
];

export function FilterBar() {
  const router = useRouter();
  const params = useSearchParams();
  const [productInput, setProductInput] = useState(params.get("product_name") || "");

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
    params.get("logistics_operator");

  return (
    <div className="flex flex-wrap gap-3 items-center">
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

      <select
        value={params.get("status") || ""}
        onChange={(e) => update("status", e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      <select
        value={params.get("logistics_operator") || ""}
        onChange={(e) => update("logistics_operator", e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {LOGISTICS_OPERATORS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <input
        type="text"
        placeholder="Buscar producto..."
        value={productInput}
        onChange={(e) => setProductInput(e.target.value)}
        onBlur={applyProductName}
        onKeyDown={(e) => e.key === "Enter" && applyProductName()}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
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
