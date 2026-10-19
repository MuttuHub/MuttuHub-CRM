import * as React from "react"

import type { UiTone } from "@/lib/catalogs"
import { cn } from "@/lib/utils"
import { Eyebrow, KpiNumeral } from "./typography"

// Numeral text color per tone; reuses tokens that exist for every tone.
const TONE_TEXT: Record<UiTone, string> = {
  neutro: "text-ink-700",
  activo: "text-rose-700 dark:text-rose-400",
  info: "text-info",
  riesgo: "text-destructivo",
  exito: "text-exito",
  alerta: "text-alerta",
  destructivo: "text-destructivo",
}

interface KpiTileProps extends Omit<React.ComponentProps<"div">, "children"> {
  label: React.ReactNode
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: UiTone
}

function KpiTile({ label, value, hint, tone, className, ...props }: KpiTileProps) {
  return (
    <div
      data-slot="kpi-tile"
      data-tone={tone}
      className={cn("flex flex-col gap-2", className)}
      {...props}
    >
      <Eyebrow>{label}</Eyebrow>
      <KpiNumeral className={tone ? TONE_TEXT[tone] : undefined}>
        {value}
      </KpiNumeral>
      {hint ? (
        <p data-slot="kpi-tile-hint" className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export { KpiTile }
