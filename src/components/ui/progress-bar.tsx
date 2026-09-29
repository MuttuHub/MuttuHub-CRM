import * as React from "react"

import { toneFromSemaforo } from "@/lib/estado-tone"
import { colorIndicador, type UmbralesSemaforo } from "@/lib/semaforo"
import type { UiTone } from "@/lib/catalogs"
import { cn } from "@/lib/utils"

// Fill color per semáforo-derived tone (only the three tones the mapping can
// return). Thresholds are NOT defined here: the band comes from
// `colorIndicador` (value/100 as a ratio) using the caller's parameterized
// `umbrales`, per the semáforo discipline in `semaforo.ts`.
const FILL_CLASS: Partial<Record<UiTone, string>> = {
  exito: "bg-exito",
  alerta: "bg-alerta",
  destructivo: "bg-destructivo",
}

interface ProgressBarProps
  extends Omit<React.ComponentProps<"div">, "role" | "children"> {
  /** 0-100; out-of-range and non-finite values are clamped. */
  value: number
  umbrales: UmbralesSemaforo
}

function ProgressBar({ value, umbrales, className, ...props }: ProgressBarProps) {
  const clamped = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0
  const band = colorIndicador(clamped / 100, umbrales)
  const tone = toneFromSemaforo(band)

  return (
    <div
      data-slot="progress-bar"
      data-band={band}
      data-tone={tone}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-ink-100", className)}
      {...props}
    >
      <div
        data-slot="progress-bar-fill"
        className={cn("h-full rounded-full transition-[width]", FILL_CLASS[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

export { ProgressBar }
