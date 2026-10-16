// Pestaña "Documentos" de la ficha (carril X, UX-1): una sola lista con todos los soportes del proyecto,
// agrupada por origen (Actividades, Indicadores, Gastos y Proyecto), con filtro por origen y buscador por
// nombre. Usa `soportes-format.ts` para el formato: la lista sale de
// `GET /projects/:id/supports` y abrir un soporte pasa por la URL firmada de su origen (la API audita
// cada emisión). Los soportes de gasto solo llegan si la API los deja ver (RNF-03).

"use client";

import { useState } from "react";
import { ExternalLink, Paperclip, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { formatFechaHora } from "@/components/proyectos/project-display";
import { formatoSoporte } from "@/components/proyectos/soportes-format";
import { EmptyBlock, InlineError, SectionHeader } from "@/components/proyectos/ui";
import {
  downloadAvanceSoporte,
  downloadExpenseSoporte,
  useProjectSupports,
  type ProjectListRow,
  type ProjectSupport,
} from "@/hooks/projects";

const ERROR = "No pudimos cargar los documentos. Inténtalo de nuevo.";

const GRUPOS: readonly { origen: ProjectSupport["origen"]; titulo: string }[] = [
  { origen: "avance", titulo: "Actividades" },
  { origen: "indicador", titulo: "Indicadores" },
  { origen: "gasto", titulo: "Gastos" },
  { origen: "proyecto", titulo: "Proyecto" },
];

/** Hay algo que abrir: el archivo de un avance o gasto (por su origen) o un enlace externo. */
function puedeAbrir(soporte: ProjectSupport): boolean {
  const viaOrigen = (soporte.origen === "avance" || soporte.origen === "gasto") && Boolean(soporte.origen_id);
  return viaOrigen || Boolean(soporte.url_externa);
}

type Filtro = "TODOS" | ProjectSupport["origen"];

export function FichaDocumentos({ proyecto }: { proyecto: ProjectListRow }) {
  const query = useProjectSupports(proyecto.id);
  const [filtro, setFiltro] = useState<Filtro>("TODOS");
  const [busqueda, setBusqueda] = useState("");
  const [abriendo, setAbriendo] = useState<string | null>(null);

  const abrir = async (soporte: ProjectSupport) => {
    setAbriendo(soporte.id);
    try {
      if (soporte.origen === "avance" && soporte.origen_id) {
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

  const soportes = query.data ?? [];
  const texto = busqueda.trim().toLowerCase();
  const visibles = soportes.filter(
    (soporte) =>
      (filtro === "TODOS" || soporte.origen === filtro) &&
      (texto === "" || soporte.nombre.toLowerCase().includes(texto)),
  );
  const delOrigen = (origen: ProjectSupport["origen"]) => visibles.filter((soporte) => soporte.origen === origen);

  const filtros: { valor: Filtro; etiqueta: string }[] = [
    { valor: "TODOS", etiqueta: "Todos" },
    ...GRUPOS.map((grupo) => ({ valor: grupo.origen as Filtro, etiqueta: grupo.titulo })),
  ];

  return (
    <section data-testid="documentos">
      <SectionHeader icon={<Paperclip className="size-3.5" strokeWidth={2} />}>Documentos</SectionHeader>
      <p className="mt-1 text-[12.5px] text-ink-500">
        Todos los soportes del proyecto en una sola lista: los de las actividades y los indicadores, los de los
        gastos y los del proyecto.
      </p>

      {query.isError ? (
        <InlineError className="mt-2" message={errorMessage(query.error, ERROR)} />
      ) : !query.data ? (
        <Skeleton data-testid="documentos-cargando" className="mt-2 h-24 w-full rounded-[14px]" />
      ) : soportes.length === 0 ? (
        <EmptyBlock>Este proyecto todavía no tiene documentos.</EmptyBlock>
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div role="group" aria-label="Filtrar documentos" className="flex flex-wrap gap-2">
              {filtros.map((f) => (
                <Button
                  key={f.valor}
                  type="button"
                  size="sm"
                  variant={filtro === f.valor ? "default" : "outline"}
                  aria-pressed={filtro === f.valor}
                  className="rounded-full"
                  onClick={() => setFiltro(f.valor)}
                >
                  {f.etiqueta}
                </Button>
              ))}
            </div>
            <label className="relative flex min-w-0 flex-1 items-center sm:max-w-60">
              <Search aria-hidden className="pointer-events-none absolute left-3 size-3.5 text-ink-500" strokeWidth={2} />
              <Input
                type="search"
                aria-label="Buscar por nombre"
                placeholder="Buscar por nombre"
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
                className="pl-8"
              />
            </label>
          </div>

          <div data-testid="documentos-lista" className="mt-3 flex flex-col gap-4">
            {visibles.length === 0 ? (
              <EmptyBlock>No hay documentos con este filtro.</EmptyBlock>
            ) : (
              GRUPOS.filter((grupo) => delOrigen(grupo.origen).length > 0).map((grupo) => (
                <section key={grupo.origen} data-testid={`documentos-grupo-${grupo.origen}`}>
                  <SectionHeader as="h4">{grupo.titulo}</SectionHeader>
                  <ul className="mt-1.5 flex flex-col gap-2">
                    {delOrigen(grupo.origen).map((soporte) => (
                      <li
                        key={soporte.id}
                        data-testid="documento-fila"
                        className="surface-inner flex flex-wrap items-center gap-3 p-3"
                      >
                        <span className="rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-bold text-ink-700">
                          {formatoSoporte(soporte)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-ink-900">{soporte.nombre}</span>
                          <span className="block truncate text-[12px] text-ink-500">
                            {[soporte.vinculo, soporte.subido_por, formatFechaHora(soporte.created_at)]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={abriendo === soporte.id || !puedeAbrir(soporte)}
                          title={puedeAbrir(soporte) ? undefined : "Este documento no tiene archivo ni enlace para abrir."}
                          onClick={() => void abrir(soporte)}
                        >
                          <ExternalLink className="size-3.5" strokeWidth={1.8} />
                          Abrir
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}
