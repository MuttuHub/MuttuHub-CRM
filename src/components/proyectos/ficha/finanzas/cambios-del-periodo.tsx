// T7 (S2, AJ-08 «Propuesto»): «en la ficha financiera, un resumen de cambios del periodo (gastos editados y anulados)
// con acceso al detalle y los motivos, para que el Gerente pueda revisarlos sin entrar a la operación diaria».
// Only for project authority (ADMINISTRADOR + GERENCIA, the API's own 403 set): any other role sees nothing and the
// request is never sent. The period is the month the change was made in Bogotá, the current one by default.

"use client";

import { useState } from "react";
import { usePermisosGastos } from "@/components/proyectos/ficha/finanzas/gastos-comun";
import { etiquetaCampoAuditoria, formatFechaHora, mesLegible } from "@/components/proyectos/project-display";
import { EmptyBlock, InlineError, SELECT_CLASS } from "@/components/proyectos/ui";
import { useProjectExpenseChanges, type CambioGasto, type ProjectListRow } from "@/hooks/projects";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import { periodOf, projectPeriods, todayInBogota } from "@/lib/proyectos/weeks";

const CAMPOS_MONETARIOS = new Set(["valor", "subtotal", "iva"]);

function periodosDe(inicio: string | null, fin: string | null): string[] {
  if (!inicio || !fin) return [];
  try {
    return projectPeriods(inicio, fin);
  } catch {
    return [];
  }
}

function valorLegible(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (CAMPOS_MONETARIOS.has(campo) && typeof valor === "string") {
    try {
      return formatCOP(toCents(valor));
    } catch {
      return valor;
    }
  }
  return typeof valor === "string" ? valor : JSON.stringify(valor);
}

function resumen(cambios: readonly CambioGasto[], periodo: string): string {
  const editados = cambios.filter((cambio) => cambio.accion === "EDITAR").length;
  const anulados = cambios.length - editados;
  const partes = [
    ...(editados > 0 ? [`${editados} ${editados === 1 ? "gasto editado" : "gastos editados"}`] : []),
    ...(anulados > 0 ? [`${anulados} ${anulados === 1 ? "anulado" : "anulados"}`] : []),
  ];
  return `${partes.join(" y ")} en ${mesLegible(periodo)}.`;
}

function Cambio({ cambio }: { cambio: CambioGasto }) {
  const [abierto, setAbierto] = useState(false);
  const documento = cambio.gasto ? `${cambio.gasto.numero_documento} · ${cambio.gasto.tercero_nombre}` : "Gasto";
  const detalleId = `cambio-${cambio.id}`;
  return (
    <li className="flex min-w-0 flex-col gap-1 rounded-inner border border-border px-3.5 py-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px]">
        <span className="font-semibold text-ink-900">{cambio.accion === "ANULAR" ? "Anulado" : "Corregido"}</span>
        <span className="min-w-0 break-words text-ink-800">{documento}</span>
        <span className="text-[12.5px] text-ink-600">
          {formatFechaHora(cambio.fecha)}
          {cambio.usuario_nombre ? ` · ${cambio.usuario_nombre}` : ""}
        </span>
      </div>
      <p className="text-[13px] text-ink-700">Motivo: {cambio.motivo ?? "sin motivo (lo corrigió quien lo registró)"}</p>
      {cambio.detalle.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={abierto}
            aria-controls={detalleId}
            className="self-start text-[12.5px] font-medium text-primary underline underline-offset-2"
            onClick={() => setAbierto((valor) => !valor)}
          >
            {abierto ? "Ocultar detalle" : `Ver detalle (${cambio.detalle.length})`}
          </button>
          {abierto && (
            <ul
              id={detalleId}
              aria-label={`Detalle del cambio ${cambio.gasto?.numero_documento ?? ""}`.trim()}
              className="flex flex-col gap-0.5 text-[12.5px] text-ink-700"
            >
              {cambio.detalle.map((fila) => (
                <li key={fila.campo} className="break-words">
                  {etiquetaCampoAuditoria(fila.campo)}: {valorLegible(fila.campo, fila.antes)} →{" "}
                  {valorLegible(fila.campo, fila.despues)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}

export function CambiosDelPeriodo({ proyecto }: { proyecto: ProjectListRow }) {
  // «para que el Gerente pueda revisarlos»: the section and its endpoint are managers-only, even now that a team
  // member is the project's Gestor for correcting and annulling (AJ-08 + D3).
  const { esManager: esGestor } = usePermisosGastos(proyecto);
  const actual = periodOf(todayInBogota());
  const periodos = periodosDe(proyecto.fecha_inicio, proyecto.fecha_fin);
  // Changes keep happening after the project's last month (late corrections), so the current month is always offered.
  const opciones = periodos.includes(actual) ? periodos : [...periodos, actual].sort();
  const [periodo, setPeriodo] = useState(actual);
  const query = useProjectExpenseChanges(proyecto.id, periodo, esGestor);

  if (!esGestor) return null;
  const cambios = query.data ?? [];

  return (
    <section aria-labelledby="finanzas-cambios-periodo" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="finanzas-cambios-periodo" className="font-display text-[15px] font-bold text-ink-950">
          Cambios del periodo
        </h3>
        <label className="flex items-center gap-1.5 text-[12px] text-ink-600">
          Periodo
          <select
            aria-label="Periodo"
            value={periodo}
            onChange={(event) => setPeriodo(event.target.value)}
            className={SELECT_CLASS}
          >
            {opciones.map((opcion) => (
              <option key={opcion} value={opcion}>
                {mesLegible(opcion)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {query.isError ? (
        <InlineError message="No pudimos cargar los cambios del periodo. Inténtalo de nuevo." />
      ) : query.isPending ? (
        <p className="text-[13px] text-ink-600">Cargando cambios…</p>
      ) : cambios.length === 0 ? (
        <EmptyBlock>Ningún gasto se editó ni se anuló en {mesLegible(periodo)}.</EmptyBlock>
      ) : (
        <>
          <p className="text-[13px] text-ink-700">{resumen(cambios, periodo)}</p>
          <ul aria-label="Gastos editados y anulados" className="flex flex-col gap-2">
            {cambios.map((cambio) => (
              <Cambio key={cambio.id} cambio={cambio} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
