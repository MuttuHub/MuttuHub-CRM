"use client";

// Reportes › Proyecto (T9c: S15, S17). The server computes the whole report (`GET /api/v1/reports/project`, built
// from the project, its allies, their opportunities, the bitácora about the project and its tasks); this screen only
// paints it: amounts, percentages and the meta vs. comprometido figures arrive done and are never recalculated. A
// section the user cannot see arrives as null and is hidden, not shown empty (S5). «Generar reporte» opens the print
// view in the same tab and «Exportar Excel» downloads the same report as a workbook (S17).

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { EstadoAliado, FaseOportunidad } from "@prisma/client";
import { ESTADO_ALIADO_LABEL, ROL_ALIADO_LABEL } from "@/lib/proyectos/aliados-labels";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { ESTADO_PROYECTO_META, formatFechaCalendario } from "@/components/proyectos/project-display";
import { formatPct } from "@/components/proyectos/project-kpis-panel";
import { EmptyBlock, InlineError, SELECT_CLASS } from "@/components/proyectos/ui";
import { ToneBadge } from "@/components/crm/shared";
import { TIPO_INTERACCION_LABELS } from "@/components/crm/interacciones-feed";
import { StatTile } from "@/components/dashboard/shared";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useProjects } from "@/hooks/projects";
import {
  downloadReporteProyecto,
  reporteProyectoPrintHref,
  useReporteProyecto,
  type ReporteProyecto,
} from "@/hooks/reportes";
import { ESTADO_OPORTUNIDAD_LABELS, ESTADO_TAREA_LABELS, type UiTone } from "@/lib/catalogs";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import { NOTA_COMPROMETIDO, NOTA_META, NOTA_OPORTUNIDADES, NOTA_SIN_CUBRIR } from "@/lib/reportes/proyecto-notas";
import { cn } from "@/lib/utils";

const ERROR_REPORTE = "No pudimos generar el reporte del proyecto. Inténtalo de nuevo.";
export const ELIGE_PROYECTO = "Elige un proyecto para ver su reporte.";

const ESTADO_ALIADO_TONE: Record<EstadoAliado, UiTone> = {
  COMPROMETIDO: "exito",
  EN_GESTION: "alerta",
  DESCARTADO: "neutro",
};
const FASE_OPORTUNIDAD_LABELS: Record<FaseOportunidad, string> = {
  PROSPECCION: "Prospección",
  EJECUCION: "Ejecución",
};
const VINCULO_LABELS: Record<NonNullable<ReporteProyecto["oportunidades"]>[number]["vinculo"], string> = {
  PROYECTO: "Del proyecto",
  ALIADO: "De un aliado",
};

const formatMonto = (value: string | null): string => (value === null ? "—" : formatCOP(toCents(value)));

/** «PRY-0007 Moda circular»: how the print title and footer name the project. */
export function proyectoTitulo(data: Pick<ReporteProyecto, "resumen">): string {
  const { codigo, nombre } = data.resumen.proyecto;
  return `${codigo} ${nombre}`;
}

/** «Cliente · Corte …»: who the project is for plus the cut-off of the figures. */
export function proyectoSubtitulo(data: Pick<ReporteProyecto, "resumen" | "corte">): string {
  return `${data.resumen.cliente} · Corte ${formatFechaCalendario(data.corte)}`;
}

