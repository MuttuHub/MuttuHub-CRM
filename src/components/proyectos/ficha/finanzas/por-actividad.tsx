// Finanzas › Resumen › «Por actividad» (S10, EV-06). La MISMA hoja financiera del «Por rubro», agrupada por
// objetivo y, al final, por «Gestión del proyecto» (las actividades transversales y la fila «Sin actividad»).
// Cada actividad pinta las cifras que el servidor ya calculó para ella (asignado, programado al corte,
// ejecutado, saldo, umbral y semáforo) y abre su detalle por rubro, que es el arreglo `rubros` de esa misma
// fila. El cliente NUNCA recalcula un umbral, un porcentaje ni un color: los pinta tal como llegan. El dinero
// viaja como texto y solo se formatea (nunca `Number()`); mientras el proyecto es BORRADOR el servidor manda
// `ejecucion_disponible: false` con porcentajes y colores nulos, y aquí no se inventa ninguno.

"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { mesLegible } from "@/components/proyectos/project-display";
import { SemaforoChip } from "@/components/proyectos/semaforo-chip";
import { EmptyBlock, InlineError } from "@/components/proyectos/ui";
import { HelpHint } from "@/components/ui/help-hint";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useProjectFinancialSheet,
  type ProjectFinancialSheet,
  type ProjectListRow,
} from "@/hooks/projects";
import { GRUPO_GESTION } from "@/lib/proyectos/actividad";
import { formatCOP, formatPercent, toCents } from "@/lib/proyectos/money";
import { cn } from "@/lib/utils";

const ACTIVIDAD_ERROR = "No pudimos cargar la vista por actividad. Inténtalo de nuevo.";
const AYUDA_SALDO =
  "Lo asignado a la actividad menos lo ejecutado. Mientras sus gastos están abiertos no se llama ahorro.";

/** Una fila de `actividades` tal como la publica la hoja financiera (S10). */
type ActividadRow = ProjectFinancialSheet["actividades"][number];
type RubroRow = ProjectFinancialSheet["rubros"][number];

/** Décimas de punto porcentual -> «90,8 %»; «—» cuando el servidor no manda porcentaje. */
const porcentaje = (decimas: number | null) => formatPercent(decimas === null ? null : BigInt(decimas));
/** Monto del servidor (texto decimal) -> «$ 59.500.000». Solo formato: nada de aritmética de dinero. */
const monto = (valor: string) => formatCOP(toCents(valor));
const nombreActividad = (fila: ActividadRow) => (fila.codigo ? `${fila.codigo} · ${fila.nombre}` : fila.nombre);
const nombreRubro = (fila: RubroRow) => (fila.codigo ? `${fila.codigo} · ${fila.nombre}` : fila.nombre);

const COLUMNA_SALDO = (
  <span className="inline-flex items-center gap-1">
    Saldo
    <HelpHint label="Saldo">{AYUDA_SALDO}</HelpHint>
  </span>
);

export function PorActividad({ proyecto }: { proyecto: ProjectListRow }) {
  const query = useProjectFinancialSheet(proyecto.id, null, "vigente");

  if (query.isError) return <InlineError message={errorMessage(query.error, ACTIVIDAD_ERROR)} />;
  if (!query.data) return <Skeleton className="h-24 w-full rounded-[14px]" />;
  return <Actividades ficha={query.data} />;
}

function Actividades({ ficha }: { ficha: ProjectFinancialSheet }) {
  // BORRADOR: el servidor ya manda los nulos; el gate es el mismo de la vista por rubro, por si llegara
  // un color o un porcentaje cuando no hay ejecución disponible.
  const disponible = ficha.ejecucion_disponible;
  const grupos = agrupar(ficha.actividades);

  return (
    <div data-testid="finanzas-por-actividad" className="flex flex-col gap-4">
      <Totales ficha={ficha} disponible={disponible} />
      {ficha.actividades.length === 0 ? (
        <EmptyBlock>Aún no hay presupuesto asignado a este proyecto.</EmptyBlock>
      ) : (
        grupos.map((grupo) => <GrupoActividades key={grupo.clave} grupo={grupo} disponible={disponible} corte={ficha.corte} />)
      )}
    </div>
  );
}

