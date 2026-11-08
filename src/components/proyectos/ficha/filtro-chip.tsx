// Filter chip of the project ficha, as in the clickable prototype (`.chip`): a rounded toggle that is dark (ink)
// when active, 44 px tall on phones and 36 px from `md`. Used by every filter group of the ficha (Actividades,
// Finanzas › Gastos, Documentos, Historial) so they look and behave the same.

"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function FiltroChip({
  activo,
  className,
  type = "button",
  ...props
}: { activo: boolean } & Omit<ComponentProps<"button">, "aria-pressed">) {
  return (
    <button
      type={type}
      aria-pressed={activo}
      className={cn(
        "inline-flex h-11 flex-none items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9",
        activo
          ? "border-ink-900 bg-ink-900 text-panel"
          : "border-border-strong bg-input-bg text-ink-800 hover:border-ink-500",
        className,
      )}
      {...props}
    />
  );
}
