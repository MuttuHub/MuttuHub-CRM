import type { UiTone } from "@/lib/catalogs"
import type { ColorSemaforo } from "@/lib/proyectos/semaforo-v2"

// Central bridge from semáforo bands to the shared UiTone palette, so a
// semáforo-derived state renders with the same tinted language as every
// other estado chip. Thresholds stay in `semaforo.ts`; this only maps names.
const SEMAFORO_TONE: Record<ColorSemaforo, UiTone> = {
  verde: "exito",
  amarillo: "alerta",
  rojo: "destructivo",
}

export function toneFromSemaforo(band: ColorSemaforo): UiTone {
  return SEMAFORO_TONE[band]
}
