"use client";

// Reportes › Etiqueta (T3: S2–S7). The server computes the whole report (`GET /api/v1/reports/tag`, built from the
// portfolio, the tagged clients and tasks, and their opportunities and bitácora); this screen only paints it:
// semáforo colors, percentages and amounts arrive done and are never recalculated. A section the user cannot see
// arrives as null and is hidden, not shown empty (S5). «Generar reporte» opens the print view in the same tab and
// «Exportar Excel» downloads the same report as a workbook (S6).

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { NOTA_DIAS_SIN_INTERACCION, NOTA_ETIQUETAS, NOTA_TAREAS_PERIODO } from "@/lib/reportes/etiqueta-notas";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { ESTADO_PROYECTO_META, formatFechaCalendario } from "@/components/proyectos/project-display";
import { formatPct } from "@/components/proyectos/project-kpis-panel";
import { EmptyBlock, InlineError, SELECT_CLASS } from "@/components/proyectos/ui";
import { SemaforoChip } from "@/components/proyectos/semaforo-chip";
import { TIPO_INTERACCION_LABELS } from "@/components/crm/interacciones-feed";
import { StatTile } from "@/components/dashboard/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTaskTags } from "@/hooks/admin";
import {
  downloadReporteEtiqueta,
  reporteEtiquetaPrintHref,
  useReporteEtiqueta,
  type ReporteEtiqueta,
  type ReporteEtiquetaParams,
} from "@/hooks/reportes";
import type { ColorSemaforo } from "@/hooks/projects";
import { ESTADO_OPORTUNIDAD_LABELS, ESTADO_TAREA_LABELS, TASK_TAGS } from "@/lib/catalogs";
import { CONTACTO_DIAS_OPTIMO } from "@/lib/clientes/salud";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import { cn } from "@/lib/utils";

const ERROR_REPORTE = "No pudimos generar el reporte por etiqueta. Inténtalo de nuevo.";
export const ELIGE_ETIQUETA = "Elige una etiqueta para ver su reporte.";
/** S2, verbatim from the proposal: the report prints it as a footnote. */
const SIN_INTERACCION = `Más de ${CONTACTO_DIAS_OPTIMO} días sin interacción`;

const formatMonto = (value: string | null): string => (value === null ? "—" : formatCOP(toCents(value)));

/** «Del … al … · Corte …»: the period the user chose plus the cut-off of the project figures. */
export function etiquetaPeriodo(data: Pick<ReporteEtiqueta, "periodo" | "corte">): string {
  const { desde, hasta } = data.periodo;
  const periodo =
    desde && hasta
      ? `Del ${formatFechaCalendario(desde)} al ${formatFechaCalendario(hasta)}`
      : desde
        ? `Desde el ${formatFechaCalendario(desde)}`
        : hasta
          ? `Hasta el ${formatFechaCalendario(hasta)}`
          : "Todo el período";
  return `${periodo} · Corte ${formatFechaCalendario(data.corte)}`;
}

