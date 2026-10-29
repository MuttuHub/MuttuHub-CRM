"use client";

// Reportes › Semanal (S5): el informe para presentar cada semana. Lo calcula entero el servidor
// (`GET /api/v1/reports/weekly`, que compone el Tablero gerencial, «Requiere atención», las tareas y la cola de
// validación de gastos); aquí solo se pinta: el color de cada semáforo, los porcentajes y los montos llegan
// hechos y nunca se recalculan. La semana va de lunes a domingo (Bogotá). «Generar reporte» abre la vista de
// impresión en la misma pestaña (S4) y «Exportar Excel» baja el mismo reporte como libro.

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { formatFechaCalendario } from "@/components/proyectos/project-display";
import { formatPct } from "@/components/proyectos/project-kpis-panel";
import { EmptyBlock, InlineError } from "@/components/proyectos/ui";
import { SemaforoChip } from "@/components/proyectos/semaforo-chip";
import { StatTile } from "@/components/dashboard/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  downloadReporteSemanal,
  reporteSemanalPrintHref,
  useReporteSemanal,
  type ReporteSemanal,
} from "@/hooks/reportes";
import type { ColorSemaforo } from "@/hooks/projects";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import { desplazarSemana, semanaActual, semanaDe } from "@/lib/reportes/semana";

const ERROR_REPORTE = "No pudimos generar el reporte semanal. Inténtalo de nuevo.";

const formatMonto = (value: string | null): string => (value === null ? "—" : formatCOP(toCents(value)));

export function etiquetaSemana(semana: { desde: string; hasta: string }): string {
  return `Semana del ${formatFechaCalendario(semana.desde)} al ${formatFechaCalendario(semana.hasta)}`;
}

