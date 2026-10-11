// Sección "Presupuesto" de la ficha (S5 U5): monto asignado (A) por rubro y
// programación mensual (P). Todos los que ven la ficha lo leen; solo quien
// gestiona proyectos (`canManageProjects`) y mientras el proyecto está en
// BORRADOR ve los controles de edición. Esa visibilidad es comodidad de
// interfaz: la autoridad es la API (403 / 409 INVALID_STATE).

"use client";

import { useState } from "react";
import { LoaderCircle, Wallet } from "lucide-react";
import { ToneBadge } from "@/components/crm/shared";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { InlineError, SectionHeader } from "@/components/proyectos/ui";
import {
  MONTO_INVALIDO,
  MoneyInput,
  montoToInput,
  parseMontoInput,
} from "@/components/proyectos/presupuesto-ui";
import { PresupuestoProgramacion } from "@/components/proyectos/presupuesto-programacion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/hooks/kanban";
import {
  useProjectBudget,
  useSetValorTotal,
  useUpdateBudget,
  type ProjectBudget,
  type ProjectListRow,
} from "@/hooks/projects";
import { canManageProjects } from "@/lib/permissions";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const BUDGET_ERROR = "No pudimos cargar el presupuesto. Inténtalo de nuevo.";

export function ProjectPresupuesto({ proyecto }: { proyecto: ProjectListRow }) {
  const usuario = useCurrentUser().data;
  const puedeGestionar = usuario ? canManageProjects({ id: usuario.id, rol: usuario.rol }) : false;
  const canEdit = puedeGestionar && proyecto.estado === "BORRADOR";
  const query = useProjectBudget(proyecto.id);

  return (
    <section data-testid="presupuesto">
      <SectionHeader icon={<Wallet className="size-3.5" strokeWidth={2} />}>Presupuesto</SectionHeader>

      {puedeGestionar && proyecto.estado !== "BORRADOR" && (
        <p className="mt-1.5 text-[12.5px] text-ink-500">
          El presupuesto y la programación solo se editan mientras el proyecto está en borrador.
        </p>
      )}

      {query.isError ? (
        <InlineError message={errorMessage(query.error, BUDGET_ERROR)} className="mt-1.5" />
      ) : query.isLoading || !query.data?.rubros ? (
        <Skeleton className="mt-2 h-24 w-full rounded-[14px]" />
      ) : (
        <PresupuestoEditor
          key={`${query.data.valor_total}|${query.data.rubros.map((r) => r.asignado).join("|")}`}
          proyectoId={proyecto.id}
          budget={query.data}
          canEdit={canEdit}
        />
      )}

      <PresupuestoProgramacion proyecto={proyecto} canEdit={canEdit} />
    </section>
  );
}

function PresupuestoEditor({
  proyectoId,
  budget,
  canEdit,
}: {
  proyectoId: string;
  budget: ProjectBudget;
  canEdit: boolean;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(budget.rubros.map((r) => [r.rubro_id, montoToInput(r.asignado)])),
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const guardar = useUpdateBudget(proyectoId);
  const igualar = useSetValorTotal(proyectoId);

  // Σ A en vivo: los borradores inválidos no suman (se avisan al guardar).
  const suma = budget.rubros.reduce((total, r) => {
    const valor = canEdit ? parseMontoInput(drafts[r.rubro_id] ?? "") : r.asignado;
    return valor === null ? total : total + toCents(valor);
  }, toCents("0"));
  const diferencia = budget.valor_total === null ? null : suma - toCents(budget.valor_total);
  const diferenciaGuardada = budget.diferencia === null ? null : toCents(budget.diferencia);

  function submit() {
    const rubros: { rubro_id: string; asignado: string }[] = [];
    for (const r of budget.rubros) {
      const asignado = parseMontoInput(drafts[r.rubro_id] ?? "");
      if (asignado === null) {
        setLocalError(`${MONTO_INVALIDO} (${r.codigo ?? r.nombre})`);
        return;
      }
      rubros.push({ rubro_id: r.rubro_id, asignado });
    }
    setLocalError(null);
    guardar.mutate({ rubros });
  }

  const errorPut = localError ?? (guardar.isError ? errorMessage(guardar.error, "No pudimos guardar el presupuesto.") : null);

  return (
    <div className="mt-2 flex flex-col gap-2.5">
      <div className="overflow-x-auto rounded-inner border border-border bg-panel">
        <Table data-testid="presupuesto-tabla" className="w-full text-[12.5px]">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Rubro</TableHead>
              <TableHead scope="col" numeric>Asignado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {budget.rubros.map((r) => (
              <TableRow key={r.rubro_id} data-testid="presupuesto-fila">
                <TableCell className="text-ink-800 whitespace-normal">
                  <span className="font-mono text-[11.5px] text-ink-500">{r.codigo ?? "—"}</span>{" "}
                  {r.nombre}
                  {r.heredado_pendiente && (
                    <div className="mt-1">
                      <ToneBadge tone="alerta" label="Rubro suspendido pendiente de reasignación" />
                    </div>
                  )}
                </TableCell>
                <TableCell numeric>
                  {canEdit ? (
                    <MoneyInput
                      label={`Asignado ${r.codigo ?? r.nombre}`}
                      value={drafts[r.rubro_id] ?? ""}
                      onChange={(value) => setDrafts((prev) => ({ ...prev, [r.rubro_id]: value }))}
                    />
                  ) : (
                    formatCOP(toCents(r.asignado))
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <dl data-testid="presupuesto-resumen" className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-3">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[12px] text-ink-500">Σ asignado</dt>
          <dd className="font-semibold text-ink-900 tabular-nums">{formatCOP(suma)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[12px] text-ink-500">Valor total</dt>
          <dd className="font-semibold text-ink-900 tabular-nums">
            {budget.valor_total === null ? "Sin definir" : formatCOP(toCents(budget.valor_total))}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[12px] text-ink-500">Diferencia</dt>
          <dd className="font-semibold text-ink-900 tabular-nums">
            {diferencia === null ? "—" : formatCOP(diferencia)}
          </dd>
        </div>
      </dl>

      {canEdit && budget.valor_total === null && (
        <p className="text-[12.5px] text-ink-500">El valor total se fijará con la suma al guardar el presupuesto.</p>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" disabled={guardar.isPending} onClick={submit}>
            {guardar.isPending && <LoaderCircle className="size-4 animate-spin" />}
            Guardar presupuesto
          </Button>
          {diferenciaGuardada !== null && diferenciaGuardada !== toCents("0") && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={igualar.isPending}
              onClick={() => igualar.mutate(budget.suma)}
            >
              {igualar.isPending && <LoaderCircle className="size-4 animate-spin" />}
              Igualar valor total a Σ A
            </Button>
          )}
        </div>
      )}
      <InlineError message={errorPut} />
      <InlineError message={igualar.isError ? errorMessage(igualar.error, "No pudimos actualizar el valor total.") : null} />
    </div>
  );
}
