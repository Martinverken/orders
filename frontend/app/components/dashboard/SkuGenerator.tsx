"use client";

import { useState, useMemo } from "react";
import type { Product } from "@/app/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

// Human-readable name for each prefix
const PREFIX_NAMES: Record<string, string> = {
  // Verken
  JAC: "Jacuzzi",
  ROP: "Ropa de baño",
  EST: "Estufa",
  TOA: "Toallero",
  AIR: "Aire acondicionado",
  FUN: "Funda",
  BRA: "Brasero",
  CHI: "Chimenea",
  RAD: "Radiador",
  BOM: "Bomba",
  CAL: "Calefactor",
  INF: "Inflable",
  DES: "Deshumidificador",
  PAR: "Partes",
  PLA: "Planchas",
  DEF: "Deflector",
  COJ: "Cojín",
  // Kaut
  SUP: "SUP (Paddle)",
  KAY: "Kayak",
  BOT: "Bote",
  ISL: "Isla inflable",
  MOT: "Motor",
  ACC: "Accesorios",
  CHA: "Chaleco",
  TRA: "Traje",
  CAR: "Carpa / Carro",
  CSU: "Canguro SUP",
};

// SKU slot labels per category prefix
const SKU_SLOT_LABELS: Record<string, string[]> = {
  // — Verken —
  JAC: ["Colección", "Producto", "Tipo", "Modelo", "Capacidad", "Color", "Extra"],
  ROP: ["Colección", "Producto", "Talla", "Peso (kg)", "Color", "", ""],
  EST: ["Colección", "Energía", "BTU/Cap", "Tipo", "Modelo", "Color", "Extra"],
  TOA: ["Colección", "Alto (cm)", "Ancho (cm)", "Watts", "Tipo", "Modelo", "Color"],
  AIR: ["Colección", "Tipo", "BTU", "Inverter", "Wifi", "Modelo", "Color"],
  FUN: ["Colección", "Ambiente", "Tamaño", "Modelo", "Color", "Extra", ""],
  BRA: ["Colección", "Tipo", "Modelo", "Forma", "Tamaño", "Color", ""],
  CHI: ["Colección", "Energía", "Tipo", "Potencia", "Modelo", "Color", ""],
  RAD: ["Colección", "Energía", "Potencia", "Material", "Modelo", "Color", ""],
  BOM: ["Colección", "Producto", "Tipo", "Tamaño", "Modelo", "Color", "Extra"],
  CAL: ["Colección", "Energía", "Tipo", "Modelo", "Color", "", ""],
  INF: ["Colección", "Energía", "Potencia", "Modelo", "Color", "", ""],
  DES: ["Colección", "Modelo", "Tipo", "Capacidad", "Wifi", "Color", ""],
  PAR: ["Colección", "Parte 1", "Parte 2", "Parte 3", "Parte 4", "Parte 5", ""],
  PLA: ["Colección", "Parte 1", "Parte 2", "Parte 3", "Parte 4", "", ""],
  DEF: ["Parte 1", "Parte 2", "Parte 3", "Parte 4", "Parte 5", "Parte 6", ""],
  COJ: ["Colección", "Tipo", "Tamaño", "Color", "", "", ""],
  // — Kaut —
  SUP: ["Colección", "Largo (cm)", "Tipo", "Modelo", "Color", "", ""],
  KAY: ["Colección", "Tipo", "Largo (cm)", "Capacidad", "Modelo", "Color", ""],
  BOT: ["Colección", "Tipo", "Largo (cm)", "Personas", "Piso", "Motor HP", "Modelo"],
  ISL: ["Colección", "Forma", "Largo", "Ancho", "Tipo", "Modelo", "Color"],
  MOT: ["Colección", "Tipo", "Empuje/HP", "Eje", "Bat/Tiempos", "Modelo", "Marca"],
  ACC: ["Colección", "Categoría", "Tipo", "Caract 1", "Caract 2", "Caract 3", ""],
  CHA: ["Colección", "Tipo", "Material 1", "Material 2", "Tamaño", "Color", ""],
  TRA: ["Colección", "Género", "MM", "Largo/Corto", "Tamaño", "", ""],
  CAR: ["Colección", "Tipo", "Material", "Largo", "Modelo", "", ""],
  CSU: ["Colección", "Largo (cm)", "Tipo", "Modelo", "Color", "", ""],
};