/** La pestaña: selector de semana, acciones y el reporte. */
export function ReporteSemanalTab() {
  // null = la semana en curso (la fija el servidor, en Bogotá).
  const [semana, setSemana] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const query = useReporteSemanal(semana);
  const data = query.data;

  const vista = semana ?? data?.semana.desde ?? null;
  const semanaVista = vista ? semanaDe(vista) : null;
  const enCurso = semanaVista === null || semanaVista.desde >= semanaActual().desde;

  function mover(n: number) {
    if (semanaVista) setSemana(desplazarSemana(semanaVista, n).desde);
  }

  async function exportar() {
    setExportando(true);
    try {
      await downloadReporteSemanal(vista);
    } catch (error) {
      toast.error(errorMessage(error, "No pudimos generar el archivo. Inténtalo de nuevo."));
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="surface flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" aria-label="Semana anterior" disabled={!semanaVista} onClick={() => mover(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <p className="min-w-0 text-[13px] font-semibold text-ink-900">
            {data ? etiquetaSemana(data.semana) : "Semana en curso"}
          </p>
          <Button type="button" variant="outline" size="icon" aria-label="Semana siguiente" disabled={enCurso} onClick={() => mover(1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled={!data || exportando} onClick={exportar}>
            <Download className="size-4" />
            Exportar Excel
          </Button>
          {vista && (
            <Link
              href={reporteSemanalPrintHref(vista)}
              className="inline-flex h-10 items-center gap-2 rounded-12 bg-rose-500 px-4 text-[13px] font-bold text-white transition-colors hover:bg-rose-700"
            >
              <Printer className="size-4" strokeWidth={1.9} />
              Generar reporte
            </Link>
          )}
        </div>
      </div>

      {query.isLoading && <Skeleton className="h-64 w-full" />}
      {query.isError && <InlineError message={errorMessage(query.error, ERROR_REPORTE)} />}
      {data && <ReporteSemanalContenido data={data} />}
    </div>
  );
}

/** El cuerpo del reporte: lo comparten la pestaña y la vista de impresión. */
export function ReporteSemanalContenido({ data }: { data: ReporteSemanal }) {
  const total = data.portafolio.total;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {!data.confirmado && (
        <p className="text-[12px] text-ink-600">Los umbrales del semáforo son provisionales hasta que se confirmen.</p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
        <StatTile label="Proyectos" value={data.portafolio.proyectos.length} foot={`Corte ${formatFechaCalendario(data.corte)}`} />
        <StatTile
          label="Avance real promedio"
          value={formatPct(total.tecnico.avance_real)}
          foot={`Programado ${formatPct(total.tecnico.avance_programado)}`}
        />
        <StatTile
          label="Ejecutado"
          mono
          value={formatMonto(total.financiero.ejecutado)}
          foot={`de ${formatMonto(total.financiero.asignado)} asignado`}
        />
        <StatTile label="Actividades atrasadas" value={total.atrasadas} acento={total.atrasadas > 0} />
      </div>

      <Seccion id="semanal-proyectos" titulo="Portafolio por proyecto">
        {data.portafolio.proyectos.length === 0 ? (
          <EmptyBlock>No hay proyectos en tu portafolio.</EmptyBlock>
        ) : (
          <Table className="min-w-[960px] print:min-w-0">
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Proyecto</TableHead>
                <TableHead>Semáforo técnico</TableHead>
                <TableHead>Semáforo financiero</TableHead>
                <TableHead numeric>Avance real</TableHead>
                <TableHead numeric>Avance programado</TableHead>
                <TableHead numeric>Asignado</TableHead>
                <TableHead numeric>Programado</TableHead>
                <TableHead numeric>Ejecutado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.portafolio.proyectos.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-[12px] font-semibold tabular-nums">{p.codigo}</TableCell>
                  <TableCell className="max-w-[220px]">
                    <p className="truncate font-semibold text-ink-950" title={p.nombre}>{p.nombre}</p>
                    <p className="truncate text-[11.5px] text-ink-600">{p.cliente.nombre}</p>
                  </TableCell>
                  <TableCell><Semaforo color={p.semaforo_tecnico} /></TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Semaforo color={p.semaforo_financiero} />
                      {p.alerta_retraso && <span className="text-[11.5px] font-semibold text-alerta">Posible retraso</span>}
                    </div>
                  </TableCell>
                  <Numero>{formatPct(p.avance_real)}</Numero>
                  <Numero>{formatPct(p.avance_programado)}</Numero>
                  <Numero>{formatMonto(p.asignado)}</Numero>
                  <Numero>{formatMonto(p.programado)}</Numero>
                  <Numero>{formatMonto(p.ejecutado)}</Numero>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Seccion>

      <Seccion id="semanal-clientes" titulo="Portafolio por cliente">
        {data.portafolio.por_cliente.length === 0 ? (
          <EmptyBlock>No hay clientes con proyectos en tu portafolio.</EmptyBlock>
        ) : (
          <Table className="min-w-[860px] print:min-w-0">
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead numeric>Proyectos</TableHead>
                <TableHead numeric>Avance real</TableHead>
                <TableHead numeric>Asignado</TableHead>
                <TableHead numeric>Programado</TableHead>
                <TableHead numeric>Ejecutado</TableHead>
                <TableHead>Semáforo técnico</TableHead>
                <TableHead>Semáforo financiero</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.portafolio.por_cliente.map((c) => (
                <TableRow key={c.cliente.id}>
                  <TableCell className="font-semibold text-ink-950">{c.cliente.nombre}</TableCell>
                  <Numero>{c.proyectos}</Numero>
                  <Numero>{formatPct(c.tecnico.avance_real)}</Numero>
                  <Numero>{formatMonto(c.financiero.asignado)}</Numero>
                  <Numero>{formatMonto(c.financiero.programado)}</Numero>
                  <Numero>{formatMonto(c.financiero.ejecutado)}</Numero>
                  <TableCell><ConteoColores conteo={c.por_color_tecnico} /></TableCell>
                  <TableCell><ConteoColores conteo={c.por_color_financiero} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Seccion>

      <Seccion id="semanal-tareas" titulo="Tareas: esta semana frente a la anterior">
        <Table className="max-w-[560px]">
          <TableHeader>
            <TableRow>
              <TableHead>Tareas</TableHead>
              <TableHead numeric>Esta semana</TableHead>
              <TableHead numeric>Semana anterior</TableHead>
              <TableHead numeric>Diferencia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <FilaTareas etiqueta="Cerradas" actual={data.tareas.semana.cerradas} anterior={data.tareas.semana_anterior.cerradas} />
            <FilaTareas etiqueta="Vencidas" actual={data.tareas.semana.vencidas} anterior={data.tareas.semana_anterior.vencidas} />
          </TableBody>
        </Table>
        <p className="mt-2 text-[11.5px] text-ink-500">
          Vencidas: su fecha de entrega cayó en la semana y no se cerraron a tiempo.
        </p>
      </Seccion>

      <Seccion id="semanal-actividades" titulo="Actividades atrasadas">
        {data.actividades_atrasadas.length === 0 ? (
          <EmptyBlock>No hay actividades atrasadas al corte.</EmptyBlock>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.actividades_atrasadas.map((a, i) => (
              <li key={`${a.proyecto.id}-${a.actividad_id ?? i}`} className="rounded-inner border border-border px-3 py-2 text-[13px]">
                <span className="font-mono text-[12px] font-semibold text-ink-700">{a.proyecto.codigo}</span>{" "}
                <span className="font-semibold text-ink-950">{a.proyecto.nombre}</span>
                <p className="text-ink-700">{a.detalle}</p>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion id="semanal-atencion" titulo="Requiere atención">
        {data.atencion.length === 0 ? (
          <EmptyBlock>Ningún proyecto requiere atención al corte.</EmptyBlock>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.atencion.map((p) => (
              <li key={p.proyecto.id} className="rounded-inner border border-border px-3 py-2">
                <p className="text-[13px]">
                  <span className="font-mono text-[12px] font-semibold text-ink-700">{p.proyecto.codigo}</span>{" "}
                  <span className="font-semibold text-ink-950">{p.proyecto.nombre}</span>
                </p>
                <ul className="mt-1 flex flex-col gap-1">
                  {p.items.map((item, i) => (
                    <li key={`${item.tipo}-${i}`} className="text-[12.5px] text-ink-700">
                      <span className="font-semibold text-ink-900">{item.titulo}:</span> {item.detalle}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      {data.gastos_por_validar && (
        <Seccion id="semanal-gastos" titulo="Gastos por validar">
          {data.gastos_por_validar.cantidad === 0 ? (
            <EmptyBlock>No hay gastos pendientes de validación.</EmptyBlock>
          ) : (
            <Table className="min-w-[640px] print:min-w-0">
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Proyecto</TableHead>
                  <TableHead numeric>Gastos</TableHead>
                  <TableHead numeric>Monto</TableHead>
                  <TableHead>Registrado desde</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.gastos_por_validar.por_proyecto.map((g) => (
                  <TableRow key={g.proyecto.id}>
                    <TableCell className="font-mono text-[12px] font-semibold tabular-nums">{g.proyecto.codigo}</TableCell>
                    <TableCell className="font-semibold text-ink-950">{g.proyecto.nombre}</TableCell>
                    <Numero>{g.cantidad}</Numero>
                    <Numero>{formatMonto(g.monto)}</Numero>
                    <TableCell>{formatFechaCalendario(g.mas_antiguo)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-bold" colSpan={2}>Total</TableCell>
                  <Numero>{data.gastos_por_validar.cantidad}</Numero>
                  <Numero>{formatMonto(data.gastos_por_validar.monto)}</Numero>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          )}
        </Seccion>
      )}
    </div>
  );
}

/* ── Piezas internas ────────────────────────────────────────────────────── */

function Seccion({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="surface min-w-0 p-4 print:break-inside-avoid print:border-0 print:p-0">
      <h2 id={id} className="mb-3 font-display text-[15px] font-bold tracking-[-0.01em] text-ink-950">
        {titulo}
      </h2>
      <div className="overflow-x-auto print:overflow-visible">{children}</div>
    </section>
  );
}

function Numero({ children }: { children: ReactNode }) {
  return <TableCell className="text-right font-mono text-[12.5px] tabular-nums">{children}</TableCell>;
}

/** El color del servidor, verbatim; sin color (proyecto no medible) no hay chip. */
function Semaforo({ color }: { color: ColorSemaforo | null }) {
  if (color === null) return <span className="text-[12px] text-ink-500">Sin medir</span>;
  return <SemaforoChip color={color} />;
}

function ConteoColores({ conteo }: { conteo: Record<ColorSemaforo, number> }) {
  return (
    <span className="text-[12px] text-ink-700 tabular-nums">
      {conteo.verde} verde · {conteo.amarillo} amarillo · {conteo.rojo} rojo
    </span>
  );
}

function FilaTareas({ etiqueta, actual, anterior }: { etiqueta: string; actual: number; anterior: number }) {
  const diferencia = actual - anterior;
  const texto = diferencia > 0 ? `+${diferencia}` : diferencia < 0 ? `−${-diferencia}` : "0";
  return (
    <TableRow>
      <TableHead scope="row">{etiqueta}</TableHead>
      <Numero>{actual}</Numero>
      <Numero>{anterior}</Numero>
      <Numero>{texto}</Numero>
    </TableRow>
  );
}
