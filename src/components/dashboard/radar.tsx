// Radar SVG del Tablero de Control Gerencial (tablero-seguimiento-social,
// Fase 4c, design.md D7): polígono de N ejes con
// `θ = -π/2 + 2πi/N` y `r = clamp(valor/100, 0, 1) · R`. viewBox fijo y CERO
// medición del DOM (determinista para `/print/dashboard/*`).
//
// Ubicación: `src/components/dashboard/radar.tsx`, NO en `charts/` como decía
// la ruta literal de tasks.md 4c.2 (misma decisión que `tacometro.tsx`).
//
// Nota de datos: el endpoint agregado expone `cumplimiento_indicadores` como
// un único porcentaje global (no una serie por indicador), así que hoy la
// quinta cara lo dibuja como un radar de un solo eje. La primitiva soporta N
// ejes para cuando exista una serie por indicador — no cambia de forma.

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

export interface RadarProps {
  axes: RadarAxis[];
  /** Etiqueta accesible; por defecto "Cumplimiento de indicadores". */
  label?: string;
  className?: string;
}

export function Radar({ axes, label = "Cumplimiento de indicadores", className }: RadarProps) {
  if (axes.length === 0) {
    return (
      <div className={cn("bg-panel border border-ink-200 rounded-xl p-4", className)}>
        <p className="text-[12px] text-ink-500">Sin datos disponibles</p>
      </div>
    );
  }

  const n = axes.length;
  const points = axes.map((a, i) => point(i, n, a.value));
  const polygon = points.map(([x, y]) => `${x},${y}`).join(" ");

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <svg
        viewBox="0 0 200 200"
        className="h-auto w-full max-w-[240px] overflow-visible"
        role="img"
        aria-label={label}
      >
        {/* Anillos de referencia (solo con 3+ ejes: un polígono de <3 puntos es degenerado) */}
        {n >= 3 &&
          [0.25, 0.5, 0.75, 1].map((f) => (
            <polygon
              key={f}
              data-testid="radar-anillo"
              points={axes
                .map((_, i) => {
                  const theta = -Math.PI / 2 + (2 * Math.PI * i) / n;
                  return `${round1(CX + f * R * Math.cos(theta))},${round1(CY + f * R * Math.sin(theta))}`;
                })
                .join(" ")}
              fill="none"
              stroke="var(--color-ink-200)"
              strokeWidth={1}
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
              stroke="var(--color-ink-200)"
              strokeWidth={1}
            />
          );
        })}

        {/* Serie */}
        <polygon
          data-testid="radar-poligono"
          points={polygon}
          fill="var(--color-rose-500)"
          fillOpacity={0.18}
          stroke="var(--color-rose-500)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {points.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={2.5} fill="var(--color-rose-500)" />
        ))}
      </svg>
    </div>
  );
}
