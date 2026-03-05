"use client";

import { useState } from "react";
import { OrderCase } from "@/app/types";
import { deleteOrderCase } from "@/app/lib/api";

interface Props {
  orderLabel: string;
  initialCases: OrderCase[];
  onClose: () => void;
  onAddCase: (data: { case_number?: string | null; case_status?: string | null; comments?: string | null }) => Promise<OrderCase>;
}

const CASE_STATUS_OPTIONS = [
  { value: "", label: "— Sin estado" },
  { value: "created", label: "Creado" },
  { value: "pending", label: "Pendiente" },
  { value: "resolved", label: "Resuelto" },
];

const CASE_STATUS_STYLE: Record<string, string> = {
  created: "bg-blue-100 text-blue-700",
  pending: "bg-amber-100 text-amber-700",
  resolved: "bg-green-100 text-green-700",
};

const inputClass = "text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-black bg-white text-black placeholder-gray-400 w-full";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "America/Santiago",
  });
}

export function CaseHistoryModal({ orderLabel, initialCases, onClose, onAddCase }: Props) {
  const [cases, setCases] = useState<OrderCase[]>(initialCases);
  const [adding, setAdding] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [newComment, setNewComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<"ok" | "error" | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAdd = async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      const created = await onAddCase({
        case_status: newStatus || null,
        case_number: newNumber.trim() || null,
        comments: newComment.trim() || null,
      });
      setCases((prev) => [...prev, created]);
      setNewStatus("");
      setNewNumber("");
      setNewComment("");
      setAdding(false);
      setSaveResult("ok");
      setTimeout(() => setSaveResult(null), 2000);
    } catch {
      setSaveResult("error");
      setTimeout(() => setSaveResult(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (caseId: string) => {
    setDeletingId(caseId);
    try {
      await deleteOrderCase(caseId);
      setCases((prev) => prev.filter((c) => c.id !== caseId));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Historial de tickets</h2>
            <p className="text-xs text-gray-500 mt-0.5 font-mono">{orderLabel}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
        </div>

        {/* Case list */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {cases.length === 0 && !adding && (
            <p className="text-sm text-gray-400 text-center py-4">No hay tickets aún</p>
          )}
          {cases.map((c) => (
            <div key={c.id} className="border border-gray-100 rounded-lg p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                {c.case_status && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CASE_STATUS_STYLE[c.case_status] ?? "bg-gray-100 text-gray-600"}`}>
                    {CASE_STATUS_OPTIONS.find((o) => o.value === c.case_status)?.label ?? c.case_status}
                  </span>
                )}
                {c.case_number && (
                  <span className="font-mono text-xs text-gray-700">{c.case_number}</span>
                )}
                <span className="text-xs text-gray-400 ml-auto">{c.created_at ? formatDate(c.created_at) : ""}</span>
                <button
                  onClick={() => handleDelete(c.id)}
                  disabled={deletingId === c.id}
                  className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40"
                  title="Eliminar"
                >
                  ✕
                </button>
              </div>
              {c.comments && (
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-snug">{c.comments}</p>
              )}
            </div>
          ))}
        </div>

        {/* Add form */}
        <div className="px-5 py-4 border-t border-gray-100">
          {adding ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className={`text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black cursor-pointer text-black bg-white flex-shrink-0 ${newStatus ? CASE_STATUS_STYLE[newStatus] : ""}`}
                >
                  {CASE_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newNumber}
                  placeholder="N° caso"
                  maxLength={80}
                  onChange={(e) => setNewNumber(e.target.value)}
                  className={inputClass}
                />
              </div>
              <textarea
                value={newComment}
                placeholder="Comentario (sin límite de largo)"
                maxLength={2000}
                rows={3}
                onChange={(e) => setNewComment(e.target.value)}
                className="text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-black bg-white text-black placeholder-gray-400 w-full resize-none"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAdd}
                  disabled={saving}
                  className="text-sm bg-black text-white rounded px-3 py-1.5 hover:bg-gray-800 disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
                <button
                  onClick={() => { setAdding(false); setNewStatus(""); setNewNumber(""); setNewComment(""); }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancelar
                </button>
                {saveResult === "ok" && <span className="text-sm text-green-600 font-medium">✓ Guardado</span>}
                {saveResult === "error" && <span className="text-sm text-red-600">Error al guardar</span>}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setAdding(true)}
                className="text-sm border border-black text-black rounded px-3 py-1.5 hover:bg-gray-100"
              >
                + Agregar ticket
              </button>
              {saveResult === "ok" && <span className="text-sm text-green-600 font-medium">✓ Guardado</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
