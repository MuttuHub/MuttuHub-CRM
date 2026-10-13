// Curva S de la ficha (S14 P7). Portado de `CurveSChart` de
// feat/dashboard-management-csv-export y adaptado a esta rama: SVG en línea, sin
// librería de gráficas y sin medir el DOM (D12), tokens del tema (claro y oscuro)
// y `prefers-reduced-motion` respetado por la animación de trazo.
//
// El servidor ya calculó las dos curvas y el corte (D11): aquí solo se pintan. Las
// curvas van SEPARADAS, nunca mezcladas: el avance técnico (planeado vs real) y el
// financiero (programado vs validado sobre lo asignado). La tabla mensual lista los
// mismos valores.

"use client";

import { TrendingUp } from "lucide-react";
import { SectionHeader } from "@/components/proyectos/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProjectCurve, ProjectCurvePoint } from "@/hooks/projects";

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const PCT = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

/** `20.7` -> `"20,7 %"`; `10` -> `"10 %"` (no trailing decimals). */
function formatPct(value: number): string {
  return `${PCT.format(value)} %`;
}

/** `"2026-08"` -> `"ago 2026"`. */
function formatPeriodo(periodo: string): string {
  const mes = MESES_CORTOS[Number(periodo.slice(5, 7)) - 1] ?? periodo.slice(5, 7);
  return `${mes} ${periodo.slice(0, 4)}`;
}

/* ── SVG geometry (fixed viewBox: no DOM measurement) ───────────────────── */

const VB = { w: 320, h: 180, left: 30, right: 10, top: 10, bottom: 26 };
const ANCHO = VB.w - VB.left - VB.right;
const ALTO = VB.h - VB.top - VB.bottom;

function xAt(index: number, total: number): number {
  if (total <= 1) return VB.left + ANCHO / 2;
  return VB.left + (index / (total - 1)) * ANCHO;
}

function yAt(pct: number): number {
  const clamped = Math.min(100, Math.max(0, pct));
  return VB.top + (1 - clamped / 100) * ALTO;
}

function pathD(puntos: readonly { x: number; y: number }[]): string {
  return puntos.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}

/** Draws the executed stroke in on mount; only under `prefers-reduced-motion: no-preference`. */
const DIBUJO_CSS = `
@keyframes curva-dibujar { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@media (prefers-reduced-motion: no-preference) {
  .curva-dibujar { animation: curva-dibujar 0.7s ease-out both; }
}
`;

/* ── Public component ───────────────────────────────────────────────────── */

export function CurveSChart({ curva }: { curva: ProjectCurve | null }) {
  const puntos = curva?.periodos ?? [];

  return (
    <section data-testid="curve-s-chart" className="mt-2 flex min-w-0 flex-col gap-3">
      <SectionHeader icon={<TrendingUp className="size-3.5" strokeWidth={2} />}>Curva S</SectionHeader>

      {!curva || puntos.length === 0 ? (
        <p className="text-[12.5px] text-ink-500">Sin datos de avance todavía.</p>
      ) : (
        <>
          <style>{DIBUJO_CSS}</style>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-600">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-0.5 w-4 rounded-full bg-ink-300" />
              Planeado
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-0.5 w-4 rounded-full bg-rose-500" />
              Ejecutado
            </span>
            <span className="text-ink-500">
              Corte al {formatPeriodo(curva.corte)}. El plan técnico de ese mes se mide a la fecha de corte.
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <CurvaPanel
              panel="tecnico"
              titulo="Avance técnico"
              ariaLabel={`Curva S técnica: avance planeado y ejecutado por mes, corte ${curva.corte}`}
              puntos={puntos}
              valor={(p) => p.tecnico}
            />
            <CurvaPanel
              panel="financiero"
              titulo="Avance financiero"
              ariaLabel={`Curva S financiera: programado y validado sobre lo asignado por mes, corte ${curva.corte}`}
              puntos={puntos}
              valor={(p) => p.financiero}
            />
          </div>

          <CurvaMensualTable puntos={puntos} corte={curva.corte} />
        </>
      )}
    </section>
  );
}

