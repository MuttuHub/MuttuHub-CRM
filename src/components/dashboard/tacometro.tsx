// Tacómetro SVG del Tablero de Control Gerencial (tablero-seguimiento-social,
// Fase 4c, design.md D7): arco de 180° con tres bandas coloreadas y aguja
// rotada por `transform`. viewBox fijo y CERO medición del DOM — el mismo
// criterio que `sparkline.tsx` cumple y que `/print/dashboard/*` exige.
//
// El nombre es `Tacometro` (no `Gauge`) a propósito: `Gauge` ya está ocupado
// por el icono de lucide importado en `dashboard-page.tsx` (decisión D7).
//
// Ubicación: `src/components/dashboard/tacometro.tsx`, NO en `charts/` como
// decía la ruta literal de tasks.md 4c.2. El patrón real ya establecido del
// módulo es `curve-s-chart.tsx` + `sparkline.tsx` + `shared.tsx`, todos en
// `src/components/dashboard/`; la consistencia con lo ya implementado manda.
//
// Las bandas se derivan de los umbrales resueltos que llegan por parámetro
// (`umbrales.tecnico`, ratio avance_real/avance_planificado) y NO de
// constantes locales: cambiar el corte cambia el dibujo sin tocar este
// archivo. Como el DTO agregado no expone la curva de planificación a nivel
// de aguja, los cortes ratio se proyectan sobre la escala de visualización
// 0..100 (exacto al cierre del proyecto, aproximado durante la ejecución).

import type { ColorSemaforo } from "@/lib/semaforo";
import { UMBRALES_SEMAFORO_DEFAULT } from "@/lib/catalogs";
import { cn } from "@/lib/utils";

const CX = 100;
const CY = 100;
const R = 78;
/** Radio de la aguja (más corta que el arco, para que no lo tape). */
const R_AGUJA = R - 14;

const BAND_STROKE: Record<ColorSemaforo, string> = {
  rojo: "var(--color-destructivo)",
  amarillo: "var(--color-alerta)",
  verde: "var(--color-exito)",
};

/** Redondeo a un decimal: evita que `0.6 * 100` arrastre 60.00000000000001. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clampPct(n: number): number {
  return Math.min(100, Math.max(0, n));
}

/** Punto sobre el arco para un porcentaje 0..100 (0 = izquierda, 100 = derecha). */
function polar(p: number): [number, number] {
  const ang = Math.PI * (1 - p / 100);
  return [round1(CX + R * Math.cos(ang)), round1(CY - R * Math.sin(ang))];
}

function arcPath(desde: number, hasta: number): string {
  const [x0, y0] = polar(desde);
  const [x1, y1] = polar(hasta);
  const large = hasta - desde > 50 ? 1 : 0;
  return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`;
}

export interface TacometroProps {
  /** Porcentaje 0..100; `null`/`undefined` renderiza el estado vacío. */
  value: number | null | undefined;
  /** Color de semáforo resuelto del avance técnico (el que ya devuelve el API). */
  color?: ColorSemaforo;
  /** Umbrales técnicos resueltos (ratio avance_real/avance_planificado). */
  umbrales?: { verde: number; rojo: number };
  /** Etiqueta accesible; por defecto "Avance técnico". */
  label?: string;
  className?: string;
}

export function Tacometro({
  value,
  color = "amarillo",
  umbrales = UMBRALES_SEMAFORO_DEFAULT.tecnico,
  label = "Avance técnico",
  className,
}: TacometroProps) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return (
      <div className={cn("bg-panel border border-ink-200 rounded-xl p-4", className)}>
        <p className="text-[12px] text-ink-500">Sin datos disponibles</p>
      </div>
    );
  }

  const clamped = clampPct(value);
  const rojo = clampPct(round1(umbrales.rojo * 100));
  const verde = clampPct(round1(umbrales.verde * 100));
  // Defensa ante umbrales invertidos: el arco siempre se dibuja de menor a mayor.
  const b1 = Math.min(rojo, verde);
  const b2 = Math.max(rojo, verde);
  const bandas: { desde: number; hasta: number; color: ColorSemaforo }[] = [
    { desde: 0, hasta: b1, color: "rojo" },
    { desde: b1, hasta: b2, color: "amarillo" },
    { desde: b2, hasta: 100, color: "verde" },
  ];

  const angle = round1(-90 + (clamped / 100) * 180);

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <svg
        viewBox="0 0 200 120"
        className="h-auto w-full max-w-[260px] overflow-visible"
        role="img"
        aria-label={`${label}: ${Math.round(clamped)}%`}
      >
        {/* Track de fondo */}
        <path
          d={arcPath(0, 100)}
          fill="none"
          stroke="var(--color-ink-100)"
          strokeWidth={12}
          strokeLinecap="round"
        />
        {bandas.map((b) => (
          <path
            key={b.color}
            data-testid="tacometro-banda"
            data-desde={b.desde}
            data-hasta={b.hasta}
            d={arcPath(b.desde, b.hasta)}
            fill="none"
            stroke={BAND_STROKE[b.color]}
            strokeWidth={12}
            strokeLinecap="butt"
          />
        ))}

        {/* Aguja (línea vertical rotada por transform; 0 -> -90°, 100 -> +90°) */}
        <line
          data-testid="tacometro-aguja"
          x1={CX}
          y1={CY}
          x2={CX}
          y2={CY - R_AGUJA}
          transform={`rotate(${angle} ${CX} ${CY})`}
          stroke={BAND_STROKE[color]}
          strokeWidth={3}
          strokeLinecap="round"
        />
        <circle cx={CX} cy={CY} r={5} fill="var(--color-ink-950)" />

        <text
          data-testid="tacometro-valor"
          x={CX}
          y={92}
          textAnchor="middle"
          fontSize={30}
          fontWeight={700}
          fill="var(--color-ink-950)"
        >
          {Math.round(clamped)}%
        </text>
      </svg>
    </div>
  );
}
