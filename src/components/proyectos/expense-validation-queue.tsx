// Cola de validación de gastos entre proyectos (S6 U6, E-22). Se monta solo para gestores
// (ADM/GER) encima de la tabla del listado. Sin gastos pendientes no pinta nada: no ocupa
// espacio ni anuncia "no hay nada". Sus filas propias no tienen controles (segregación de
// funciones) y los gastos con datos incompletos no se pueden validar todavía.

"use client";

import { ToneBadge } from "@/components/crm/shared";
import { ValidacionControles } from "@/components/proyectos/gasto-acciones";
import { formatFechaCalendario } from "@/components/proyectos/project-display";
import { useExpenseValidationQueue } from "@/hooks/projects";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import { SectionHeader } from "@/components/proyectos/ui";

export function ExpenseValidationQueue() {
  const query = useExpenseValidationQueue();
  const gastos = query.data?.gastos ?? [];
  if (query.isError || gastos.length === 0) return null;

  return (
    <section
      data-testid="cola-validacion"
      aria-label="Gastos por validar"
      className="rounded-[22px] border border-ink-200 bg-panel p-4 lg:p-5"
    >
      <SectionHeader as="h2">Gastos por validar · {gastos.length}</SectionHeader>
      <ul className="mt-2 flex flex-col gap-2">
        {gastos.map((gasto) => (
          <li
            key={gasto.id}
            data-testid="cola-fila"
            className="flex flex-col gap-1.5 rounded-[14px] border border-ink-200 p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[12px] font-semibold text-ink-600 tabular-nums">
                {gasto.proyecto_codigo}
              </span>
              {gasto.alerta_sobregasto && <ToneBadge tone="destructivo" label="Supera el asignado" />}
              {gasto.datos_incompletos && <ToneBadge tone="alerta" label="Datos incompletos" />}
              <span className="ml-auto font-mono text-[13px] font-semibold text-ink-900 tabular-nums">
                {formatCOP(toCents(gasto.valor))}
              </span>
            </div>
            <p className="text-[13px] text-ink-900">
              <span className="font-semibold">
                {gasto.rubro.codigo ? `${gasto.rubro.codigo} · ${gasto.rubro.nombre}` : gasto.rubro.nombre}
              </span>
              {" — "}
              {gasto.tercero_nombre}
            </p>
            <p className="text-[12px] text-ink-600">
              {[
                gasto.descripcion,
                `Documento ${gasto.numero_documento}`,
                formatFechaCalendario(gasto.fecha_documento),
                gasto.registrado_por_nombre ? `Registró ${gasto.registrado_por_nombre}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <ValidacionControles
              projectId={gasto.proyecto_id}
              gastoId={gasto.id}
              propio={gasto.propio}
              datosIncompletos={gasto.datos_incompletos}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
