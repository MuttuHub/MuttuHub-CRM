// Programación mensual (P) de la sección "Presupuesto" (S5 U5): una columna por
// mes del proyecto y una fila por rubro con línea. El control (Σ celdas − A) es
// informativo en borrador; la línea base lo exigirá en $ 0.

"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { ToneBadge } from "@/components/crm/shared";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { InlineError } from "@/components/proyectos/ui";
import {
  MONTO_INVALIDO,
  MoneyInput,
  montoToInput,
  parseMontoInput,
} from "@/components/proyectos/presupuesto-ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectProgramming, useUpdateProgramming, type ProjectListRow, type ProjectProgramming } from "@/hooks/projects";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PROGRAMMING_ERROR = "No pudimos cargar la programación. Inténtalo de nuevo.";

export function PresupuestoProgramacion({ proyecto, canEdit }: { proyecto: ProjectListRow; canEdit: boolean }) {
  const query = useProjectProgramming(proyecto.id);

  return (
    <div data-testid="programacion" className="mt-4">
      <h4 className="text-[11px] font-semibold tracking-[0.06em] text-ink-500 uppercase">Programación mensual</h4>
      {query.isError ? (
        <InlineError message={errorMessage(query.error, PROGRAMMING_ERROR)} className="mt-1.5" />
      ) : query.isLoading || !query.data?.periodos ? (
        <Skeleton className="mt-2 h-20 w-full rounded-[14px]" />
      ) : (
        <ProgramacionGrid
          key={query.data.filas.map((f) => `${f.rubro_id}${f.periodo}${f.valor}`).join("|") + query.data.control_por_rubro.map((c) => c.asignado).join("|")}
          proyectoId={proyecto.id}
          data={query.data}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}

const cellKey = (rubroId: string, periodo: string) => `${rubroId}|${periodo}`;

function ProgramacionGrid({
  proyectoId,
  data,
  canEdit,
}: {
  proyectoId: string;
  data: ProjectProgramming;
  canEdit: boolean;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      data.filas
        .filter((f) => data.periodos.includes(f.periodo))
        .map((f) => [cellKey(f.rubro_id, f.periodo), montoToInput(f.valor)]),
    ),
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const guardar = useUpdateProgramming(proyectoId);
  const ZERO = toCents("0");

  if (data.control_por_rubro.length === 0) {
    return <p className="mt-1.5 text-[13px] text-ink-500">Asigna un monto a algún rubro para poder programarlo.</p>;
  }

  const celda = (rubroId: string, periodo: string) => drafts[cellKey(rubroId, periodo)] ?? "";
  const valorCelda = (rubroId: string, periodo: string) => parseMontoInput(celda(rubroId, periodo));
  const fueraDeRango = data.filas.filter((f) => !data.periodos.includes(f.periodo)).length;

  const sumaFila = (rubroId: string) =>
    data.periodos.reduce((total, periodo) => {
      const valor = valorCelda(rubroId, periodo);
      return valor === null ? total : total + toCents(valor);
    }, ZERO);
  const pendiente = !data.control_por_rubro.some((c) => sumaFila(c.rubro_id) > ZERO);

  function submit() {
    const filas: { rubro_id: string; periodo: string; valor: string }[] = [];
    for (const c of data.control_por_rubro) {
      for (const periodo of data.periodos) {
        const valor = valorCelda(c.rubro_id, periodo);
        if (valor === null) {
          setLocalError(`${MONTO_INVALIDO} (${c.codigo ?? c.nombre} ${periodo})`);
          return;
        }
        if (toCents(valor) > ZERO) filas.push({ rubro_id: c.rubro_id, periodo, valor });
      }
    }
    setLocalError(null);
    guardar.mutate({ filas });
  }

  const error = localError ?? (guardar.isError ? errorMessage(guardar.error, "No pudimos guardar la programación.") : null);

  return (
    <div className="mt-2 flex flex-col gap-2.5">
      {pendiente && <ToneBadge tone="alerta" label="Programación pendiente" className="self-start" />}

      <div className="overflow-x-auto rounded-inner border border-border bg-panel">
        <Table data-testid="programacion-grid" className="w-full text-[12.5px]">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Rubro</TableHead>
              {data.periodos.map((periodo) => (
                <TableHead key={periodo} scope="col" numeric>{periodo}</TableHead>
              ))}
              <TableHead scope="col" numeric>Control</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.control_por_rubro.map((c) => {
              const control = sumaFila(c.rubro_id) - toCents(c.asignado);
              return (
                <TableRow key={c.rubro_id} data-testid="programacion-fila">
                  <TableCell className="text-ink-800 whitespace-normal">
                    <span className="font-mono text-[11.5px] text-ink-500">{c.codigo ?? "—"}</span> {c.nombre}
                  </TableCell>
                  {data.periodos.map((periodo) => (
                    <TableCell key={periodo} numeric>
                      {canEdit ? (
                        <MoneyInput
                          label={`Programado ${c.codigo ?? c.nombre} ${periodo}`}
                          value={celda(c.rubro_id, periodo)}
                          onChange={(value) => setDrafts((prev) => ({ ...prev, [cellKey(c.rubro_id, periodo)]: value }))}
                        />
                      ) : (
                        formatCOP(toCents(valorCelda(c.rubro_id, periodo) ?? "0"))
                      )}
                    </TableCell>
                  ))}
                  <TableCell numeric className="font-semibold">{formatCOP(control)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-[12px] text-ink-500">
        El control (Σ programación − asignado) es informativo en borrador; deberá ser $ 0 para aprobar la línea base.
      </p>
      {fueraDeRango > 0 && (
        <p className="text-[12.5px] text-ink-600">
          {fueraDeRango === 1 ? "1 celda queda fuera" : `${fueraDeRango} celdas quedan fuera`} del rango del proyecto
          {canEdit ? " y se eliminará al guardar." : "."}
        </p>
      )}

      {canEdit && (
        <div>
          <Button type="button" size="sm" disabled={guardar.isPending} onClick={submit}>
            {guardar.isPending && <LoaderCircle className="size-4 animate-spin" />}
            Guardar programación
          </Button>
        </div>
      )}
      <InlineError message={error} />
    </div>
  );
}
