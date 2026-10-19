// Vista "Reporte" del tablero (PRD §5.4): resumen con tasa de cumplimiento,
// distribución por persona / estado / cliente y exportación PDF/Excel.
//
// PR 17 (Fase 3, plan §3B): ReportView reimplementaba primitivas que ya
// existen en el dashboard — los botones de rango eran un ChipSelector, las
// SummaryCards un StatTile peor, el ReportSkeleton un DashboardSkeleton. Se
// reutilizan (diff neto negativo). Además la API ya devuelve resumen.a_tiempo
// / tarde que la UI nunca pintaba: van al pie de la tarjeta de completadas, y
// la Tasa de cumplimiento (un ratio 0-100) se dibuja con BarRow.
//
// El alcance (rol COLABORADOR = solo sus tareas) lo aplica el backend; acá el
// título se deriva del filtro aplicado (responsable === yo), que es la verdad
// (3A): la inferencia por rol de reportes-page se eliminó.

"use client";

import { useState, type ReactNode } from "react";
import { FileSpreadsheet, FileText, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ESTADO_TAREA_LABELS } from "@/lib/catalogs";
import { useTaskReport, buildTaskQueryString, useCurrentUser, type ReportFilters } from "@/hooks/kanban";
import {
  BarRow,
  ChipSelector,
  DashboardSkeleton,
  StackedBarRow,
  StatTile,
} from "@/components/dashboard/shared";
import { TrendFigure } from "@/components/dashboard/trend-figure";

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
};

