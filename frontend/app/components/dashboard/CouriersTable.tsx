"use client";

import { useState } from "react";
import { createCourier, deleteCourier, updateCourier } from "@/app/lib/api";
import { Courier } from "@/app/types";

interface Props {
  initialData: Courier[];
}

const PRICING_OPTIONS = [
  { value: "por_peso", label: "Por peso" },
  { value: "por_dimensiones", label: "Por dimensiones" },
  { value: "mixto", label: "Mixto (peso + dimensiones)" },
  { value: "tarifa_plana", label: "Tarifa plana" },
  { value: "por_zona", label: "Por zona" },
];

const EMPTY_FORM = {
  name: "",
  pricing_type: "",
  base_price: "",
  price_per_kg: "",
  max_weight_kg: "",
  max_length_cm: "",
  max_width_cm: "",
  max_height_cm: "",
  notes: "",
  active: true,
};

type FormState = typeof EMPTY_FORM;

export function CouriersTable({ initialData }: Props) {
  const [couriers, setCouriers] = useState<Courier[]>(initialData);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function openNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowForm(true);
  }

  function openEdit(c: Courier) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      pricing_type: c.pricing_type ?? "",
      base_price: c.base_price != null ? String(c.base_price) : "",
      price_per_kg: c.price_per_kg != null ? String(c.price_per_kg) : "",
      max_weight_kg: c.max_weight_kg != null ? String(c.max_weight_kg) : "",
      max_length_cm: c.max_length_cm != null ? String(c.max_length_cm) : "",
      max_width_cm: c.max_width_cm != null ? String(c.max_width_cm) : "",
      max_height_cm: c.max_height_cm != null ? String(c.max_height_cm) : "",
      notes: c.notes ?? "",
      active: c.active,
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
    if (!form.name.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        pricing_type: form.pricing_type || null,
        base_price: parseNum(form.base_price),
        price_per_kg: parseNum(form.price_per_kg),
        max_weight_kg: parseNum(form.max_weight_kg),
        max_length_cm: parseNum(form.max_length_cm),
        max_width_cm: parseNum(form.max_width_cm),
        max_height_cm: parseNum(form.max_height_cm),
        notes: form.notes.trim() || null,
        active: form.active,
      };
      if (editingId) {
        const updated = await updateCourier(editingId, payload);
        setCouriers((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
      } else {
        const created = await createCourier(payload);
        setCouriers((prev) => [...prev, created]);
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
      await deleteCourier(id);
      setCouriers((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setDeletingId(null);
    }
  }

  const inputClass =
    "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent w-full";

  const pricingLabel = (type: string | null | undefined) =>
    PRICING_OPTIONS.find((o) => o.value === type)?.label ?? type ?? "—";

  return (
    <div className="space-y-4">
      {/* Form */}
      {showForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            {editingId ? "Editar courier" : "Nuevo courier"}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Nombre *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass}
                placeholder="Ej: Chilexpress, Starken, Welivery..."
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tipo de tarificación</label>
              <select
                value={form.pricing_type}
                onChange={(e) => setForm({ ...form, pricing_type: e.target.value })}
                className={inputClass}
              >
                <option value="">Sin especificar</option>
                {PRICING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Precio base (CLP)</label>
              <input
                type="number"
                step="1"
                min="0"
                value={form.base_price}
                onChange={(e) => setForm({ ...form, base_price: e.target.value })}
                className={inputClass}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Precio por kg (CLP)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.price_per_kg}
                onChange={(e) => setForm({ ...form, price_per_kg: e.target.value })}
                className={inputClass}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Peso máx. (kg)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.max_weight_kg}
                onChange={(e) => setForm({ ...form, max_weight_kg: e.target.value })}
                className={inputClass}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Largo máx. (cm)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.max_length_cm}
                onChange={(e) => setForm({ ...form, max_length_cm: e.target.value })}
                className={inputClass}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ancho máx. (cm)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.max_width_cm}
                onChange={(e) => setForm({ ...form, max_width_cm: e.target.value })}
                className={inputClass}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Alto máx. (cm)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.max_height_cm}
                onChange={(e) => setForm({ ...form, max_height_cm: e.target.value })}
                className={inputClass}
                placeholder="0.00"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs text-gray-500 mb-1">Notas / Restricciones adicionales</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className={`${inputClass} resize-none`}
                rows={3}
                placeholder="Ej: No acepta objetos frágiles. Solo RM. Requiere embalaje especial para +5 kg..."
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="courier-active"
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
              />
              <label htmlFor="courier-active" className="text-sm text-gray-700">
                Activo
              </label>
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Agregar courier"}
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
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-gray-500">{couriers.length} couriers</p>
          {!showForm && (
            <button
              onClick={openNew}
              className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
            >
              + Agregar courier
            </button>
          )}
        </div>

        {couriers.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            No hay couriers. Agrega uno para comenzar.
          </div>
        ) : (
          <div className="space-y-3">
            {couriers.map((c) => (
              <div
                key={c.id}
                className={`border rounded-xl p-4 transition-colors ${
                  c.active ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{c.name}</span>
                      {!c.active && (
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                          Inactivo
                        </span>
                      )}
                      {c.pricing_type && (
                        <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">
                          {pricingLabel(c.pricing_type)}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
                      {c.base_price != null && (
                        <span>Base: <strong className="text-gray-700">${c.base_price.toLocaleString("es-CL")}</strong></span>
                      )}
                      {c.price_per_kg != null && (
                        <span>Por kg: <strong className="text-gray-700">${c.price_per_kg.toLocaleString("es-CL")}</strong></span>
                      )}
                      {c.max_weight_kg != null && (
                        <span>Peso máx: <strong className="text-gray-700">{c.max_weight_kg} kg</strong></span>
                      )}
                      {(c.max_length_cm != null || c.max_width_cm != null || c.max_height_cm != null) && (
                        <span>
                          Dimensiones máx:{" "}
                          <strong className="text-gray-700">
                            {[c.max_length_cm, c.max_width_cm, c.max_height_cm]
                              .map((v) => (v != null ? `${v}` : "—"))
                              .join(" × ")}{" "}cm
                          </strong>
                        </span>
                      )}
                    </div>

                    {c.notes && (
                      <p className="mt-1.5 text-xs text-gray-500 italic">{c.notes}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={() => openEdit(c)}
                      className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      disabled={deletingId === c.id}
                      className="text-xs text-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
                    >
                      {deletingId === c.id ? "..." : "Eliminar"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
