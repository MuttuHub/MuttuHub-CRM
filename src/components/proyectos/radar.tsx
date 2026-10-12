// Radar del Tablero gerencial (S14 P9). Portado de `Radar` de
// feat/dashboard-management-csv-export y adaptado a esta rama: SVG en línea con
// viewBox fijo y CERO medición del DOM — el mismo criterio que `tacometro.tsx` y
// `curve-s-chart.tsx` cumplen (D12). Sin librería de gráficas.
//
// Polígono de N ejes con `θ = -π/2 + 2πi/N` y `r = clamp(valor/100, 0, 1) · R`.
// El color de la serie sale de tokens del tema (claro y oscuro), nunca de una
// paleta cruda; la entrada respeta `prefers-reduced-motion`. Los valores llegan
// ya calculados por el servidor (`agregado.por_linea`): aquí solo se pintan.

"use client";

import { cn } from "@/lib/utils";

const CX = 100;
const CY = 100;
const R = 78;

export interface RadarAxis {
  label: string;
  /** Valor 0..100 (porcentaje de cumplimiento del eje). */
  value: number;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Punto del eje i (de N) a la razón `value/100`, redondeado a un decimal. */
function point(i: number, n: number, value: number): [number, number] {
  const theta = -Math.PI / 2 + (2 * Math.PI * i) / n;
  const r = (Math.min(100, Math.max(0, value)) / 100) * R;
  return [round1(CX + r * Math.cos(theta)), round1(CY + r * Math.sin(theta))];
}

/** Punto del anillo de referencia a la fracción `f` (0..1) del radio. */
function ringPoint(i: number, n: number, f: number): string {
  const theta = -Math.PI / 2 + (2 * Math.PI * i) / n;
  return `${round1(CX + f * R * Math.cos(theta))},${round1(CY + f * R * Math.sin(theta))}`;
}

/** Fades the series in on mount; only under `prefers-reduced-motion: no-preference`. */
const ENTRADA_CSS = `
@keyframes radar-entrar { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: no-preference) {
  .radar-serie { animation: radar-entrar 0.5s ease-out both; }
}
`;

export interface RadarProps {
  axes: RadarAxis[];
  /** Etiqueta accesible; por defecto "Cumplimiento de indicadores". */
  label?: string;
  className?: string;
}

export function Radar({ axes, label = "Cumplimiento de indicadores", className }: RadarProps) {
  if (axes.length === 0) {
    return (
      <div className={cn("surface-inner p-3", className)}>
        <p className="text-[12px] text-ink-500">Sin datos disponibles</p>
      </div>
    );
  }

  const n = axes.length;
  const points = axes.map((a, i) => point(i, n, a.value));
  const polygon = points.map(([x, y]) => `${x},${y}`).join(" ");

  return (
    <div data-testid="radar" className={cn("flex flex-col items-center", className)}>
      <style>{ENTRADA_CSS}</style>
      <svg
        viewBox="0 0 200 200"
        className="h-auto w-full max-w-[240px] overflow-visible"
        role="img"
        aria-label={label}
      >
        <title>{label}</title>

        {/* Anillos de referencia (solo con 3+ ejes: un polígono de <3 puntos es degenerado) */}
        {n >= 3 &&
          [0.25, 0.5, 0.75, 1].map((f) => (
            <polygon
              key={f}
              data-testid="radar-anillo"
              points={axes.map((_, i) => ringPoint(i, n, f)).join(" ")}
              fill="none"
              strokeWidth={1}
              className="stroke-ink-200"
            />
          ))}

        {/* Ejes (uno por dimensión) */}
        {axes.map((a, i) => {
          const theta = -Math.PI / 2 + (2 * Math.PI * i) / n;
          return (
            <line
              key={a.label}
              data-testid="radar-eje"
              x1={CX}
              y1={CY}
              x2={round1(CX + R * Math.cos(theta))}
              y2={round1(CY + R * Math.sin(theta))}
              strokeWidth={1}
              className="stroke-ink-200"
            />
          );
        })}

        {/* Serie */}
        <g className="radar-serie">
          <polygon
            data-testid="radar-poligono"
            points={polygon}
            fillOpacity={0.18}
            strokeWidth={2}
            strokeLinejoin="round"
            className="fill-rose-500 stroke-rose-500 dark:fill-rose-400 dark:stroke-rose-400"
          />
          {points.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={2.5} className="fill-rose-500 dark:fill-rose-400" />
          ))}
        </g>
      </svg>
    </div>
  );
}
