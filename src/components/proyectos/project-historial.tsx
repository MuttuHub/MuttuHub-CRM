// Historial de cambios del proyecto (REQ-AUD-04), extraído de la ficha para que la pestaña Historial lo componga.

"use client";

import { useMemo } from "react";
import { History } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ACCION_AUDITORIA_META,
  etiquetaEntidadAuditoria,
  formatFechaHora,
} from "@/components/proyectos/project-display";
import { nombresDelProyecto, pasosLegibles, type CambioLegible, type PasoLegible } from "@/components/proyectos/historial-format";
import { EmptyBlock, SectionHeader } from "@/components/proyectos/ui";
import { useProjectAudit, type ProjectAuditEntry, type ProjectListRow } from "@/hooks/projects";

/**
 * Historial de cambios del proyecto (solo lectura). La consulta se monta con
 * la ficha ya cargada y tiene sus propios estados de carga/error/vacío, para
 * que un fallo del libro no tape el resto de la ficha. No expone ninguna
 * acción de escritura: el libro es append-only.
 */
export function ProjectHistorial({ proyecto }: { proyecto: ProjectListRow }) {
  const query = useProjectAudit(proyecto.id);
  const pasos = useMemo(
    () => pasosLegibles(query.data ?? [], nombresDelProyecto(proyecto)),
    [query.data, proyecto],
  );

  return (
    <section data-testid="historial">
      <SectionHeader icon={<History className="size-3.5" strokeWidth={2} />}>Historial</SectionHeader>

      {query.isError ? (
        <p role="alert" className="mt-1.5 text-[13px] text-destructivo">
          {query.error instanceof Error
            ? query.error.message
            : "No pudimos cargar el historial. Inténtalo de nuevo."}
        </p>
      ) : query.isLoading ? (
        <HistorialSkeleton />
      ) : pasos.length > 0 ? (
        <HistorialPasos pasos={pasos} />
      ) : (
        <EmptyBlock>Sin movimientos registrados.</EmptyBlock>
      )}
    </section>
  );
}

/**
 * Una operación = un paso. Las filas comparten `lote_id` (y el instante de la
 * transacción): la conversión de la oportunidad y la creación del proyecto se
 * leen juntas, que es justamente lo que el módulo promete.
 */
function HistorialPasos({ pasos }: { pasos: PasoLegible<ProjectAuditEntry>[] }) {
  return (
    <ol className="mt-2 flex flex-col gap-3">
      {pasos.map((paso) => (
        <li
          key={paso.key}
          data-testid="historial-paso"
          className="rounded-inner border border-border bg-panel p-3"
        >
          <time
            dateTime={paso.created_at}
            className="font-mono text-[11px] text-ink-500 tabular-nums"
          >
            {formatFechaHora(paso.created_at)}
          </time>
          <ul className="mt-2 flex flex-col gap-2.5">
            {paso.entradas.map(({ entry, cambio }) => (
              <HistorialEntrada key={entry.id} entry={entry} cambio={cambio} />
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function HistorialEntrada({ entry, cambio }: { entry: ProjectAuditEntry; cambio: CambioLegible }) {
  const { anterior, nuevo, campo } = cambio;

  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-ink-100 px-2 py-[2px] text-[10.5px] font-bold text-ink-700">
          {ACCION_AUDITORIA_META[entry.accion]}
        </span>
        <span className="text-[11px] font-semibold text-ink-600">
          {etiquetaEntidadAuditoria(entry.entidad)}
        </span>
        <span className="text-[11px] text-ink-500">
          · {entry.usuario_nombre ?? "Usuario no disponible"}
        </span>
      </div>
      <p className="text-[12.5px] leading-snug text-ink-800">
        {campo && <span className="font-semibold">{campo}: </span>}
        {anterior && <span className="text-ink-500 line-through">{anterior}</span>}
        {anterior && nuevo && <span className="text-ink-500"> → </span>}
        {nuevo && <span>{nuevo}</span>}
      </p>
    </li>
  );
}

function HistorialSkeleton() {
  return (
    <div className="mt-2 space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-[14px]" />
      ))}
    </div>
  );
}