export function ReportView({ responsable, cliente }: ReportViewProps) {
  const [rango, setRango] = useState<ReportFilters["rango"]>("month");
  const reportQuery = useTaskReport({ rango, responsable, cliente });
  const report = reportQuery.data;
  const meQuery = useCurrentUser();

  // 3A: el título se deriva del filtro aplicado (¿estoy filtrando por mí?),
  // no de la inferencia por rol. En el tablero responsableEquipo === me => "Mi
  // reporte"; en Reportes (sin filtro) => "del equipo".
  const misTareas = Boolean(responsable) && responsable === meQuery.data?.id;

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
          <ChipSelector<ReportFilters["rango"]>
            options={RANGOS}
            value={rango}
            onChange={setRango}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void exportExcel()}
            className="h-9 rounded-lg border-ink-200 bg-panel px-3.5 text-[13px] font-semibold text-ink-800 hover:bg-ink-100"
          >
            <FileSpreadsheet className="size-4 text-exito" strokeWidth={1.8} />
            Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={openPdf}
            className="h-9 rounded-lg border-ink-200 bg-panel px-3.5 text-[13px] font-semibold text-ink-800 hover:bg-ink-100"
          >
            <FileText className="size-4 text-destructivo" strokeWidth={1.8} />
            PDF
          </Button>
        </div>
      </div>

      {reportQuery.isLoading && <DashboardSkeleton />}

      {reportQuery.isError && (
        <section className="grid min-h-[320px] place-items-center rounded-[24px] border border-ink-200 bg-panel p-8">
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
          <p className="text-[11.5px] leading-relaxed text-ink-500">
            Rango: {RANGO_LABEL[report.rango]} · {report.meta.criterio_rango}
          </p>
          <SummaryCards resumen={report.resumen} rango={RANGO_LABEL[report.rango]} />

          {report.resumen.total_asignadas === 0 ? (
            <section className="grid min-h-[220px] place-items-center rounded-[24px] border border-dashed border-ink-300 bg-panel p-8 text-center">
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
              <div className="grid gap-4 lg:grid-cols-2">
                <VencimientosCard vencimientos={report.vencimientos_por_antiguedad} />
                <CargaSemanalCard carga={report.carga_semanal} />
              </div>
              {report.tendencia_cierre.length > 0 && (
                <TendenciaCierreCard tendencia={report.tendencia_cierre} />
              )}
              <PersonTable porPersona={report.por_persona} misTareas={misTareas} />
              <CargaPersonaCard porPersona={report.por_persona} />
              <EstadoCard porEstado={report.por_estado} />
              {report.por_cliente.length > 0 && (
                <ClienteCard porCliente={report.por_cliente} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Tarjetas de resumen (StatTile del dashboard + BarRow en la tasa) ───── */

function SummaryCards({
  resumen,
  rango,
}: {
  resumen: {
    total_asignadas: number;
    completadas: number;
    vencidas_activas: number;
    tasa_cumplimiento: number;
    a_tiempo: number;
    tarde: number;
  };
  rango: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-[14px] xl:grid-cols-4">
      <StatTile label="Total asignadas" value={resumen.total_asignadas} mono foot={rango} />
      <StatTile
        label="Completadas"
        value={resumen.completadas}
        mono
        foot={
          <>
            {resumen.a_tiempo} a tiempo · {resumen.tarde} tarde
          </>
        }
      />
      <StatTile
        label="Vencidas activas"
        value={resumen.vencidas_activas}
        mono
        acento={resumen.vencidas_activas > 0}
        foot={resumen.vencidas_activas > 0 ? "Requieren atención" : rango}
      />
      <StatTile
        label="Tasa de cumplimiento"
        value={`${resumen.tasa_cumplimiento}%`}
        mono
        foot={
          <BarRow
            label="completadas"
            count={resumen.completadas}
            total={resumen.total_asignadas}
            tone="exito"
          />
        }
      />
    </div>
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
    <section className="overflow-hidden rounded-[22px] border border-ink-200 bg-panel">
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

function CargaPersonaCard({
  porPersona,
}: {
  porPersona: { id: string; nombre: string; asignadas: number; en_curso: number; vencidas: number; completadas: number; a_tiempo: number; tarde: number }[];
}) {
  // PR 19 (plan 3B): la tabla por persona responde fila por fila; esta barra
  // apilada responde de un vistazo la pregunta que la tabla no: ¿está
  // balanceada la carga? Cada persona = una barra con segmentos
  // completadas / en curso / vencidas sobre su total de asignadas.
  const conTareas = porPersona.filter((p) => p.asignadas > 0);
  if (conTareas.length === 0) return null;

  return (
    <section className="rounded-[22px] border border-ink-200 bg-panel p-5 lg:p-6">
      <h3 className="mb-4 font-display text-[14.5px] font-bold tracking-[-0.01em] text-ink-950">
        Carga por persona
      </h3>
      <div className="space-y-3.5">
        {conTareas.map((p) => (
          <StackedBarRow
            key={p.id}
            label={p.nombre}
            total={p.asignadas}
            segments={[
              { name: "completadas", value: p.completadas, tone: "exito" },
              { name: "en curso", value: p.en_curso, tone: "activo" },
              { name: "vencidas", value: p.vencidas, tone: "destructivo" },
            ]}
          />
        ))}
      </div>
    </section>
  );
}

function VencimientosCard({
  vencimientos,
}: {
  vencimientos: { bucket: string; cantidad: number }[];
}) {
  // PR 20 (plan 3B): convierte "Vencidas activas: 23" (un número con el que no
  // podés hacer nada) en "17 de las 23 llevan más de un mes". BarRow con tono
  // por gravedad; "sin fecha de entrega" saca a la luz lo que el resumen
  // descarta. Las barras leen con CSS apagado (label + conteo como texto).
  const total = vencimientos.reduce((acc, v) => acc + v.cantidad, 0);
  const tono = (bucket: string) =>
    bucket === "más de 1 mes" ? "destructivo" : bucket === "1 a 4 semanas" ? "alerta" : bucket === "menos de 1 semana" ? "info" : "neutro";

  return (
    <section className="rounded-[22px] border border-ink-200 bg-panel p-5 lg:p-6">
      <h3 className="mb-1 font-display text-[14.5px] font-bold tracking-[-0.01em] text-ink-950">
        Vencimientos por antigüedad
      </h3>
      <p className="mb-4 text-[12.5px] text-ink-600">
        {total} tareas abiertas con fecha de entrega vencida o sin fecha.
      </p>
      <div className="space-y-3.5">
        {vencimientos.map((v) => (
          <BarRow
            key={v.bucket}
            label={v.bucket}
            count={v.cantidad}
            total={total}
            tone={tono(v.bucket)}
          />
        ))}
      </div>
    </section>
  );
}

function CargaSemanalCard({ carga }: { carga: { semana: string; cantidad: number }[] }) {
  // PR 20 (plan 3B): histograma exacto sobre fecha_entrega (no un proxy).
  // El dato vive en el caption + lista sr-only de TrendFigure — la regla del
  // plan: todo visual de Reportes lee con CSS apagado.
  const total = carga.reduce((acc, c) => acc + c.cantidad, 0);
  if (carga.length === 0) return null;

  const primera = new Date(carga[0].semana);
  const ultima = new Date(carga[carga.length - 1].semana);
  const rangoLabel =
    primera.toLocaleDateString("es-CO", { day: "numeric", month: "short" }) +
    " – " +
    ultima.toLocaleDateString("es-CO", { day: "numeric", month: "short" });

  return (
    <section className="rounded-[22px] border border-ink-200 bg-panel p-5 lg:p-6">
      <h3 className="mb-1 font-display text-[14.5px] font-bold tracking-[-0.01em] text-ink-950">
        Carga por semana de entrega
      </h3>
      <p className="mb-4 text-[12.5px] text-ink-600">
        {total} tareas abiertas con entrega entre {rangoLabel}.
      </p>
      <div className="flex items-end justify-between gap-2">
        <TrendFigure
          caption={`Carga por semana de entrega (${carga.length} semanas, ${total} tareas).`}
          series={carga.map((c) => ({ label: c.semana, value: c.cantidad }))}
          stroke="var(--color-rose-500)"
        />
        <span className="text-[11px] font-semibold text-ink-500">{rangoLabel}</span>
      </div>
    </section>
  );
}

function TendenciaCierreCard({ tendencia }: { tendencia: { semana: string; cantidad: number }[] }) {
  // PR 22 (plan 3B): la tendencia de cierre que todos quieren. La serie corre
  // sobre completed_at (PR 21), la marca REAL — no una línea rotulada "cierres
  // por semana" que en realidad grafica "tareas editadas por semana".
  const total = tendencia.reduce((acc, t) => acc + t.cantidad, 0);
  const ultima = new Date(tendencia[tendencia.length - 1].semana);
  const ultimaLabel = ultima.toLocaleDateString("es-CO", { day: "numeric", month: "short" });

  return (
    <section className="rounded-[22px] border border-ink-200 bg-panel p-5 lg:p-6">
      <h3 className="mb-1 font-display text-[14.5px] font-bold tracking-[-0.01em] text-ink-950">
        Tendencia de cierre
      </h3>
      <p className="mb-4 text-[12.5px] text-ink-600">
        {total} tareas completadas en el período · última semana {ultimaLabel}.
      </p>
      <div className="flex items-end justify-between gap-2">
        <TrendFigure
          caption={`Tendencia de cierre: ${total} tareas completadas en ${tendencia.length} semanas.`}
          series={tendencia.map((t) => ({ label: t.semana, value: t.cantidad }))}
          stroke="var(--color-exito)"
        />
        <span className="text-[11px] font-semibold text-ink-500">{ultimaLabel}</span>
      </div>
    </section>
  );
}

function EstadoCard({ porEstado }: { porEstado: { estado: string; cantidad: number }[] }) {
  // PR 18 (plan 3B): el estado es un embudo, no una tabla. Cada estado tiene
  // tono semántico (los mismos de cara-pipeline). Los ceros salen de las
  // barras (una barra de 0% es ruido) pero no se pierden: se listan en texto.
  const conTareas = porEstado.filter((e) => e.cantidad > 0);
  const sinTareas = porEstado.filter((e) => e.cantidad === 0);
  const total = porEstado.reduce((acc, e) => acc + e.cantidad, 0);

  return (
    <section className="rounded-[22px] border border-ink-200 bg-panel p-5 lg:p-6">
      <h3 className="mb-4 font-display text-[14.5px] font-bold tracking-[-0.01em] text-ink-950">
        Por estado
      </h3>
      {total === 0 ? (
        <p className="text-[13px] text-ink-600">Sin tareas en este período.</p>
      ) : (
        <div className="space-y-3.5">
          {conTareas.map((e) => {
            const entry = ESTADO_TAREA_LABELS[e.estado as keyof typeof ESTADO_TAREA_LABELS];
            return (
              <BarRow
                key={e.estado}
                label={entry?.label ?? e.estado}
                count={e.cantidad}
                total={total}
                tone={entry?.tone}
              />
            );
          })}
          {sinTareas.length > 0 && (
            <p className="pt-1 text-[12px] text-ink-600">
              Sin tareas en:{" "}
              {sinTareas
                .map((e) => ESTADO_TAREA_LABELS[e.estado as keyof typeof ESTADO_TAREA_LABELS]?.label ?? e.estado)
                .join(", ")}
              .
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function ClienteCard({ porCliente }: { porCliente: { nombre: string; cantidad: number }[] }) {
  // PR 18 (plan 3B): ranking -> barra horizontal (el caso indiscutible). Top 8
  // + "+N clientes más"; ya viene ordenado desc desde el servidor.
  const top = porCliente.slice(0, 8);
  const total = porCliente.reduce((acc, c) => acc + c.cantidad, 0);
  const restantes = porCliente.length - top.length;

  return (
    <section className="rounded-[22px] border border-ink-200 bg-panel p-5 lg:p-6">
      <h3 className="mb-4 font-display text-[14.5px] font-bold tracking-[-0.01em] text-ink-950">
        Por cliente
      </h3>
      <div className="space-y-3.5">
        {top.map((c) => (
          <BarRow
            key={c.nombre}
            label={c.nombre || "—"}
            count={c.cantidad}
            total={total}
            tone="activo"
          />
        ))}
        {restantes > 0 && (
          <p className="pt-1 text-[12px] text-ink-600">
            +{restantes} {restantes === 1 ? "cliente más" : "clientes más"}.
          </p>
        )}
      </div>
    </section>
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