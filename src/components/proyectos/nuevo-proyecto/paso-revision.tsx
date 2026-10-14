// Step 5 "Revisión" of the new-project stepper: a read-only summary of what exists for the project plus the
// two ways out. Everything captured in steps 1-4 is already persisted (each editor saves through its own
// endpoint), so "Guardar borrador" only opens the ficha. "Aprobar línea base" is the existing control of the
// ficha header, untouched: it decides by itself who sees it (`canApproveBaseline`, BORRADOR only), asks for
// confirmation and lists, inline, the pending preconditions the API returns on a 409. This step never
// re-implements those validations; it only counts what exists and points out a budget that does not add up.

"use client";

import Link from "next/link";
import { CircleCheckBig } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { FieldValue } from "@/components/crm/shared";
import { BaselineApproval } from "@/components/proyectos/baseline-approval";
import { formatFechaCalendario } from "@/components/proyectos/project-display";
import { SectionHeader } from "@/components/proyectos/ui";
import {
  useProjectActivities,
  useProjectBudget,
  useProjectDeliverables,
  useProjectIndicators,
  useProjectObjectives,
  type ProjectListRow,
} from "@/hooks/projects";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import { cn } from "@/lib/utils";

type Conteo = { data: readonly unknown[] | undefined; isError: boolean };

/** A count for the summary: the number, a placeholder while it loads, or a short message when it failed. */
function textoConteo(consulta: Conteo): string {
  if (consulta.isError) return "No se pudo cargar";
  return consulta.data ? String(consulta.data.length) : "…";
}

export function PasoRevision({ proyecto }: { proyecto: ProjectListRow }) {
  const objetivos = useProjectObjectives(proyecto.id);
  const actividades = useProjectActivities(proyecto.id);
  const entregables = useProjectDeliverables(proyecto.id);
  const indicadores = useProjectIndicators(proyecto.id);
  const presupuesto = useProjectBudget(proyecto.id);
  const esBorrador = proyecto.estado === "BORRADOR";

  return (
    <div className="flex flex-col gap-6" data-testid="paso-revision">
      <section className="flex flex-col gap-3">
        <SectionHeader>Resumen</SectionHeader>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
          <FieldValue label="Proyecto" value={`${proyecto.codigo} · ${proyecto.nombre}`} />
          <FieldValue label="Cliente" value={proyecto.cliente.nombre} />
          <FieldValue label="Responsable" value={proyecto.responsable?.nombre ?? "Sin asignar"} />
          <FieldValue
            label="Fechas"
            value={`${formatFechaCalendario(proyecto.fecha_inicio)} → ${formatFechaCalendario(proyecto.fecha_fin)}`}
            mono
          />
          <FieldValue label="Objetivos" value={textoConteo(objetivos)} mono />
          <FieldValue label="Indicadores" value={textoConteo(indicadores)} mono />
          <FieldValue label="Actividades" value={textoConteo(actividades)} mono />
          <FieldValue label="Entregables" value={textoConteo(entregables)} mono />
          <FieldValue label="Presupuesto" value={<ResumenPresupuesto consulta={presupuesto} />} mono />
        </dl>
        <AvisoDiferencia diferencia={presupuesto.data?.diferencia ?? null} />
      </section>

      {esBorrador ? (
        <section className="flex flex-col gap-3 border-t border-ink-200 pt-5">
          <p className="text-[13px] text-ink-600">
            Todo lo que capturaste ya está guardado en el borrador. Puedes dejarlo así y seguir después, o aprobar la
            línea base: la estructura y el presupuesto quedan congelados y el proyecto pasa a En ejecución.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <BaselineApproval proyecto={proyecto} />
            <Link
              href={`/proyectos/${proyecto.id}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Guardar borrador
            </Link>
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-3 border-t border-ink-200 pt-5">
          <div
            role="status"
            className="flex items-start gap-2 rounded-12 border border-ink-200 bg-ink-050 px-4 py-3 text-[13px] text-ink-800"
          >
            <CircleCheckBig className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <p>Línea base aprobada. El proyecto ya está en seguimiento.</p>
          </div>
          <div>
            <Link href={`/proyectos/${proyecto.id}`} className={buttonVariants({ variant: "default" })}>
              Abrir proyecto
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

function ResumenPresupuesto({ consulta }: { consulta: ReturnType<typeof useProjectBudget> }) {
  if (consulta.isError) return <>No se pudo cargar</>;
  const budget = consulta.data;
  if (!budget) return <>…</>;
  const rubros = budget.rubros.filter((rubro) => toCents(rubro.asignado) > BigInt(0)).length;
  const suma = formatCOP(toCents(budget.suma));
  const detalle = rubros === 1 ? "1 rubro" : `${rubros} rubros`;
  return (
    <>
      {budget.valor_total === null
        ? `${suma} (sin valor total) · ${detalle}`
        : `${suma} de ${formatCOP(toCents(budget.valor_total))} · ${detalle}`}
    </>
  );
}

/** Informational only: the approval flow owns the real validation and reports it as preconditions. */
function AvisoDiferencia({ diferencia }: { diferencia: string | null }) {
  if (diferencia === null) return null;
  const cents = toCents(diferencia);
  if (cents === BigInt(0)) return null;
  const absoluta = cents < BigInt(0) ? -cents : cents;
  return (
    <p className="rounded-12 border border-ink-200 bg-ink-050 px-3 py-2 text-[12.5px] text-ink-700">
      {`La suma de los rubros difiere del valor total en ${formatCOP(absoluta)}. Ajusta el presupuesto antes de aprobar la línea base.`}
    </p>
  );
}
