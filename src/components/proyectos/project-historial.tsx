// Historial › Registro de cambios (REQ-AUD-04; rediseño «Historial-propuesta» / «Interacciones-Historial»): los
// movimientos del proyecto agrupados por día (hora de Bogotá), del más reciente al más antiguo. Los movimientos
// conocidos (avances, anulaciones, gastos, solicitudes y versiones) se leen como una frase; el resto conserva la
// lectura por campo de `historial-format`. Filtros por tipo y por persona, sin recargar, y un pliegue de los días
// largos. Solo lectura: el libro es append-only.

"use client";

import { useEffect, useId, useMemo, useRef, useState, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { HelpHint } from "@/components/ui/help-hint";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { ACCION_AUDITORIA_META, etiquetaEntidadAuditoria } from "@/components/proyectos/project-display";
import { nombresDelProyecto, pasosLegibles, type CambioLegible } from "@/components/proyectos/historial-format";
import { TIPO_MODIFICACION_LABEL } from "@/components/proyectos/modificacion-form";
import { claveDia, hora, tituloDia } from "@/components/proyectos/ficha/historial/fechas";
import {
  contextoDeEntradas,
  describirEntrada,
  iniciales,
  tipoDeEntrada,
  type ContextoFrases,
  type Frase,
  type TipoMovimiento,
} from "@/components/proyectos/ficha/historial/registro-frases";
import { EmptyBlock, SELECT_CLASS_LG } from "@/components/proyectos/ui";
import {
  useProjectActivities,
  useProjectAudit,
  useProjectBudget,
  useProjectDeliverables,
  useProjectIndicators,
  type ProjectAuditEntry,
  type ProjectListRow,
} from "@/hooks/projects";
import { FiltroChip } from "@/components/proyectos/ficha/filtro-chip";

/** Tabs of the ficha the change log can open. */
export type DestinoFicha = "actividades" | "finanzas";

type Filtro = "todo" | Exclude<TipoMovimiento, "otros">;

const FILTROS: readonly { valor: Filtro; etiqueta: string }[] = [
  { valor: "todo", etiqueta: "Todo" },
  { valor: "avances", etiqueta: "Avances" },
  { valor: "gastos", etiqueta: "Gastos" },
  { valor: "anulaciones", etiqueta: "Anulaciones" },
  { valor: "plan", etiqueta: "Cambios del plan" },
];

/** Entries of a day shown before «Ver N cambios más de este día» (the exact number is pending with the PO). */
const POR_DIA = 5;
const SIN_NOMBRE = "Usuario no disponible";

type Fila = { entry: ProjectAuditEntry; cambio: CambioLegible; frase: Frase | null };
type Paso = { key: string; created_at: string; quien: string; filas: Fila[]; tipos: Set<TipoMovimiento> };

const lista = <T,>(valor: unknown): T[] => (Array.isArray(valor) ? (valor as T[]) : []);

export function ProjectHistorial({
  proyecto,
  onIrA,
}: {
  proyecto: ProjectListRow;
  /** Switches the ficha's tab («Ver actividad», «Ver gasto»). Without it those links are not shown. */
  onIrA?: (destino: DestinoFicha) => void;
}) {
  const query = useProjectAudit(proyecto.id);
  // Names the sentences need; the same queries (and cache) as the Actividades and Finanzas tabs.
  const actividades = useProjectActivities(proyecto.id).data;
  const entregables = useProjectDeliverables(proyecto.id).data;
  const indicadores = useProjectIndicators(proyecto.id).data;
  const presupuesto = useProjectBudget(proyecto.id).data;
  const [filtro, setFiltro] = useState<Filtro>("todo");
  const [persona, setPersona] = useState("");

  const ctx = useMemo<ContextoFrases>(
    () =>
      contextoDeEntradas(query.data ?? [], {
        actividades: new Map(lista<{ id: string; codigo: string }>(actividades).map((a) => [a.id, a.codigo])),
        entregables: new Map(lista<{ id: string; codigo: string }>(entregables).map((e) => [e.id, e.codigo])),
        indicadores: new Map(lista<{ id: string; codigo: string }>(indicadores).map((i) => [i.id, i.codigo])),
        rubros: new Map(
          lista<{ rubro_id: string; codigo: string | null; nombre: string }>(presupuesto?.rubros).map((r) => [
            r.rubro_id,
            { codigo: r.codigo, nombre: r.nombre },
          ]),
        ),
        tiposModificacion: TIPO_MODIFICACION_LABEL,
      }),
    [query.data, actividades, entregables, indicadores, presupuesto],
  );

  const pasos = useMemo<Paso[]>(() => {
    const legibles = pasosLegibles(query.data ?? [], nombresDelProyecto(proyecto));
    return legibles
      .map((paso) => {
        const filas = paso.entradas.map(({ entry, cambio }) => ({ entry, cambio, frase: describirEntrada(entry, ctx) }));
        // The sentences first: they say what happened; the field readings detail it.
        filas.sort((a, b) => Number(b.frase !== null) - Number(a.frase !== null));
        return {
          key: paso.key,
          created_at: paso.created_at,
          quien: filas[0]?.entry.usuario_nombre ?? SIN_NOMBRE,
          filas,
          tipos: new Set(filas.map((f) => f.frase?.tipo ?? tipoDeEntrada(f.entry))),
        };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [query.data, proyecto, ctx]);

  const personas = useMemo(() => [...new Set(pasos.map((paso) => paso.quien))].sort((a, b) => a.localeCompare(b)), [pasos]);
  const visibles = pasos.filter(
    (paso) => (persona === "" || paso.quien === persona) && (filtro === "todo" || paso.tipos.has(filtro)),
  );
  const dias = agruparPorDia(visibles);

  return (
    <section data-testid="historial">
      {query.isError ? (
        <p role="alert" className="mt-1.5 text-[13px] text-destructivo">
          {query.error instanceof Error ? query.error.message : "No pudimos cargar el historial. Inténtalo de nuevo."}
        </p>
      ) : query.isLoading ? (
        <HistorialSkeleton />
      ) : pasos.length === 0 ? (
        <EmptyBlock>Sin movimientos registrados.</EmptyBlock>
      ) : (
        <>
          <Filtros
            filtro={filtro}
            onFiltro={setFiltro}
            persona={persona}
            personas={personas}
            onPersona={setPersona}
          />
          {dias.length === 0 ? (
            <EmptyState
              bordered
              className="mt-3 min-h-0 py-5"
              title="No hay movimientos con estos filtros."
              description="Prueba con otro tipo de movimiento u otra persona."
              action={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setFiltro("todo");
                    setPersona("");
                  }}
                >
                  Quitar filtros
                </Button>
              }
            />
          ) : (
            <div className="mt-4 flex flex-col gap-5">
              {dias.map((dia) => (
                <Dia key={dia.clave} clave={dia.clave} pasos={dia.pasos} ctx={ctx} onIrA={onIrA} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function agruparPorDia(pasos: Paso[]): { clave: string; pasos: Paso[] }[] {
  const dias: { clave: string; pasos: Paso[] }[] = [];
  for (const paso of pasos) {
    const clave = claveDia(paso.created_at);
    const ultimo = dias[dias.length - 1];
    if (ultimo?.clave === clave) ultimo.pasos.push(paso);
    else dias.push({ clave, pasos: [paso] });
  }
  return dias;
}

function Filtros({
  filtro,
  onFiltro,
  persona,
  personas,
  onPersona,
}: {
  filtro: Filtro;
  onFiltro: (filtro: Filtro) => void;
  persona: string;
  personas: string[];
  onPersona: (persona: string) => void;
}) {
  const id = useId();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 md:flex md:items-center">
      <span id={`${id}-mostrar`} className="text-[12px] font-semibold text-ink-600">
        Mostrar
      </span>
      <div
        role="group"
        aria-labelledby={`${id}-mostrar`}
        className="no-scrollbar col-span-2 row-start-2 flex gap-2 overflow-x-auto md:row-start-auto md:flex-1 md:flex-wrap md:overflow-visible"
      >
        {FILTROS.map((f) => (
          <FiltroChip key={f.valor} activo={filtro === f.valor} onClick={() => onFiltro(f.valor)}>
            {f.etiqueta}
          </FiltroChip>
        ))}
      </div>
      <label className="col-start-2 row-start-1 flex items-center gap-1.5 text-[12px] text-ink-600 md:col-auto md:row-auto">
        Persona
        <select value={persona} onChange={(event) => onPersona(event.target.value)} className={SELECT_CLASS_LG}>
          <option value="">todas</option>
          {personas.map((nombre) => (
            <option key={nombre} value={nombre}>
              {nombre}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Dia({
  clave,
  pasos,
  ctx,
  onIrA,
}: {
  clave: string;
  pasos: Paso[];
  ctx: ContextoFrases;
  onIrA?: (destino: DestinoFicha) => void;
}) {
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const primeraNueva = useRef<HTMLLIElement>(null);
  const enfocar = useRef(false);
  const ocultos = pasos.length - POR_DIA;
  const mostrados = abierto || ocultos <= 0 ? pasos : pasos.slice(0, POR_DIA);

  useEffect(() => {
    if (abierto && enfocar.current) {
      enfocar.current = false;
      primeraNueva.current?.focus();
    }
  }, [abierto]);

  return (
    <section data-testid="historial-dia" aria-labelledby={`${id}-titulo`}>
      <h4 id={`${id}-titulo`} className="text-[13px] font-bold text-ink-900">
        {tituloDia(pasos[0].created_at)}
      </h4>
      <div className="surface-inner mt-1.5 px-3 py-1 sm:px-4">
        <ol id={`${id}-lista`} className="flex flex-col divide-y divide-border" data-dia={clave}>
          {mostrados.map((paso, indice) => (
            <PasoRegistro
              key={paso.key}
              paso={paso}
              ctx={ctx}
              onIrA={onIrA}
              refEntrada={indice === POR_DIA ? primeraNueva : undefined}
            />
          ))}
        </ol>
        {ocultos > 0 && (
          <Button
            type="button"
            variant="link"
            size="xs"
            className="mb-1 px-0"
            aria-expanded={abierto}
            aria-controls={`${id}-lista`}
            onClick={() => {
              enfocar.current = !abierto;
              setAbierto(!abierto);
            }}
          >
            {abierto ? "Ver menos" : `Ver ${ocultos} ${ocultos === 1 ? "cambio" : "cambios"} más de este día`}
          </Button>
        )}
      </div>
    </section>
  );
}

function PasoRegistro({
  paso,
  ctx,
  onIrA,
  refEntrada,
}: {
  paso: Paso;
  ctx: ContextoFrases;
  onIrA?: (destino: DestinoFicha) => void;
  refEntrada?: Ref<HTMLLIElement>;
}) {
  const [primera, ...resto] = paso.filas;
  const actividad = paso.filas
    .map((f) => (f.frase?.actividadId ? ctx.actividades.get(f.frase.actividadId) : undefined))
    .find(Boolean);
  const gastoId = paso.filas.map((f) => f.frase?.gastoId).find(Boolean);
  const gasto = gastoId ? (ctx.gastos.get(gastoId) ?? "") : null;

  return (
    <li
      ref={refEntrada}
      tabIndex={-1}
      data-testid="historial-paso"
      className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[4.5rem_2rem_minmax(0,1fr)]"
    >
      <time
        dateTime={paso.created_at}
        className="col-start-2 row-start-1 text-[11px] text-ink-500 tabular-nums sm:col-start-1 sm:pt-1.5"
      >
        {hora(paso.created_at)}
      </time>
      <span
        aria-hidden="true"
        className="col-start-1 row-span-2 row-start-1 grid size-8 place-items-center rounded-full bg-ink-100 text-[11px] font-bold text-ink-700 sm:col-start-2 sm:row-span-1"
      >
        {iniciales(paso.quien)}
      </span>
      <div className="col-start-2 row-start-2 min-w-0 sm:col-start-3 sm:row-start-1">
        <p className="text-[13px] leading-snug text-ink-800">
          <b className="font-semibold text-ink-950">{paso.quien}</b>
          {primera.frase && (
            <>
              {" "}
              {primera.frase.predicado} <Etiqueta frase={primera.frase} />
            </>
          )}
        </p>
        {primera.frase ? <Detalle frase={primera.frase} /> : <LecturaPorCampo fila={primera} />}
        {resto.map((fila) =>
          fila.frase ? (
            <div key={fila.entry.id} className="mt-1.5">
              <p className="text-[13px] leading-snug text-ink-800">
                {mayuscula(fila.frase.predicado)} <Etiqueta frase={fila.frase} />
              </p>
              <Detalle frase={fila.frase} />
            </div>
          ) : (
            <LecturaPorCampo key={fila.entry.id} fila={fila} />
          ),
        )}
        {onIrA && (actividad || gasto !== null) && (
          <div className="mt-1 flex flex-wrap gap-x-4">
            {actividad && (
              <Button type="button" variant="link" size="xs" className="px-0" onClick={() => onIrA("actividades")}>
                Ver actividad {actividad}
              </Button>
            )}
            {gasto !== null && (
              <Button type="button" variant="link" size="xs" className="px-0" onClick={() => onIrA("finanzas")}>
                {gasto ? `Ver gasto ${gasto}` : "Ver gasto"}
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

const mayuscula = (texto: string) => `${texto.charAt(0).toUpperCase()}${texto.slice(1)}`;

function Etiqueta({ frase }: { frase: Frase }) {
  return (
    <StatusChip dot={false} tone={frase.tono} className="align-middle">
      {frase.etiqueta}
    </StatusChip>
  );
}

function Detalle({ frase }: { frase: Frase }) {
  return (
    <>
      {frase.cita && <p className="mt-0.5 text-[12.5px] text-ink-600">«{frase.cita}»</p>}
      {frase.tipo === "anulaciones" && (
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-[12.5px] text-ink-600">
          <span>
            {frase.motivoAnulacion && `Motivo: «${frase.motivoAnulacion}» `}
            Ya no cuenta para el avance.
          </span>
          <HelpHint label="Reporte anulado" className="after:-inset-3">
            Un reporte anulado deja de contar para el avance, pero queda en el registro con su motivo.
          </HelpHint>
        </p>
      )}
      {frase.nota && <p className="mt-0.5 text-[12.5px] text-ink-600">{frase.nota}</p>}
    </>
  );
}

/** A movement without a sentence: its action, its entity and the field that changed, «antes → después». */
function LecturaPorCampo({ fila }: { fila: Fila }) {
  const { anterior, nuevo, campo } = fila.cambio;
  return (
    <div className="mt-1 flex flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusChip dot={false} tone="neutro">{ACCION_AUDITORIA_META[fila.entry.accion]}</StatusChip>
        <span className="text-[11.5px] font-semibold text-ink-600">{etiquetaEntidadAuditoria(fila.entry.entidad)}</span>
      </div>
      <p className="text-[12.5px] leading-snug break-words text-ink-800">
        {campo && <span className="font-semibold">{campo}: </span>}
        {anterior && <span className="text-ink-500">{anterior}</span>}
        {anterior && nuevo && <span className="text-ink-500"> → </span>}
        {nuevo && <span>{nuevo}</span>}
      </p>
    </div>
  );
}

function HistorialSkeleton() {
  return (
    <div className="mt-2 space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} data-testid="historial-cargando" className="h-14 w-full rounded-[14px]" />
      ))}
    </div>
  );
}
