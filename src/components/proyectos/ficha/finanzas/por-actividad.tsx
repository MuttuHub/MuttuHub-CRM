// Finanzas › Resumen › «Por actividad» (S10, EV-06). La MISMA hoja financiera del «Por rubro», agrupada por
// objetivo y, al final, por «Gestión del proyecto» (las actividades transversales y la fila «Sin actividad»).
// Cada actividad pinta las cifras que el servidor ya calculó para ella (asignado, programado al corte,
// ejecutado, saldo, umbral y semáforo) y abre su detalle por rubro, que es el arreglo `rubros` de esa misma
// fila. El cliente NUNCA recalcula un umbral, un porcentaje ni un color: los pinta tal como llegan. El dinero
// viaja como texto y solo se formatea (nunca `Number()`); mientras el proyecto es BORRADOR el servidor manda
// `ejecucion_disponible: false` con porcentajes y colores nulos, y aquí no se inventa ninguno.
//
// L32 (S10): el título del objetivo lleva su descripción, que la hoja no publica, así que se lee de la misma
// estructura que usa Actividades (`useProjectObjectives`); y debajo de `md` cada actividad y sus rubros se pintan
// como tarjetas, el mismo patrón del «Por rubro» vecino, mientras la tabla de siempre se queda en escritorio.
//
// S11 (EV-07/T14.5-B): con los gastos abiertos la fila muestra «Saldo» y el Gestor puede cerrarlos con una nota
// obligatoria; cerrados, muestra «Ahorro» o «Sobreejecución» —el monto lo manda el servidor— con la nota del
// cierre y la acción «Reabrir», que pide su motivo. Sin nota ni motivo la pantalla se niega con el mensaje del
// servidor y no manda nada; el traslado del ahorro es el flujo de AJ-09 y no se reimplementa aquí.

"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronRight, LoaderCircle } from "lucide-react";
import { useIsMobile } from "@/components/proyectos/capture-surface";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { formatFechaHora, mesLegible } from "@/components/proyectos/project-display";
import { SemaforoChip } from "@/components/proyectos/semaforo-chip";
import { usePermisosGastos } from "@/components/proyectos/ficha/finanzas/gastos-comun";
import { CAPTURE_TEXTAREA, EmptyBlock, InlineError } from "@/components/proyectos/ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HelpHint } from "@/components/ui/help-hint";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useCloseActivityExpenses,
  useProjectFinancialSheet,
  useProjectObjectives,
  useReopenActivityExpenses,
  type ProjectBase,
  type ProjectFinancialSheet,
  type ProjectListRow,
  type ProjectObjective,
} from "@/hooks/projects";
import { GRUPO_GESTION } from "@/lib/proyectos/actividad";
import { formatCOP, formatPercent, toCents } from "@/lib/proyectos/money";
import { cn } from "@/lib/utils";

const ACTIVIDAD_ERROR = "No pudimos cargar la vista por actividad. Inténtalo de nuevo.";
const AYUDA_SALDO =
  "Lo asignado a la actividad menos lo ejecutado. Mientras sus gastos están abiertos no se llama ahorro.";

/**
 * S11: los mensajes del servidor (`NOTA_CIERRE_OBLIGATORIA` y `MOTIVO_REAPERTURA_OBLIGATORIO` de
 * `src/lib/api/cierre-gastos.ts`, que es de servidor y no se puede importar en un componente de cliente). Se
 * copian palabra por palabra: el test fija el texto exacto y la API sigue siendo la autoridad.
 */
const NOTA_CIERRE_OBLIGATORIA = "La nota del cierre es obligatoria.";
const MOTIVO_REAPERTURA_OBLIGATORIO = "El motivo de la reapertura es obligatorio.";
const CIERRE_ERROR = "No pudimos cerrar los gastos de la actividad. Inténtalo de nuevo.";
const REAPERTURA_ERROR = "No pudimos reabrir los gastos de la actividad. Inténtalo de nuevo.";

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

/**
 * S11: el cierre con su monto. El servidor publica siempre las dos `max(...)` —ahorro y sobreejecución— y solo
 * una es distinta de cero; aquí solo se nombra la que ocurrió, sin recalcular ningún monto.
 */
function cierreDe(fila: ActividadRow): { etiqueta: "Ahorro" | "Sobreejecución"; valor: string } | null {
  if (!fila.cerrada) return null;
  const sobre = fila.sobreejecucion;
  return sobre !== null && toCents(sobre) > BigInt(0)
    ? { etiqueta: "Sobreejecución", valor: sobre }
    : { etiqueta: "Ahorro", valor: fila.ahorro ?? "0.00" };
}

