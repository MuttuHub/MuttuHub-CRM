// Programación mensual (P) de la sección "Presupuesto" (S5 U5): una columna por
// mes del proyecto y una fila por línea del presupuesto (actividad + rubro, T11 S8). "Falta por programar" (A − celdas) es
// informativo mientras se edita; T13 (S7): el Gestor confirma la programación cuando queda en $ 0 en todas las líneas, y
// la línea base exige esa confirmación. T13 (S4): en ejecución la grilla es de solo lectura y el Gestor mueve valores
// entre meses de una misma línea, sin aprobación (`MoverValor`).

"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, LoaderCircle } from "lucide-react";
import { ToneBadge } from "@/components/crm/shared";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { mesLegible } from "@/components/proyectos/project-display";
import { useEjecucionPermisos } from "@/components/proyectos/project-ejecucion";
import { MontoInput, MoverValor, nombreLinea } from "@/components/proyectos/ficha/seguimiento/mover-valor";
import { InlineError } from "@/components/proyectos/ui";
import { MONTO_INVALIDO, montoToInput, parseMontoInput } from "@/components/proyectos/presupuesto-ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useConfirmProgramming,
  useProjectProgramming,
  useUpdateProgramming,
  type ProjectListRow,
  type ProjectProgramming,
} from "@/hooks/projects";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// The amount field moved with «Mover valor» (shared with the seguimiento view, V9); re-exported for its other users.
export { MontoInput };

const PROGRAMMING_ERROR = "No pudimos cargar la programación. Inténtalo de nuevo.";

export function PresupuestoProgramacion({ proyecto, canEdit }: { proyecto: ProjectListRow; canEdit: boolean }) {
  const query = useProjectProgramming(proyecto.id);
  // T13 (S4): who may edit the project's data moves values while it runs (the same gate as the API).
  const enEjecucion = proyecto.estado === "EN_EJECUCION";
  const { canWrite } = useEjecucionPermisos(enEjecucion ? proyecto.id : "");
  const puedeMover = enEjecucion && canWrite;

  return (
    <div data-testid="programacion" className="mt-4">
      <h4 className="text-[11px] font-semibold tracking-[0.06em] text-ink-500 uppercase">Programación mensual</h4>
      {query.isError ? (
        <InlineError message={errorMessage(query.error, PROGRAMMING_ERROR)} className="mt-1.5" />
      ) : query.isLoading || !query.data?.periodos ? (
        <Skeleton className="mt-2 h-20 w-full rounded-[14px]" />
      ) : (
        <ProgramacionGrid
          key={query.data.filas.map((f) => `${f.linea_id}${f.periodo}${f.valor}`).join("|") + query.data.control_por_linea.map((c) => `${c.linea_id}:${c.asignado}`).join("|")}
          proyectoId={proyecto.id}
          data={query.data}
          canEdit={canEdit}
        />
      )}
      {puedeMover && query.data?.periodos && query.data.control_por_linea.length > 0 && (
        <MoverValor proyectoId={proyecto.id} data={query.data} />
      )}
    </div>
  );
}