const VERKEN_PREFIXES = ["JAC","ROP","EST","TOA","AIR","FUN","BRA","CHI","RAD","BOM","CAL","INF","DES","PAR","PLA","DEF","COJ"];
const KAUT_PREFIXES = ["SUP","KAY","BOT","ISL","MOT","ACC","CHA","TRA","CAR","CSU"];
const NUM_SLOTS = 7;

interface Props {
  products: Product[];
  onClose: () => void;
  onCreated: () => void;
}

export function SkuGenerator({ products, onClose, onCreated }: Props) {
  const [brand, setBrand] = useState<"verken" | "kaut">("verken");
  const [prefix, setPrefix] = useState("");
  const [customPrefix, setCustomPrefix] = useState("");
  const [productName, setProductName] = useState("");
  const [slots, setSlots] = useState<string[]>(Array(NUM_SLOTS).fill(""));
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{ ok: boolean; msg: string; url?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const prefixes = brand === "verken" ? VERKEN_PREFIXES : KAUT_PREFIXES;
  const activePrefix = prefix || customPrefix.toUpperCase();
  const labels = activePrefix
    ? (SKU_SLOT_LABELS[activePrefix] ?? Array(NUM_SLOTS).fill("Atributo"))
    : Array(NUM_SLOTS).fill("");

  function handleBrandChange(b: "verken" | "kaut") {
    setBrand(b);
    setPrefix("");
    setCustomPrefix("");
    setSlots(Array(NUM_SLOTS).fill(""));
    setCreateResult(null);
  }

  function handlePrefixSelect(p: string) {
    setPrefix(p);
    setCustomPrefix("");
    setSlots(Array(NUM_SLOTS).fill(""));
    setCreateResult(null);
  }

  function handleCustomPrefix(v: string) {
    setCustomPrefix(v.toUpperCase().replace(/[^A-Z]/g, ""));
    setPrefix(""); // deselect chip
    setSlots(Array(NUM_SLOTS).fill(""));
    setCreateResult(null);
  }

  function handleSlot(i: number, v: string) {
    const next = [...slots];
    next[i] = v.toUpperCase();
    setSlots(next);
    setCreateResult(null);
  }

  const sku = useMemo(() => {
    if (!activePrefix) return "";
    const parts = [activePrefix, ...slots.map((s) => s.trim())].filter(Boolean);
    return parts.join("");
  }, [activePrefix, slots]);

  const refProducts = useMemo(() => {
    if (!activePrefix) return [];
    return products
      .filter((p) => p.sku.startsWith(activePrefix) && p.brand?.toLowerCase() === brand)
      .slice(0, 8);
  }, [activePrefix, brand, products]);

  async function handleCopy() {
    if (!sku) return;
    await navigator.clipboard.writeText(sku);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleCreate() {
    if (!sku || !productName.trim()) return;
    setCreating(true);
    setCreateResult(null);
    try {
      const res = await fetch(`${API_URL}/api/shopify/create-product`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand, name: productName.trim(), sku }),
      });
      const data = await res.json();
      if (res.ok) {
        setCreateResult({ ok: true, msg: "Producto creado en Shopify (draft)", url: data.shopify_url });
        onCreated();
      } else {
        setCreateResult({ ok: false, msg: data.detail ?? "Error al crear en Shopify" });
      }
    } catch (e) {
      setCreateResult({ ok: false, msg: e instanceof Error ? e.message : "Error de red" });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Generador de SKU</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg font-bold leading-none">✕</button>
        </div>

        <div className="p-6 space-y-5">

          {/* Brand */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Marca</label>
            <div className="flex gap-2">
              {(["verken", "kaut"] as const).map((b) => (
                <button key={b} onClick={() => handleBrandChange(b)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    brand === b ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {b.charAt(0).toUpperCase() + b.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Category prefix */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Categoría</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {prefixes.map((p) => {
                const active = prefix === p;
                return (
                  <button key={p} onClick={() => handlePrefixSelect(p)}
                    className={`flex flex-col items-start px-3 py-1.5 rounded-lg border transition-colors text-left ${
                      active
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "border-gray-200 text-gray-900 hover:bg-gray-50"
                    }`}
                  >
                    <span className="font-mono font-bold text-xs leading-tight">{p}</span>
                    <span className={`text-xs leading-tight ${active ? "text-blue-100" : "text-gray-400"}`}>
                      {PREFIX_NAMES[p] ?? ""}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* Custom prefix */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Nuevo prefijo:</span>
              <input
                type="text"
                value={customPrefix}
                onChange={(e) => handleCustomPrefix(e.target.value)}
                placeholder="ej. NEW"
                maxLength={6}
                className="w-24 px-2 py-1.5 text-sm font-mono font-bold text-gray-900 border border-dashed border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase placeholder:font-normal placeholder:text-gray-300"
              />
              {customPrefix && (
                <span className="text-xs text-gray-500">→ el SKU usará slots genéricos</span>
              )}
            </div>
          </div>

          {/* Selected category banner */}
          {activePrefix && (
            <div className="flex items-center gap-2 bg-blue-50 rounded-lg px-4 py-2.5">
              <span className="font-mono font-bold text-blue-700 text-sm">{activePrefix}</span>
              <span className="text-gray-400">·</span>
              <span className="text-sm text-gray-700 font-medium">
                {PREFIX_NAMES[activePrefix] ?? "Categoría personalizada"}
              </span>
            </div>
          )}

          {/* Product name */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Nombre del producto</label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="ej. Jacuzzi Spa Inflable 4 personas Negro"
              className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Slot builder */}
          {activePrefix && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Segmentos del SKU</label>
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: NUM_SLOTS }).map((_, i) => {
                  const label = labels[i];
                  if (!label && i > 0) return null;
                  return (
                    <div key={i}>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{label || `Atributo ${i + 1}`}</label>
                      <input
                        type="text"
                        value={slots[i]}
                        onChange={(e) => handleSlot(i, e.target.value)}
                        placeholder={label || `Atributo ${i + 1}`}
                        className="w-full px-2 py-1.5 text-sm font-mono font-semibold text-gray-900 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase placeholder:font-normal placeholder:text-gray-300"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SKU Preview */}
          {activePrefix && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">SKU generado</span>
                <button onClick={handleCopy} disabled={!sku}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:text-gray-300 transition-colors">
                  {copied ? "✓ Copiado" : "Copiar"}
                </button>
              </div>
              <p className={`font-mono text-2xl font-bold tracking-wider ${sku ? "text-gray-900" : "text-gray-300"}`}>
                {sku || `${activePrefix}…`}
              </p>
              {sku && (
                <div className="flex flex-wrap gap-1 mt-2.5">
                  <span className="px-2 py-0.5 text-xs font-mono font-bold bg-blue-100 text-blue-800 rounded-md">{activePrefix}</span>
                  {slots.filter((s) => s.trim()).map((s, i) => (
                    <span key={i} className="px-2 py-0.5 text-xs font-mono font-semibold bg-gray-200 text-gray-800 rounded-md">{s}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Reference SKUs */}
          {refProducts.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Referencia — {activePrefix} · {PREFIX_NAMES[activePrefix] ?? ""} ({refProducts.length})
              </label>
              <div className="rounded-lg border border-gray-100 divide-y divide-gray-50 max-h-36 overflow-y-auto">
                {refProducts.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="font-mono text-xs font-bold text-blue-700 shrink-0 w-44 truncate">{p.sku}</span>
                    <span className="text-xs text-gray-600 truncate">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Create result */}
          {createResult && (
            <div className={`rounded-lg px-4 py-3 text-sm font-medium ${createResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {createResult.msg}
              {createResult.url && (
                <a href={createResult.url} target="_blank" rel="noreferrer" className="ml-2 underline">
                  Ver en Shopify →
                </a>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
            <button onClick={handleCreate}
              disabled={!sku || !productName.trim() || creating}
              className="flex-1 py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
              {creating ? "Creando en Shopify…" : "Crear en Shopify"}
            </button>
            <button onClick={handleCopy} disabled={!sku}
              className="px-4 py-2.5 text-sm font-medium border border-gray-200 text-gray-800 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors">
              {copied ? "✓ Copiado" : "Copiar SKU"}
            </button>
          </div>
          <p className="text-xs text-gray-400">
            El producto se crea como <strong className="text-gray-600">draft</strong> en Shopify. Revisalo y publícalo desde el panel de Shopify.
          </p>

        </div>
      </div>
    </div>
  );
}