/** `corte` y `base` son los que eligió «Por rubro» (L32.1); sin ellos, el corte del servidor y el plan vigente. */
export function PorActividad({
  proyecto,
  corte = null,
  base = "vigente",
}: {
  proyecto: ProjectListRow;
  corte?: string | null;
  base?: ProjectBase;
}) {
  const query = useProjectFinancialSheet(proyecto.id, corte, base);
  // L32.3: la hoja solo publica `objetivo_codigo`, así que la descripción del título se lee de la estructura, la
  // misma fuente que usa la pantalla de Actividades. Mientras carga, si falla o si el objetivo no está en la
  // lista, el título se queda como hoy («Objetivo 1»).
  const objetivosQuery = useProjectObjectives(proyecto.id);
  // S11: cerrar y reabrir tienen el mismo permiso que registrar un gasto (el gate de la API). Es una comodidad:
  // la API decide, y aquí solo se evita ofrecer lo que rechazaría.
  const puedeCerrarGastos = usePermisosGastos(proyecto).puedeRegistrar;

  if (query.isError) return <InlineError message={errorMessage(query.error, ACTIVIDAD_ERROR)} />;
  if (!query.data) return <Skeleton className="h-24 w-full rounded-[14px]" />;
  return (
    <Actividades
      ficha={query.data}
      objetivos={objetivosQuery.data ?? []}
      proyectoId={proyecto.id}
      puedeCerrarGastos={puedeCerrarGastos}
    />
  );
}

