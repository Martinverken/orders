"use client";

import { useEffect, useRef, useState } from "react";
import { createProduct, deleteProduct, exportProducts, getProducts, importProducts, syncShopifyProducts, updateProduct } from "@/app/lib/api";
import { Product, ProductsPage } from "@/app/types";

interface Props {
  initialData: ProductsPage;
}

const BRANDS = ["Verken", "Kaut"];

interface FormState {
  name: string;
  sku: string;
  brand: string;
  category: string;
  height_cm: string;
  width_cm: string;
  length_cm: string;
  weight_kg: string;
  num_bultos: number;
  is_service: boolean;
  is_pack: boolean;
}

const EMPTY_FORM: FormState = {
  name: "", sku: "", brand: "", category: "",
  height_cm: "", width_cm: "", length_cm: "", weight_kg: "",
  num_bultos: 1, is_service: false, is_pack: false,
};
const STANDARD_BAG = { height_cm: "32", width_cm: "42", length_cm: "5", weight_kg: "3" };

type SizeTag = "Chico" | "Mediano" | "Grande" | "Extra Grande" | "Gigante";

const SIZE_COLOR: Record<SizeTag, string> = {
  Chico: "bg-green-50 text-green-700",
  Mediano: "bg-teal-50 text-teal-700",
  Grande: "bg-yellow-50 text-yellow-700",
  "Extra Grande": "bg-orange-50 text-orange-700",
  Gigante: "bg-red-50 text-red-700",
};

function computeBillableWeight(p: Product): number | null {
  if (p.is_service) return null;
  if (p.height_cm == null || p.width_cm == null || p.length_cm == null || p.weight_kg == null) return null;
  const volWeight = (p.height_cm * p.width_cm * p.length_cm) / 4000;
  const perBulto = Math.max(p.weight_kg, volWeight);
  return perBulto * (p.num_bultos ?? 1);
}

function computeSize(p: Product): SizeTag | null {
  if (p.is_service) return null;
  if (p.height_cm == null || p.width_cm == null || p.length_cm == null || p.weight_kg == null) return null;
  const sum = p.height_cm + p.width_cm + p.length_cm;
  if (sum > 180 || p.weight_kg > 20) return "Gigante";
  if (sum <= 55) return "Chico";
  if (sum <= 120) return "Mediano";
  if (sum <= 150) return "Grande";
  return "Extra Grande";
}

