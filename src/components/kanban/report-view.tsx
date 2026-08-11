// Vista "Reporte" del tablero (PRD §5.4): resumen con tasa de cumplimiento,
// distribución por persona / estado / cliente y exportación PDF/Excel. El
// alcance (rol COLABORADOR = solo sus tareas) lo aplica el backend; aquí solo
// se titula la vista en consecuencia.

"use client";

import { useState, type ReactNode } from "react";
import { FileSpreadsheet, FileText, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ESTADO_TAREA_LABELS } from "@/lib/catalogs";
import { useTaskReport, buildTaskQueryString, type ReportFilters } from "@/hooks/kanban";

const RANGOS: { value: ReportFilters["rango"]; label: string }[] = [
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
  { value: "quarter", label: "Trimestre" },
  { value: "all", label: "Todo" },
];

const RANGO_LABEL: Record<ReportFilters["rango"], string> = {
  week: "Última semana",
  month: "Último mes",
  quarter: "Último trimestre",
  all: "Todo el histórico",
};

type ReportViewProps = {
  responsable: string | undefined;
  cliente: string | undefined;
  misTareas: boolean;
};

export function ReportView({ responsable, cliente, misTareas }: ReportViewProps) {
  const [rango, setRango] = useState<ReportFilters["rango"]>("month");
  const reportQuery = useTaskReport({ rango, responsable, cliente });
  const report = reportQuery.data;

  function exportExcel() {
    const qs = buildTaskQueryString({
      responsable,
      cliente,
    });
    void descargarExcel(`/api/v1/tasks/export?${qs}`);
  }

  function openPdf() {
    const sp = new URLSearchParams();
    sp.set("rango", rango);
    if (responsable) sp.set("responsable", responsable);
    if (cliente) sp.set("cliente", cliente);
    window.open(`/print/reportes/tareas?${sp.toString()}`, "_blank", "noopener");
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-[17px] font-bold tracking-[-0.02em] text-ink-950">
          {misTareas ? "Mi reporte de tareas" : "Reporte de tareas del equipo"}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-ink-100 p-1">
            {RANGOS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRango(r.value)}
                aria-pressed={rango === r.value}
                className={cn(
                  "h-8 rounded-10 px-3 text-[12.5px] font-bold transition-colors",
                  rango === r.value
                    ? "bg-white text-ink-900 shadow-sm"
                    : "text-ink-600 hover:text-ink-900",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void exportExcel()}
            className="h-9 rounded-lg border-ink-200 bg-white px-3.5 text-[13px] font-semibold text-ink-800 hover:bg-ink-100"
          >
            <FileSpreadsheet className="size-4 text-exito" strokeWidth={1.8} />
            Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={openPdf}
            className="h-9 rounded-lg border-ink-200 bg-white px-3.5 text-[13px] font-semibold text-ink-800 hover:bg-ink-100"
          >
            <FileText className="size-4 text-destructivo" strokeWidth={1.8} />
            PDF
          </Button>
        </div>
      </div>

      {reportQuery.isLoading && <ReportSkeleton />}

      {reportQuery.isError && (
        <section className="grid min-h-[320px] place-items-center rounded-[24px] border border-ink-200 bg-white p-8">
          <div className="max-w-[46ch] text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-[16px_16px_16px_6px] bg-alerta-bg text-alerta">
              <LoaderCircle className="size-6" strokeWidth={1.7} />
            </span>
            <h3 className="mt-4 font-display text-[19px] font-bold tracking-[-0.02em] text-ink-950">
              No pudimos generar el reporte
            </h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
              Revisa la conexión e inténtalo de nuevo.
            </p>
            <Button
              onClick={() => void reportQuery.refetch()}
              variant="outline"
              className="mt-5 rounded-lg px-4 font-semibold"
            >
              Reintentar
            </Button>
          </div>
        </section>
      )}

      {report && (
        <div className="flex min-w-0 flex-col gap-4">
          <SummaryCards resumen={report.resumen} rango={RANGO_LABEL[report.rango]} />

          {report.resumen.total_asignadas === 0 ? (
            <section className="grid min-h-[220px] place-items-center rounded-[24px] border border-dashed border-ink-300 bg-white p-8 text-center">
              <div className="max-w-[42ch]">
                <h3 className="font-display text-[17px] font-bold tracking-[-0.02em] text-ink-950">
                  Sin tareas en este período
                </h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-600">
                  Cambia el rango o ajusta los filtros para ver el reporte.
                </p>
              </div>
            </section>
          ) : (
            <>
              <PersonTable porPersona={report.por_persona} misTareas={misTareas} />
              <EstadoTable porEstado={report.por_estado} />
              {report.por_cliente.length > 0 && (
                <ClienteTable porCliente={report.por_cliente} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Tarjetas de resumen ───────────────────────────────────────────────── */

function SummaryCards({
  resumen,
  rango,
}: {
  resumen: { total_asignadas: number; completadas: number; vencidas_activas: number; tasa_cumplimiento: number };
  rango: string;
}) {
  const cards = [
    { label: "Total asignadas", value: resumen.total_asignadas, mono: true },
    { label: "Completadas", value: resumen.completadas, mono: true, acento: "text-exito" },
    { label: "Vencidas activas", value: resumen.vencidas_activas, mono: true, acento: resumen.vencidas_activas > 0 ? "text-destructivo" : "" },
    { label: "Tasa de cumplimiento", value: `${resumen.tasa_cumplimiento}%`, mono: true },
  ];
  return (
    <section className="rounded-[22px] border border-ink-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-14 bg-ink-100/60 px-4 py-3.5">
            <p className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
              {c.label}
            </p>
            <p
              className={cn(
                "mt-1 font-display text-[26px] leading-none font-extrabold tracking-[-0.02em] text-ink-950 tabular-nums",
                c.acento,
              )}
            >
              {c.value}
            </p>
            <p className="mt-1 text-[11px] text-ink-600">{rango}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Tablas del reporte ────────────────────────────────────────────────── */

function TableCard({
  title,
  headers,
  children,
}: {
  title: string;
  headers: string[];
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[22px] border border-ink-200 bg-white">
      <div className="border-b border-ink-200 px-5 py-3">
        <h3 className="font-display text-[14.5px] font-bold tracking-[-0.01em] text-ink-950">
          {title}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-200 text-left">
              {headers.map((h) => (
                <th
                  key={h}
                  className="px-5 py-2.5 text-[10.5px] font-bold tracking-[0.09em] text-ink-500 uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  );
}

function MonoCell({ value, tone }: { value: number | string; tone?: string }) {
  return (
    <td className="px-5 py-2.5">
      <span className={cn("font-mono text-[12px] font-medium tabular-nums", tone ?? "text-ink-900")}>
        {value}
      </span>
    </td>
  );
}

function PersonTable({
  porPersona,
  misTareas,
}: {
  porPersona: { id: string; nombre: string; asignadas: number; en_curso: number; vencidas: number; completadas: number; a_tiempo: number; tarde: number }[];
  misTareas: boolean;
}) {
  return (
    <TableCard
      title={misTareas ? "Por persona · mis tareas" : "Por persona"}
      headers={["Persona", "Asignadas", "En curso", "Vencidas", "Completadas", "A tiempo", "Tarde"]}
    >
      {porPersona.map((p) => (
        <tr key={p.id} className="border-t border-ink-200 first:border-t-0 hover:bg-ink-100/40">
          <td className="px-5 py-2.5 font-semibold text-ink-900">{p.nombre}</td>
          <MonoCell value={p.asignadas} />
          <MonoCell value={p.en_curso} />
          <MonoCell value={p.vencidas} tone={p.vencidas > 0 ? "text-destructivo" : "text-ink-900"} />
          <MonoCell value={p.completadas} tone="text-exito" />
          <MonoCell value={p.a_tiempo} tone="text-exito" />
          <MonoCell value={p.tarde} tone={p.tarde > 0 ? "text-alerta" : "text-ink-900"} />
        </tr>
      ))}
    </TableCard>
  );
}

function EstadoTable({ porEstado }: { porEstado: { estado: string; cantidad: number }[] }) {
  return (
    <TableCard title="Por estado" headers={["Estado", "Cantidad"]}>
      {porEstado.map((e) => (
        <tr key={e.estado} className="border-t border-ink-200 first:border-t-0 hover:bg-ink-100/40">
          <td className="px-5 py-2.5 font-semibold text-ink-900">
            {ESTADO_TAREA_LABELS[e.estado as keyof typeof ESTADO_TAREA_LABELS]?.label ?? e.estado}
          </td>
          <MonoCell value={e.cantidad} />
        </tr>
      ))}
    </TableCard>
  );
}

function ClienteTable({ porCliente }: { porCliente: { nombre: string; cantidad: number }[] }) {
  return (
    <TableCard title="Por cliente" headers={["Cliente", "Cantidad"]}>
      {porCliente.map((c) => (
        <tr key={c.nombre} className="border-t border-ink-200 first:border-t-0 hover:bg-ink-100/40">
          <td className="px-5 py-2.5 font-semibold text-ink-900">{c.nombre || "—"}</td>
          <MonoCell value={c.cantidad} />
        </tr>
      ))}
    </TableCard>
  );
}

function ReportSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="h-[118px] animate-pulse rounded-[22px] bg-ink-100" />
      <div className="h-[220px] animate-pulse rounded-[22px] bg-ink-100" />
      <div className="h-[160px] animate-pulse rounded-[22px] bg-ink-100" />
    </div>
  );
}

async function descargarExcel(url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      let msg = "No pudimos generar el archivo.";
      try {
        const body = (await res.json()) as { error?: string };
        msg = body.error ?? msg;
      } catch {
        /* mensaje por defecto */
      }
      toast.error(msg);
      return;
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = "tareas.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
    toast.success("Exportación completada: tareas.xlsx");
  } catch {
    toast.error("No pudimos generar el archivo.");
  }
}