/* ── Totales de la hoja ─────────────────────────────────────────────────── */

function Cifra({ etiqueta, valor, testId, children }: { etiqueta: string; valor: string; testId?: string; children?: ReactNode }) {
  return (
    <div data-testid={testId} className="flex min-w-0 flex-col gap-1">
      <dt className="text-[11px] font-semibold tracking-[0.06em] text-ink-600 uppercase">{etiqueta}</dt>
      <dd className="font-display text-[17px] leading-tight font-bold text-ink-950 tabular-nums">{valor}</dd>
      {children && <dd className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-600">{children}</dd>}
    </div>
  );
}

/**
 * El total de la hoja, del mismo payload que pinta el «Por rubro»: S10 pide que el ejecutado total sea igual
 * en las dos vistas, y lo es porque ninguna de las dos lo recalcula.
 */
function Totales({ ficha, disponible }: { ficha: ProjectFinancialSheet; disponible: boolean }) {
  const total = ficha.total;
  return (
    <dl data-testid="actividad-totales" className="surface-tile grid grid-cols-1 gap-3 p-3.5 sm:grid-cols-2 md:grid-cols-4">
      <Cifra etiqueta="Asignado" valor={monto(total.asignado)} />
      <Cifra etiqueta="Programado al corte" valor={monto(total.programado)}>
        <span>{mesLegible(ficha.corte)}</span>
      </Cifra>
      <Cifra testId="actividad-total-ejecutado" etiqueta="Ejecutado total" valor={monto(total.ejecutado)} />
      <Cifra etiqueta="% de lo programado" valor={disponible ? porcentaje(total.ep_decimas) : "—"}>
        {disponible && total.color && <SemaforoChip color={total.color} />}
      </Cifra>
    </dl>
  );
}

/* ── Agrupación por objetivo y «Gestión del proyecto» ───────────────────── */

type Grupo = { clave: string; titulo: string; testId: string; filas: ActividadRow[] };

/**
 * Agrupa en el orden del servidor (objetivos en su orden y «Gestión del proyecto» al final) y deja «Gestión
 * del proyecto» de último siempre, que es el orden que nombra S10; no reordena las filas dentro del grupo.
 */
function agrupar(actividades: readonly ActividadRow[]): Grupo[] {
  const grupos = new Map<string, Grupo>();
  for (const fila of actividades) {
    const clave = fila.gestion ? "gestion" : `objetivo:${fila.objetivo_id ?? fila.objetivo_codigo ?? ""}`;
    const existente = grupos.get(clave);
    if (existente) {
      existente.filas.push(fila);
      continue;
    }
    grupos.set(clave, {
      clave,
      // Sin nombre de objetivo en el payload: el código es lo que la ficha usa como etiqueta («Objetivo 1»).
      titulo: fila.gestion ? GRUPO_GESTION : fila.objetivo_codigo ? `Objetivo ${fila.objetivo_codigo}` : "Objetivo",
      testId: fila.gestion ? "actividad-grupo-gestion" : `actividad-grupo-${fila.objetivo_codigo ?? "sin-codigo"}`,
      filas: [fila],
    });
  }
  const todos = [...grupos.values()];
  return [...todos.filter((grupo) => grupo.clave !== "gestion"), ...todos.filter((grupo) => grupo.clave === "gestion")];
}

function GrupoActividades({ grupo, disponible, corte }: { grupo: Grupo; disponible: boolean; corte: string }) {
  const tituloId = useId();
  return (
    <section data-testid={grupo.testId} aria-labelledby={tituloId} className="flex min-w-0 flex-col gap-2">
      <h3 id={tituloId} className="font-display text-[15px] font-bold text-ink-950">
        {grupo.titulo}
      </h3>
      <div className="surface overflow-x-auto">
        <Table className="min-w-[46rem]">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Actividad</TableHead>
              <TableHead scope="col" numeric>Asignado</TableHead>
              <TableHead scope="col" numeric>Programado al corte</TableHead>
              <TableHead scope="col" numeric>Ejecutado</TableHead>
              <TableHead scope="col" numeric>{COLUMNA_SALDO}</TableHead>
              <TableHead scope="col" numeric>% de lo programado</TableHead>
              <TableHead scope="col" numeric>Pasa a rojo desde</TableHead>
              <TableHead scope="col">Semáforo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grupo.filas.map((fila) => (
              <FilaActividad key={fila.actividad_id ?? "sin-actividad"} fila={fila} disponible={disponible} corte={corte} />
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function FilaActividad({ fila, disponible, corte }: { fila: ActividadRow; disponible: boolean; corte: string }) {
  const [abierta, setAbierta] = useState(false);
  const detalleId = useId();
  const conDetalle = fila.rubros.length > 0;
  const pct = disponible ? fila.ep_decimas : null;
  const color = disponible ? fila.color : null;

  return (
    <>
      <TableRow data-testid="actividad-fila">
        <TableCell className="font-semibold whitespace-normal text-ink-900">
          <span data-testid="actividad-nombre" className="flex min-h-11 items-center">
            {conDetalle ? (
              <button
                type="button"
                aria-expanded={abierta}
                aria-controls={detalleId}
                onClick={() => setAbierta((valor) => !valor)}
                className="flex min-h-11 w-full items-center gap-1.5 rounded-12 text-left outline-none hover:text-ink-950 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <ChevronRight
                  className={cn("size-4 shrink-0 transition-transform", abierta && "rotate-90")}
                  strokeWidth={2}
                  aria-hidden
                />
                {nombreActividad(fila)}
              </button>
            ) : (
              nombreActividad(fila)
            )}
          </span>
        </TableCell>
        <TableCell numeric>{monto(fila.asignado)}</TableCell>
        <TableCell numeric>{monto(fila.programado)}</TableCell>
        <TableCell numeric>{monto(fila.ejecutado)}</TableCell>
        <TableCell numeric>{monto(fila.saldo)}</TableCell>
        <TableCell numeric>{porcentaje(pct)}</TableCell>
        <TableCell numeric>{monto(fila.umbral_rojo)}</TableCell>
        <TableCell>{color ? <SemaforoChip color={color} /> : "—"}</TableCell>
      </TableRow>
      {conDetalle && abierta && (
        <TableRow data-testid="actividad-detalle">
          <TableCell id={detalleId} colSpan={8} className="bg-ink-100/40 p-3">
            <p className="text-[12px] font-semibold text-ink-700">Detalle por rubro</p>
            <Table data-testid="actividad-rubros" className="mt-1 min-w-[38rem] text-[12.5px]">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Rubro</TableHead>
                  <TableHead scope="col" numeric>Asignado</TableHead>
                  <TableHead scope="col" numeric>Programado al corte</TableHead>
                  <TableHead scope="col" numeric>Ejecutado</TableHead>
                  <TableHead scope="col" numeric>% de lo programado</TableHead>
                  <TableHead scope="col" numeric>Pasa a rojo desde</TableHead>
                  <TableHead scope="col">Semáforo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fila.rubros.map((row) => (
                  <FilaRubro key={row.rubro_id ?? row.nombre} row={row} disponible={disponible} />
                ))}
              </TableBody>
            </Table>
            <p className="mt-1 text-[12px] text-ink-600">{`Programado al corte de ${mesLegible(corte)}.`}</p>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/** Una fila hija del detalle: el mismo color, umbral y porcentaje del servidor, solo pintados. */
function FilaRubro({ row, disponible }: { row: RubroRow; disponible: boolean }) {
  const color = disponible ? row.color : null;
  return (
    <TableRow data-testid="actividad-rubro">
      <TableCell className="whitespace-normal text-ink-800">{nombreRubro(row)}</TableCell>
      <TableCell numeric>{monto(row.asignado)}</TableCell>
      <TableCell numeric>{monto(row.programado)}</TableCell>
      <TableCell numeric>{monto(row.ejecutado)}</TableCell>
      <TableCell numeric>{porcentaje(disponible ? row.ep_decimas : null)}</TableCell>
      <TableCell numeric>{monto(row.umbral_rojo)}</TableCell>
      <TableCell>{color ? <SemaforoChip color={color} /> : "—"}</TableCell>
    </TableRow>
  );
}
