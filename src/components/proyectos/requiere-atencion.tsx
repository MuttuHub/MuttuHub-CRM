// Tarjeta "Requiere atención" del Resumen de la ficha (S14 P5). De solo lectura: la lista, el texto
// (título y detalle) y los tipos los deriva el servidor (`GET /projects/:id/attention`); aquí solo se
// pintan y el cliente NUNCA recalcula un semáforo (D11). Un proyecto BORRADOR no se pide al servidor
// (nunca es medible), igual que las tarjetas KPI del Resumen.

"use client";

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { EmptyBlock, InlineError, SectionHeader } from "@/components/proyectos/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { useProjectAttention, type AtencionTipo, type ProjectListRow } from "@/hooks/projects";
import type { UiTone } from "@/lib/catalogs";

export const ATENCION_ERROR = "No pudimos cargar lo que requiere atención. Inténtalo de nuevo.";
const ATENCION_VACIO = "Sin novedades por ahora.";

/** Tono visual por tipo; el servidor decide el tipo, el cliente solo el color del chip. */
const TONE: Record<AtencionTipo, UiTone> = {
  alerta_retraso: "alerta",
  rubro_sobreejecucion: "riesgo",
  actividad_atrasada: "alerta",
  avance_sin_soporte: "info",
  indicador_bajo_meta: "alerta",
  gasto_observado: "info",
};

export function RequiereAtencion({ proyecto }: { proyecto: Pick<ProjectListRow, "id" | "estado"> }) {
  return (
    <section data-testid="requiere-atencion" aria-label="Requiere atención" className="flex flex-col gap-2.5">
      <SectionHeader icon={<AlertTriangle className="size-3.5" strokeWidth={2} />}>Requiere atención</SectionHeader>
      {/* Un BORRADOR nunca es medible: no se pide al servidor (igual que el encabezado y los KPIs). */}
      {proyecto.estado === "BORRADOR" ? <Vacio /> : <RequiereAtencionContenido proyectoId={proyecto.id} />}
    </section>
  );
}

function RequiereAtencionContenido({ proyectoId }: { proyectoId: string }) {
  const query = useProjectAttention(proyectoId);

  if (query.isError) return <InlineError message={ATENCION_ERROR} />;
  if (!query.data) return <Cargando />;
  if (query.data.medible === false || query.data.items.length === 0) return <Vacio />;

  return (
    <ul className="surface-inner divide-y divide-ink-200 p-4" data-testid="requiere-atencion-lista">
      {query.data.items.map((item, index) => (
        <li
          key={`${item.tipo}-${item.rubro_id ?? item.actividad_id ?? item.avance_id ?? item.indicador_id ?? item.gasto_id ?? index}`}
          data-testid={`atencion-${item.tipo}`}
          className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0"
        >
          <StatusChip tone={TONE[item.tipo]}>{item.titulo}</StatusChip>
          <p className="text-[13px] leading-relaxed text-ink-700">{item.detalle}</p>
        </li>
      ))}
    </ul>
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

function Vacio(): ReactNode {
  return <EmptyBlock>{ATENCION_VACIO}</EmptyBlock>;
}