/** The tab: tag and period filters, actions and the report. */
export function ReporteEtiquetaTab() {
  const [params, setParams] = useState<ReporteEtiquetaParams>({ etiqueta: "", desde: "", hasta: "" });
  const [exportando, setExportando] = useState(false);
  const query = useReporteEtiqueta(params);
  const data = params.etiqueta ? query.data : undefined;
  const desdeId = useId();
  const hastaId = useId();

  const set = (key: keyof ReporteEtiquetaParams) => (value: string) => setParams((p) => ({ ...p, [key]: value }));

  async function exportar() {
    setExportando(true);
    try {
      await downloadReporteEtiqueta(params);
    } catch (error) {
      toast.error(errorMessage(error, "No pudimos generar el archivo. Inténtalo de nuevo."));
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="surface flex flex-wrap items-end justify-between gap-3 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <EtiquetaSelect value={params.etiqueta} onChange={set("etiqueta")} />
          <div className="flex flex-col gap-1">
            <Label htmlFor={desdeId} className="text-[11.5px] font-bold tracking-[0.08em] text-ink-500 uppercase">
              Desde
            </Label>
            <Input
              id={desdeId}
              type="date"
              className="h-10 w-[160px] md:text-[12.5px]"
              value={params.desde}
              max={params.hasta || undefined}
              onChange={(e) => set("desde")(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={hastaId} className="text-[11.5px] font-bold tracking-[0.08em] text-ink-500 uppercase">
              Hasta
            </Label>
            <Input
              id={hastaId}
              type="date"
              className="h-10 w-[160px] md:text-[12.5px]"
              value={params.hasta}
              min={params.desde || undefined}
              onChange={(e) => set("hasta")(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled={!data || exportando} onClick={exportar}>
            <Download className="size-4" />
            Exportar Excel
          </Button>
          {params.etiqueta && (
            <Link
              href={reporteEtiquetaPrintHref(params)}
              className="inline-flex h-10 items-center gap-2 rounded-12 bg-rose-500 px-4 text-[13px] font-bold text-white transition-colors hover:bg-rose-700"
            >
              <Printer className="size-4" strokeWidth={1.9} />
              Generar reporte
            </Link>
          )}
        </div>
      </div>

      {!params.etiqueta && <EmptyBlock>{ELIGE_ETIQUETA}</EmptyBlock>}
      {params.etiqueta && query.isLoading && <Skeleton className="h-64 w-full" />}
      {params.etiqueta && query.isError && <InlineError message={errorMessage(query.error, ERROR_REPORTE)} />}
      {data && !query.isError && (
        <>
          <p className="text-[13px] font-semibold text-ink-900">{etiquetaPeriodo(data)}</p>
          <ReporteEtiquetaContenido data={data} />
        </>
      )}
    </div>
  );
}

/** The report body, shared by the tab and the print view. */
export function ReporteEtiquetaContenido({ data }: { data: ReporteEtiqueta }) {
  const { resumen } = data;
  // Commercial access is told by the payload: without it the opportunities come as null (S5).
  const comercial = data.oportunidades !== null;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {!data.confirmado && (
        <p className="text-[12px] text-ink-600">Los umbrales del semáforo son provisionales hasta que se confirmen.</p>
      )}

      <section aria-labelledby="etiqueta-resumen" className="min-w-0 print:break-inside-avoid">
        <Titulo id="etiqueta-resumen">Resumen</Titulo>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
          <StatTile label="Clientes" value={resumen.clientes} />
          <StatTile label="Proyectos" value={resumen.proyectos} foot={`Corte ${formatFechaCalendario(data.corte)}`} />
          <StatTile label="Valor total" mono value={formatMonto(resumen.valor_total)} />
          <StatTile
            label="Ejecución presupuestal"
            mono
            value={formatMonto(resumen.financiero.ejecutado)}
            foot={`de ${formatMonto(resumen.financiero.programado)} programado`}
          />
          {resumen.pipeline !== null && (
            <StatTile
              label="Pipeline abierto"
              mono
              value={formatMonto(resumen.pipeline.valor)}
              foot={resumen.pipeline.oportunidades === 1 ? "1 oportunidad" : `${resumen.pipeline.oportunidades} oportunidades`}
            />
          )}
          <StatTile label="Tareas completadas" value={`${resumen.tareas.completadas} de ${resumen.tareas.total}`} />
          <StatTile label="Tareas vencidas" value={resumen.tareas.vencidas} acento={resumen.tareas.vencidas > 0} />
        </div>
      </section>

      <Seccion id="etiqueta-proyectos" titulo="Proyectos">
        {data.proyectos.length === 0 ? (
          <EmptyBlock>Ningún proyecto tiene esta etiqueta.</EmptyBlock>
        ) : (
          <Table className="min-w-[960px] print:min-w-0">
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Proyecto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead numeric>Avance real</TableHead>
                <TableHead numeric>Avance programado</TableHead>
                <TableHead numeric>Ejecutado</TableHead>
                <TableHead numeric>Programado</TableHead>
                <TableHead>Semáforo técnico</TableHead>
                <TableHead>Semáforo financiero</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.proyectos.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-[12px] font-semibold tabular-nums">{p.codigo}</TableCell>
                  <TableCell className="max-w-[220px]">
                    <p className="truncate font-semibold text-ink-950" title={p.nombre}>{p.nombre}</p>
                    <p className="truncate text-[11.5px] text-ink-600">{p.cliente.nombre}</p>
                  </TableCell>
                  <TableCell className="text-[12.5px]">{ESTADO_PROYECTO_META[p.estado].label}</TableCell>
                  <Numero>{formatPct(p.kpis.tecnico?.avance_real ?? null)}</Numero>
                  <Numero>{formatPct(p.kpis.tecnico?.avance_programado ?? null)}</Numero>
                  <Numero>{formatMonto(p.kpis.financiero?.ejecutado ?? null)}</Numero>
                  <Numero>{formatMonto(p.kpis.financiero?.programado ?? null)}</Numero>
                  <TableCell><Semaforo color={p.semaforo_tecnico} /></TableCell>
                  <TableCell><Semaforo color={p.semaforo_financiero} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Seccion>

      <Seccion id="etiqueta-clientes" titulo="Clientes">
        {data.clientes.length === 0 ? (
          <EmptyBlock>Ningún cliente tiene esta etiqueta.</EmptyBlock>
        ) : (
          <Table className="min-w-[640px] print:min-w-0">
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead numeric>Proyectos</TableHead>
                {comercial && <TableHead numeric>Oportunidades abiertas</TableHead>}
                <TableHead>Última interacción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.clientes.map((c) => (
                <TableRow key={c.id} className={cn(c.sin_interaccion_reciente && "bg-alerta-bg")}>
                  <TableCell>
                    <p className="font-semibold text-ink-950">{c.nombre}</p>
                    {c.sin_interaccion_reciente && (
                      <p className="text-[11.5px] font-semibold text-alerta">{SIN_INTERACCION}</p>
                    )}
                  </TableCell>
                  <Numero>{c.proyectos}</Numero>
                  {comercial && <Numero>{"oportunidades_abiertas" in c ? c.oportunidades_abiertas : "—"}</Numero>}
                  <TableCell className="text-[12.5px]">
                    {c.ultima_interaccion ? formatFechaCalendario(c.ultima_interaccion) : "Sin interacciones"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Seccion>

      {data.oportunidades !== null && (
        <Seccion id="etiqueta-oportunidades" titulo="Oportunidades abiertas">
          {data.oportunidades.length === 0 ? (
            <EmptyBlock>Estos clientes no tienen oportunidades abiertas.</EmptyBlock>
          ) : (
            <Table className="min-w-[640px] print:min-w-0">
              <TableHeader>
                <TableRow>
                  <TableHead>Oportunidad</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead numeric>Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.oportunidades.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-semibold text-ink-950">{o.nombre}</TableCell>
                    <TableCell className="text-[12.5px]">{o.cliente.nombre}</TableCell>
                    <TableCell className="text-[12.5px]">{ESTADO_OPORTUNIDAD_LABELS[o.estado].label}</TableCell>
                    <Numero>{formatMonto(o.valor_estimado_cop)}</Numero>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Seccion>
      )}

      <Seccion id="etiqueta-bitacora" titulo="Bitácora">
        {data.bitacora.length === 0 ? (
          <EmptyBlock>No hay interacciones con estos clientes en el período.</EmptyBlock>
        ) : (
          <Table className="min-w-[860px] print:min-w-0">
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Interacción</TableHead>
                <TableHead>Próximo paso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.bitacora.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-[12px] whitespace-nowrap tabular-nums">{formatFechaCalendario(b.fecha)}</TableCell>
                  <TableCell className="text-[12.5px]">{b.cliente.nombre}</TableCell>
                  <TableCell className="text-[12.5px]">{TIPO_INTERACCION_LABELS[b.tipo]}</TableCell>
                  <TableCell className="max-w-[320px] text-[12.5px] whitespace-normal">{b.texto}</TableCell>
                  <TableCell className="max-w-[240px] text-[12.5px] whitespace-normal">{b.proximo_paso ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Seccion>

      <Seccion id="etiqueta-tareas" titulo="Tareas">
        {data.tareas.length === 0 ? (
          <EmptyBlock>No hay tareas con esta etiqueta en el período.</EmptyBlock>
        ) : (
          <Table className="min-w-[720px] print:min-w-0">
            <TableHeader>
              <TableRow>
                <TableHead>Tarea</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha de entrega</TableHead>
                <TableHead>Responsable</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* The server delivers them overdue first; the order is kept as is. */}
              {data.tareas.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="max-w-[320px] font-semibold whitespace-normal text-ink-950">{t.titulo}</TableCell>
                  <TableCell className="text-[12.5px]">{ESTADO_TAREA_LABELS[t.estado].label}</TableCell>
                  <TableCell className="text-[12.5px] whitespace-nowrap">
                    <span className="font-mono text-[12px] tabular-nums">
                      {t.fecha_entrega ? formatFechaCalendario(t.fecha_entrega) : "Sin fecha"}
                    </span>
                    {t.vencida && (
                      <span className="ml-2 rounded-full bg-destructivo/15 px-2 py-0.5 text-[11px] font-bold text-destructivo">
                        Vencida
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-[12.5px]">{t.responsable.nombre}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Seccion>

      <div className="flex flex-col gap-1 border-t border-border pt-3 text-[11.5px] text-ink-500">
        <p>{NOTA_ETIQUETAS}</p>
        <p>{NOTA_TAREAS_PERIODO}</p>
        <p>{NOTA_DIAS_SIN_INTERACCION}</p>
      </div>
    </div>
  );
}

/* ── Internal pieces ────────────────────────────────────────────────────── */

/**
 * Tag picker fed by the live `task_tags` catalog (S3), like the client list filter. A chosen tag no longer in the
 * catalog stays offered so the select still shows it.
 */
function EtiquetaSelect({ value, onChange }: { value: string; onChange: (etiqueta: string) => void }) {
  const tagsQuery = useTaskTags();
  const catalogTags = tagsQuery.data ?? [...TASK_TAGS];
  const options = value && !catalogTags.includes(value) ? [...catalogTags, value] : catalogTags;
  return (
    <div className="flex flex-col gap-1">
      <span aria-hidden className="text-[11.5px] font-bold tracking-[0.08em] text-ink-500 uppercase">
        Etiqueta
      </span>
      <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
        <SelectTrigger aria-label="Etiqueta" className={cn(SELECT_CLASS, "min-w-[180px]")}>
          <SelectValue placeholder="Elige una etiqueta" />
        </SelectTrigger>
        <SelectContent>
          {options.map((tag) => (
            <SelectItem key={tag} value={tag}>
              {tag}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Titulo({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="mb-3 font-display text-[15px] font-bold tracking-[-0.01em] text-ink-950">
      {children}
    </h2>
  );
}

function Seccion({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="surface min-w-0 p-4 print:break-inside-avoid print:border-0 print:p-0">
      <Titulo id={id}>{titulo}</Titulo>
      <div className="overflow-x-auto print:overflow-visible">{children}</div>
    </section>
  );
}

function Numero({ children }: { children: ReactNode }) {
  return <TableCell className="text-right font-mono text-[12.5px] tabular-nums">{children}</TableCell>;
}

/** The server color, verbatim; no color (project not measurable) means no chip. */
function Semaforo({ color }: { color: ColorSemaforo | null }) {
  if (color === null) return <span className="text-[12px] text-ink-500">Sin medir</span>;
  return <SemaforoChip color={color} />;
}
