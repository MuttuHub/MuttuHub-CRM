// Cronograma del proyecto (S14 P4, enriquecido en P6): vista de solo lectura de
// las actividades agrupadas por objetivo, con la tabla del diseño v6 (días,
// % plan, % real, soporte). Todo el estado técnico llega del servidor
// (`GET /projects/:id/technical-status`): el cliente pinta el semáforo, nunca lo
// recalcula (D11). No expone ningún control de escritura.

"use client";

import { CalendarDays } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SemaforoChip } from "@/components/proyectos/semaforo-chip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { EmptyBlock, InlineError, SectionHeader } from "@/components/proyectos/ui";
import {
  useProjectTechnicalStatus,
  type ProjectListRow,
  type ProjectTechnicalActivityV6,
} from "@/hooks/projects";

const LOAD_ERROR = "No pudimos cargar el cronograma. Inténtalo de nuevo.";

/** 0..100 con un decimal, con el mismo separador decimal que el resto de la app. */
function formatPct(value: number): string {
  return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(value)} %`;
}

export type ObjetivoGrupo = { codigo: string; actividades: ProjectTechnicalActivityV6[] };

/**
 * Agrupa las actividades por el objetivo al que pertenecen, en el orden en que
 * el servidor las envía (semana de inicio y código): es puro y estable para que
 * la vista agrupada sea predecible.
 */
export function agruparPorObjetivo(
  actividades: readonly ProjectTechnicalActivityV6[],
): ObjetivoGrupo[] {
  const grupos: ObjetivoGrupo[] = [];
  for (const actividad of actividades) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.codigo === actividad.objetivo_codigo) ultimo.actividades.push(actividad);
    else grupos.push({ codigo: actividad.objetivo_codigo, actividades: [actividad] });
  }
  return grupos;
}

export function ProjectCronograma({ proyecto }: { proyecto: ProjectListRow }) {
  const query = useProjectTechnicalStatus(proyecto.id);

  return (
    <section data-testid="cronograma">
      <SectionHeader icon={<CalendarDays className="size-3.5" strokeWidth={2} />}>
        Cronograma
      </SectionHeader>

      {query.isError ? (
        <InlineError message={errorMessage(query.error, LOAD_ERROR)} className="mt-1.5" />
      ) : !query.data ? (
        <div className="mt-2 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-[14px]" />
          ))}
        </div>
      ) : query.data.actividades.length === 0 ? (
        <EmptyBlock>Este proyecto todavía no tiene actividades.</EmptyBlock>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-inner border border-border bg-panel">
          <Table data-testid="cronograma-tabla" className="w-full text-[12.5px]">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Actividad</TableHead>
                <TableHead scope="col" numeric>Días</TableHead>
                <TableHead scope="col" numeric>% plan</TableHead>
                <TableHead scope="col" numeric>% real</TableHead>
                <TableHead scope="col">Semáforo</TableHead>
                <TableHead scope="col">Soporte</TableHead>
              </TableRow>
            </TableHeader>
            {agruparPorObjetivo(query.data.actividades).map((grupo) => (
              <TableBody key={grupo.codigo} data-testid={`cronograma-objetivo-${grupo.codigo}`}>
                <TableRow className="bg-ink-100/60">
                  <TableCell colSpan={6} className="text-[12px] font-semibold text-ink-600">
                    Objetivo {grupo.codigo}
                  </TableCell>
                </TableRow>
                {grupo.actividades.map((actividad) => (
                  <TableRow key={actividad.id} data-testid="cronograma-actividad">
                    <TableCell className="whitespace-normal text-ink-800">
                      <span className="font-mono text-[11.5px] text-ink-500">{actividad.codigo}</span>{" "}
                      {actividad.nombre}
                    </TableCell>
                    <TableCell numeric>{actividad.dias}</TableCell>
                    <TableCell numeric>{formatPct(actividad.programado)}</TableCell>
                    <TableCell numeric>{formatPct(actividad.progreso)}</TableCell>
                    <TableCell>
                      <SemaforoChip color={actividad.color} />
                    </TableCell>
                    <TableCell>{actividad.sin_soporte ? "Sin soporte" : "Con soporte"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            ))}
          </Table>
        </div>
      )}
    </section>
  );
}
