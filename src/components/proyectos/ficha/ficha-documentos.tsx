// Pestaña "Documentos" de la ficha (rediseño «Documentos-propuesta» / «Interacciones-Documentos»): una sola lista
// con todos los soportes del proyecto, agrupada por origen (entregables, gastos, indicadores y del proyecto), con
// filtros por origen que llevan su número, un buscador por nombre o código y la explicación de los grupos vacíos.
// La lista sale de `GET /projects/:id/supports` y abrir un soporte pasa por la URL firmada de su origen (la API
// audita cada emisión). Los soportes de gasto solo llegan si la API los deja ver (RNF-03).
//
// DOC1: los documentos generales del proyecto (origen "proyecto") se crean con «Subir documento» (archivo
// o enlace) y se eliminan con confirmación. Gestores, o un integrante del equipo sobre lo que subió, y
// solo con el proyecto en BORRADOR/EN_EJECUCION (suspendido, cerrado o cancelado está congelado, B7); la API
// sigue siendo la autoridad.

"use client";

import { useId, useState } from "react";
import { ExternalLink, FileText, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { EmptyState } from "@/components/ui/empty-state";
import { EmptyBlock, InlineError } from "@/components/proyectos/ui";
import { SubirDocumentoDialog } from "@/components/proyectos/ficha/subir-documento-dialog";
import { fechaCorta } from "@/components/proyectos/ficha/historial/fechas";
import { useCurrentUser } from "@/hooks/kanban";
import { PROJECT_MEMBER_ROLES, canManageProjects } from "@/lib/permissions";
import {
  downloadAvanceSoporte,
  downloadExpenseSoporte,
  downloadProjectDocument,
  useDeleteProjectDocument,
  useProjectMembers,
  useProjectSupports,
  type ProjectListRow,
  type ProjectSupport,
} from "@/hooks/projects";
import { FiltroChip } from "@/components/proyectos/ficha/filtro-chip";

const ERROR = "No pudimos cargar los documentos. Inténtalo de nuevo.";
const SIN_ARCHIVO = "Este documento no tiene archivo ni enlace para abrir.";
const ESTADOS_ESCRITURA: readonly string[] = ["BORRADOR", "EN_EJECUCION"];

type Origen = ProjectSupport["origen"];

/**
 * Order and wording of each origin: the filter label, the group title and how its supports are added (said once
 * for the first empty group, «Los soportes de…», and shortened for the next ones, «los de…»).
 */
const GRUPOS: readonly { origen: Origen; filtro: string; titulo: string; primero: string; siguiente: string }[] = [
  {
    origen: "avance",
    filtro: "Entregables",
    titulo: "Soportes de entregables",
    primero: "Los soportes de entregables se adjuntan al registrar el avance en Actividades",
    siguiente: "los de entregables, al registrar el avance en Actividades",
  },
  {
    origen: "gasto",
    filtro: "Gastos",
    titulo: "Soportes de gastos",
    primero: "Los soportes de gastos se adjuntan al registrar el gasto en Finanzas",
    siguiente: "los de gastos, al registrar el gasto en Finanzas",
  },
  {
    origen: "indicador",
    filtro: "Indicadores",
    titulo: "Soportes de indicadores",
    primero: "Los soportes de las mediciones se adjuntan desde Actividades › Indicadores",
    siguiente: "los de las mediciones, desde Actividades › Indicadores",
  },
  {
    origen: "proyecto",
    filtro: "Del proyecto",
    titulo: "Documentos del proyecto",
    primero: "Los del proyecto (convenio, actas de inicio) se suben con «Subir documento»",
    siguiente: "los del proyecto (convenio, actas de inicio), con «Subir documento»",
  },
];

/** Hay algo que abrir: el archivo de un avance, gasto o documento del proyecto, o un enlace externo. */
function puedeAbrir(soporte: ProjectSupport): boolean {
  const viaOrigen = (soporte.origen === "avance" || soporte.origen === "gasto") && Boolean(soporte.origen_id);
  const viaProyecto = soporte.origen === "proyecto" && (soporte.tipo === "archivo" || Boolean(soporte.url_externa));
  return viaOrigen || viaProyecto || Boolean(soporte.url_externa);
}

/**
 * «De dónde viene» in two lines. The API sends one string per origin (`E1 · Taller`, `I2 · Hogares`,
 * `Gasto FV-4007 · descripción`): the entregable and the indicador get their kind in front, the gasto is split into
 * its number and its description.
 */
function origenDe(soporte: ProjectSupport): { principal: string; detalle: string | null } | null {
  if (soporte.origen === "proyecto" && !soporte.vinculo) {
    const forma = soporte.tipo === "archivo" ? "Archivo" : "Enlace";
    return { principal: "Del proyecto", detalle: `${forma} subido con «Subir documento»` };
  }
  if (!soporte.vinculo) return null;
  if (soporte.origen === "gasto") {
    const [numero, ...resto] = soporte.vinculo.split(" · ");
    return { principal: numero, detalle: resto.join(" · ") || null };
  }
  if (soporte.origen === "avance") return { principal: `Entregable ${soporte.vinculo}`, detalle: null };
  if (soporte.origen === "indicador") return { principal: `Indicador ${soporte.vinculo}`, detalle: null };
  return { principal: soporte.vinculo, detalle: null };
}

/** «A», «A y B», «A, B y C». */
function enumerar(nombres: string[]): string {
  if (nombres.length <= 1) return nombres.join("");
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/** Who cannot upload reads who does it instead of «Subir documento» (prototype wording). */
const PROYECTO_SIN_SUBIR = {
  primero: "Los del proyecto (convenio, actas de inicio) los sube el equipo del proyecto",
  siguiente: "los del proyecto (convenio, actas de inicio) los sube el equipo del proyecto",
};

/**
 * The explanation of the empty groups, as in the prototype: a bold first sentence naming them and how each one
 * gets its documents; `null` when none is empty. «Subir documento» only for who may use it.
 */
function explicacionVacios(vacios: typeof GRUPOS, puedeSubir: boolean): { cabeza: string; como: string } | null {
  if (vacios.length === 0) return null;
  const nombres = enumerar(vacios.map((grupo) => grupo.filtro));
  const cabeza = `${nombres} ${vacios.length === 1 ? "no tiene" : "no tienen"} documentos.`;
  const frases = vacios.map((grupo) => (grupo.origen === "proyecto" && !puedeSubir ? PROYECTO_SIN_SUBIR : grupo));
  const como = frases.map((frase, indice) => (indice === 0 ? frase.primero : frase.siguiente)).join("; ");
  return { cabeza, como: `${como}.` };
}

const ENLACE_INDICADORES = "Actividades › Indicadores";

/** The explanation's text, with «Actividades › Indicadores» as a link to the Actividades tab when it can go there. */
function ComoSeAgregan({ texto, onVerIndicadores }: { texto: string; onVerIndicadores?: () => void }) {
  const corte = texto.indexOf(ENLACE_INDICADORES);
  if (!onVerIndicadores || corte === -1) return <span>{texto}</span>;
  return (
    <span>
      {texto.slice(0, corte)}
      <button
        type="button"
        className="rounded-sm font-medium text-primary underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        onClick={onVerIndicadores}
      >
        {ENLACE_INDICADORES}
      </button>
      {texto.slice(corte + ENLACE_INDICADORES.length)}
    </span>
  );
}

type Filtro = "TODOS" | Origen;

export function FichaDocumentos({
  proyecto,
  onVerIndicadores,
}: {
  proyecto: ProjectListRow;
  /** «Actividades › Indicadores» in the empty-group explanation: switches the ficha to Actividades. */
  onVerIndicadores?: () => void;
}) {
  const query = useProjectSupports(proyecto.id);
  const usuario = useCurrentUser().data;
  const miembros = useProjectMembers(proyecto.id).data;
  const borrar = useDeleteProjectDocument(proyecto.id);
  const [filtro, setFiltro] = useState<Filtro>("TODOS");
  const idFiltro = useId();
  const [busqueda, setBusqueda] = useState("");
  const [abriendo, setAbriendo] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [eliminando, setEliminando] = useState<ProjectSupport | null>(null);

  // Mismo gate que la API (DOC1): gestores o un integrante del equipo, en estados editables.
  const esGestor = usuario ? canManageProjects({ id: usuario.id, rol: usuario.rol }) : false;
  const esMiembroDelEquipo = Boolean(
    usuario &&
      PROJECT_MEMBER_ROLES.includes(usuario.rol) &&
      (miembros ?? []).some((miembro) => miembro.usuario.id === usuario.id),
  );
  const puedeEscribir = (esGestor || esMiembroDelEquipo) && ESTADOS_ESCRITURA.includes(proyecto.estado);
  const puedeEliminar = (soporte: ProjectSupport) =>
    soporte.origen === "proyecto" && puedeEscribir && (esGestor || soporte.subido_por_id === usuario?.id);

  const abrir = async (soporte: ProjectSupport) => {
    setAbriendo(soporte.id);
    try {
      if (soporte.origen === "proyecto" && soporte.tipo === "archivo") {
        await downloadProjectDocument(proyecto.id, soporte.id);
      } else if (soporte.origen === "avance" && soporte.origen_id) {
        await downloadAvanceSoporte(proyecto.id, soporte.origen_id, soporte.id);
      } else if (soporte.origen === "gasto" && soporte.origen_id) {
        await downloadExpenseSoporte(proyecto.id, soporte.origen_id, soporte.id);
      } else if (soporte.url_externa) {
        window.open(soporte.url_externa, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      toast.error(errorMessage(error, "No pudimos abrir el soporte. Inténtalo de nuevo."));
    } finally {
      setAbriendo(null);
    }
  };

  const confirmarEliminar = async () => {
    if (!eliminando) return;
    try {
      await borrar.mutateAsync(eliminando.id);
      setEliminando(null);
      toast.success("Documento eliminado.");
    } catch (error) {
      toast.error(errorMessage(error, "No pudimos eliminar el documento. Inténtalo de nuevo."));
    }
  };

  const soportes = query.data ?? [];
  const cuenta = (origen: Origen) => soportes.filter((soporte) => soporte.origen === origen).length;
  const texto = busqueda.trim().toLowerCase();
  const visibles = soportes.filter(
    (soporte) =>
      (filtro === "TODOS" || soporte.origen === filtro) &&
      (texto === "" ||
        soporte.nombre.toLowerCase().includes(texto) ||
        (soporte.vinculo ?? "").toLowerCase().includes(texto)),
  );
  const delOrigen = (origen: Origen) => visibles.filter((soporte) => soporte.origen === origen);
  // The counts ignore the search: they say how many documents each origin has.
  const vacios = GRUPOS.filter((grupo) => (filtro === "TODOS" || grupo.origen === filtro) && cuenta(grupo.origen) === 0);
  const explicacion = explicacionVacios(vacios, puedeEscribir);

  const filtros: { valor: Filtro; etiqueta: string; cantidad: number }[] = [
    { valor: "TODOS", etiqueta: "Todos", cantidad: soportes.length },
    ...GRUPOS.map((grupo) => ({ valor: grupo.origen as Filtro, etiqueta: grupo.filtro, cantidad: cuenta(grupo.origen) })),
  ];

  return (
    <section data-testid="documentos" className="grid grid-cols-1 gap-x-4 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <h3 className="font-display text-[18px] font-bold tracking-[-0.01em] text-ink-950 sm:text-[19px]">
            Documentos del proyecto
          </h3>
          <HelpHint label="Qué documentos aparecen aquí" className="after:-inset-3">
            Aquí ves todos los soportes del proyecto. Cada uno se sube desde donde nace: el avance de un entregable, un
            gasto o una medición. Usa «Subir documento» solo para los del proyecto, como el convenio o el acta de inicio.
          </HelpHint>
        </div>
        <p className="mt-1 max-w-[70ch] text-[13.5px] text-ink-600">
          Los soportes de entregables, gastos, indicadores y del proyecto, en una sola lista.
        </p>
      </div>

      {/* One button: in the header from `sm`, a full-width bar fixed at the bottom on phones. */}
      {puedeEscribir && (
        <div
          data-testid="documentos-acciones"
          className="sticky bottom-0 z-10 order-last -mx-5 mt-4 border-t border-border bg-panel px-5 py-3 sm:static sm:order-none sm:col-start-2 sm:row-start-1 sm:mx-0 sm:mt-0 sm:self-start sm:border-0 sm:bg-transparent sm:p-0"
        >
          <Button type="button" className="w-full sm:w-auto" onClick={() => setSubiendo(true)}>
            <Upload className="size-3.5" strokeWidth={1.8} />
            Subir documento
          </Button>
        </div>
      )}

      <div className="min-w-0 sm:col-span-2">
        {query.isError ? (
          <InlineError className="mt-2" message={errorMessage(query.error, ERROR)} />
        ) : !query.data ? (
          <Skeleton data-testid="documentos-cargando" className="mt-2 h-24 w-full rounded-[14px]" />
        ) : soportes.length === 0 ? (
          <EmptyState
            bordered
            className="mt-2 min-h-0 py-6"
            title="Este proyecto todavía no tiene documentos."
            description="Los soportes aparecen aquí cuando se registran avances, gastos o mediciones."
            action={
              puedeEscribir ? (
                <Button type="button" onClick={() => setSubiendo(true)}>
                  <Upload className="size-3.5" strokeWidth={1.8} />
                  Subir documento
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="mt-3 flex flex-col gap-2 md:flex-row-reverse md:items-center md:justify-between">
              <label className="relative flex min-w-0 items-center md:w-64 md:flex-none">
                <Search aria-hidden className="pointer-events-none absolute left-3 size-3.5 text-ink-500" strokeWidth={2} />
                <Input
                  type="search"
                  aria-label="Buscar por nombre o código"
                  placeholder="Buscar por nombre o código"
                  value={busqueda}
                  onChange={(event) => setBusqueda(event.target.value)}
                  className="pl-8"
                />
              </label>
              <div className="relative min-w-0">
                {/* T11 D2: visible label, as in the prototype; it also names the chip group. */}
                <span
                  id={`${idFiltro}-etiqueta`}
                  className="mb-1.5 block text-[11.5px] font-semibold tracking-[0.06em] text-ink-600 uppercase"
                >
                  Filtrar por origen
                </span>
                <div
                  role="group"
                  aria-labelledby={`${idFiltro}-etiqueta`}
                  className="no-scrollbar flex gap-2 overflow-x-auto pr-6 md:flex-wrap md:overflow-visible md:pr-0"
                >
                  {filtros.map((f) => (
                    <FiltroChip key={f.valor} activo={filtro === f.valor} onClick={() => setFiltro(f.valor)}>
                      {`${f.etiqueta} · ${f.cantidad}`}
                    </FiltroChip>
                  ))}
                </div>
                {/* Hints at the filters out of view on phones. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 right-0 h-full w-6 bg-gradient-to-l from-panel to-transparent md:hidden"
                />
              </div>
            </div>

            <div data-testid="documentos-lista" className="mt-3 flex flex-col gap-4">
              {visibles.length === 0 && texto !== "" ? (
                <EmptyState
                  bordered
                  className="min-h-0 py-6"
                  title="No hay documentos con este filtro."
                  description={`Ningún documento coincide con «${busqueda.trim()}».`}
                  action={
                    <Button type="button" variant="outline" size="sm" onClick={() => setBusqueda("")}>
                      Limpiar búsqueda
                    </Button>
                  }
                />
              ) : visibles.length === 0 && !explicacion ? (
                <EmptyBlock>No hay documentos con este filtro.</EmptyBlock>
              ) : (
                GRUPOS.filter((grupo) => delOrigen(grupo.origen).length > 0).map((grupo) => (
                  <GrupoDocumentos
                    key={grupo.origen}
                    origen={grupo.origen}
                    titulo={`${grupo.titulo} · ${delOrigen(grupo.origen).length}`}
                    soportes={delOrigen(grupo.origen)}
                    abriendo={abriendo}
                    puedeEliminar={puedeEliminar}
                    onAbrir={(soporte) => void abrir(soporte)}
                    onEliminar={setEliminando}
                  />
                ))
              )}
              {explicacion && (
                <p
                  data-testid="documentos-vacios"
                  className="rounded-inner bg-muted px-4 py-3.5 text-[13.5px] leading-relaxed text-ink-700"
                >
                  <b className="font-semibold text-ink-900">{explicacion.cabeza}</b>{" "}
                  <ComoSeAgregan texto={explicacion.como} onVerIndicadores={onVerIndicadores} />
                </p>
              )}
            </div>
          </>
        )}
      </div>

      <SubirDocumentoDialog projectId={proyecto.id} open={subiendo} onOpenChange={setSubiendo} />

      <Dialog
        open={eliminando !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setEliminando(null);
        }}
      >
        <DialogContent className="sm:max-w-[min(440px,calc(100%-2rem))]">
          <DialogHeader>
            <DialogTitle>Eliminar documento</DialogTitle>
            <DialogDescription>
              «{eliminando?.nombre}» dejará de aparecer en la lista. El archivo queda en el almacenamiento.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEliminando(null)} disabled={borrar.isPending}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmarEliminar()}
              disabled={borrar.isPending}
            >
              {borrar.isPending ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/**
 * One origin: a compact table from `md` (Documento · De dónde viene · Subió · Abrir) and one card per document
 * below it. The same list in both widths, so every document is in the page once.
 */
function GrupoDocumentos({
  origen,
  titulo,
  soportes,
  abriendo,
  puedeEliminar,
  onAbrir,
  onEliminar,
}: {
  origen: Origen;
  titulo: string;
  soportes: ProjectSupport[];
  abriendo: string | null;
  puedeEliminar: (soporte: ProjectSupport) => boolean;
  onAbrir: (soporte: ProjectSupport) => void;
  onEliminar: (soporte: ProjectSupport) => void;
}) {
  const COLUMNAS = "md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,1fr)_auto] md:items-center md:gap-4";
  return (
    <section data-testid={`documentos-grupo-${origen}`}>
      <h4 className="text-[14.5px] font-bold text-ink-900">{titulo}</h4>
      {/* One bordered card per document on phones; a single white table from `md`, as in the prototype. */}
      <div className="mt-1.5 md:surface-tile md:overflow-hidden">
        <div
          aria-hidden="true"
          className={`hidden border-b border-border px-3 py-2 text-[10.5px] font-bold tracking-[0.08em] text-ink-500 uppercase ${COLUMNAS}`}
        >
          <span>Documento</span>
          <span>De dónde viene</span>
          <span>Subió</span>
          <span className="w-24" />
        </div>
        <ul className="flex flex-col gap-2 md:gap-0 md:divide-y md:divide-border">
          {soportes.map((soporte) => {
            const origenTexto = origenDe(soporte);
            const abrible = puedeAbrir(soporte);
            return (
              <li
                key={soporte.id}
                data-testid="documento-fila"
                className={`surface-tile flex flex-col gap-1.5 px-3 py-3 md:rounded-none md:border-0 md:bg-transparent ${COLUMNAS}`}
              >
                <span className="flex min-w-0 items-start gap-2 text-[13px] font-semibold break-words text-ink-900">
                  <FileText
                    data-testid="documento-icono"
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-ink-500"
                    strokeWidth={1.8}
                  />
                  <span className="min-w-0">{soporte.nombre}</span>
                </span>
                <span data-testid="documento-origen" className="min-w-0 text-[12.5px] break-words text-ink-700">
                  {origenTexto && (
                    <>
                      <span className="block font-medium text-ink-800">{origenTexto.principal}</span>
                      {origenTexto.detalle && <span className="block text-ink-500">{origenTexto.detalle}</span>}
                    </>
                  )}
                </span>
                {/* «Quién · día» in one line on phones; name, then the day below it from `md` (prototype). */}
                <span data-testid="documento-subio" className="min-w-0 text-[12.5px] text-ink-600">
                  {soporte.subido_por && (
                    <>
                      <span className="md:block md:text-ink-800">{soporte.subido_por}</span>
                      <span className="md:hidden"> · </span>
                    </>
                  )}
                  <span className="md:block">{fechaCorta(soporte.created_at)}</span>
                </span>
                <span className="mt-1 flex items-center gap-2 md:mt-0 md:justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Abrir ${soporte.nombre}`}
                    disabled={abriendo === soporte.id || !abrible}
                    title={abrible ? undefined : SIN_ARCHIVO}
                    onClick={() => onAbrir(soporte)}
                    className="h-11 flex-1 md:flex-none"
                  >
                    <ExternalLink className="size-3.5" strokeWidth={1.8} />
                    Abrir
                  </Button>
                  {puedeEliminar(soporte) && (
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={`Eliminar ${soporte.nombre}`}
                      onClick={() => onEliminar(soporte)}
                      className="size-11 shrink-0 text-destructivo hover:border-destructivo/40"
                    >
                      <Trash2 className="size-3.5" strokeWidth={1.8} />
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