function Actividades({
  ficha,
  objetivos,
  proyectoId,
  puedeCerrarGastos,
}: {
  ficha: ProjectFinancialSheet;
  objetivos: readonly ProjectObjective[];
  proyectoId: string;
  puedeCerrarGastos: boolean;
}) {
  // BORRADOR: el servidor ya manda los nulos; el gate es el mismo de la vista por rubro, por si llegara
  // un color o un porcentaje cuando no hay ejecución disponible.
  const disponible = ficha.ejecucion_disponible;
  // Debajo de `md` se montan las tarjetas y por encima la tabla: nunca las dos a la vez, como el «Por rubro».
  const movil = useIsMobile();
  const grupos = agrupar(ficha.actividades, objetivos);

  return (
    <div data-testid="finanzas-por-actividad" className="flex flex-col gap-4">
      <Totales ficha={ficha} disponible={disponible} />
      {ficha.actividades.length === 0 ? (
        <EmptyBlock>Aún no hay presupuesto asignado a este proyecto.</EmptyBlock>
      ) : (
        grupos.map((grupo) => (
          <GrupoActividades
            key={grupo.clave}
            grupo={grupo}
            disponible={disponible}
            corte={ficha.corte}
            movil={movil}
            proyectoId={proyectoId}
            puedeCerrarGastos={puedeCerrarGastos}
          />
        ))
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
function agrupar(actividades: readonly ActividadRow[], objetivos: readonly ProjectObjective[]): Grupo[] {
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
      titulo: tituloObjetivo(fila, objetivos),
      testId: fila.gestion ? "actividad-grupo-gestion" : `actividad-grupo-${fila.objetivo_codigo ?? "sin-codigo"}`,
      filas: [fila],
    });
  }
  const todos = [...grupos.values()];
  return [...todos.filter((grupo) => grupo.clave !== "gestion"), ...todos.filter((grupo) => grupo.clave === "gestion")];
}

/** El objetivo de la fila: por id y, si la lista todavía no lo trae, por el código que publica la hoja. */
function objetivoDe(fila: ActividadRow, objetivos: readonly ProjectObjective[]): ProjectObjective | undefined {
  const porId = fila.objetivo_id ? objetivos.find((objetivo) => objetivo.id === fila.objetivo_id) : undefined;
  return porId ?? (fila.objetivo_codigo ? objetivos.find((objetivo) => objetivo.codigo === fila.objetivo_codigo) : undefined);
}

/**
 * «Objetivo 1» de siempre, o «Objetivo 1. Ferias» cuando la lista de objetivos ya trae su descripción (el mismo
 * texto de Actividades). Sin descripción —cargando, con error o un objetivo ausente de la lista— no cambia nada.
 */
function tituloObjetivo(fila: ActividadRow, objetivos: readonly ProjectObjective[]): string {
  if (fila.gestion) return GRUPO_GESTION;
  const objetivo = objetivoDe(fila, objetivos);
  const codigo = fila.objetivo_codigo ?? objetivo?.codigo ?? null;
  if (!codigo) return "Objetivo";
  return objetivo?.descripcion ? `Objetivo ${codigo}. ${objetivo.descripcion}` : `Objetivo ${codigo}`;
}

function GrupoActividades({
  grupo,
  disponible,
  corte,
  movil,
  proyectoId,
  puedeCerrarGastos,
}: {
  grupo: Grupo;
  disponible: boolean;
  corte: string;
  movil: boolean;
  proyectoId: string;
  puedeCerrarGastos: boolean;
}) {
  const tituloId = useId();
  return (
    <section data-testid={grupo.testId} aria-labelledby={tituloId} className="flex min-w-0 flex-col gap-2">
      <h3 id={tituloId} className="font-display text-[15px] font-bold text-ink-950">
        {grupo.titulo}
      </h3>
      {movil ? (
        <ul data-testid="actividad-lista" className="surface flex flex-col divide-y divide-border">
          {grupo.filas.map((fila) => (
            <TarjetaActividad
              key={fila.actividad_id ?? "sin-actividad"}
              fila={fila}
              disponible={disponible}
              corte={corte}
              proyectoId={proyectoId}
              puedeCerrarGastos={puedeCerrarGastos}
            />
          ))}
        </ul>
      ) : (
        <div className="surface overflow-x-auto">
          <Table data-testid="actividad-tabla" className="min-w-[46rem]">
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
                <TableHead scope="col">Cierre de gastos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grupo.filas.map((fila) => (
                <FilaActividad
                  key={fila.actividad_id ?? "sin-actividad"}
                  fila={fila}
                  disponible={disponible}
                  corte={corte}
                  proyectoId={proyectoId}
                  puedeCerrarGastos={puedeCerrarGastos}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function FilaActividad({
  fila,
  disponible,
  corte,
  proyectoId,
  puedeCerrarGastos,
}: {
  fila: ActividadRow;
  disponible: boolean;
  corte: string;
  proyectoId: string;
  puedeCerrarGastos: boolean;
}) {
  const [abierta, setAbierta] = useState(false);
  const detalleId = useId();
  const conDetalle = fila.rubros.length > 0;
  const pct = disponible ? fila.ep_decimas : null;
  const color = disponible ? fila.color : null;
  // S11: abierta muestra el saldo; cerrada, el ahorro o la sobreejecución del servidor con la nota del cierre.
  const cierre = cierreDe(fila);

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
          {fila.cerrada && <NotaCierre fila={fila} />}
        </TableCell>
        <TableCell numeric>{monto(fila.asignado)}</TableCell>
        <TableCell numeric>{monto(fila.programado)}</TableCell>
        <TableCell numeric>{monto(fila.ejecutado)}</TableCell>
        <TableCell numeric>
          {cierre ? (
            <span data-testid="actividad-cierre" className="inline-flex flex-col items-end">
              <span className="text-[11px] text-ink-600">{cierre.etiqueta}</span>
              {monto(cierre.valor)}
            </span>
          ) : (
            monto(fila.saldo)
          )}
        </TableCell>
        <TableCell numeric>{porcentaje(pct)}</TableCell>
        <TableCell numeric>{monto(fila.umbral_rojo)}</TableCell>
        <TableCell>{color ? <SemaforoChip color={color} /> : "—"}</TableCell>
        <TableCell className="whitespace-normal">
          <AccionesCierre fila={fila} proyectoId={proyectoId} puedeCerrarGastos={puedeCerrarGastos} />
        </TableCell>
      </TableRow>
      {conDetalle && abierta && (
        <TableRow data-testid="actividad-detalle">
          <TableCell id={detalleId} colSpan={9} className="bg-ink-100/40 p-3">
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

/* ── Tarjetas (teléfono) ────────────────────────────────────────────────── */

/** Un dato de la tarjeta, con la MISMA etiqueta de la columna que sustituye. */
function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[12px] text-ink-500">{etiqueta}</dt>
      <dd className="font-mono text-[12.5px] text-ink-900">{children}</dd>
    </div>
  );
}

/** El porcentaje en la esquina, como en la tarjeta del «Por rubro», con su etiqueta de columna. */
function PorcentajeTarjeta({ valor }: { valor: string }) {
  return (
    <span className="shrink-0 text-right">
      <span className="block text-[12px] text-ink-500">% de lo programado</span>
      <span className="text-[13px] font-bold text-ink-900 tabular-nums">{valor}</span>
    </span>
  );
}

/**
 * La actividad como tarjeta en el teléfono: las mismas cifras, etiquetas, color y porcentaje que la fila de la
 * tabla, y el mismo botón que abre su detalle por rubro. S11: cerrada muestra el ahorro o la sobreejecución con
 * su nota, y las mismas acciones de cierre que la tabla.
 */
function TarjetaActividad({
  fila,
  disponible,
  corte,
  proyectoId,
  puedeCerrarGastos,
}: {
  fila: ActividadRow;
  disponible: boolean;
  corte: string;
  proyectoId: string;
  puedeCerrarGastos: boolean;
}) {
  const [abierta, setAbierta] = useState(false);
  const detalleId = useId();
  const conDetalle = fila.rubros.length > 0;
  const pct = disponible ? fila.ep_decimas : null;
  const color = disponible ? fila.color : null;
  // S11: abierta muestra el saldo; cerrada, el ahorro o la sobreejecución del servidor con la nota del cierre.
  const cierre = cierreDe(fila);

  return (
    <li data-testid="actividad-fila" className="flex flex-col gap-2 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span data-testid="actividad-nombre" className="min-w-0 text-[14px] font-semibold text-ink-900">
          {conDetalle ? (
            <button
              type="button"
              aria-expanded={abierta}
              aria-controls={detalleId}
              onClick={() => setAbierta((valor) => !valor)}
              className="flex min-h-11 items-center gap-1.5 rounded-12 text-left outline-none hover:text-ink-950 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ChevronRight
                className={cn("size-4 shrink-0 transition-transform", abierta && "rotate-90")}
                strokeWidth={2}
                aria-hidden
              />
              {nombreActividad(fila)}
            </button>
          ) : (
            <span className="flex min-h-11 items-center">{nombreActividad(fila)}</span>
          )}
        </span>
        <PorcentajeTarjeta valor={porcentaje(pct)} />
      </div>
      {fila.cerrada && <NotaCierre fila={fila} />}
      <dl className="grid grid-cols-2 gap-2">
        <Dato etiqueta="Asignado">{monto(fila.asignado)}</Dato>
        <Dato etiqueta="Programado al corte">{monto(fila.programado)}</Dato>
        <Dato etiqueta="Ejecutado">{monto(fila.ejecutado)}</Dato>
        {cierre ? (
          <div data-testid="actividad-cierre">
            <Dato etiqueta={cierre.etiqueta}>{monto(cierre.valor)}</Dato>
          </div>
        ) : (
          <Dato etiqueta="Saldo">{monto(fila.saldo)}</Dato>
        )}
        <Dato etiqueta="Pasa a rojo desde">{monto(fila.umbral_rojo)}</Dato>
        <Dato etiqueta="Semáforo">{color ? <SemaforoChip color={color} /> : "—"}</Dato>
      </dl>
      <AccionesCierre fila={fila} proyectoId={proyectoId} puedeCerrarGastos={puedeCerrarGastos} />
      {conDetalle && abierta && (
        <div id={detalleId} data-testid="actividad-detalle" className="rounded-inner bg-ink-100/40 p-3">
          <p className="text-[12px] font-semibold text-ink-700">Detalle por rubro</p>
          <ul data-testid="actividad-rubros" className="mt-1 flex flex-col divide-y divide-border">
            {fila.rubros.map((row) => (
              <TarjetaRubro key={row.rubro_id ?? row.nombre} row={row} disponible={disponible} />
            ))}
          </ul>
          <p className="mt-1 text-[12px] text-ink-600">{`Programado al corte de ${mesLegible(corte)}.`}</p>
        </div>
      )}
    </li>
  );
}

/** Un rubro hijo en tarjeta: el mismo color, umbral y porcentaje del servidor, solo pintados. */
function TarjetaRubro({ row, disponible }: { row: RubroRow; disponible: boolean }) {
  const color = disponible ? row.color : null;
  return (
    <li data-testid="actividad-rubro" className="flex flex-col gap-2 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 text-[13px] font-semibold text-ink-800">{nombreRubro(row)}</span>
        <PorcentajeTarjeta valor={porcentaje(disponible ? row.ep_decimas : null)} />
      </div>
      <dl className="grid grid-cols-2 gap-2">
        <Dato etiqueta="Asignado">{monto(row.asignado)}</Dato>
        <Dato etiqueta="Programado al corte">{monto(row.programado)}</Dato>
        <Dato etiqueta="Ejecutado">{monto(row.ejecutado)}</Dato>
        <Dato etiqueta="Pasa a rojo desde">{monto(row.umbral_rojo)}</Dato>
        <Dato etiqueta="Semáforo">{color ? <SemaforoChip color={color} /> : "—"}</Dato>
      </dl>
    </li>
  );
}

/* ── Cierre de gastos de la actividad (S11, EV-07) ──────────────────────── */

/** La nota del cierre, tal como la escribió el Gestor, con el instante en que se cerró la actividad. */
function NotaCierre({ fila }: { fila: ActividadRow }) {
  return (
    <p
      data-testid="actividad-cierre-nota"
      className="mt-1 max-w-[42ch] text-[12px] font-normal whitespace-normal text-ink-600"
    >
      {fila.cerrada_at ? `Gastos cerrados el ${formatFechaHora(fila.cerrada_at)}. ` : "Gastos cerrados. "}
      {fila.nota_cierre}
    </p>
  );
}

/**
 * S11: «Cerrar gastos de la actividad» o «Reabrir», con su diálogo. El campo es obligatorio, pero el botón que
 * guarda NO se deshabilita por estar vacío: al intentarlo se muestra el mensaje del servidor —palabra por
 * palabra— y no se manda nada. El estado del cierre se pinta para quien solo puede leer; la acción, solo para
 * quien puede registrar gastos, que es el mismo permiso que exige la API.
 */
function AccionesCierre({
  fila,
  proyectoId,
  puedeCerrarGastos,
}: {
  fila: ActividadRow;
  proyectoId: string;
  puedeCerrarGastos: boolean;
}) {
  const cerrar = useCloseActivityExpenses(proyectoId);
  const reabrir = useReopenActivityExpenses(proyectoId);
  const [accion, setAccion] = useState<"cerrar" | "reabrir" | null>(null);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const campoId = useId();
  const esCierre = accion === "cerrar";
  const enCurso = cerrar.isPending || reabrir.isPending;
  // `""` = la fila «Sin actividad» (no es una actividad): así el id es un `string` también dentro de `enviar`.
  const activityId = fila.actividad_id ?? "";
  const estado = fila.cerrada ? `Cerrada el ${formatFechaHora(fila.cerrada_at)}` : null;

  // D4 «Sin actividad»: esa fila no es una actividad y no tiene cierre que ofrecer.
  if (activityId === "") return <span className="text-[12px] text-ink-500">—</span>;
  if (!puedeCerrarGastos) {
    return <span className="text-[12px] text-ink-500">{estado ?? "Abierta"}</span>;
  }

  function abrir(cual: "cerrar" | "reabrir") {
    setTexto("");
    setError(null);
    setAccion(cual);
  }

  async function enviar() {
    if (accion === null) return;
    const valor = texto.trim();
    // S11: sin nota (o sin motivo) no se envía nada y se muestra el mensaje del servidor.
    if (valor === "") {
      setError(accion === "cerrar" ? NOTA_CIERRE_OBLIGATORIA : MOTIVO_REAPERTURA_OBLIGATORIO);
      return;
    }
    setError(null);
    try {
      if (accion === "cerrar") await cerrar.mutateAsync({ activityId, nota: valor });
      else await reabrir.mutateAsync({ activityId, motivo: valor });
      setAccion(null);
    } catch (err) {
      setError(errorMessage(err, accion === "cerrar" ? CIERRE_ERROR : REAPERTURA_ERROR));
    }
  }

  return (
    <>
      <div data-testid="actividad-cierre-acciones" className="flex flex-col items-start gap-1">
        {estado && <span className="text-[12px] text-ink-600">{estado}</span>}
        <Button type="button" variant="outline" size="sm" onClick={() => abrir(fila.cerrada ? "reabrir" : "cerrar")}>
          {fila.cerrada ? "Reabrir" : "Cerrar gastos de la actividad"}
        </Button>
      </div>
      <Dialog
        open={accion !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setAccion(null);
        }}
      >
        <DialogContent className="sm:max-w-[min(520px,calc(100%-2rem))]">
          <DialogHeader>
            <DialogTitle>{esCierre ? "Cerrar gastos de la actividad" : "Reabrir gastos de la actividad"}</DialogTitle>
            <DialogDescription>
              {esCierre
                ? "Explica la diferencia entre lo asignado y lo ejecutado. La actividad no admitirá gastos nuevos hasta que la reabras."
                : "Indica por qué los gastos vuelven a estar abiertos. La reapertura queda en la auditoría del proyecto."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1">
            <Label htmlFor={campoId} className="text-[12px] text-ink-600">
              {esCierre ? "Nota" : "Motivo"}
            </Label>
            <textarea
              id={campoId}
              value={texto}
              onChange={(event) => setTexto(event.target.value)}
              rows={3}
              maxLength={1000}
              className={CAPTURE_TEXTAREA}
            />
          </div>
          <InlineError message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAccion(null)} disabled={enCurso}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void enviar()} disabled={enCurso}>
              {enCurso && <LoaderCircle className="animate-spin" />}
              {esCierre ? "Cerrar gastos" : "Reabrir gastos"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
