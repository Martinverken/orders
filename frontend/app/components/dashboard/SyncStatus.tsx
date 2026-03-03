"use client";

import { useState } from "react";
import { triggerSync } from "@/app/lib/api";
import { formatRelative } from "@/app/lib/utils";
import { SyncLog } from "@/app/types";

interface Props {
  lastSync: SyncLog | null;
}

export function SyncStatus({ lastSync }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setMessage(null);
    try {
      const result = await triggerSync("all") as { total_fetched: number; total_upserted: number };
      setMessage(`Sincronizado: ${result.total_upserted} pedidos actualizados`);
      // Refresh page after 1s to show new data
      setTimeout(() => window.location.reload(), 1000);
    } catch (e) {
      setMessage("Error al sincronizar. Revisa la consola.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {lastSync && (
        <span className="text-sm text-gray-500">
          Sync: {formatRelative(lastSync.started_at)}
        </span>
      )}
      <button
        onClick={handleSync}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Sincronizando..." : "Sync ahora"}
      </button>
      {message && (
        <span className="text-sm text-green-600">{message}</span>
      )}
    </div>
  );
}