/* ── One curve panel ────────────────────────────────────────────────────── */

function CurvaPanel({
  panel,
  titulo,
  ariaLabel,
  puntos,
  valor,
}: {
  panel: "tecnico" | "financiero";
  titulo: string;
  ariaLabel: string;
  puntos: readonly ProjectCurvePoint[];
  valor: (punto: ProjectCurvePoint) => { planeado: number; ejecutado: number | null };
}) {
  const n = puntos.length;
  const planeado = puntos.map((p, i) => ({ x: xAt(i, n), y: yAt(valor(p).planeado) }));
  const ejecutado = puntos
    .filter((p) => valor(p).ejecutado !== null)
    .map((p, i) => ({ x: xAt(i, n), y: yAt(valor(p).ejecutado as number) }));

  return (
    <div data-testid={`curve-s-${panel}`} className="surface-inner p-3">
      <p className="text-[12px] font-semibold text-ink-700">{titulo}</p>
      <svg
        data-testid={`curve-s-${panel}-svg`}
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${VB.w} ${VB.h}`}
        className="mt-1.5 h-auto w-full"
      >
        <title>{ariaLabel}</title>

        {[0, 25, 50, 75, 100].map((pct) => (
          <g key={pct}>
            <line
              x1={VB.left}
              y1={yAt(pct)}
              x2={VB.left + ANCHO}
              y2={yAt(pct)}
              className="stroke-ink-200"
              strokeWidth={1}
            />
            <text x={VB.left - 4} y={yAt(pct) + 3} textAnchor="end" className="fill-ink-500 text-[8px]">
              {`${pct} %`}
            </text>
          </g>
        ))}

        {puntos.map((p, i) => (
          <text
            key={p.periodo}
            x={xAt(i, n)}
            y={VB.h - 8}
            textAnchor="middle"
            className="fill-ink-500 text-[8px]"
          >
            {MESES_CORTOS[Number(p.periodo.slice(5, 7)) - 1] ?? p.periodo.slice(5, 7)}
          </text>
        ))}

        <path
          data-testid={`curve-s-${panel}-planeado`}
          data-puntos={planeado.length}
          d={pathD(planeado)}
          fill="none"
          strokeWidth={2}
          strokeDasharray="4 3"
          className="stroke-ink-300"
        />
        {ejecutado.length > 0 && (
          <path
            data-testid={`curve-s-${panel}-ejecutado`}
            data-puntos={ejecutado.length}
            d={pathD(ejecutado)}
            fill="none"
            strokeWidth={2.5}
            pathLength={1}
            strokeDasharray={1}
            className="curva-dibujar stroke-rose-500 dark:stroke-rose-400"
          />
        )}
        {ejecutado.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2} className="fill-rose-500 dark:fill-rose-400" />
        ))}
      </svg>
    </div>
  );
}

/* ── Monthly table ──────────────────────────────────────────────────────── */

function CurvaMensualTable({ puntos, corte }: { puntos: readonly ProjectCurvePoint[]; corte: string }) {
  return (
    <Table data-testid="curve-s-tabla" className="min-w-[460px]">
      <TableHeader>
        <TableRow>
          <TableHead>Periodo</TableHead>
          <TableHead numeric>Téc. plan</TableHead>
          <TableHead numeric>Téc. ejec</TableHead>
          <TableHead numeric>Fin. plan</TableHead>
          <TableHead numeric>Fin. ejec</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {puntos.map((p) => (
          <TableRow key={p.periodo}>
            <TableCell>{p.periodo === corte ? `${formatPeriodo(p.periodo)} (al corte)` : formatPeriodo(p.periodo)}</TableCell>
            <TableCell numeric>{formatPct(p.tecnico.planeado)}</TableCell>
            <TableCell numeric>{p.tecnico.ejecutado === null ? "—" : formatPct(p.tecnico.ejecutado)}</TableCell>
            <TableCell numeric>{formatPct(p.financiero.planeado)}</TableCell>
            <TableCell numeric>{p.financiero.ejecutado === null ? "—" : formatPct(p.financiero.ejecutado)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
