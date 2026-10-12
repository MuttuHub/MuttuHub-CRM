// Tacómetro de la ficha (S14 P8). Portado de `Tacometro` de
// feat/dashboard-management-csv-export y adaptado a esta rama: SVG en línea con
// viewBox fijo y CERO medición del DOM — el mismo criterio que `curve-s-chart.tsx`
// cumple y que `/print/dashboard/*` exige (D12). Sin librería de gráficas.
//
// El nombre es `Tacometro` (no `Gauge`) a propósito: `Gauge` ya está ocupado por
// el icono de lucide en otras vistas (decisión D7 del tablero original).
//
// El cliente NUNCA recalcula un semáforo (D11): la aguja pinta el color que
// devuelve el servidor (`color`) y las bandas del arco se dibujan desde los
// límites (`bandas`) que el llamador ya derivó de los montos del servidor. Si no
// se pasan límites, el arco queda neutro (sin bandas de color). La animación de
// entrada de la aguja respeta `prefers-reduced-motion`.

"use client";

import type { ColorSemaforo } from "@/hooks/projects";
import { cn } from "@/lib/utils";

const CX = 100;
const CY = 100;
const R = 78;
/** Radio de la aguja (más corta que el arco, para que no lo tape). */
const R_AGUJA = R - 14;

const BAND_STROKE: Record<ColorSemaforo, string> = {
  verde: "var(--color-exito)",
  amarillo: "var(--color-alerta)",
  rojo: "var(--color-destructivo)",
};

const PCT = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

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

/** One arc segment: everything from the previous boundary up to `hasta`. */
export type TacometroBanda = { hasta: number; color: ColorSemaforo };

/**
 * Turns the caller's upper boundaries into contiguous arc segments. Boundaries
 * outside 0..100 are clamped and a boundary at or below the previous one yields
 * no segment, so the arc is never drawn backwards.
 */
function segmentos(bandas: readonly TacometroBanda[] | undefined) {
  if (!bandas || bandas.length === 0) return [];
  const out: { desde: number; hasta: number; color: ColorSemaforo }[] = [];
  let desde = 0;
  for (const banda of bandas) {
    const hasta = clampPct(banda.hasta);
    if (hasta > desde) out.push({ desde, hasta, color: banda.color });
    desde = Math.max(desde, hasta);
  }
  return out;
}

/** Draws the needle in on mount; only under `prefers-reduced-motion: no-preference`. */
const ENTRADA_CSS = `
@keyframes tacometro-entrar { from { transform: rotate(-90deg); } to { transform: rotate(0deg); } }
.tacometro-aguja { transform-box: view-box; transform-origin: 100px 100px; }
@media (prefers-reduced-motion: no-preference) {
  .tacometro-aguja { animation: tacometro-entrar 0.6s ease-out both; }
}
`;

export interface TacometroProps {
  /** Porcentaje 0..100; `null`/`undefined` renderiza el estado vacío. */
  value: number | null | undefined;
  /** Color de semáforo resuelto por el servidor (el que ya devuelve el API). */
  color?: ColorSemaforo;
  /** Límites superiores del arco, derivados de los montos del servidor. */
  bandas?: readonly TacometroBanda[];
  /** Etiqueta accesible; por defecto "Ejecución". */
  label?: string;
  className?: string;
}

export function Tacometro({
  value,
  color = "amarillo",
  bandas,
  label = "Ejecución",
  className,
}: TacometroProps) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return (
      <div className={cn("surface-inner p-3", className)}>
        <p className="text-[12px] text-ink-500">Sin datos disponibles</p>
      </div>
    );
  }

  const clamped = clampPct(value);
  const texto = `${PCT.format(clamped)} %`;
  const angle = round1(-90 + (clamped / 100) * 180);
  const segmentosDelArco = segmentos(bandas);

  return (
    <div data-testid="tacometro" className={cn("flex flex-col items-center", className)}>
      <style>{ENTRADA_CSS}</style>
      <svg
        viewBox="0 0 200 120"
        className="h-auto w-full max-w-[260px] overflow-visible"
        role="img"
        aria-label={`${label}: ${texto}`}
      >
        <title>{`${label}: ${texto}`}</title>

        <path
          data-testid="tacometro-track"
          d={arcPath(0, 100)}
          fill="none"
          stroke="var(--color-ink-100)"
          strokeWidth={12}
          strokeLinecap="round"
        />
        {segmentosDelArco.map((b) => (
          <path
            key={b.color}
            data-testid="tacometro-banda"
            data-desde={b.desde}
            data-hasta={b.hasta}
            data-color={b.color}
            d={arcPath(b.desde, b.hasta)}
            fill="none"
            stroke={BAND_STROKE[b.color]}
            strokeWidth={12}
            strokeLinecap="butt"
          />
        ))}

        <g className="tacometro-aguja">
          <line
            data-testid="tacometro-aguja"
            data-color={color}
            x1={CX}
            y1={CY}
            x2={CX}
            y2={CY - R_AGUJA}
            transform={`rotate(${angle} ${CX} ${CY})`}
            stroke={BAND_STROKE[color]}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </g>
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
          {texto}
        </text>
      </svg>
    </div>
  );
}
