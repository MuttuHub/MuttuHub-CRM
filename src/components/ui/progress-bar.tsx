import * as React from "react"

import { toneFromSemaforo } from "@/lib/estado-tone"
import type { ColorSemaforo } from "@/lib/proyectos/semaforo-v2"
import type { UiTone } from "@/lib/catalogs"
import { cn } from "@/lib/utils"

// Fill color per semáforo-derived tone (only the three tones the mapping can
// return). The band is computed by the SERVER (`colorTecnicoV2` & co.) and
// only painted here: the client never recomputes a semáforo. Without a band
// the fill is neutral.
const FILL_CLASS: Partial<Record<UiTone, string>> = {
  exito: "bg-exito",
  alerta: "bg-alerta",
  destructivo: "bg-destructivo",
}

interface ProgressBarProps
  extends Omit<React.ComponentProps<"div">, "role" | "children"> {
  /** 0-100; out-of-range and non-finite values are clamped. */
  value: number
  /** Server-computed semáforo band; omit for a neutral bar. */
  band?: ColorSemaforo
}

function ProgressBar({ value, band, className, ...props }: ProgressBarProps) {
  const clamped = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0
  const tone = band ? toneFromSemaforo(band) : undefined

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
        className={cn(
          "h-full rounded-full transition-[width]",
          tone ? FILL_CLASS[tone] : "bg-ink-500"
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

export { ProgressBar }
