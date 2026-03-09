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

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getSunday(monday: Date): Date {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday;
}

function formatISO(d: Date): string {
  return d.toLocaleDateString("sv"); // YYYY-MM-DD
}

function formatWeekLabel(from: string, to: string): string {
  const f = new Date(from + "T00:00:00");
  const t = new Date(to + "T00:00:00");
  const fmtDay = (d: Date) => d.toLocaleDateString("es-CL", { day: "numeric", month: "short" });
  return `${fmtDay(f)} – ${fmtDay(t)}`;
}

export function HistoricalFilterBar({ cities = [] }: { cities?: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [communes, setCommunes] = useState<string[]>([]);
  const [orderNumberInput, setOrderNumberInput] = useState(params.get("h_order_number") || "");

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

  function applyOrderNumber() {
    update("h_order_number", orderNumberInput.trim());
  }

  function setWeek(monday: Date) {
    const next = new URLSearchParams(params.toString());
    next.set("h_date_from", formatISO(monday));
    next.set("h_date_to", formatISO(getSunday(monday)));
    next.delete("h_page");
    router.push(`/dashboard?${next.toString()}`);
  }

  function clearAll() {
    setOrderNumberInput("");
    const next = new URLSearchParams(params.toString());
    ["h_source", "h_urgency", "h_logistics_operator", "h_city", "h_commune", "h_order_number", "h_date_from", "h_date_to", "h_page"].forEach(
      (k) => next.delete(k)
    );
    router.push(`/dashboard?${next.toString()}`);
  }

  const hasFilters =
    params.get("h_source") ||
    params.get("h_urgency") ||
    params.get("h_logistics_operator") ||
    params.get("h_city") ||
    params.get("h_commune") ||
    params.get("h_order_number") ||
    params.get("h_date_from");

  const currentDateFrom = params.get("h_date_from") || "";
  const currentDateTo = params.get("h_date_to") || "";

  // Week navigation
  const today = new Date();
  const lastMonday = getMonday(new Date(today.getTime() - 7 * 86400000));
  const thisMonday = getMonday(today);

  const activeWeekMonday = currentDateFrom ? getMonday(new Date(currentDateFrom + "T00:00:00")) : null;

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

      <input
        type="text"
        placeholder="N° orden..."
        value={orderNumberInput}
        onChange={(e) => setOrderNumberInput(e.target.value)}
        onBlur={applyOrderNumber}
        onKeyDown={(e) => e.key === "Enter" && applyOrderNumber()}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-36"
      />

      <div className="flex items-center gap-1 border border-gray-200 rounded-lg bg-white">
        <button
          onClick={() => {
            if (activeWeekMonday) {
              setWeek(getMonday(new Date(activeWeekMonday.getTime() - 7 * 86400000)));
            } else {
              setWeek(lastMonday);
            }
          }}
          className="px-2 py-2 text-gray-500 hover:text-gray-700 text-sm"
          title="Semana anterior"
        >
          ‹
        </button>
        <button
          onClick={() => setWeek(lastMonday)}
          className={`px-3 py-2 text-sm transition-colors ${
            activeWeekMonday && formatISO(activeWeekMonday) === formatISO(lastMonday)
              ? "bg-blue-50 text-blue-700 font-medium"
              : "text-gray-700 hover:bg-gray-50"
          }`}
        >
          Sem. anterior
        </button>
        <button
          onClick={() => setWeek(thisMonday)}
          className={`px-3 py-2 text-sm transition-colors ${
            activeWeekMonday && formatISO(activeWeekMonday) === formatISO(thisMonday)
              ? "bg-blue-50 text-blue-700 font-medium"
              : "text-gray-700 hover:bg-gray-50"
          }`}
        >
          Esta semana
        </button>
        <button
          onClick={() => {
            if (activeWeekMonday) {
              setWeek(getMonday(new Date(activeWeekMonday.getTime() + 7 * 86400000)));
            }
          }}
          disabled={!activeWeekMonday}
          className="px-2 py-2 text-gray-500 hover:text-gray-700 text-sm disabled:opacity-30"
          title="Semana siguiente"
        >
          ›
        </button>
      </div>
      {currentDateFrom && currentDateTo && (
        <span className="text-xs text-gray-500">
          {formatWeekLabel(currentDateFrom, currentDateTo)}
        </span>
      )}

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