const cellKey = (lineaId: string, periodo: string) => `${lineaId}|${periodo}`;

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
        .map((f) => [cellKey(f.linea_id, f.periodo), montoToInput(f.valor)]),
    ),
  );
  const [localError, setLocalError] = useState<string | null>(null);
  // T13 (S7): activity groups that collapse; all open at first. Collapsing never drops a typed value.
  const [plegados, setPlegados] = useState<ReadonlySet<string>>(() => new Set());
  const guardar = useUpdateProgramming(proyectoId);
  const confirmar = useConfirmProgramming(proyectoId);
  const ZERO = toCents("0");

  if (data.control_por_linea.length === 0) {
    return <p className="mt-1.5 text-[13px] text-ink-500">Asigna un monto a algún rubro para poder programarlo.</p>;
  }

  const celda = (lineaId: string, periodo: string) => drafts[cellKey(lineaId, periodo)] ?? "";
  const valorCelda = (lineaId: string, periodo: string) => parseMontoInput(celda(lineaId, periodo));
  const fueraDeRango = data.filas.filter((f) => !data.periodos.includes(f.periodo)).length;

  const sumaFila = (lineaId: string) =>
    data.periodos.reduce((total, periodo) => {
      const valor = valorCelda(lineaId, periodo);
      return valor === null ? total : total + toCents(valor);
    }, ZERO);
  const pendiente = !data.control_por_linea.some((c) => sumaFila(c.linea_id) > ZERO);

  // T13 (S7): what is confirmed is what is saved, so an unsaved edit or a line still pending blocks the button.
  const guardado = (lineaId: string, periodo: string) =>
    toCents(data.filas.find((f) => f.linea_id === lineaId && f.periodo === periodo)?.valor ?? "0");
  const sinGuardar = data.control_por_linea.some((c) =>
    data.periodos.some((periodo) => {
      const valor = valorCelda(c.linea_id, periodo);
      return valor === null || toCents(valor) !== guardado(c.linea_id, periodo);
    }),
  );
  const completa = !data.programacion_pendiente && data.control_por_linea.every((c) => toCents(c.control) === ZERO);
  const confirmada = data.programacion_confirmada !== null;

  // T13 (S7): «… con arriba los totales por rubro y por mes»; computed from what is typed, so they move as you edit.
  const montoCelda = (lineaId: string, periodo: string) => {
    const valor = valorCelda(lineaId, periodo);
    return valor === null ? ZERO : toCents(valor);
  };
  const totalRubroMes = (rubroId: string, periodo: string) =>
    data.control_por_linea
      .filter((c) => c.rubro_id === rubroId)
      .reduce((total, c) => total + montoCelda(c.linea_id, periodo), ZERO);
  const totalMes = (periodo: string) =>
    data.control_por_linea.reduce((total, c) => total + montoCelda(c.linea_id, periodo), ZERO);
  const sumar = (valores: bigint[]) => valores.reduce((total, valor) => total + valor, ZERO);

  // Lines grouped by activity, in the order the server sends them (activity, then rubro); legacy lines last.
  const grupos: { clave: string; titulo: string; lineas: ProjectProgramming["control_por_linea"] }[] = [];
  for (const c of data.control_por_linea) {
    const clave = c.actividad?.id ?? "sin-actividad";
    const grupo = grupos.find((g) => g.clave === clave);
    if (grupo) grupo.lineas.push(c);
    else grupos.push({ clave, titulo: c.actividad ? `${c.actividad.codigo} ${c.actividad.nombre}` : "Sin actividad", lineas: [c] });
  }
  const alternar = (clave: string) =>
    setPlegados((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });

  function submit() {
    const filas: { linea_id: string; periodo: string; valor: string }[] = [];
    for (const c of data.control_por_linea) {
      for (const periodo of data.periodos) {
        const valor = valorCelda(c.linea_id, periodo);
        if (valor === null) {
          setLocalError(`${MONTO_INVALIDO} (${nombreLinea(c)} ${mesLegible(periodo)})`);
          return;
        }
        if (toCents(valor) > ZERO) filas.push({ linea_id: c.linea_id, periodo, valor });
      }
    }
    setLocalError(null);
    guardar.mutate({ filas });
  }

  const error =
    localError ??
    (guardar.isError ? errorMessage(guardar.error, "No pudimos guardar la programación.") : null) ??
    (confirmar.isError ? errorMessage(confirmar.error, "No pudimos confirmar la programación.") : null);

  return (
    <div className="mt-2 flex flex-col gap-2.5">
      {pendiente && <ToneBadge tone="alerta" label="Programación pendiente" className="self-start" />}
      {confirmada && <ToneBadge tone="exito" label="Programación confirmada" className="self-start" />}

      <div className="overflow-x-auto rounded-inner border border-border bg-panel">
        <Table data-testid="programacion-totales" className="w-full text-[12.5px]">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Rubro</TableHead>
              {data.periodos.map((periodo) => (
                <TableHead key={periodo} scope="col" numeric>{mesLegible(periodo)}</TableHead>
              ))}
              <TableHead scope="col" numeric>Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.control_por_rubro.map((r) => (
              <TableRow key={r.rubro_id}>
                <TableCell className="text-ink-800 whitespace-normal">
                  <span className="font-mono text-[11.5px] text-ink-500">{r.codigo ?? "—"}</span> {r.nombre}
                </TableCell>
                {data.periodos.map((periodo) => (
                  <TableCell key={periodo} numeric>{formatCOP(totalRubroMes(r.rubro_id, periodo))}</TableCell>
                ))}
                <TableCell numeric className="font-semibold">
                  {formatCOP(sumar(data.periodos.map((periodo) => totalRubroMes(r.rubro_id, periodo))))}
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-semibold text-ink-900">Total</TableCell>
              {data.periodos.map((periodo) => (
                <TableCell key={periodo} numeric className="font-semibold">{formatCOP(totalMes(periodo))}</TableCell>
              ))}
              <TableCell numeric className="font-semibold">{formatCOP(sumar(data.periodos.map(totalMes)))}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div className="overflow-x-auto rounded-inner border border-border bg-panel">
        <Table data-testid="programacion-grid" className="w-full text-[12.5px]">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Actividad</TableHead>
              <TableHead scope="col">Rubro</TableHead>
              {data.periodos.map((periodo) => (
                <TableHead key={periodo} scope="col" numeric>{mesLegible(periodo)}</TableHead>
              ))}
              <TableHead scope="col" numeric>Falta por programar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grupos.flatMap((grupo) => {
              const abierto = !plegados.has(grupo.clave);
              const cabecera = (
                <TableRow key={`grupo-${grupo.clave}`} data-testid="programacion-grupo" className="bg-muted/40">
                  <TableCell colSpan={data.periodos.length + 3}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-expanded={abierto}
                      onClick={() => alternar(grupo.clave)}
                      className="px-1.5 font-semibold text-ink-800"
                    >
                      {abierto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      {grupo.titulo}
                    </Button>
                  </TableCell>
                </TableRow>
              );
              return [cabecera, ...(abierto ? grupo.lineas : []).map((c) => {
              // What is still to program: assigned minus programmed (negative when over-programmed).
              const faltante = toCents(c.asignado) - sumaFila(c.linea_id);
              return (
                <TableRow key={c.linea_id} data-testid="programacion-fila">
                  <TableCell className="text-ink-800 whitespace-normal">
                    {c.actividad ? (
                      <>
                        <span className="font-mono text-[11.5px] text-ink-500">{c.actividad.codigo}</span> {c.actividad.nombre}
                      </>
                    ) : (
                      <span className="text-ink-500">Sin actividad</span>
                    )}
                  </TableCell>
                  <TableCell className="text-ink-800 whitespace-normal">
                    <span className="font-mono text-[11.5px] text-ink-500">{c.codigo ?? "—"}</span> {c.nombre}
                  </TableCell>
                  {data.periodos.map((periodo) => (
                    <TableCell key={periodo} numeric>
                      {canEdit ? (
                        <MontoInput
                          label={`Programado ${nombreLinea(c)} ${mesLegible(periodo)}`}
                          value={celda(c.linea_id, periodo)}
                          onChange={(value) => setDrafts((prev) => ({ ...prev, [cellKey(c.linea_id, periodo)]: value }))}
                        />
                      ) : (
                        formatCOP(toCents(valorCelda(c.linea_id, periodo) ?? "0"))
                      )}
                    </TableCell>
                  ))}
                  <TableCell numeric className="font-semibold">{formatCOP(faltante)}</TableCell>
                </TableRow>
              );
              })];
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-[12px] text-ink-500">
        Falta por programar es lo asignado a la línea que aún no está repartido en meses (negativo si se programó de más).
        Confirma la programación cuando «Falta por programar» quede en $ 0 en todas las líneas; después se aprueba la línea
        base. Cualquier cambio posterior pide confirmarla otra vez.
      </p>
      {fueraDeRango > 0 && (
        <p className="text-[12.5px] text-ink-600">
          {fueraDeRango === 1 ? "1 celda queda fuera" : `${fueraDeRango} celdas quedan fuera`} del rango del proyecto
          {canEdit ? " y se eliminará al guardar." : "."}
        </p>
      )}

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={guardar.isPending} onClick={submit}>
            {guardar.isPending && <LoaderCircle className="size-4 animate-spin" />}
            Guardar programación
          </Button>
          {!confirmada && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!completa || sinGuardar || confirmar.isPending}
              onClick={() => confirmar.mutate()}
            >
              {confirmar.isPending && <LoaderCircle className="size-4 animate-spin" />}
              Confirmar programación
            </Button>
          )}
        </div>
      )}
      <InlineError message={error} />
    </div>
  );
}
