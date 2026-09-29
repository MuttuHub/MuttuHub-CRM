import * as React from "react"

import type { UiTone } from "@/lib/catalogs"
import { cn } from "@/lib/utils"

// Tinted chip (dot + tinted text), never a solid fill. Class strings mirror
// the existing per-feature TONE_BADGE maps (crm/shared.tsx) so migrating
// those screens later (V2.x) is visually a no-op. `neutro`, `activo` and
// `riesgo` have no dedicated color token: they reuse ink/rose/destructivo.
const TONE_CLASS: Record<UiTone, string> = {
  neutro: "bg-ink-100 text-ink-700",
  activo: "bg-rose-50 text-rose-700 dark:text-rose-400",
  info: "bg-info-bg text-info",
  riesgo: "bg-destructivo-bg text-destructivo",
  exito: "bg-exito-bg text-exito",
  alerta: "bg-alerta-bg text-alerta",
  destructivo: "bg-destructivo-bg text-destructivo",
}

interface StatusChipProps extends React.ComponentProps<"span"> {
  tone: UiTone
}

function StatusChip({ tone, className, children, ...props }: StatusChipProps) {
  return (
    <span
      data-slot="status-chip"
      data-tone={tone}
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        TONE_CLASS[tone],
        className
      )}
      {...props}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}

export { StatusChip }
