"use client";

import { useState } from "react";
import { Courier } from "@/app/types";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface Props { initialData: Courier[] }

const clp = (n: number) => `$${n.toLocaleString("es-CL")}`;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

function downloadCsv(filename: string, rows: string[][]) {
  const bom = "\uFEFF";
  const content = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([bom + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Welivery tiers ────────────────────────────────────────────────────────────
const WELIVERY_URBAN = [
  { tier: "Normal",   max_sides: 150, max_weight: 20, price: 2450 },
  { tier: "XL",       max_sides: 200, max_weight: 25, price: 4300 },
  { tier: "2XL",      max_sides: 250, max_weight: 30, price: 10000 },
  { tier: "3XL",      max_sides: 300, max_weight: 35, price: 16000 },
  { tier: "4XL",      max_sides: 350, max_weight: 40, price: 21000 },
  { tier: "5XL",      max_sides: 400, max_weight: 45, price: 26000 },
  { tier: "6XL",      max_sides: 450, max_weight: 50, price: 30000 },
];
const WELIVERY_RURAL = [
  { tier: "Rural",    max_sides: 150, max_weight: 20, price: 4600 },
  { tier: "XL Rural", max_sides: 200, max_weight: 25, price: 6500 },
  { tier: "2XL Rural",max_sides: 250, max_weight: 30, price: 13000 },
  { tier: "3XL Rural",max_sides: 300, max_weight: 35, price: 19000 },
  { tier: "4XL Rural",max_sides: 350, max_weight: 40, price: 24000 },
  { tier: "5XL Rural",max_sides: 400, max_weight: 45, price: 29000 },
  { tier: "6XL Rural",max_sides: 450, max_weight: 50, price: 33000 },
];

// ── MercadoLibre Centro de Envíos ─────────────────────────────────────────────
// Peso tarificable = max(real, volumétrico) donde vol = l×w×h / 4000.
// Precios con IVA incluido (CLP). Descuentos según reputación + precio producto.
const ML_ROWS = [
  { label: "≤ 300g",     base: 6000 },
  { label: "300g–500g",  base: 6200 },
  { label: "500g–1kg",   base: 6400 },
  { label: "1–1,5kg",    base: 6600 },
  { label: "1,5–2kg",    base: 7200 },
  { label: "2–3kg",      base: 7600 },
  { label: "3–4kg",      base: 9100 },
  { label: "4–5kg",      base: 9500 },
  { label: "5–6kg",      base: 10100 },
  { label: "6–8kg",      base: 11300 },
  { label: "8–10kg",     base: 12100 },
  { label: "10–15kg",    base: 14000 },
  { label: "15–20kg",    base: 16600 },
  { label: "20–25kg",    base: 20000 },
  { label: "25–30kg",    base: 26100 },
  { label: "30–40kg",    base: 29200 },
  { label: "40–50kg",    base: 34600 },
  { label: "50–60kg",    base: 36200 },
  { label: "60–70kg",    base: 40000 },
  { label: "70–80kg",    base: 44000 },
  { label: "80–90kg",    base: 47600 },
  { label: "90–100kg",   base: 51600 },
  { label: "100–110kg",  base: 56800 },
  { label: "110–120kg",  base: 63200 },
  { label: "120–130kg",  base: 69800 },
  { label: "130–140kg",  base: 76800 },
  { label: "140–150kg",  base: 83200 },
  { label: "150–175kg",  base: 94800 },
  { label: "175–200kg",  base: 111200 },
  { label: "200–225kg",  base: 127800 },
  { label: "225–250kg",  base: 141800 },
  { label: "250–275kg",  base: 156800 },
  { label: "275–300kg",  base: 171800 },
  { label: "> 300kg",    base: 186800 },
];

// Líderes/verde/sin rep: descuento por precio del producto nuevo
const ML_LIDERES_DISCOUNTS = [
  { label: "Usado / < $19.990", discount: 0 },
  { label: "$19.990–$30.000",   discount: 0.60 },
  { label: "$30.001–$40.000",   discount: 0.55 },
  { label: "$40.001+",          discount: 0.50 },
];

// ── Falabella tariff table ────────────────────────────────────────────────────
// Columns: [5/5_low, 4/5_low, 3/5_low, 2/5_low, 5/5_high, 4/5_high, 3/5_high, 2/5_high]
const FALA_ROWS = [
  { label: "0–1 kg",     prices: [1000, 1190, 1890, 2390, 2790, 3490, 5290, 6590] },
  { label: "1–2 kg",     prices: [1000, 1190, 1890, 2390, 2890, 3490, 5590, 6990] },
  { label: "2–3 kg",     prices: [1000, 1190, 1890, 2390, 3090, 3690, 5890, 7390] },
  { label: "3–6 kg",     prices: [2490, 2990, 4790, 5990, 3390, 3990, 6390, 7990] },
  { label: "6–10 kg",    prices: [3790, 4490, 7190, 8990, 3790, 4490, 7190, 8990] },
  { label: "10–15 kg",   prices: [4590, 5490, 8790, 10990, 4590, 5490, 8790, 10990] },
  { label: "15–20 kg",   prices: [5490, 6490, 10390, 12990, 5490, 6490, 10390, 12990] },
  { label: "20–30 kg",   prices: [6690, 7990, 12790, 15990, 6690, 7990, 12790, 15990] },
  { label: "30–50 kg",   prices: [7590, 8990, 14390, 17990, 7590, 8990, 14390, 17990] },
  { label: "50–80 kg",   prices: [8390, 9990, 15990, 19990, 8390, 9990, 15990, 19990] },
  { label: "80–100 kg",  prices: [9190, 10990, 17590, 21990, 9190, 10990, 17590, 21990] },
  { label: "100–125 kg", prices: [9190, 10990, 17590, 21990, 9190, 10990, 17590, 21990] },
  { label: "125–150 kg", prices: [10890, 12990, 20790, 25990, 10890, 12990, 20790, 25990] },
  { label: "150–175 kg", prices: [10890, 12990, 20790, 25990, 10890, 12990, 20790, 25990] },
  { label: "175–200 kg", prices: [12590, 14990, 23990, 29990, 12590, 14990, 23990, 29990] },
  { label: "200–225 kg", prices: [15990, 18990, 30390, 37990, 15990, 18990, 30390, 37990] },
  { label: "225–250 kg", prices: [15990, 18990, 30390, 37990, 15990, 18990, 30390, 37990] },
  { label: "250–300 kg", prices: [20990, 24990, 39990, 49990, 20990, 24990, 39990, 49990] },
  { label: "300–400 kg", prices: [21790, 25990, 41590, 51990, 21790, 25990, 41590, 51990] },
  { label: "400–500 kg", prices: [22690, 26990, 43190, 53990, 22690, 26990, 43190, 53990] },
  { label: "500–600 kg", prices: [29390, 34990, 55990, 69990, 29390, 34990, 55990, 69990] },
  { label: ">600 kg/kg", prices: [34, 40, 64, 80, 34, 40, 64, 80] },
];

// ── Shared UI pieces ──────────────────────────────────────────────────────────
function ZonePill({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

function SectionLabel({ children, className = "mb-2" }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-xs font-semibold text-gray-400 uppercase tracking-wide ${className}`}>{children}</p>;
}

function DownloadBtn({ onClick, label = "Descargar Excel" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2.5 py-1 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
    >
      ↓ {label}
    </button>
  );
}

function Restriction({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-1.5 text-xs text-gray-600">
      <span className="mt-0.5 text-red-400 shrink-0">✕</span>
      {children}
    </li>
  );
}

function CourierCard({ name, color, children }: { name: string; color: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-white hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
          <span className="font-semibold text-gray-900 text-sm">{name}</span>
        </div>
        <span className="text-gray-400 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-5 py-5 border-t border-gray-100 bg-white space-y-5">{children}</div>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function CouriersTable({ initialData }: Props) {
  const [weliveryTab, setWeliveryTab] = useState<"urbano" | "rural">("urbano");
  const [falaRating, setFalaRating] = useState<"5/5" | "4/5" | "3/5" | "2/5">("5/5");
  const [mlRep, setMlRep] = useState<"lideres" | "amarilla" | "naranja">("lideres");

  const falaRatingIdx = { "5/5": 0, "4/5": 1, "3/5": 2, "2/5": 3 }[falaRating];

  function downloadWelivery() {
    const header = ["Tipo", "Tramo", "Suma lados máx. (cm)", "Peso máx. (kg)", "Precio neto (CLP)", "Precio c/IVA (CLP)"];
    const rows: string[][] = [header];
    for (const r of WELIVERY_URBAN) {
      rows.push(["Urbano", r.tier, String(r.max_sides), String(r.max_weight), String(r.price), String(Math.ceil(r.price * 1.19))]);
    }
    for (const r of WELIVERY_RURAL) {
      rows.push(["Rural", r.tier, String(r.max_sides), String(r.max_weight), String(r.price), String(Math.ceil(r.price * 1.19))]);
    }
    downloadCsv("tarifas_welivery.csv", rows);
  }

  function downloadFalabella() {
    const header = [
      "Tramo",
      "5/5 < $19.990", "4/5 < $19.990", "3/5 < $19.990", "2/5 < $19.990",
      "5/5 ≥ $19.990", "4/5 ≥ $19.990", "3/5 ≥ $19.990", "2/5 ≥ $19.990",
    ];
    const rows: string[][] = [header];
    for (const row of FALA_ROWS) {
      rows.push([row.label, ...row.prices.map(String)]);
    }
    downloadCsv("tarifas_falabella_cofinanciamiento.csv", rows);
  }

  function downloadML() {
    const header = [
      "Tramo",
      "Precio base (CLP)",
      "Líderes/Verde: usado/<$19.990 (CLP)",
      "Líderes/Verde: $19.990-$30.000 −60% (CLP)",
      "Líderes/Verde: $30.001-$40.000 −55% (CLP)",
      "Líderes/Verde: $40.001+ −50% (CLP)",
      "Amarilla: <$19.990 (CLP)",
      "Amarilla: ≥$19.990 −40% (CLP)",
      "Naranja/Roja: sin descuento (CLP)",
    ];
    const rows: string[][] = [header];
    for (const r of ML_ROWS) {
      rows.push([
        r.label,
        String(r.base),
        String(r.base),
        String(Math.round(r.base * 0.40)),
        String(Math.round(r.base * 0.45)),
        String(Math.round(r.base * 0.50)),
        String(r.base),
        String(Math.round(r.base * 0.60)),
        String(r.base),
      ]);
    }
    downloadCsv("tarifas_mercadolibre.csv", rows);
  }

  async function downloadStarken() {
    const res = await fetch(`${API_URL}/api/shipping/tariffs/starken`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tarifas_starken.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">

      {/* ── Rapiboy ── */}
      <CourierCard name="Rapiboy" color="bg-blue-500">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div>
            <SectionLabel>Zonas disponibles</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              <ZonePill label="Santiago Flex" color="bg-blue-50 text-blue-700" />
            </div>
          </div>
          <div>
            <SectionLabel>Tarifa</SectionLabel>
            <p className="text-sm text-gray-700">Tarifa plana</p>
            <p className="text-lg font-semibold text-gray-900 mt-0.5">{clp(2856)} <span className="text-xs font-normal text-gray-400">c/IVA</span></p>
            <p className="text-xs text-gray-500">{clp(2400)} neto</p>
          </div>
          <div>
            <SectionLabel>Restricciones</SectionLabel>
            <ul className="space-y-1">
              <Restriction>Suma de lados máx. 180 cm</Restriction>
              <Restriction>Peso máx. 20 kg</Restriction>
              <Restriction>Solo comunas zona Flex</Restriction>
            </ul>
          </div>
        </div>
      </CourierCard>

      {/* ── Welivery ── */}
      <CourierCard name="Welivery" color="bg-green-500">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div>
            <SectionLabel>Zonas disponibles</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              <ZonePill label="Santiago Flex (urbano)" color="bg-green-50 text-green-700" />
              <ZonePill label="Santiago Flex (rural)" color="bg-teal-50 text-teal-700" />
            </div>
          </div>
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <SectionLabel className="mb-0">Tarifas por tramo</SectionLabel>
              <DownloadBtn onClick={downloadWelivery} />
            </div>
            <div className="flex gap-1 mb-3">
              {(["urbano", "rural"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setWeliveryTab(t)}
                  className={`px-3 py-1 text-xs rounded-lg transition-colors ${weliveryTab === t ? "bg-gray-900 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-1.5 pr-3 text-gray-500 font-medium">Tramo</th>
                    <th className="text-right py-1.5 pr-3 text-gray-500 font-medium">Suma lados</th>
                    <th className="text-right py-1.5 pr-3 text-gray-500 font-medium">Peso máx.</th>
                    <th className="text-right py-1.5 pr-3 text-gray-500 font-medium">Precio neto</th>
                    <th className="text-right py-1.5 text-gray-500 font-medium">Precio c/IVA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(weliveryTab === "urbano" ? WELIVERY_URBAN : WELIVERY_RURAL).map((row) => (
                    <tr key={row.tier}>
                      <td className="py-1.5 pr-3 font-medium text-gray-700">{row.tier}</td>
                      <td className="py-1.5 pr-3 text-right text-gray-600">≤ {row.max_sides} cm</td>
                      <td className="py-1.5 pr-3 text-right text-gray-600">≤ {row.max_weight} kg</td>
                      <td className="py-1.5 pr-3 text-right text-gray-600">{clp(row.price)}</td>
                      <td className="py-1.5 text-right font-semibold text-gray-900">{clp(Math.ceil(row.price * 1.19))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div>
          <SectionLabel>Restricciones y otros</SectionLabel>
          <ul className="space-y-1">
            <Restriction>Solo comunas zona Flex</Restriction>
            <Restriction>Máx. 450 cm (suma de lados) y 50 kg</Restriction>
          </ul>
          <p className="mt-2 text-xs text-gray-500">El tramo se determina por el criterio más restrictivo entre lados y peso.</p>
        </div>
      </CourierCard>

      {/* ── Starken ── */}
      <CourierCard name="Starken" color="bg-yellow-500">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div>
            <SectionLabel>Zonas disponibles</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              <ZonePill label="Todo Chile" color="bg-yellow-50 text-yellow-700" />
            </div>
          </div>
          <div>
            <SectionLabel>Cálculo de tarifa</SectionLabel>
            <p className="text-xs text-gray-600 leading-relaxed">
              Tarifa por <strong>localidad + peso tarificable</strong>.<br />
              <strong>Peso tarificable</strong> = max(peso real, peso volumétrico)<br />
              <strong>Peso volumétrico</strong> = alto × ancho × largo / 4.000
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <SectionLabel className="mb-0">Tramos de peso</SectionLabel>
              <DownloadBtn onClick={downloadStarken} label="Tarifario completo" />
            </div>
            <div className="flex flex-wrap gap-1 text-xs text-gray-600">
              {["0–0,5", "0,5–1,5", "1,5–3", "3–6", "6–10", "10–20", "20–30", "30–40", "40–50", "50–60", "60–70", "70–80", "80–90", "90–100", "100–499 /kg", "499–1000 /kg"].map((t) => (
                <span key={t} className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">{t}</span>
              ))}
            </div>
          </div>
        </div>
        <div>
          <SectionLabel>Restricciones y otros</SectionLabel>
          <ul className="space-y-1">
            <Restriction>Peso tarificable máx. 1.000 kg</Restriction>
          </ul>
          <div className="mt-2 flex gap-2 text-xs">
            <span className="px-2 py-0.5 bg-gray-100 rounded">Estándar ≤ 30 kg</span>
            <span className="px-2 py-0.5 bg-amber-50 rounded text-amber-700">Pesado 30–100 kg</span>
            <span className="px-2 py-0.5 bg-red-50 rounded text-red-700">Sobrepeso &gt; 100 kg</span>
          </div>
          <p className="mt-2 text-xs text-gray-500">Tarifario cargado con ~600 localidades. Precios netos (+ 19% IVA al cotizar).</p>
          <p className="mt-1.5 text-xs text-amber-600 font-medium">⚠ Pedidos de regiones: se agregan $2.500 neto por picking & packing en el checkout de la página web.</p>
        </div>
      </CourierCard>

      {/* ── Falabella ── */}
      <CourierCard name="Falabella — Cofinanciamiento logístico (Bluexpress / Chilexpress)" color="bg-purple-500">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div>
            <SectionLabel>Zonas disponibles</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              <ZonePill label="Todo Chile" color="bg-purple-50 text-purple-700" />
            </div>
            <p className="mt-2 text-xs text-gray-500">Falabella gestiona la entrega vía Bluexpress o Chilexpress según destino.</p>
          </div>
          <div>
            <SectionLabel>Cálculo de tarifa</SectionLabel>
            <p className="text-xs text-gray-600 leading-relaxed">
              Tarifa por <strong>peso tarificable + precio del producto + rating vendedor</strong>.<br />
              <strong>Peso tarificable</strong> = max(peso real, peso volumétrico)<br />
              <strong>Peso volumétrico</strong> = alto × ancho × largo / 4.000
            </p>
          </div>
          <div>
            <SectionLabel>Restricciones</SectionLabel>
            <ul className="space-y-1">
              <li className="flex items-start gap-1.5 text-xs text-gray-600">
                <span className="mt-0.5 text-green-500 shrink-0">✓</span>
                Sin restricciones de dimensiones
              </li>
              <li className="flex items-start gap-1.5 text-xs text-gray-600">
                <span className="mt-0.5 text-green-500 shrink-0">✓</span>
                Sin restricciones de zona
              </li>
            </ul>
          </div>
        </div>

        {/* Tariff table */}
        <div>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <SectionLabel className="mb-0">Tabla de tarifas (CLP con IVA)</SectionLabel>
            <div className="flex items-end gap-3">
              <DownloadBtn onClick={downloadFalabella} />
              <div>
                <p className="text-xs text-gray-400 mb-1">Nota F+</p>
                <div className="flex gap-1">
                  {(["5/5", "4/5", "3/5", "2/5"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setFalaRating(r)}
                      className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${falaRating === r ? "bg-gray-900 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-1.5 pr-4 text-gray-500 font-medium">Tramo</th>
                  <th className="text-right py-1.5 pr-4 text-gray-500 font-medium">Producto &lt; $19.990</th>
                  <th className="text-right py-1.5 text-gray-500 font-medium">Producto ≥ $19.990</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {FALA_ROWS.map((row) => {
                  const low = row.prices[falaRatingIdx];
                  const high = row.prices[falaRatingIdx + 4];
                  const isPerKg = row.label.includes("/kg");
                  return (
                    <tr key={row.label} className={isPerKg ? "bg-gray-50" : ""}>
                      <td className="py-1.5 pr-4 font-medium text-gray-700">{row.label}</td>
                      <td className="py-1.5 pr-4 text-right text-gray-900">{isPerKg ? `${clp(low)}/kg` : clp(low)}</td>
                      <td className={`py-1.5 text-right font-semibold ${low === high ? "text-gray-400" : "text-gray-900"}`}>
                        {isPerKg ? `${clp(high)}/kg` : clp(high)}
                        {low === high && <span className="ml-1 text-gray-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-gray-400">El precio del producto afecta solo los tramos 0–6 kg. Desde 6 kg en adelante ambas columnas son iguales.</p>
        </div>
      </CourierCard>

      {/* ── MercadoLibre ── */}
      <CourierCard name="MercadoLibre — Centro de Envíos / Regular" color="bg-yellow-400">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div>
            <SectionLabel>Zonas disponibles</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              <ZonePill label="Todo Chile" color="bg-yellow-50 text-yellow-700" />
            </div>
          </div>
          <div>
            <SectionLabel>Cálculo de tarifa</SectionLabel>
            <p className="text-xs text-gray-600 leading-relaxed">
              Tarifa por <strong>peso tarificable</strong>.<br />
              <strong>Peso tarificable</strong> = max(peso real, peso volumétrico)<br />
              <strong>Peso volumétrico</strong> = largo × ancho × alto / 4.000<br />
              Descuento según <strong>reputación + precio del producto nuevo</strong>.
            </p>
          </div>
          <div>
            <SectionLabel>Restricciones</SectionLabel>
            <ul className="space-y-1">
              <li className="flex items-start gap-1.5 text-xs text-gray-600">
                <span className="mt-0.5 text-green-500 shrink-0">✓</span>
                Sin restricciones de zona (Todo Chile)
              </li>
              <li className="flex items-start gap-1.5 text-xs text-gray-600">
                <span className="mt-0.5 text-green-500 shrink-0">✓</span>
                Sin restricciones de dimensiones
              </li>
            </ul>
          </div>
        </div>

        {/* Tariff table */}
        <div>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <SectionLabel className="mb-0">Tabla de tarifas (CLP con IVA)</SectionLabel>
            <div className="flex items-end gap-3">
              <DownloadBtn onClick={downloadML} />
              <div>
                <p className="text-xs text-gray-400 mb-1">Reputación vendedor</p>
                <div className="flex gap-1">
                  {([
                    { key: "lideres",  label: "Líderes / Verde" },
                    { key: "amarilla", label: "Amarilla" },
                    { key: "naranja",  label: "Naranja / Roja" },
                  ] as const).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setMlRep(key)}
                      className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${mlRep === key ? "bg-gray-900 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-1.5 pr-4 text-gray-500 font-medium">Tramo</th>
                    {mlRep === "lideres" && ML_LIDERES_DISCOUNTS.map((d) => (
                      <th key={d.label} className="text-right py-1.5 pr-2 text-gray-500 font-medium whitespace-nowrap">
                        {d.label}
                        {d.discount > 0 && <span className="ml-1 text-green-600">−{d.discount * 100}%</span>}
                      </th>
                    ))}
                    {mlRep === "amarilla" && <>
                      <th className="text-right py-1.5 pr-2 text-gray-500 font-medium">{"< $19.990"}</th>
                      <th className="text-right py-1.5 text-gray-500 font-medium">≥ $19.990 <span className="text-green-600">−40%</span></th>
                    </>}
                    {mlRep === "naranja" && (
                      <th className="text-right py-1.5 text-gray-500 font-medium">Sin descuento</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {ML_ROWS.map((row) => (
                    <tr key={row.label}>
                      <td className="py-1.5 pr-4 font-medium text-gray-700 whitespace-nowrap">{row.label}</td>
                      {mlRep === "lideres" && ML_LIDERES_DISCOUNTS.map((d) => (
                        <td key={d.label} className={`py-1.5 pr-2 text-right ${d.discount > 0 ? "font-semibold text-gray-900" : "text-gray-500"}`}>
                          {clp(Math.round(row.base * (1 - d.discount)))}
                        </td>
                      ))}
                      {mlRep === "amarilla" && <>
                        <td className="py-1.5 pr-2 text-right text-gray-500">{clp(row.base)}</td>
                        <td className="py-1.5 text-right font-semibold text-gray-900">{clp(Math.round(row.base * 0.60))}</td>
                      </>}
                      {mlRep === "naranja" && (
                        <td className="py-1.5 text-right text-gray-900">{clp(row.base)}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-400">Descuentos aplican solo a productos nuevos. Productos usados y publicaciones sin precio mínimo pagan tarifa base.</p>
        </div>
      </CourierCard>

    </div>
  );
}
