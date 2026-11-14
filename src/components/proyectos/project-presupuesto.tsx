// Sección "Presupuesto" de la ficha (S5 U5, T11): una línea por actividad + rubro, el asignado de cada rubro
// como suma de sus líneas, el valor total como suma de todas (S2: no se digita) y la programación mensual (P). Todos los que ven la ficha lo leen; solo quien
// pertenece al equipo del proyecto (`useEjecucionPermisos`) y mientras el proyecto está en
// BORRADOR ve los controles de edición. Esa visibilidad es comodidad de
// interfaz: la autoridad es la API (403 / 409 INVALID_STATE). Fuera de BORRADOR (rediseño T3) la tabla suma, por
// rubro, lo ejecutado y lo disponible (asignado − ejecutado), leídos de la misma lista de gastos que usa
// Finanzas › Gastos. AJ-08: todo gasto que cuenta ya es ejecutado, así que no hay columna «Por validar».

"use client";

import { Fragment, useState } from "react";
import { LoaderCircle, Wallet } from "lucide-react";
import { ToneBadge } from "@/components/crm/shared";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { InlineError, SectionHeader } from "@/components/proyectos/ui";
import { MONTO_INVALIDO, montoToInput, parseMontoInput } from "@/components/proyectos/presupuesto-ui";
import { MontoInput, PresupuestoProgramacion } from "@/components/proyectos/presupuesto-programacion";
import { Button } from "@/components/ui/button";
import { HelpHint } from "@/components/ui/help-hint";
import { AYUDA_DISPONIBLE } from "@/components/proyectos/ficha/finanzas/gastos-comun";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useProjectActivities,
  useProjectBudget,
  useProjectExpenses,
  useUpdateBudget,
  type ProjectBudget,
  type ProjectBudgetLinea,
  type ProjectExpense,
  type ProjectListRow,
} from "@/hooks/projects";
import { useEjecucionPermisos } from "@/components/proyectos/project-ejecucion";
import { cuentaComoEjecutado } from "@/lib/proyectos/gastos";
import { formatCOP, fromCents as fromCentsString, toCents, type Cents } from "@/lib/proyectos/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const BUDGET_ERROR = "No pudimos cargar el presupuesto. Inténtalo de nuevo.";

export function ProjectPresupuesto({ proyecto }: { proyecto: ProjectListRow }) {
  // S5 (PO matrix 2026-10-19): the budget belongs to the project's team.
  const { canWrite: puedeGestionar } = useEjecucionPermisos(proyecto.id);
  const canEdit = puedeGestionar && proyecto.estado === "BORRADOR";
  const query = useProjectBudget(proyecto.id);
  // Outside BORRADOR the budget also shows execution; a draft has no expenses, so it does not read them.
  const enBorrador = proyecto.estado === "BORRADOR";
  const gastosQuery = useProjectExpenses(enBorrador ? "" : proyecto.id);
  const ejecucion = enBorrador || !gastosQuery.data?.gastos ? null : ejecucionPorRubro(gastosQuery.data.gastos);

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
          key={(query.data.lineas ?? []).map((l) => `${l.linea_id}:${l.valor}`).join("|")}
          proyectoId={proyecto.id}
          budget={query.data}
          canEdit={canEdit}
          ejecucion={ejecucion}
        />
      )}

      <PresupuestoProgramacion proyecto={proyecto} canEdit={canEdit} />
    </section>
  );
}

type Ejecucion = Map<string, { ejecutado: Cents }>;

/** Executed totals per rubro, from the project expenses: REGISTRADO already counts (AJ-08). */
function ejecucionPorRubro(gastos: readonly ProjectExpense[]): Ejecucion {
  const mapa: Ejecucion = new Map();
  for (const g of gastos) {
    if (!cuentaComoEjecutado(g.estado)) continue;
    const actual = mapa.get(g.rubro.id) ?? { ejecutado: BigInt(0) };
    actual.ejecutado += toCents(g.valor);
    mapa.set(g.rubro.id, actual);
  }
  return mapa;
}

type LineaEditable = Omit<ProjectBudgetLinea, "linea_id" | "valor"> & { clave: string; draft: string };

const claveLinea = (actividadId: string | null, rubroId: string) => `${actividadId ?? ""}|${rubroId}`;
/** How a line is named in labels and messages: activity code (or «sin actividad») and rubro code. */
const nombreLinea = (l: Pick<LineaEditable, "actividad_codigo" | "rubro_codigo" | "rubro_nombre">) =>
  `${l.actividad_codigo ?? "sin actividad"} ${l.rubro_codigo ?? l.rubro_nombre}`;

/** Activity code as numbers (1.2 before 1.10); legacy lines without an activity last. */
function compararLineas(a: LineaEditable, b: LineaEditable): number {
  if ((a.actividad_codigo === null) !== (b.actividad_codigo === null)) return a.actividad_codigo === null ? 1 : -1;
  return (a.actividad_codigo ?? "").localeCompare(b.actividad_codigo ?? "", "es", { numeric: true });
}

