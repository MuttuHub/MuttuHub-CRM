// Mini inline SVG sparkline (no deps): normaliza la serie a un viewBox fijo
// y dibuja la línea polinómica + un punto en el último valor. Se usa en las
// caras del dashboard (Hito 6) para mini-tendencias sin librerías de charts.

import { cn } from "@/lib/utils";

export function Sparkline({
  data,
  className,
  stroke = "var(--color-rose-500)",
}: {
  data: number[];
  className?: string;
  stroke?: string;
}) {
  const W = 96;
  const H = 28;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;

  const points = data.map((v, i) => {
    const x = data.length <= 1 ? W / 2 : (i / (data.length - 1)) * W;
    const y = H - 2 - ((v - min) / span) * (H - 6);
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as const;
  });

  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn("h-7 w-24 overflow-visible", className)}
      role="img"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      {path && (
        <>
          <polyline
            points={points.map(([x, y]) => `${x},${y}`).join(" ")}
            fill="none"
            stroke={stroke}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {last && (
            <circle
              cx={last[0]}
              cy={last[1]}
              r={2.2}
              fill="white"
              stroke={stroke}
              strokeWidth={1.4}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </>
      )}
    </svg>
  );
}