/** The tab: project picker, actions and the report. `proyectoInicial` comes from the deep link (S17). */
export function ReporteProyectoTab({ proyectoInicial = "" }: { proyectoInicial?: string }) {
  const [proyectoId, setProyectoId] = useState(proyectoInicial);
  const [exportando, setExportando] = useState(false);
  const query = useReporteProyecto(proyectoId);
  const data = proyectoId ? query.data : undefined;

  async function exportar() {
    setExportando(true);
    try {
      await downloadReporteProyecto(proyectoId);
    } catch (error) {
      toast.error(errorMessage(error, "No pudimos generar el archivo. Inténtalo de nuevo."));
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="surface flex flex-wrap items-end justify-between gap-3 p-3">
        <ProyectoSelect value={proyectoId} onChange={setProyectoId} />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled={!data || exportando} onClick={exportar}>
            <Download className="size-4" />
            Exportar Excel
          </Button>
          {proyectoId && (
            <Link
              href={reporteProyectoPrintHref(proyectoId)}
              className="inline-flex h-10 items-center gap-2 rounded-12 bg-rose-500 px-4 text-[13px] font-bold text-white transition-colors hover:bg-rose-700"
            >
              <Printer className="size-4" strokeWidth={1.9} />
              Generar reporte
            </Link>
          )}
        </div>
      </div>

      {!proyectoId && <EmptyBlock>{ELIGE_PROYECTO}</EmptyBlock>}
      {proyectoId && query.isLoading && <Skeleton className="h-64 w-full" />}
      {proyectoId && query.isError && <InlineError message={errorMessage(query.error, ERROR_REPORTE)} />}
      {data && !query.isError && (
        <>
          <p className="text-[13px] font-semibold text-ink-900">{proyectoSubtitulo(data)}</p>
          <ReporteProyectoContenido data={data} />
        </>
      )}
    </div>
  );
}

/** The report body, shared by the tab and the print view. */
export function ReporteProyectoContenido({ data }: { data: ReporteProyecto }) {
  const { resumen, tareas } = data;
  const filasTareas = [...tareas.vencidas.map((t) => ({ ...t, vencida: true })), ...tareas.proximas.map((t) => ({ ...t, vencida: false }))];
  const medibles = tareas.resumen.total - tareas.resumen.canceladas;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <section aria-labelledby="proyecto-resumen" className="min-w-0 print:break-inside-avoid">
        <Titulo id="proyecto-resumen">Resumen</Titulo>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
          <StatTile label="Cliente" value={<span className="text-[15px]">{resumen.cliente}</span>} />
          <StatTile
            label="Estado"
            value={ESTADO_PROYECTO_META[resumen.proyecto.estado].label}
            foot={`Responsable: ${resumen.responsable?.nombre ?? "Sin asignar"}`}
          />
          <StatTile label="Valor total" mono value={formatMonto(resumen.valor_total)} />
          <StatTile
            label="Ejecución presupuestal"
            mono
            value={formatMonto(resumen.financiero?.ejecutado ?? null)}
            foot={resumen.financiero ? `de ${formatMonto(resumen.financiero.programado)} programado` : "Sin medir todavía"}
          />
          {resumen.financiacion !== null && (
            <>
              <StatTile label="Meta" mono value={formatMonto(resumen.financiacion.meta)} />
              <StatTile label="Comprometido" mono value={formatMonto(resumen.financiacion.comprometido)} />
              <StatTile label="En gestión" mono value={formatMonto(resumen.financiacion.en_gestion)} />
              <StatTile label="Sin cubrir" mono value={formatMonto(resumen.financiacion.sin_cubrir)} />
            </>
          )}
        </div>
      </section>

      <Seccion id="proyecto-aliados" titulo="Aliados">
        {data.aliados.length === 0 ? (
          <EmptyBlock>Este proyecto no tiene aliados.</EmptyBlock>
        ) : (
          <Table className="min-w-[720px] print:min-w-0">
            <TableHeader>
              <TableRow>
                <TableHead>Aliado</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead numeric>Aporte</TableHead>
                <TableHead>Última interacción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.aliados.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-semibold text-ink-950">{a.cliente.nombre}</TableCell>
                  <TableCell className="text-[12.5px]">{ROL_ALIADO_LABEL[a.rol]}</TableCell>
                  <TableCell>
                    <ToneBadge tone={ESTADO_ALIADO_TONE[a.estado]} label={ESTADO_ALIADO_LABEL[a.estado]} />
                  </TableCell>
                  <Numero>{a.aporte_cop === null ? "—" : formatCOP(toCents(a.aporte_cop))}</Numero>
                  <TableCell className="text-[12.5px]">
                    {a.ultima_interaccion ? (
                      <span className="font-mono text-[12px] tabular-nums">{formatFechaCalendario(a.ultima_interaccion)}</span>
                    ) : (
                      "Sin interacciones"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Seccion>

      {data.oportunidades !== null && (
        <Seccion id="proyecto-oportunidades" titulo="Oportunidades">
          {data.oportunidades.length === 0 ? (
            <EmptyBlock>No hay oportunidades vinculadas a este proyecto.</EmptyBlock>
          ) : (
            <Table className="min-w-[760px] print:min-w-0">
              <TableHeader>
                <TableRow>
                  <TableHead>Oportunidad</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vínculo</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead numeric>Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.oportunidades.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-semibold text-ink-950">{o.nombre}</TableCell>
                    <TableCell className="text-[12.5px]">{o.cliente.nombre}</TableCell>
                    <TableCell className="text-[12.5px]">{VINCULO_LABELS[o.vinculo]}</TableCell>
                    <TableCell className="text-[12.5px]">{FASE_OPORTUNIDAD_LABELS[o.fase]}</TableCell>
                    <TableCell className="text-[12.5px]">{ESTADO_OPORTUNIDAD_LABELS[o.estado].label}</TableCell>
                    <Numero>{formatMonto(o.valor_estimado_cop)}</Numero>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Seccion>
      )}

      <Seccion id="proyecto-bitacora" titulo="Bitácora">
        {data.bitacora.length === 0 ? (
          <EmptyBlock>No hay interacciones registradas sobre este proyecto.</EmptyBlock>
        ) : (
          <Table className="min-w-[860px] print:min-w-0">
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Aliado</TableHead>
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

      <Seccion id="proyecto-tareas" titulo="Tareas">
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
          <StatTile label="Avance" value={formatPct(tareas.resumen.avance_pct)} />
          <StatTile label="Completadas" value={`${tareas.resumen.completadas} de ${medibles}`} />
          <StatTile label="Vencidas" value={tareas.vencidas.length} acento={tareas.vencidas.length > 0} />
          <StatTile label="Próximas" value={tareas.proximas.length} />
        </div>
        {filasTareas.length === 0 ? (
          <EmptyBlock>Este proyecto no tiene tareas abiertas.</EmptyBlock>
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
              {filasTareas.map((t) => (
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
        {resumen.financiacion !== null && (
          <>
            <p>{NOTA_META}</p>
            <p>{NOTA_COMPROMETIDO}</p>
            <p>{NOTA_SIN_CUBRIR}</p>
          </>
        )}
        {data.oportunidades !== null && <p>{NOTA_OPORTUNIDADES}</p>}
      </div>
    </div>
  );
}

/* ── Internal pieces ────────────────────────────────────────────────────── */

/**
 * Project picker fed by the projects the user can see (`GET /api/v1/projects`), shown as «código · nombre». A
 * project from the deep link that is not in the list yet still shows its id until the list loads.
 */
function ProyectoSelect({ value, onChange }: { value: string; onChange: (proyectoId: string) => void }) {
  const proyectos = useProjects({}).data?.proyectos ?? [];
  const etiqueta = (id: string): string => {
    const p = proyectos.find((x) => x.id === id);
    return p ? `${p.codigo} · ${p.nombre}` : id;
  };
  return (
    <div className="flex flex-col gap-1">
      <span aria-hidden className="text-[11.5px] font-bold tracking-[0.08em] text-ink-500 uppercase">
        Proyecto
      </span>
      <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
        <SelectTrigger aria-label="Proyecto" className={cn(SELECT_CLASS, "min-w-[260px]")}>
          <SelectValue>{(v: string | null) => (v ? etiqueta(v) : "Elige un proyecto")}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {proyectos.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {`${p.codigo} · ${p.nombre}`}
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
