// Reportes imprimibles del dashboard (Hito 6, PRD §7.3): una página fuera
// del shell por cara, que lee los mismos filtros comunes (§7.2) + dias_sin_gestion
// y re-descarga el endpoint correspondiente de /api/v1/dashboard. Se
// auto-imprime al cargar; en pantalla muestra la barra con "Volver" +
// "Imprimir". Patrón espejo de print-list.tsx (incluido el estado
// "Plataforma no conectada" cuando el API no está configurado).

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Printer, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet, ApiError } from "@/lib/api/http";
import {
  ESTADO_CLIENTE_LABELS,
  ESTADO_OPORTUNIDAD_LABELS,
  ESTADO_TAREA_LABELS,
  PRIORIDAD_CLIENTE_LABELS,
  TIPO_CLIENTE_LABELS,
} from "@/lib/catalogs";
import { formatCOP, formatFecha } from "@/hooks/crm";
import type {
  DashboardClientsActivity,
  DashboardMySummary,
  DashboardPipeline,
  DashboardTasks,
} from "@/hooks/dashboard";

export type CaraPrint =
  | "pipeline"
  | "tasks"
  | "clients-activity"
  | "my-summary";

const CARA_META: Record<CaraPrint, { title: string; endpoint: string }> = {
  pipeline: { title: "Reporte — Pipeline comercial", endpoint: "/api/v1/dashboard/pipeline" },
  tasks: { title: "Reporte — Gestión de tareas", endpoint: "/api/v1/dashboard/tasks" },
  "clients-activity": { title: "Reporte — Actividad de clientes", endpoint: "/api/v1/dashboard/clients-activity" },
  "my-summary": { title: "Reporte — Mi resumen", endpoint: "/api/v1/dashboard/my-summary" },
};

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string; clave: "sin-conexion" | "otro" }
  | { kind: "ready"; data: unknown };

export function PrintDashboardCara({ cara }: { cara: CaraPrint }) {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const filtros = describeFiltros(cara, query);

  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    setState({ kind: "loading" });
  }

  useEffect(() => {
    let alive = true;

    apiGet<unknown>(`${CARA_META[cara].endpoint}?${query}`)
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
  }, [cara, query]);

  useEffect(() => {
    if (state.kind !== "ready") return;
    const t = setTimeout(() => window.print(), 250);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <main className="min-h-screen bg-white px-6 py-6 text-ink-900 sm:px-10 print:bg-white print:p-0">
      <div className="print-hide mb-6 flex items-center justify-between rounded-[16px] border border-ink-200 bg-panel px-5 py-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex h-[34px] items-center gap-1.5 rounded-[11px] border border-ink-200 bg-white px-3 text-[12.5px] font-semibold text-ink-800 transition-colors hover:bg-ink-100"
          >
            <ArrowLeft className="size-3.5" strokeWidth={1.9} />
            Volver al dashboard
          </Link>
          <p className="hidden text-[13px] text-ink-600 sm:block">
            Vista de impresión: los filtros que aplicaste se respetan.
          </p>
        </div>
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
            title={CARA_META[cara].title}
            subtitle={`generado el ${fechaDelDia()}`}
          />
          <FiltrosSummary filtros={filtros} />
          {cara === "pipeline" && <PipelineBody data={state.data as DashboardPipeline} />}
          {cara === "tasks" && <TasksBody data={state.data as DashboardTasks} />}
          {cara === "clients-activity" && (
            <ClientsBody data={state.data as DashboardClientsActivity} />
          )}
          {cara === "my-summary" && <MySummaryBody data={state.data as DashboardMySummary} />}
          <PrintFooter />
        </>
      )}
    </main>
  );
}

/* ── Cabecera, filtros y pie ────────────────────────────────────────────── */

function PrintHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="flex items-start justify-between gap-6 border-b-2 border-ink-950 pb-4">
      <div>
        <p className="font-display text-[13px] font-extrabold tracking-[0.14em] text-rose-500 uppercase">
          Muttu Innovación Social
        </p>
        <h1 className="mt-1.5 font-display text-[24px] font-extrabold tracking-[-0.02em] text-ink-950">
          {title}
        </h1>
      </div>
      <p className="text-right font-mono text-[11.5px] text-ink-500">{subtitle}</p>
    </header>
  );
}

function PrintFooter() {
  return (
    <footer className="mt-8 flex items-center justify-between border-t border-ink-200 pt-3 text-[11px] text-ink-500">
      <span className="font-bold tracking-[0.12em] text-rose-700 uppercase">
        Muttu Hub
      </span>
      <span>Dashboard · exportado desde Muttu Hub</span>
    </footer>
  );
}

