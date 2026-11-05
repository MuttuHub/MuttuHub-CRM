// Generic requirement checklist for Proyectos v3. Pure presentation: the caller supplies the items, the
// wording and the action, so the baseline checklist (B5) and the closing checklist (B7) share one piece
// and no rule lives here. The state is announced in text, never only in colour, and the icon is decorative.

import type { ComponentProps, ReactNode } from "react"
import { cn } from "@/lib/utils"

export type ItemVerificacion = {
  /** Stable key of the requirement. */
  id: string
  /** Short requirement name, as the caller wants it read. */
  etiqueta: string
  /** Optional explanation of why it is still pending. */
  detalle?: string
  /** Whether the requirement is met. */
  listo: boolean
  /** Optional action that resolves it («Corregir aquí», «Resolver»). */
  accion?: ReactNode
}

interface ListaVerificacionProps extends Omit<ComponentProps<"ul">, "children"> {
  items: readonly ItemVerificacion[]
}

export function ListaVerificacion({ items, className, ...props }: ListaVerificacionProps) {
  return (
    <ul data-slot="lista-verificacion" className={cn("flex flex-col", className)} {...props}>
      {items.map((item) => (
        <li
          key={item.id}
          data-slot="lista-verificacion-item"
          data-listo={item.listo}
          className="flex items-center gap-3 border-b border-ink-200 py-2.5 last:border-b-0"
        >
          <span
            data-slot="lista-verificacion-icono"
            aria-hidden="true"
            className={cn(
              "grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold",
              item.listo ? "text-exito" : "text-alerta",
            )}
          >
            {item.listo ? "✓" : "!"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="sr-only">{item.listo ? "Listo" : "Pendiente"}: </span>
            <span className="font-semibold text-ink-950">{item.etiqueta}</span>
            {item.detalle ? <span className="block text-ink-600">{item.detalle}</span> : null}
          </span>
          {item.accion ? <span className="shrink-0">{item.accion}</span> : null}
        </li>
      ))}
    </ul>
  )
}
