// «Qué falta» del Resumen de la ficha (antes «Requiere atención», S14 P5; rediseño S2). La lista, sus tipos y el
// texto base los deriva el servidor (`GET /projects/:id/attention`) y el cliente NUNCA recalcula un semáforo
// (D11). Aquí solo se presenta: cada tipo lleva su etiqueta llana, los indicadores bajo la meta se agrupan en
// una fila y cada fila ofrece la acción exacta que la resuelve, según lo que la persona puede hacer (la API
// sigue siendo la autoridad). Los nombres de la actividad, su responsable y los datos del gasto se leen de las
// consultas que la ficha ya usa (actividades, equipo, gastos) y solo cuando hay una fila de ese tipo; si no
// llegan, la fila muestra el texto del servidor. Un BORRADOR no se pide al servidor (nunca es medible).

"use client";

import type { ReactNode } from "react";
import { HelpHint } from "@/components/ui/help-hint";
import { EmptyBlock, InlineError, SectionHeader } from "@/components/proyectos/ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { useEjecucionPermisos } from "@/components/proyectos/project-ejecucion";
import {
  useProjectActivities,
  useProjectAttention,
  useProjectExpenses,
  useProjectMembers,
  type AtencionItem,
  type AtencionTipo,
  type ProjectListRow,
} from "@/hooks/projects";
import { useCurrentUser } from "@/hooks/kanban";
import type { UiTone } from "@/lib/catalogs";
import { canManageProjects } from "@/lib/permissions";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import { fechaDia } from "@/components/proyectos/ficha/historial/fechas";

export const ATENCION_ERROR = "No pudimos cargar lo que requiere atención. Inténtalo de nuevo.";
const ATENCION_VACIO = "Nada pendiente por ahora.";
const TITULO = "Qué falta";
const AYUDA = "Lo que necesita una acción ahora. Cada fila te lleva al lugar exacto donde se resuelve.";

/** Pestaña de la ficha donde se resuelve cada tipo de aviso. */
export type AtencionDestino = "actividades" | "finanzas";

/** La acción exacta de una fila; quien monta la ficha decide cómo abrirla. */
export type AccionAtencion =
  | { tipo: "registrar-avance"; actividadId: string }
  | { tipo: "revisar-gasto"; gastoId: string }
  | { tipo: "adjuntar-soporte"; avanceId: string }
  | { tipo: "ver-indicadores" };

/** Sin `onAccion`, cada acción cae en la pestaña donde vive (el comportamiento de antes). */
export const DESTINO_DE_ACCION: Record<AccionAtencion["tipo"], AtencionDestino> = {
  "registrar-avance": "actividades",
  "revisar-gasto": "finanzas",
  "adjuntar-soporte": "actividades",
  "ver-indicadores": "actividades",
};

const DESTINO_LABEL: Record<AtencionDestino, string> = {
  actividades: "Ver actividades",
  finanzas: "Ver finanzas",
};

/** Etiqueta llana por tipo (la del servidor se conserva para los tipos que el rediseño no redibuja). */
const ETIQUETA: Partial<Record<AtencionTipo, string>> = {
  actividad_atrasada: "Actividad vencida",
  gasto_observado: "Gasto por revisar",
  avance_sin_soporte: "Avance sin soporte",
};

/** Tono visual por tipo; el servidor decide el tipo, el cliente solo el color de la etiqueta. */
const TONE: Record<AtencionTipo, UiTone> = {
  alerta_retraso: "alerta",
  rubro_sobreejecucion: "riesgo",
  actividad_atrasada: "destructivo",
  avance_sin_soporte: "info",
  indicador_bajo_meta: "alerta",
  gasto_observado: "alerta",
};

const BOTON_FILA = "w-full sm:w-auto";

type Fila = { clave: string; tipo: AtencionTipo; items: AtencionItem[] };

/** Los indicadores bajo la meta van juntos en una fila, en el lugar del primero; el resto, uno por fila. */
function agrupar(items: AtencionItem[]): Fila[] {
  const filas: Fila[] = [];
  let indicadores: Fila | null = null;
  items.forEach((item, index) => {
    if (item.tipo === "indicador_bajo_meta") {
      if (!indicadores) {
        indicadores = { clave: "indicadores", tipo: item.tipo, items: [] };
        filas.push(indicadores);
      }
      indicadores.items.push(item);
      return;
    }
    const id = item.rubro_id ?? item.actividad_id ?? item.avance_id ?? item.gasto_id ?? String(index);
    filas.push({ clave: `${item.tipo}-${id}`, tipo: item.tipo, items: [item] });
  });
  return filas;
}

type Acciones = {
  onIrA?: (destino: AtencionDestino) => void;
  onAccion?: (accion: AccionAtencion) => void;
};

