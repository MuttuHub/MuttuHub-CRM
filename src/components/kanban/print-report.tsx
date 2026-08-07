// Reporte imprimible de tareas (PRD §5.4): página fuera del shell (sin
// sidebar) que re-descarga /api/v1/tasks/report con los mismos filtros del
// tablero (rango, responsable, cliente). Se auto-imprime al cargar; en
// pantalla muestra una barra con el botón "Imprimir" y la vista previa.

"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ESTADO_TAREA_LABELS } from "@/lib/catalogs";
import { apiGet, ApiError } from "@/lib/api/http";
import type { TaskReportResponse } from "@/hooks/kanban";

const RANGO_LABEL_PRINT: Record<string, string> = {
  week: "Última semana",
  month: "Último mes",
  quarter: "Último trimestre",
  all: "Todo el histórico",
};

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string; clave: "sin-conexion" | "otro" }
  | { kind: "ready"; data: TaskReportResponse };

export function PrintReportes() {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    setState({ kind: "loading" });
  }

  useEffect(() => {
    let alive = true;
    apiGet<TaskReportResponse>(`/api/v1/tasks/report?${query}`)
      .then((data) => {
        if (alive) setState({ kind: "ready", data });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        if (err instanceof ApiError && (err.status === 500 || err.status === 401)) {
          setState({ kind: "error", message: err.message, clave: "sin-conexion" });
        } else {
          const msg =
            err instanceof ApiError ? err.message : "No pudimos generar el reporte.";
          setState({ kind: "error", message: msg, clave: "otro" });
        }
      });
    return () => {
      alive = false;
    };
  }, [query]);

  useEffect(() => {
    if (state.kind !== "ready") return;
    const t = setTimeout(() => window.print(), 250);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <main className="min-h-screen bg-white px-6 py-6 text-ink-900 sm:px-10 print:bg-white print:p-0">
      <div className="print-hide mb-6 flex items-center justify-between rounded-[16px] border border-ink-200 bg-panel px-5 py-4">
        <p className="text-[13px] text-ink-600">
          Vista de impresión: los filtros que aplicaste se respetan.
        </p>
        <Button onClick={() => window.print()} className="rounded-[12px] px-4 font-bold">
          <Printer className="size-4" />
          Imprimir
        </Button>
      </div>

      {state.kind === "loading" && (
        <p className="py-20 text-center text-[13px] text-ink-500">
          Preparando el reporte…
        </p>
      )}

      {state.kind === "error" && (
        <PrintError
          sinConexion={state.clave === "sin-conexion"}
          message={state.message}
          onRetry={() => window.location.reload()}
        />
      )}

      {state.kind === "ready" && (
        <>
          <PrintHeader
            data={state.data}
            filtros={describeFiltros(query)}
          />
          {state.data.resumen.total_asignadas === 0 ? (
            <SinResultados />
          ) : (
            <Reporte data={state.data} />
          )}
        </>
      )}
    </main>
  );
}

/* ── Cabecera y resumen ────────────────────────────────────────────────── */

