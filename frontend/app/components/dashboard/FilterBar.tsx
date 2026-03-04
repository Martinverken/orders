"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect } from "react";

const SOURCES = [
  { value: "", label: "Todas las fuentes" },
  { value: "falabella", label: "Falabella" },
  { value: "mercadolibre", label: "Mercado Libre" },
];

const URGENCIES = [
  { value: "overdue", label: "Atrasados" },
  { value: "due_today", label: "Entregar hoy" },
  { value: "tomorrow", label: "Para mañana" },
  { value: "on_time", label: "A tiempo" },
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
];

function MultiSelectDropdown({
  label,
  options,
  paramKey,
  params,
  onUpdate,
}: {
  label: string;
  options: { value: string; label: string }[];
  paramKey: string;
  params: ReturnType<typeof useSearchParams>;
  onUpdate: (key: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = (params.get(paramKey) || "").split(",").filter(Boolean);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggle(value: string) {
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    onUpdate(paramKey, next.join(","));
  }

  const displayLabel =
    selected.length === 0
      ? label
      : selected.length === 1
      ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
      : `${selected.length} seleccionados`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-1.5 text-gray-900 ${
          selected.length > 0 ? "border-blue-400" : "border-gray-200"
        }`}
      >
        {displayLabel}
        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[180px] py-1">
          {options.map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm text-gray-900"
            >
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                onChange={() => toggle(o.value)}
                className="rounded"
              />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function FilterBar({ cities = [] }: { cities?: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [productInput, setProductInput] = useState(params.get("product_name") || "");
  const [communeInput, setCommuneInput] = useState(params.get("commune") || "");

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

  function applyCommune() {
    update("commune", communeInput.trim());
  }

  function clearAll() {
    setProductInput("");
    setCommuneInput("");
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

      <input
        type="text"
        placeholder="Comuna..."
        value={communeInput}
        onChange={(e) => setCommuneInput(e.target.value)}
        onBlur={applyCommune}
        onKeyDown={(e) => e.key === "Enter" && applyCommune()}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-36"
      />

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
