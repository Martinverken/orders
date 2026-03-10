"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface ProductCellProps {
  sku: string | null;
  title: string | null;
  quantity: number | null;
}

export function ProductCell({ sku, title, quantity }: ProductCellProps) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const hasContent = !!(sku || title);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    // Show above if less than 120px from viewport bottom
    setAbove(window.innerHeight - rect.bottom < 120);
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!hasContent) {
    return <span className="text-gray-400">—</span>;
  }

  const positionClass = above ? "bottom-6" : "top-6";

  return (
    <div
      className="relative group"
      onMouseEnter={updatePosition}
    >
      <span
        ref={triggerRef}
        className="block truncate font-mono text-xs text-gray-700 cursor-pointer"
        onClick={() => {
          updatePosition();
          setOpen((v) => !v);
        }}
      >
        {sku || "—"}
      </span>
      <div
        ref={popupRef}
        className={`absolute z-20 bg-white shadow-xl border border-gray-200 rounded-lg p-3 min-w-[220px] text-sm left-0 ${positionClass} ${
          open
            ? "block"
            : "hidden group-hover:block pointer-events-none"
        }`}
      >
        {title && (
          <p className="font-medium text-gray-800 leading-snug">{title}</p>
        )}
        <p className="text-gray-500 mt-1 text-xs">
          Cant.: {quantity ?? 1}
        </p>
      </div>
    </div>
  );
}
