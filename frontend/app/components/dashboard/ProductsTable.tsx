"use client";

import { useRef, useState } from "react";
import { createProduct, deleteProduct, exportProducts, getProducts, importProducts, syncShopifyProducts, updateProduct } from "@/app/lib/api";
import { Product, ProductsPage } from "@/app/types";

interface Props {
  initialData: ProductsPage;
}

const BRANDS = ["Verken", "Kaut"];
const EMPTY_FORM = { name: "", sku: "", brand: "", category: "", height_cm: "", width_cm: "", length_cm: "", weight_kg: "" };

const BRAND_COLOR: Record<string, string> = {
  Verken: "bg-blue-50 text-blue-700",
  Kaut: "bg-purple-50 text-purple-700",
};

export function ProductsTable({ initialData }: Props) {
  const [products, setProducts] = useState<Product[]>(initialData.data);
  const [total, setTotal] = useState(initialData.total);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [filterBrand, setFilterBrand] = useState("");
  const [filterCategory, setFilterCategory] = useState("");

  const allCategories = Array.from(new Set(products.map((p) => p.category).filter(Boolean) as string[])).sort();

  const filtered = products.filter((p) => {
    if (filterBrand && p.brand !== filterBrand) return false;
    if (filterCategory && p.category !== filterCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  function openNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
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
        height_cm: parseNum(form.height_cm),
        width_cm: parseNum(form.width_cm),
        length_cm: parseNum(form.length_cm),
        weight_kg: parseNum(form.weight_kg),
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

  return (
    <div className="space-y-4">
      {/* Form */}
      {showForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            {editingId ? "Editar producto" : "Nuevo producto"}
          </h3>
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
        <p className="text-xs text-gray-500">{total} productos{filtered.length !== total ? ` · ${filtered.length} mostrados` : ""}</p>
        <div className="flex items-center gap-2 flex-wrap">
          {(syncResult || importResult) && (
            <span className={`text-xs ${(syncResult ?? importResult ?? "").startsWith("Error") ? "text-red-500" : "text-green-600"}`}>
              {syncResult ?? importResult}
            </span>
          )}
          {/* Export */}
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-3 py-1.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {exporting ? "Exportando..." : "Exportar CSV"}
          </button>
          {/* Import */}
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="px-3 py-1.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {importing ? "Importando..." : "Importar CSV"}
          </button>
          {/* Sync Shopify */}
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
          value={filterBrand}
          onChange={(e) => setFilterBrand(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        >
          <option value="">Todas las marcas</option>
          {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        >
          <option value="">Todas las categorías</option>
          {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {(search || filterBrand || filterCategory) && (
          <button
            onClick={() => { setSearch(""); setFilterBrand(""); setFilterCategory(""); }}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          {products.length === 0
            ? 'No hay productos. Usa "Sincronizar Shopify" o agrega uno manualmente.'
            : "No hay productos que coincidan con los filtros."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-400 w-10">#</th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">SKU</th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Marca</th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Categoría</th>
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Alto</th>
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ancho</th>
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Largo</th>
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Peso</th>
                <th className="py-2.5 px-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((p, idx) => {
                const missingDimensions = !p.height_cm || !p.width_cm || !p.length_cm || !p.weight_kg;
                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-3 text-right text-xs text-gray-400">{idx + 1}</td>
                    <td className="py-3 px-3 font-medium text-gray-900">{p.name}</td>
                    <td className="py-3 px-3 text-gray-500 font-mono text-xs">{p.sku}</td>
                    <td className="py-3 px-3">
                      {p.brand ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${BRAND_COLOR[p.brand] ?? "bg-gray-100 text-gray-600"}`}>
                          {p.brand}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-xs text-gray-500">
                      {p.category ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className={`py-3 px-3 text-right text-xs ${p.height_cm ? "text-gray-700" : "text-amber-400"}`}>
                      {p.height_cm != null ? `${p.height_cm} cm` : "—"}
                    </td>
                    <td className={`py-3 px-3 text-right text-xs ${p.width_cm ? "text-gray-700" : "text-amber-400"}`}>
                      {p.width_cm != null ? `${p.width_cm} cm` : "—"}
                    </td>
                    <td className={`py-3 px-3 text-right text-xs ${p.length_cm ? "text-gray-700" : "text-amber-400"}`}>
                      {p.length_cm != null ? `${p.length_cm} cm` : "—"}
                    </td>
                    <td className={`py-3 px-3 text-right text-xs ${p.weight_kg ? "text-gray-700" : "text-amber-400"}`}>
                      {p.weight_kg != null ? `${p.weight_kg} kg` : "—"}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-end gap-3">
                        {missingDimensions && (
                          <span className="text-xs text-amber-500">Pendiente</span>
                        )}
                        <button
                          onClick={() => openEdit(p)}
                          className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          disabled={deletingId === p.id}
                          className="text-xs text-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
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
