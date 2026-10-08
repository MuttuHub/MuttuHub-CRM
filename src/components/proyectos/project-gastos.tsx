// Sección "Gastos" de la ficha (S6 U6): lista de gastos con totales por estado, registro
// (gestores y COORDINADOR integrante, solo EN_EJECUCION), validación y soportes. El número de
// identificación del tercero y los soportes llegan SOLO si la API los envía (RNF-03): aquí se
// pintan si vienen y nunca se piden por otro camino. La API es la autoridad de cada permiso.

"use client";

import { useState } from "react";
import { Plus, Receipt } from "lucide-react";
import { ToneBadge } from "@/components/crm/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineError, VoidControl, errorMessage, plural } from "@/components/proyectos/estructura-ui";
import { GastoForm, TIPO_SOPORTE_LABELS } from "@/components/proyectos/gasto-form";
import { ValidacionControles } from "@/components/proyectos/gasto-acciones";
import { formatFechaCalendario } from "@/components/proyectos/project-display";
import { useCurrentUser } from "@/hooks/kanban";
import {
  downloadExpenseSoporte,
  useProjectBudget,
  useProjectExpenses,
  useProjectMembers,
  useVoidExpense,
  type ProjectExpense,
  type ProjectExpenseEstado,
  type ProjectListRow,
} from "@/hooks/projects";
import type { UiTone } from "@/lib/catalogs";
import { canManageProjects } from "@/lib/permissions";
import { formatCOP, toCents } from "@/lib/proyectos/money";

const GASTOS_ERROR = "No pudimos cargar los gastos. Inténtalo de nuevo.";

export const ESTADO_GASTO_META: Record<ProjectExpenseEstado, { label: string; tone: UiTone }> = {
  REGISTRADO: { label: "Registrado", tone: "info" },
  VALIDADO: { label: "Validado", tone: "exito" },
  RECHAZADO: { label: "Rechazado", tone: "destructivo" },
  ANULADO: { label: "Anulado", tone: "neutro" },
};

export function ProjectGastos({ proyecto }: { proyecto: ProjectListRow }) {
  const query = useProjectExpenses(proyecto.id);
  const budgetQuery = useProjectBudget(proyecto.id);
  const userQuery = useCurrentUser();
  const membersQuery = useProjectMembers(proyecto.id);
  const [registrando, setRegistrando] = useState(false);

  const usuario = userQuery.data;
  const esGestor = usuario ? canManageProjects({ id: usuario.id, rol: usuario.rol }) : false;
  const esMiembroCoordinador = Boolean(
    usuario &&
      usuario.rol === "COORDINADOR" &&
      (membersQuery.data ?? []).some((miembro) => miembro.usuario.id === usuario.id),
  );
  // Registrar: gestor o COORDINADOR integrante, y solo con el proyecto en ejecución.
  const puedeRegistrar = (esGestor || esMiembroCoordinador) && proyecto.estado === "EN_EJECUCION";

  const gastos = query.data?.gastos ?? [];
  const totales = query.data?.totales;

  return (
    <section data-testid="gastos">
      <h3 className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
        <Receipt className="size-3.5" strokeWidth={2} />
        Gastos
      </h3>

      {query.isError ? (
        <InlineError message={errorMessage(query.error, GASTOS_ERROR)} className="mt-2" />
      ) : !query.data ? (
        <Skeleton className="mt-2 h-16 w-full rounded-[14px]" />
      ) : (
        <>
          {totales && (
            <p className="mt-1.5 text-[12px] text-ink-600">
              {(Object.keys(ESTADO_GASTO_META) as ProjectExpenseEstado[])
                .filter((estado) => totales[estado]?.cantidad > 0)
                .map(
                  (estado) =>
                    `${ESTADO_GASTO_META[estado].label}: ${plural(totales[estado].cantidad, "gasto", "gastos")} · ${formatCOP(toCents(totales[estado].valor))}`,
                )
                .join("  |  ")}
            </p>
          )}

          {puedeRegistrar &&
            (registrando ? (
              <GastoForm
                proyecto={proyecto}
                rubros={budgetQuery.data?.rubros ?? []}
                onDone={() => setRegistrando(false)}
              />
            ) : (
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setRegistrando(true)}>
                <Plus className="size-3.5" />
                Registrar gasto
              </Button>
            ))}

          <div data-testid="gastos-lista" className="mt-2">
            {gastos.length === 0 ? (
              <p className="text-[12.5px] text-ink-500">Aún no hay gastos registrados.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {gastos.map((gasto) => (
                  <GastoFila
                    key={gasto.id}
                    proyectoId={proyecto.id}
                    gasto={gasto}
                    usuarioId={usuario?.id ?? null}
                    esGestor={esGestor}
                  />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function GastoFila({
  proyectoId,
  gasto,
  usuarioId,
  esGestor,
}: {
  proyectoId: string;
  gasto: ProjectExpense;
  usuarioId: string | null;
  esGestor: boolean;
}) {
  const anular = useVoidExpense();
  const [errorSoporte, setErrorSoporte] = useState<string | null>(null);
  const meta = ESTADO_GASTO_META[gasto.estado];
  const identificacion = [gasto.tercero_tipo_id, gasto.tercero_numero_id].filter(Boolean).join(" ");

  async function verSoporte(soporteId: string) {
    setErrorSoporte(null);
    try {
      await downloadExpenseSoporte(proyectoId, gasto.id, soporteId);
    } catch (error) {
      setErrorSoporte(errorMessage(error, "No pudimos abrir el soporte. Inténtalo de nuevo."));
    }
  }

  return (
    <li data-testid="gasto-fila" className="flex flex-col gap-1.5 rounded-[14px] border border-ink-200 bg-panel p-3">
      <div className="flex flex-wrap items-center gap-2">
        <ToneBadge tone={meta.tone} label={meta.label} />
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
        {gasto.descripcion}
      </p>
      <p className="text-[12px] text-ink-600">
        {[
          gasto.tercero_nombre,
          identificacion,
          `${TIPO_SOPORTE_LABELS[gasto.tipo_soporte]} ${gasto.numero_documento}`,
          formatFechaCalendario(gasto.fecha_documento),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {gasto.estado === "RECHAZADO" && gasto.motivo_rechazo && (
        <p className="text-[12px] text-destructivo">Rechazado: {gasto.motivo_rechazo}</p>
      )}
      {gasto.estado === "ANULADO" && gasto.motivo_anulacion && (
        <p className="text-[12px] text-ink-600">Anulado: {gasto.motivo_anulacion}</p>
      )}

      {(gasto.soportes ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(gasto.soportes ?? []).map((soporte) => (
            <Button
              key={soporte.id}
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Ver soporte ${soporte.nombre}`}
              onClick={() => void verSoporte(soporte.id)}
            >
              {soporte.nombre}
            </Button>
          ))}
        </div>
      )}
      <InlineError message={errorSoporte} />

      {esGestor && gasto.estado === "REGISTRADO" && (
        <ValidacionControles
          projectId={proyectoId}
          gastoId={gasto.id}
          propio={gasto.registrado_por_id === usuarioId}
          datosIncompletos={gasto.datos_incompletos}
        />
      )}
      {esGestor && gasto.estado === "VALIDADO" && (
        <VoidControl
          nombre={`gasto ${gasto.numero_documento}`}
          pending={anular.isPending}
          error={anular.isError ? errorMessage(anular.error, "No pudimos anular el gasto. Inténtalo de nuevo.") : null}
          onConfirm={(motivo) => anular.mutate({ projectId: proyectoId, id: gasto.id, motivo })}
        />
      )}
    </li>
  );
}