function PrintHeader({
  data,
  filtros,
}: {
  data: TaskReportResponse;
  filtros: string[];
}) {
  return (
    <header className="flex items-start justify-between gap-6 border-b-2 border-ink-950 pb-4">
      <div>
        <p className="font-display text-[13px] font-extrabold tracking-[0.14em] text-rose-500 uppercase">
          Muttu Innovación Social
        </p>
        <h1 className="mt-1.5 font-display text-[24px] font-extrabold tracking-[-0.02em] text-ink-950">
          Reporte de tareas
        </h1>
        <p className="mt-1 text-[12.5px] text-ink-600">
          {RANGO_LABEL_PRINT[data.rango]} · generado el {fechaDelDia()}
        </p>
      </div>
      <div className="text-right">
        {filtros.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {filtros.map((f) => (
              <span
                key={f}
                className="rounded-full border border-ink-200 bg-ink-100 px-2.5 py-0.5 text-[11px] font-medium text-ink-600"
              >
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

function Reporte({ data }: { data: TaskReportResponse }) {
  const r = data.resumen;
  return (
    <div className="mt-6 flex flex-col gap-6">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Total asignadas" value={r.total_asignadas} />
        <SummaryCard label="Completadas" value={r.completadas} />
        <SummaryCard label="Vencidas activas" value={r.vencidas_activas} />
        <SummaryCard label="Tasa de cumplimiento" value={`${r.tasa_cumplimiento}%`} />
      </section>

      <TablaSimple
        title="Por persona"
        headers={["Persona", "Asignadas", "En curso", "Vencidas", "Completadas", "A tiempo", "Tarde"]}
        rows={data.por_persona.map((p) => [p.nombre, p.asignadas, p.en_curso, p.vencidas, p.completadas, p.a_tiempo, p.tarde])}
      />

      <TablaSimple
        title="Por estado"
        headers={["Estado", "Cantidad"]}
        rows={data.por_estado.map((e) => [
          ESTADO_TAREA_LABELS[e.estado as keyof typeof ESTADO_TAREA_LABELS]?.label ?? e.estado,
          e.cantidad,
        ])}
      />

      {data.por_cliente.length > 0 && (
        <TablaSimple
          title="Por cliente"
          headers={["Cliente", "Cantidad"]}
          rows={data.por_cliente.map((c) => [c.nombre || "—", c.cantidad])}
        />
      )}

      <footer className="mt-2 flex items-center justify-between border-t border-ink-200 pt-3 text-[11px] text-ink-500">
        <span className="font-bold tracking-[0.12em] text-rose-700 uppercase">
          Muttu Hub
        </span>
        <span>{r.total_asignadas} tareas en el reporte · exportado desde Muttu Hub</span>
      </footer>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-[14px] border border-ink-200 bg-ink-100/50 px-4 py-3">
      <p className="text-[10.5px] font-bold tracking-[0.08em] text-ink-500 uppercase">{label}</p>
      <p className="mt-1 font-display text-[24px] leading-none font-extrabold tracking-[-0.02em] text-ink-950 tabular-nums">
        {value}
      </p>
    </div>
  );
}

function TablaSimple({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <section>
      <h2 className="mb-2 text-[13px] font-bold tracking-[-0.01em] text-ink-950">{title}</h2>
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b-2 border-ink-950 text-left">
            {headers.map((h) => (
              <th
                key={h}
                className="py-2 pr-3 text-[10.5px] font-bold tracking-[0.09em] text-ink-500 uppercase"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-ink-200">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`py-2 pr-3 align-top ${j === 0 ? "font-semibold text-ink-950" : ""}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function describeFiltros(query: string): string[] {
  const sp = new URLSearchParams(query);
  const out: string[] = [];
  const rango = sp.get("rango");
  if (rango) {
    out.push(`Período: ${RANGO_LABEL_PRINT[rango as keyof typeof RANGO_LABEL_PRINT] ?? rango}`);
  }
  if (sp.get("responsable")) out.push("Responsable: una persona");
  if (sp.get("cliente")) out.push("Cliente: uno específico");
  return out;
}

function SinResultados() {
  return (
    <div className="mt-10 grid place-items-center rounded-[18px] border border-dashed border-ink-300 bg-ink-100/40 py-16 text-center">
      <div className="max-w-[40ch]">
        <h2 className="font-display text-[16px] font-bold tracking-[-0.02em] text-ink-950">
          Sin tareas en este período
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-600">
          No hay tareas que coincidan con la combinación de filtros del reporte.
        </p>
      </div>
    </div>
  );
}

function PrintError({
  sinConexion,
  message,
  onRetry,
}: {
  sinConexion: boolean;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="grid min-h-[380px] place-items-center">
      <div className="max-w-[46ch] text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-[16px_16px_16px_6px] bg-alerta-bg text-alerta">
          <TriangleAlert className="size-5" strokeWidth={1.7} />
        </span>
        <h2 className="mt-4 font-display text-[19px] font-bold tracking-[-0.02em] text-ink-950">
          {sinConexion ? "Plataforma no conectada" : "No pudimos generar el reporte"}
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
          {sinConexion
            ? "Configura el archivo .env con Supabase o inicia sesión para exportar el reporte."
            : message}
        </p>
        <Button onClick={onRetry} variant="outline" className="mt-5 rounded-[13px] px-4 font-semibold">
          Reintentar
        </Button>
      </div>
    </div>
  );
}

function fechaDelDia(): string {
  return new Date().toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}