/** Con `onIrA` cada fila ofrece su acción; sin él la lista es de solo lectura, como antes. */
export function RequiereAtencion({
  proyecto,
  onIrA,
  onAccion,
  ocultar,
}: {
  proyecto: Pick<ProjectListRow, "id" | "estado">;
  /** Tipos que otra parte de la pantalla ya explica: la lista no repite el aviso. */
  ocultar?: readonly AtencionTipo[];
} & Acciones) {
  const medible = proyecto.estado !== "BORRADOR";
  const query = useProjectAttention(medible ? proyecto.id : "");
  const items = (query.data?.items ?? []).filter((item) => !ocultar?.includes(item.tipo));
  const filas = medible && query.data?.medible ? agrupar(items) : [];

  let contenido: ReactNode;
  if (!medible) contenido = <EmptyBlock>{ATENCION_VACIO}</EmptyBlock>;
  else if (query.isError) contenido = <InlineError message={ATENCION_ERROR} />;
  else if (!query.data) contenido = <Cargando />;
  else if (filas.length === 0) contenido = <EmptyBlock>{ATENCION_VACIO}</EmptyBlock>;
  else {
    contenido = (
      <ul className="surface-inner divide-y divide-ink-200 p-4" data-testid="requiere-atencion-lista">
        {filas.map((fila) => (
          <FilaAtencion
            key={fila.clave}
            fila={fila}
            proyecto={proyecto}
            onIrA={onIrA}
            onAccion={onAccion}
          />
        ))}
      </ul>
    );
  }

  return (
    <section data-testid="requiere-atencion" aria-label={TITULO} className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1.5">
        <SectionHeader as="h2">{filas.length > 0 ? `${TITULO} · ${filas.length}` : TITULO}</SectionHeader>
        <HelpHint label={TITULO} className="after:-inset-3">
          {AYUDA}
        </HelpHint>
      </div>
      {contenido}
    </section>
  );
}

/* ── Filas ─────────────────────────────────────────────────────────────── */

function FilaAtencion({
  fila,
  proyecto,
  onIrA,
  onAccion,
}: {
  fila: Fila;
  proyecto: Pick<ProjectListRow, "id" | "estado">;
} & Acciones) {
  const [item] = fila.items as [AtencionItem, ...AtencionItem[]];
  const ir = (accion: AccionAtencion) => (onAccion ? onAccion(accion) : onIrA?.(DESTINO_DE_ACCION[accion.tipo]));

  switch (fila.tipo) {
    case "actividad_atrasada":
      return <FilaVencida item={item} proyecto={proyecto} onIrA={onIrA} ir={ir} />;
    case "gasto_observado":
      return <FilaGasto item={item} proyectoId={proyecto.id} onIrA={onIrA} ir={ir} />;
    case "avance_sin_soporte":
      return <FilaSinSoporte item={item} proyecto={proyecto} onIrA={onIrA} ir={ir} />;
    case "indicador_bajo_meta": {
      const n = fila.items.length;
      return (
        <FilaBase tipo={fila.tipo} etiqueta={n === 1 ? "1 indicador bajo la meta" : `${n} indicadores bajo la meta`}>
          <ul className="flex flex-col gap-0.5">
            {fila.items.map((indicador, index) => (
              <li key={indicador.indicador_id ?? index} className="text-[13px] leading-relaxed text-ink-800">
                {indicador.detalle}
              </li>
            ))}
          </ul>
          {onIrA && <BotonFila onClick={() => ir({ tipo: "ver-indicadores" })}>Ver indicadores</BotonFila>}
        </FilaBase>
      );
    }
    default:
      return (
        <FilaBase tipo={fila.tipo} etiqueta={item.titulo}>
          <p className="text-[13px] leading-relaxed text-ink-700">{item.detalle}</p>
          {onIrA && <BotonFila onClick={() => onIrA("finanzas")}>{DESTINO_LABEL.finanzas}</BotonFila>}
        </FilaBase>
      );
  }
}

type FilaProps = {
  item: AtencionItem;
  onIrA?: (destino: AtencionDestino) => void;
  ir: (accion: AccionAtencion) => void;
};

/** Quien puede registrar avance o adjuntar soporte: gestor o integrante, con el proyecto en ejecución. */
function usePuedeEjecutar(proyecto: Pick<ProjectListRow, "id" | "estado">): boolean {
  const { canWrite } = useEjecucionPermisos(proyecto.id);
  return canWrite && proyecto.estado === "EN_EJECUCION";
}

