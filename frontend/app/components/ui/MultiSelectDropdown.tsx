"use client";

import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function MultiSelectDropdown({
  label,
  options,
  paramKey,
  params,
  onUpdate,
}: {
  label: string;
  options: { value: string; label: string }[];
  paramKey: string;
  params: ReturnType<typeof useSearchParams>;
  onUpdate: (key: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = (params.get(paramKey) || "").split(",").filter(Boolean);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggle(value: string) {
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    onUpdate(paramKey, next.join(","));
  }

  const displayLabel =
    selected.length === 0
      ? label
      : selected.length === 1
      ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
      : `${selected.length} seleccionados`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-1.5 text-gray-900 ${
          selected.length > 0 ? "border-blue-400" : "border-gray-200"
        }`}
      >
        {displayLabel}
        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[180px] py-1">
          {options.map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm text-gray-900"
            >
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                onChange={() => toggle(o.value)}
                className="rounded"
              />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