function describeFiltros(cara: CaraPrint, query: string): string[] {
  const sp = new URLSearchParams(query);
  const out: string[] = [];
  const push = (label: string, value: string) => {
    if (value) out.push(`${label}: ${value}`);
  };
  push("Desde", sp.get("desde") ?? "");
  push("Hasta", sp.get("hasta") ?? "");
  const tipo = sp.get("tipo_cliente");
  push(
    "Tipo de cliente",
    tipo ? (TIPO_CLIENTE_LABELS[tipo as keyof typeof TIPO_CLIENTE_LABELS]?.label ?? tipo) : "",
  );
  if (cara === "clients-activity") {
    push("Sin gestión", sp.get("dias_sin_gestion") ? `más de ${sp.get("dias_sin_gestion")} días` : "");
  }
  return out;
}

function FiltrosSummary({ filtros }: { filtros: string[] }) {
  if (filtros.length === 0) return null;
  return (
    <div className="mt-5">
      <p className="text-[11px] font-bold tracking-[0.1em] text-ink-500 uppercase">
        Filtros aplicados
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {filtros.map((f) => (
          <li
            key={f}
            className="rounded-full border border-ink-200 bg-ink-100 px-3 py-1 text-[11.5px] font-medium text-ink-700"
          >
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Tablas de cada cara ────────────────────────────────────────────────── */

function TableShell({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <table className="mt-6 w-full border-collapse text-[12px]">
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
      <tbody>{children}</tbody>
    </table>
  );
}

function Row({ cells, first }: { cells: React.ReactNode[]; first?: boolean }) {
  return (
    <tr className={!first ? "border-t border-ink-200" : ""}>
      {cells.map((c, i) => (
        <td key={i} className="py-2.5 pr-3 align-top">
          {c}
        </td>
      ))}
    </tr>
  );
}

function SinResultados({ texto }: { texto: string }) {
  return (
    <div className="mt-8 grid place-items-center rounded-[18px] border border-dashed border-ink-300 bg-ink-100/40 py-12 text-center">
      <div className="max-w-[44ch]">
        <h2 className="font-display text-[16px] font-bold tracking-[-0.02em] text-ink-950">
          Sin datos para este reporte
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-600">{texto}</p>
      </div>
    </div>
  );
}

function PipelineBody({ data }: { data: DashboardPipeline }) {
  const { total_activas, valor_activo, embudo, top_clientes, comparativo } = data;
  return (
    <div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <PrintKpi label="Oportunidades activas" value={String(total_activas)} />
        <PrintKpi label="Valor potencial" value={formatCOP(valor_activo)} />
        <PrintKpi label="Ganado histórico" value={formatCOP(comparativo.ganado_historico)} />
        <PrintKpi
          label="Ratio cierre"
          value={`${comparativo.ratio.toLocaleString("es-CO", { maximumFractionDigits: 2 })}×`}
        />
      </div>

      {embudo.length === 0 ? (
        <SinResultados texto="No hay oportunidades activas para la combinación de filtros." />
      ) : (
        <TableShell headers={["Etapa", "Oportunidades"]}>
          {embudo.map((e, i) => (
            <Row
              key={e.estado}
              first={i === 0}
              cells={[
                ESTADO_OPORTUNIDAD_LABELS[e.estado]?.label ?? e.estado,
                String(e.count),
              ]}
            />
          ))}
        </TableShell>
      )}

      {top_clientes.length > 0 && (
        <TableShell headers={["#", "Cliente", "Valor potencial"]}>
          {top_clientes.map((c, i) => (
            <Row
              key={c.cliente_id}
              first={i === 0}
              cells={[String(i + 1), c.nombre, formatCOP(c.valor_potencial)]}
            />
          ))}
        </TableShell>
      )}
    </div>
  );
}

function TasksBody({ data }: { data: DashboardTasks }) {
  const { por_columna, cumplimiento_por_persona, vencidas } = data;
  return (
    <div>
      <TableShell headers={["Columna", "Tareas"]}>
        {por_columna.map((c, i) => (
          <Row key={c.estado} first={i === 0} cells={[c.label, String(c.count)]} />
        ))}
      </TableShell>

      {cumplimiento_por_persona.length > 0 && (
        <TableShell headers={["Responsable", "Asignadas", "Completadas", "Cumplidas a tiempo", "%"]}>
          {cumplimiento_por_persona.map((p, i) => (
            <Row
              key={p.responsable_id}
              first={i === 0}
              cells={[
                p.nombre,
                String(p.total),
                String(p.completadas),
                String(p.cumplidas),
                `${p.porc}%`,
              ]}
            />
          ))}
        </TableShell>
      )}

      <div className="mt-6 rounded-[16px] border border-destructivo/30 bg-destructivo-bg p-4">
        <p className="text-[12px] font-bold text-destructivo">
          Tareas vencidas activas: {vencidas.count}
        </p>
      </div>
      {vencidas.lista.length > 0 ? (
        <TableShell headers={["Tarea", "Responsable", "Cliente", "Fecha de entrega"]}>
          {vencidas.lista.map((v, i) => (
            <Row
              key={v.id}
              first={i === 0}
              cells={[
                <span key="t" className="font-bold text-ink-950">
                  {v.titulo}
                </span>,
                v.responsable_nombre,
                v.cliente_nombre ?? "—",
                formatFecha(v.fecha_entrega),
              ]}
            />
          ))}
        </TableShell>
      ) : (
        <SinResultados texto="No hay tareas vencidas activas." />
      )}
    </div>
  );
}

function ClientsBody({ data }: { data: DashboardClientsActivity }) {
  const { sin_gestion, distribucion, actividad_por_responsable } = data;
  return (
    <div>
      <p className="mt-6 text-[12px] font-bold text-ink-700">
        Clientes sin gestión reciente (más de {sin_gestion.dias} días)
      </p>
      {sin_gestion.clientes.length === 0 ? (
        <SinResultados texto="Ningún cliente supera el corte de días sin gestión." />
      ) : (
        <TableShell headers={["Cliente", "Estado", "Prioridad", "Responsable", "Última gestión"]}>
          {sin_gestion.clientes.map((c, i) => (
            <Row
              key={c.cliente_id}
              first={i === 0}
              cells={[
                <span key="n" className="font-bold text-ink-950">
                  {c.nombre}
                </span>,
                ESTADO_CLIENTE_LABELS[c.estado]?.label ?? c.estado,
                c.prioridad ? PRIORIDAD_CLIENTE_LABELS[c.prioridad]?.label ?? c.prioridad : "—",
                c.responsable_nombre,
                c.ultima_gestion ? formatFecha(c.ultima_gestion) : "Nunca",
              ]}
            />
          ))}
        </TableShell>
      )}

      <p className="mt-6 text-[12px] font-bold text-ink-700">Distribución por estado</p>
      <TableShell headers={["Estado", "Clientes"]}>
        {distribucion.por_estado
          .filter((r) => r.count > 0)
          .map((r, i) => (
            <Row
              key={r.estado}
              first={i === 0}
              cells={[ESTADO_CLIENTE_LABELS[r.estado]?.label ?? r.estado, String(r.count)]}
            />
          ))}
      </TableShell>

      {actividad_por_responsable.length > 0 && (
        <TableShell headers={["Responsable", "Gestiones", "Tareas"]}>
          {actividad_por_responsable.map((a, i) => (
            <Row
              key={a.responsable_id}
              first={i === 0}
              cells={[a.nombre, String(a.gestiones), String(a.tareas_count)]}
            />
          ))}
        </TableShell>
      )}
    </div>
  );
}

function MySummaryBody({ data }: { data: DashboardMySummary }) {
  const { activas, vencidas, hoy, compromisos_pendientes, clientes_asignados } = data;
  return (
    <div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <PrintKpi label="Tareas pendientes" value={String(activas.count)} />
        <PrintKpi label="Vencen hoy" value={String(hoy.count)} />
        <PrintKpi label="Vencidas" value={String(vencidas.count)} />
        <PrintKpi label="Compromisos CRM" value={String(compromisos_pendientes.count)} />
      </div>

      {activas.items.length > 0 && (
        <TableShell headers={["Tarea", "Estado", "Fecha de entrega"]}>
          {activas.items.map((t, i) => (
            <Row
              key={t.id}
              first={i === 0}
              cells={[
                <span key="t" className="font-bold text-ink-950">
                  {t.titulo}
                </span>,
                ESTADO_TAREA_LABELS[t.estado]?.label ?? t.estado,
                t.fecha_entrega ? formatFecha(t.fecha_entrega) : "Sin fecha",
              ]}
            />
          ))}
        </TableShell>
      )}

      {clientes_asignados.items.length > 0 && (
        <TableShell headers={["Cliente asignado", "Estado"]}>
          {clientes_asignados.items.map((c, i) => (
            <Row
              key={c.cliente_id}
              first={i === 0}
              cells={[
                <span key="n" className="font-bold text-ink-950">
                  {c.nombre}
                </span>,
                ESTADO_CLIENTE_LABELS[c.estado]?.label ?? c.estado,
              ]}
            />
          ))}
        </TableShell>
      )}
      <p className="mt-6 text-[12px] font-bold text-ink-700">
        Compromisos CRM pendientes: {compromisos_pendientes.count} (
        {compromisos_pendientes.vencidos} vencidos)
      </p>
    </div>
  );
}

function PrintKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-ink-200 bg-panel p-3.5">
      <p className="text-[10.5px] font-bold tracking-[0.08em] text-ink-500 uppercase">{label}</p>
      <p className="mt-1.5 font-display text-[19px] font-extrabold tracking-[-0.02em] text-ink-950">
        {value}
      </p>
    </div>
  );
}

/* ── Estado de error ────────────────────────────────────────────────────── */

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