const SELECT =
  "h-8 rounded-[8px] border border-border bg-input-bg px-2 text-[12.5px] text-ink-800 focus:outline-none focus:ring-2 focus:ring-primary/30";

function PresupuestoEditor({
  proyectoId,
  budget,
  canEdit,
  ejecucion,
}: {
  proyectoId: string;
  budget: ProjectBudget;
  canEdit: boolean;
  /** Execution per rubro outside BORRADOR; null while it loads or in a draft. */
  ejecucion: Ejecucion | null;
}) {
  const [lineas, setLineas] = useState<LineaEditable[]>(() =>
    (budget.lineas ?? []).map((l) => ({
      actividad_id: l.actividad_id,
      actividad_codigo: l.actividad_codigo,
      actividad_nombre: l.actividad_nombre,
      rubro_id: l.rubro_id,
      rubro_codigo: l.rubro_codigo,
      rubro_nombre: l.rubro_nombre,
      clave: claveLinea(l.actividad_id, l.rubro_id),
      draft: montoToInput(l.valor),
    })),
  );
  const [nueva, setNueva] = useState({ actividadId: "", rubroId: "", valor: "" });
  const [localError, setLocalError] = useState<string | null>(null);
  const guardar = useUpdateBudget(proyectoId);
  const actividades = useProjectActivities(canEdit ? proyectoId : "");
  const rubrosActivos = budget.rubros.filter((r) => r.activo);

  // S2: el asignado de cada rubro y el valor total son sumas de las líneas, en vivo. Un borrador
  // inválido no suma (se avisa al guardar).
  const centsDe = (l: LineaEditable) => {
    const valor = parseMontoInput(l.draft);
    return valor === null ? toCents("0") : toCents(valor);
  };
  const porRubro = new Map<string, Cents>();
  for (const l of lineas) porRubro.set(l.rubro_id, (porRubro.get(l.rubro_id) ?? toCents("0")) + centsDe(l));
  const suma = lineas.reduce((total, l) => total + centsDe(l), toCents("0"));
  const filasRubro = budget.rubros.map((r) => ({ ...r, asignado: fromCentsString(porRubro.get(r.rubro_id) ?? toCents("0")) }));

  function agregar() {
    const actividad = actividades.data?.find((a) => a.id === nueva.actividadId);
    const rubro = rubrosActivos.find((r) => r.rubro_id === nueva.rubroId);
    if (!actividad || !rubro) {
      setLocalError("Elige la actividad y el rubro de la nueva línea.");
      return;
    }
    if (parseMontoInput(nueva.valor) === null) {
      setLocalError(MONTO_INVALIDO);
      return;
    }
    const clave = claveLinea(actividad.id, rubro.rubro_id);
    const linea: LineaEditable = {
      clave,
      actividad_id: actividad.id,
      actividad_codigo: actividad.codigo,
      actividad_nombre: actividad.nombre,
      rubro_id: rubro.rubro_id,
      rubro_codigo: rubro.codigo,
      rubro_nombre: rubro.nombre,
      draft: nueva.valor,
    };
    // S5: «no se repite la misma combinación actividad + rubro».
    if (lineas.some((l) => l.clave === clave)) {
      setLocalError(`La línea ${nombreLinea(linea)} ya está en el presupuesto: cambia su valor.`);
      return;
    }
    setLocalError(null);
    setLineas((prev) => [...prev, linea]);
    setNueva({ actividadId: "", rubroId: "", valor: "" });
  }

  function submit() {
    const cuerpo: { actividad_id: string | null; rubro_id: string; valor: string }[] = [];
    for (const l of lineas) {
      const valor = parseMontoInput(l.draft);
      if (valor === null) {
        setLocalError(`${MONTO_INVALIDO} (${nombreLinea(l)})`);
        return;
      }
      cuerpo.push({ actividad_id: l.actividad_id, rubro_id: l.rubro_id, valor });
    }
    setLocalError(null);
    guardar.mutate({ lineas: cuerpo });
  }

  const errorPut = localError ?? (guardar.isError ? errorMessage(guardar.error, "No pudimos guardar el presupuesto.") : null);
  const ordenadas = [...lineas].sort(compararLineas);

  return (
    <div className="mt-2 flex flex-col gap-2.5">
      <div className="overflow-x-auto rounded-inner border border-border bg-panel">
        <Table data-testid="presupuesto-lineas" className="w-full text-[12.5px]">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Rubro</TableHead>
              <TableHead scope="col" numeric>Valor</TableHead>
              {canEdit && <TableHead scope="col"><span className="sr-only">Acciones</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordenadas.map((l, i) => {
              const grupo = l.actividad_codigo === null ? "Sin actividad" : `${l.actividad_codigo} · ${l.actividad_nombre}`;
              const previo = ordenadas[i - 1];
              const abreGrupo = !previo || previo.actividad_id !== l.actividad_id;
              return (
                <Fragment key={l.clave}>
                  {abreGrupo && (
                    <TableRow>
                      <TableCell colSpan={canEdit ? 3 : 2} className="bg-ink-50 font-semibold text-ink-800">
                        {grupo}
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow data-testid="presupuesto-linea">
                    <TableCell className="text-ink-800 whitespace-normal">
                      <span className="font-mono text-[11.5px] text-ink-500">{l.rubro_codigo ?? "—"}</span> {l.rubro_nombre}
                    </TableCell>
                    <TableCell numeric>
                      {canEdit ? (
                        <MontoInput
                          label={`Valor ${nombreLinea(l)}`}
                          value={l.draft}
                          onChange={(value) =>
                            setLineas((prev) => prev.map((x) => (x.clave === l.clave ? { ...x, draft: value } : x)))
                          }
                        />
                      ) : (
                        formatCOP(centsDe(l))
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Quitar línea ${nombreLinea(l)}`}
                          onClick={() => setLineas((prev) => prev.filter((x) => x.clave !== l.clave))}
                        >
                          Quitar
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                </Fragment>
              );
            })}
            {ordenadas.length === 0 && (
              <TableRow>
                <TableCell colSpan={canEdit ? 3 : 2} className="text-ink-500">
                  El presupuesto todavía no tiene líneas.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {canEdit && (
        <div data-testid="presupuesto-nueva-linea" className="flex flex-wrap items-end gap-2">
          <select
            aria-label="Actividad de la nueva línea"
            className={SELECT}
            value={nueva.actividadId}
            onChange={(e) => setNueva((prev) => ({ ...prev, actividadId: e.target.value }))}
          >
            <option value="">Actividad…</option>
            {(actividades.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>{`${a.codigo} ${a.nombre}`}</option>
            ))}
          </select>
          <select
            aria-label="Rubro de la nueva línea"
            className={SELECT}
            value={nueva.rubroId}
            onChange={(e) => setNueva((prev) => ({ ...prev, rubroId: e.target.value }))}
          >
            <option value="">Rubro…</option>
            {rubrosActivos.map((r) => (
              <option key={r.rubro_id} value={r.rubro_id}>{`${r.codigo ?? ""} ${r.nombre}`.trim()}</option>
            ))}
          </select>
          <MontoInput
            label="Valor de la nueva línea"
            value={nueva.valor}
            onChange={(value) => setNueva((prev) => ({ ...prev, valor: value }))}
          />
          <Button type="button" size="sm" variant="outline" onClick={agregar}>
            Agregar línea
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-inner border border-border bg-panel">
        <Table data-testid="presupuesto-tabla" className="w-full text-[12.5px]">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Rubro</TableHead>
              <TableHead scope="col" numeric>Asignado</TableHead>
              {ejecucion && (
                <>
                  <TableHead scope="col" numeric>Ejecutado</TableHead>
                  <TableHead scope="col" numeric>
                    <span className="inline-flex items-center gap-1">
                      Disponible
                      <HelpHint label="Disponible del rubro">{AYUDA_DISPONIBLE}</HelpHint>
                    </span>
                  </TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filasRubro.map((r) => (
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
                <TableCell numeric>{formatCOP(toCents(r.asignado))}</TableCell>
                {ejecucion && <CeldasEjecucion asignado={r.asignado} fila={ejecucion.get(r.rubro_id)} />}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <dl data-testid="presupuesto-resumen" className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[12px] text-ink-500">Total asignado</dt>
          <dd className="font-semibold text-ink-900 tabular-nums">{formatCOP(suma)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[12px] text-ink-500">Valor total</dt>
          <dd className="font-semibold text-ink-900 tabular-nums">
            {formatCOP(suma)}
            <span className="ml-1.5 text-[11.5px] font-normal text-ink-500">Se calcula sumando las líneas</span>
          </dd>
        </div>
      </dl>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" disabled={guardar.isPending} onClick={submit}>
            {guardar.isPending && <LoaderCircle className="size-4 animate-spin" />}
            Guardar presupuesto
          </Button>
        </div>
      )}
      <InlineError message={errorPut} />
    </div>
  );
}

function CeldasEjecucion({
  asignado,
  fila,
}: {
  asignado: string;
  fila: { ejecutado: Cents } | undefined;
}) {
  const ejecutado = fila?.ejecutado ?? BigInt(0);
  const disponible = toCents(asignado) - ejecutado;
  return (
    <>
      <TableCell numeric>{formatCOP(ejecutado)}</TableCell>
      <TableCell numeric className={disponible < BigInt(0) ? "font-semibold text-destructivo" : undefined}>
        {formatCOP(disponible)}
      </TableCell>
    </>
  );
}
