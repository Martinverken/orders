"use client";

import { useState } from "react";
import { createProduct, deleteProduct, updateProduct } from "@/app/lib/api";
import { Product, ProductsPage } from "@/app/types";

interface Props {
  initialData: ProductsPage;
}

const EMPTY_FORM = { name: "", sku: "", height_cm: "", width_cm: "", length_cm: "", weight_kg: "" };

export function ProductsTable({ initialData }: Props) {
  const [products, setProducts] = useState<Product[]>(initialData.data);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setDeletingId(null);
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-1">
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
              <label className="block text-xs text-gray-500 mb-1">Alto (cm)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.height_cm}
                onChange={(e) => setForm({ ...form, height_cm: e.target.value })}
                className={inputClass}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ancho (cm)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.width_cm}
                onChange={(e) => setForm({ ...form, width_cm: e.target.value })}
                className={inputClass}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Largo (cm)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.length_cm}
                onChange={(e) => setForm({ ...form, length_cm: e.target.value })}
                className={inputClass}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Peso (kg)</label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={form.weight_kg}
                onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
                className={inputClass}
                placeholder="0.000"
              />
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
            <button
              onClick={cancelForm}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-gray-500">{products.length} productos</p>
          {!showForm && (
            <button
              onClick={openNew}
              className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
            >
              + Agregar producto
            </button>
          )}
        </div>

        {products.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            No hay productos. Agrega uno para comenzar.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">SKU</th>
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Alto (cm)</th>
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ancho (cm)</th>
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Largo (cm)</th>
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Peso (kg)</th>
                <th className="py-2.5 px-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-3 font-medium text-gray-900">{p.name}</td>
                  <td className="py-3 px-3 text-gray-500 font-mono text-xs">{p.sku}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{p.height_cm ?? "—"}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{p.width_cm ?? "—"}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{p.length_cm ?? "—"}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{p.weight_kg ?? "—"}</td>
                  <td className="py-3 px-3">
                    <div className="flex items-center justify-end gap-3">
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
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
