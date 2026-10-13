// "Soportes" tab of the ficha (v7). Read-only list of every live soporte of the project, whatever its origin
// (avance, indicator measurement, expense). The list comes from `GET /projects/:id/supports` (metadata only);
// opening one goes through the signed-URL download route of its origin, so each issuance stays audited.
// Expense supports only appear for actors allowed to see financial supports (the API filters them).

"use client";

import { useState } from "react";
import { ExternalLink, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { formatFechaCalendario } from "@/components/proyectos/project-display";
import { EmptyBlock, InlineError, SectionHeader } from "@/components/proyectos/ui";
import {
  downloadAvanceSoporte,
  downloadExpenseSoporte,
  useProjectSupports,
  type ProjectSupport,
} from "@/hooks/projects";

const ERROR = "No pudimos cargar los soportes. Inténtalo de nuevo.";

const ORIGEN_LABEL: Record<ProjectSupport["origen"], string> = {
  avance: "Avance",
  indicador: "Indicador",
  gasto: "Gasto",
  proyecto: "Proyecto",
};

/** Short format badge: the extension of the file, "Drive" for links. */
export function formatoSoporte(soporte: Pick<ProjectSupport, "tipo" | "nombre" | "url_externa">): string {
  if (soporte.tipo === "enlace") return soporte.url_externa?.includes("drive.google") ? "Drive" : "Enlace";
  const ext = soporte.nombre.split(".").pop();
  return ext && ext.length <= 5 && ext !== soporte.nombre ? ext.toUpperCase() : "Archivo";
}

export function ProjectSoportes({ proyectoId }: { proyectoId: string }) {
  const query = useProjectSupports(proyectoId);
  const [abriendo, setAbriendo] = useState<string | null>(null);

  const abrir = async (soporte: ProjectSupport) => {
    setAbriendo(soporte.id);
    try {
      if (soporte.origen === "avance" && soporte.origen_id) {
        await downloadAvanceSoporte(proyectoId, soporte.origen_id, soporte.id);
      } else if (soporte.origen === "gasto" && soporte.origen_id) {
        await downloadExpenseSoporte(proyectoId, soporte.origen_id, soporte.id);
      } else if (soporte.url_externa) {
        window.open(soporte.url_externa, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      toast.error(errorMessage(error, "No pudimos abrir el soporte. Inténtalo de nuevo."));
    } finally {
      setAbriendo(null);
    }
  };

  return (
    <section data-testid="soportes">
      <SectionHeader icon={<Paperclip className="size-3.5" strokeWidth={2} />}>Soportes</SectionHeader>
      <p className="mt-1 text-[12.5px] text-ink-500">
        Documentos y enlaces que validan los entregables, los indicadores y los gastos. Se agregan al registrar el avance,
        la medición o el gasto.
      </p>

      {query.isError ? (
        <InlineError className="mt-2" message={errorMessage(query.error, ERROR)} />
      ) : !query.data ? (
        <Skeleton className="mt-2 h-24 w-full rounded-[14px]" />
      ) : query.data.length === 0 ? (
        <EmptyBlock>Este proyecto todavía no tiene soportes.</EmptyBlock>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {query.data.map((soporte) => (
            <li
              key={soporte.id}
              data-testid="soporte-fila"
              className="surface-inner flex flex-wrap items-center gap-3 p-3"
            >
              <span className="rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-bold text-ink-700">
                {formatoSoporte(soporte)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-ink-900">{soporte.nombre}</span>
                <span className="block truncate text-[12px] text-ink-500">
                  {[
                    soporte.vinculo ?? ORIGEN_LABEL[soporte.origen],
                    soporte.subido_por,
                    formatFechaCalendario(soporte.created_at),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={abriendo === soporte.id || (soporte.origen === "indicador" && !soporte.url_externa)}
                onClick={() => void abrir(soporte)}
              >
                <ExternalLink className="size-3.5" strokeWidth={1.8} />
                Abrir
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