function FilaVencida({ item, proyecto, onIrA, ir }: FilaProps & { proyecto: Pick<ProjectListRow, "id" | "estado"> }) {
  const puede = usePuedeEjecutar(proyecto);
  const actividad = useProjectActivities(proyecto.id).data?.find((a) => a.id === item.actividad_id);
  const responsable = useProjectMembers(proyecto.id).data?.find(
    (miembro) => actividad?.responsable_id && miembro.usuario.id === actividad.responsable_id,
  );

  return (
    <FilaBase tipo={item.tipo} etiqueta={ETIQUETA.actividad_atrasada!}>
      {actividad ? (
        <>
          <p className="text-[13.5px] font-semibold text-ink-900">{`${actividad.codigo} ${actividad.nombre}`}</p>
          <p className="text-[13px] leading-relaxed text-ink-700">
            {`Venció el ${fechaDia(actividad.fecha_fin)}`}
            <span className="hidden sm:inline"> sin llegar a su meta</span>.
            {responsable && (
              <>
                {` Le toca a ${responsable.usuario.nombre}`}
                <span className="hidden sm:inline">, responsable</span>.
              </>
            )}
          </p>
        </>
      ) : (
        <p className="text-[13px] leading-relaxed text-ink-700">{item.detalle}</p>
      )}
      {onIrA &&
        (puede && item.actividad_id ? (
          <BotonFila onClick={() => ir({ tipo: "registrar-avance", actividadId: item.actividad_id! })}>
            {actividad ? `Registrar avance de ${actividad.codigo}` : "Registrar avance"}
          </BotonFila>
        ) : (
          <BotonFila onClick={() => onIrA("actividades")}>{DESTINO_LABEL.actividades}</BotonFila>
        ))}
    </FilaBase>
  );
}

function FilaGasto({ item, proyectoId, onIrA, ir }: FilaProps & { proyectoId: string }) {
  const usuario = useCurrentUser().data;
  const gasto = useProjectExpenses(proyectoId).data?.gastos.find((g) => g.id === item.gasto_id);
  const esGestor = usuario ? canManageProjects({ id: usuario.id, rol: usuario.rol }) : false;
  // Un gestor no valida su propio gasto (la API lo rechaza): solo se ofrece cuando se sabe que no es suyo.
  const puedeRevisar = esGestor && Boolean(item.gasto_id) && Boolean(gasto) && gasto?.registrado_por_id !== usuario?.id;

  const motivos: string[] = [];
  if (gasto?.alerta_sobregasto) {
    motivos.push(
      `Supera lo asignado al rubro ${gasto.rubro.codigo ? `${gasto.rubro.codigo} · ${gasto.rubro.nombre}` : gasto.rubro.nombre}.`,
    );
  }
  if (gasto?.datos_incompletos) motivos.push("Faltan datos del tercero.");

  return (
    <FilaBase tipo={item.tipo} etiqueta={ETIQUETA.gasto_observado!}>
      {gasto ? (
        <>
          <p className="text-[13.5px] font-semibold text-ink-900">
            {`${formatCOP(toCents(gasto.valor))} · ${gasto.tercero_nombre}`}
          </p>
          <p className="text-[13px] leading-relaxed text-ink-700">
            {motivos.join(" ")}
            <span className="hidden sm:inline"> Le toca a Gerencia validarlo o rechazarlo.</span>
          </p>
        </>
      ) : (
        <p className="text-[13px] leading-relaxed text-ink-700">{item.detalle}</p>
      )}
      {onIrA &&
        (puedeRevisar ? (
          <BotonFila onClick={() => ir({ tipo: "revisar-gasto", gastoId: item.gasto_id! })}>Revisar gasto</BotonFila>
        ) : (
          <BotonFila onClick={() => onIrA("finanzas")}>{DESTINO_LABEL.finanzas}</BotonFila>
        ))}
    </FilaBase>
  );
}

function FilaSinSoporte({ item, proyecto, onIrA, ir }: FilaProps & { proyecto: Pick<ProjectListRow, "id" | "estado"> }) {
  const puede = usePuedeEjecutar(proyecto);
  return (
    <FilaBase tipo={item.tipo} etiqueta={ETIQUETA.avance_sin_soporte!}>
      <p className="text-[13.5px] font-semibold text-ink-900">{item.detalle}</p>
      <p className="hidden text-[13px] leading-relaxed text-ink-700 sm:block">
        Adjunta el archivo o el enlace que lo respalda.
      </p>
      {onIrA &&
        (puede && item.avance_id ? (
          <BotonFila onClick={() => ir({ tipo: "adjuntar-soporte", avanceId: item.avance_id! })}>
            Adjuntar soporte
          </BotonFila>
        ) : (
          <BotonFila onClick={() => onIrA("actividades")}>{DESTINO_LABEL.actividades}</BotonFila>
        ))}
    </FilaBase>
  );
}

function FilaBase({ tipo, etiqueta, children }: { tipo: AtencionTipo; etiqueta: string; children: ReactNode }) {
  return (
    <li data-testid={`atencion-${tipo}`} className="flex flex-col items-start gap-1 py-3 first:pt-0 last:pb-0">
      <StatusChip dot={false} tone={TONE[tipo]}>{etiqueta}</StatusChip>
      {children}
    </li>
  );
}

function BotonFila({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button type="button" variant="outline" className={`mt-1.5 ${BOTON_FILA}`} onClick={onClick}>
      {children}
    </Button>
  );
}

function Cargando() {
  return (
    <div className="flex flex-col gap-2" data-testid="requiere-atencion-cargando">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-inner" />
      ))}
    </div>
  );
}
