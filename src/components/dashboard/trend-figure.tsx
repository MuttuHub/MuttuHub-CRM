// TrendFigure (plan Fase 3, 3B): envuelve el Sparkline en un <figure> con
// caption OBLIGATORIO y una lista sr-only de la serie. Sparkline es
// aria-hidden (sparkline.tsx) y nunca puede ser el único portador de un dato;
// en vez de dejarlo como convención que alguien va a olvidar, esta primitiva
// lo impone en la forma. Si quien lo usa no puede escribir el caption, el
// gráfico no debería existir.

import { Sparkline } from "@/components/dashboard/sparkline";

export function TrendFigure({
  caption,
  series,
  stroke,
}: {
  /** Texto que describe la serie — OBLIGATORIO (leer con el CSS apagado). */
  caption: string;
  /** Serie etiquetada, en orden de dibujo (izq -> der). */
  series: { label: string; value: number }[];
  stroke?: string;
}) {
  return (
    <figure>
      <figcaption className="sr-only">{caption}</figcaption>
      <Sparkline data={series.map((s) => s.value)} stroke={stroke} />
      <ul className="sr-only">
        {series.map((s) => (
          <li key={s.label}>
            {s.label}: {s.value}
          </li>
        ))}
      </ul>
    </figure>
  );
}