export function ProductsTable({ initialData }: Props) {
  const [products, setProducts] = useState<Product[]>(initialData.data);
  const [total, setTotal] = useState(initialData.total);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!lightboxUrl) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLightboxUrl(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxUrl]);

  // Brand tab
  const [activeBrand, setActiveBrand] = useState<"Verken" | "Kaut">("Verken");

  // Filters
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");

  // Sort
  type SortKey = "name" | "sku" | "category" | "weight_kg" | "billable";
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const brandProducts = products.filter((p) => p.brand === activeBrand);
  const allCategories = Array.from(new Set(brandProducts.map((p) => p.category).filter(Boolean) as string[])).sort();

  const filtered = brandProducts.filter((p) => {
    if (filterCategory && p.category !== filterCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const sorted = sortKey
    ? [...filtered].sort((a, b) => {
        let av: string | number | null = null;
        let bv: string | number | null = null;
        if (sortKey === "name") { av = a.name; bv = b.name; }
        else if (sortKey === "sku") { av = a.sku; bv = b.sku; }
        else if (sortKey === "category") { av = a.category ?? null; bv = b.category ?? null; }
        else if (sortKey === "weight_kg") { av = a.weight_kg ?? null; bv = b.weight_kg ?? null; }
        else if (sortKey === "billable") { av = computeBillableWeight(a); bv = computeBillableWeight(b); }
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === "asc" ? cmp : -cmp;
      })
    : filtered;

  function SortableHeader({ label, colKey, right }: { label: string; colKey: SortKey; right?: boolean }) {
    const active = sortKey === colKey;
    const arrow = active ? (sortDir === "asc" ? " ↑" : " ↓") : " ↕";
    return (
      <th
        onClick={() => handleSort(colKey)}
        className={`py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700 ${right ? "text-right" : "text-left"}`}
      >
        {label}<span className={`ml-0.5 ${active ? "text-gray-700" : "text-gray-300"}`}>{arrow}</span>
      </th>
    );
  }

  function openNew() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, brand: activeBrand });
    setError(null);
    setShowForm(true);
  }

  function openEdit(p: Product) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      sku: p.sku,
      brand: p.brand ?? "",
      category: p.category ?? "",
      height_cm: p.height_cm != null ? String(p.height_cm) : "",
      width_cm: p.width_cm != null ? String(p.width_cm) : "",
      length_cm: p.length_cm != null ? String(p.length_cm) : "",
      weight_kg: p.weight_kg != null ? String(p.weight_kg) : "",
      num_bultos: p.num_bultos ?? 1,
      is_service: p.is_service ?? false,
      is_pack: p.is_pack ?? false,
    });
    setError(null);
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function parseNum(v: string): number | null {
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  }

  async function refreshList() {
    const page = await getProducts({ per_page: 200 });
    setProducts(page.data);
    setTotal(page.total);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.sku.trim()) {
      setError("Nombre y SKU son obligatorios");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim(),
        brand: form.brand || null,
        category: form.category.trim() || null,
        height_cm: form.is_service ? null : parseNum(form.height_cm),
        width_cm: form.is_service ? null : parseNum(form.width_cm),
        length_cm: form.is_service ? null : parseNum(form.length_cm),
        weight_kg: form.is_service ? null : parseNum(form.weight_kg),
        num_bultos: form.num_bultos,
        is_service: form.is_service,
        is_pack: form.is_pack,
      };
      if (editingId) {
        const updated = await updateProduct(editingId, payload);
        setProducts((prev) => prev.map((p) => (p.id === editingId ? updated : p)));
      } else {
        const created = await createProduct(payload);
        setProducts((prev) => [...prev, created]);
        setTotal((t) => t + 1);
      }
      cancelForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      setTotal((t) => t - 1);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSyncShopify() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await syncShopifyProducts();
      await refreshList();
      const storesSummary = result.stores.map((s) => `${s.store}: ${s.variants} SKUs`).join(", ");
      setSyncResult(`✓ ${result.inserted} nuevos · ${result.updated} actualizados — ${storesSummary}`);
    } catch (e) {
      setSyncResult(`Error: ${e instanceof Error ? e.message : "Error desconocido"}`);
    } finally {
      setSyncing(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await exportProducts();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "productos.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al exportar");
    } finally {
      setExporting(false);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    setImportResult(null);
    try {
      const result = await importProducts(file);
      await refreshList();
      setImportResult(`✓ ${result.inserted} nuevos · ${result.updated} actualizados`);
    } catch (e) {
      setImportResult(`Error: ${e instanceof Error ? e.message : "Error desconocido"}`);
    } finally {
      setImporting(false);
    }
  }

  const inputClass =
    "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent w-full";

  const verkenCount = products.filter((p) => p.brand === "Verken").length;
  const kautCount = products.filter((p) => p.brand === "Kaut").length;

  return (
    <div className="space-y-4">
      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh] p-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute -top-3 -right-3 w-7 h-7 bg-white rounded-full flex items-center justify-center text-gray-600 hover:text-gray-900 shadow-md text-sm font-bold z-10"
            >
              ✕
            </button>
            <img src={lightboxUrl} alt="Producto" className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" />
          </div>
        </div>
      )}

      {/* Brand tabs */}
      <div className="flex items-center gap-1 border-b border-gray-100">
        {(["Verken", "Kaut"] as const).map((brand) => {
          const count = brand === "Verken" ? verkenCount : kautCount;
          const active = activeBrand === brand;
          return (
            <button
              key={brand}
              onClick={() => { setActiveBrand(brand); setSearch(""); setFilterCategory(""); setSortKey(null); }}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {brand}
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            {editingId ? "Editar producto" : "Nuevo producto"}
          </h3>

          {/* Toggles row */}
          <div className="flex items-center gap-6 mb-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                aria-checked={form.is_service}
                onClick={() => setForm((f) => ({ ...f, is_service: !f.is_service, is_pack: f.is_pack && !f.is_service ? false : f.is_pack }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${form.is_service ? "bg-purple-600" : "bg-gray-200"}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${form.is_service ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
              <span className="text-sm text-gray-700">Servicio</span>
              <span className="text-xs text-gray-400">(sin peso/dimensiones)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                aria-checked={form.is_pack}
                onClick={() => setForm((f) => ({ ...f, is_pack: !f.is_pack }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${form.is_pack ? "bg-blue-600" : "bg-gray-200"}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${form.is_pack ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
              <span className="text-sm text-gray-700">Pack</span>
              <span className="text-xs text-gray-400">(composición de SKUs)</span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Nombre *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass}
                placeholder="Ej: Camiseta básica"
              />
              {editingId && <p className="mt-1 text-xs text-red-500">Solo se puede editar desde Shopify</p>}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">SKU *</label>
              <input
                type="text"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                className={inputClass}
                placeholder="Ej: CAM-001"
              />
              {editingId && <p className="mt-1 text-xs text-red-500">Solo se puede editar desde Shopify</p>}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Marca</label>
              <select
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className={inputClass}
              >
                <option value="">Sin especificar</option>
                {BRANDS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Categoría</label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className={inputClass}
                placeholder="Ej: Ropa, Accesorios"
              />
            </div>

            {/* Num bultos stepper */}
            {!form.is_service && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Bultos</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, num_bultos: Math.max(1, f.num_bultos - 1) }))}
                    className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors text-base font-medium"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-semibold text-gray-900">{form.num_bultos}</span>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, num_bultos: f.num_bultos + 1 }))}
                    className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors text-base font-medium"
                  >
                    +
                  </button>
                </div>
                {form.num_bultos > 1 && (
                  <p className="mt-1 text-xs text-gray-400">Dimensiones = 1 bulto</p>
                )}
              </div>
            )}

            {/* Dimension fields — hidden when service */}
            {!form.is_service && (
              <>
                <div className="col-span-2 sm:col-span-3 lg:col-span-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, ...STANDARD_BAG }))}
                    className="px-2.5 py-1 text-xs border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
                  >
                    📦 Bolsa estándar — 32×42×5 cm · 3 kg
                  </button>
                  <span className="text-xs text-gray-400">Pedidos pequeños en bolsa plástica</span>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Alto (cm)</label>
                  <input type="number" step="0.01" min="0" value={form.height_cm}
                    onChange={(e) => setForm({ ...form, height_cm: e.target.value })}
                    className={inputClass} placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Ancho (cm)</label>
                  <input type="number" step="0.01" min="0" value={form.width_cm}
                    onChange={(e) => setForm({ ...form, width_cm: e.target.value })}
                    className={inputClass} placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Largo (cm)</label>
                  <input type="number" step="0.01" min="0" value={form.length_cm}
                    onChange={(e) => setForm({ ...form, length_cm: e.target.value })}
                    className={inputClass} placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Peso (kg)</label>
                  <input type="number" step="0.001" min="0" value={form.weight_kg}
                    onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
                    className={inputClass} placeholder="0.000" />
                </div>
              </>
            )}
          </div>
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Agregar producto"}
            </button>
            <button onClick={cancelForm} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-gray-500">
          {brandProducts.length} productos{filtered.length !== brandProducts.length ? ` · ${filtered.length} mostrados` : ""}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {(syncResult || importResult) && (
            <span className={`text-xs ${(syncResult ?? importResult ?? "").startsWith("Error") ? "text-red-500" : "text-green-600"}`}>
              {syncResult ?? importResult}
            </span>
          )}
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-3 py-1.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {exporting ? "Exportando..." : "Exportar CSV"}
          </button>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="px-3 py-1.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {importing ? "Importando..." : "Importar CSV"}
          </button>
          <button
            onClick={handleSyncShopify}
            disabled={syncing}
            className="px-3 py-1.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`}>
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {syncing ? "Sincronizando..." : "Sincronizar Shopify"}
          </button>
          {!showForm && (
            <button
              onClick={openNew}
              className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
            >
              + Agregar producto
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o SKU..."
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent w-56"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        >
          <option value="">Todas las categorías</option>
          {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {(search || filterCategory) && (
          <button
            onClick={() => { setSearch(""); setFilterCategory(""); }}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          {brandProducts.length === 0
            ? `No hay productos ${activeBrand}. Usa "Sincronizar Shopify" o agrega uno manualmente.`
            : "No hay productos que coincidan con los filtros."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-400 w-10">#</th>
                <th className="py-2.5 px-3 w-12" />
                <SortableHeader label="Nombre" colKey="name" />
                <SortableHeader label="SKU" colKey="sku" />
                <SortableHeader label="Categoría" colKey="category" />
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tamaño</th>
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Alto (cm)</th>
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ancho (cm)</th>
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Largo (cm)</th>
                <SortableHeader label="Peso (kg)" colKey="weight_kg" right />
                <SortableHeader label="P. Tarificable (kg)" colKey="billable" right />
                <th className="py-2.5 px-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map((p, idx) => {
                const missingDimensions = !p.is_service && (!p.height_cm || !p.width_cm || !p.length_cm || !p.weight_kg);
                const sizeTag = computeSize(p);
                const billableWeight = computeBillableWeight(p);
                const perBulto = p.weight_kg != null && p.height_cm != null && p.width_cm != null && p.length_cm != null
                  ? Math.max(p.weight_kg, (p.height_cm * p.width_cm * p.length_cm) / 4000)
                  : null;
                const isVolumetric = perBulto != null && p.weight_kg != null && perBulto > p.weight_kg;
                const numBultos = p.num_bultos ?? 1;
                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-3 text-right text-xs text-gray-400">{idx + 1}</td>
                    <td className="py-2 px-3">
                      {p.image_url ? (
                        <button onClick={() => setLightboxUrl(p.image_url!)} className="block group relative">
                          <img
                            src={p.image_url}
                            alt={p.name}
                            className="w-10 h-10 object-cover rounded-md border border-gray-100 group-hover:opacity-80 transition-opacity"
                          />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <svg className="w-4 h-4 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                            </svg>
                          </div>
                        </button>
                      ) : (
                        <div className="w-10 h-10 rounded-md border border-gray-100 bg-gray-50 flex items-center justify-center">
                          <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 font-medium text-gray-900">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{p.name}</span>
                        {p.is_service && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700">Servicio</span>
                        )}
                        {p.is_pack && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">Pack</span>
                        )}
                        {numBultos > 1 && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">×{numBultos} bultos</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-gray-500 font-mono text-xs">{p.sku}</td>
                    <td className="py-3 px-3 text-xs text-gray-500">
                      {p.category ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-3 px-3">
                      {p.is_service ? (
                        <span className="text-gray-300">—</span>
                      ) : sizeTag ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${SIZE_COLOR[sizeTag]}`}>
                          {sizeTag}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className={`py-3 px-3 text-right text-xs ${p.is_service ? "text-gray-300" : p.height_cm ? "text-gray-700" : "text-amber-400"}`}>
                      {p.is_service ? "—" : p.height_cm != null ? p.height_cm : "—"}
                    </td>
                    <td className={`py-3 px-3 text-right text-xs ${p.is_service ? "text-gray-300" : p.width_cm ? "text-gray-700" : "text-amber-400"}`}>
                      {p.is_service ? "—" : p.width_cm != null ? p.width_cm : "—"}
                    </td>
                    <td className={`py-3 px-3 text-right text-xs ${p.is_service ? "text-gray-300" : p.length_cm ? "text-gray-700" : "text-amber-400"}`}>
                      {p.is_service ? "—" : p.length_cm != null ? p.length_cm : "—"}
                    </td>
                    <td className={`py-3 px-3 text-right text-xs ${p.is_service ? "text-gray-300" : p.weight_kg ? "text-gray-700" : "text-amber-400"}`}>
                      {p.is_service ? "—" : p.weight_kg != null ? p.weight_kg : "—"}
                    </td>
                    <td className="py-3 px-3 text-right text-xs">
                      {p.is_service ? (
                        <span className="text-gray-300">—</span>
                      ) : billableWeight != null ? (
                        <span className={isVolumetric ? "text-orange-600 font-semibold" : "text-gray-700"}>
                          {billableWeight % 1 === 0 ? billableWeight : billableWeight.toFixed(2)}
                          {isVolumetric && <span className="ml-1 text-orange-400 font-normal">(vol)</span>}
                          {numBultos > 1 && <span className="ml-1 text-amber-500 font-normal">×{numBultos}</span>}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-end gap-2">
                        {missingDimensions && (
                          <span className="text-xs px-2 py-0.5 border border-amber-300 text-amber-600 rounded-md">Pendiente</span>
                        )}
                        <button
                          onClick={() => openEdit(p)}
                          className="text-xs px-2 py-0.5 border border-gray-900 text-gray-700 rounded-md hover:bg-gray-900 hover:text-white transition-colors"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          disabled={deletingId === p.id}
                          className="text-xs px-2 py-0.5 border border-gray-900 text-gray-700 rounded-md hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors disabled:opacity-50"
                        >
                          {deletingId === p.id ? "..." : "Eliminar"}
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
    </div>
  );
}
