// Tablero del portafolio de proyectos (S9 U6, RF-30; `/proyectos?vista=tablero`). De solo lectura: cada
// semáforo, porcentaje y alerta llega calculado por el servidor (`GET /dashboard/portfolio`) y aquí solo se
// pinta; el cliente NUNCA recalcula un color. El alcance (todos, o solo los proyectos del COORDINADOR) lo
// aplica la API. Solo agregados: sin gastos individuales ni soportes, y sin desglose por territorio (el
// municipio es solo un filtro). Mientras los parámetros del semáforo no estén confirmados se muestra
// la insignia "No confirmado".

"use client";

import { useMemo, useState } from "react";
import { Download, Eye, FolderKanban } from "lucide-react";
import { toast } from "sonner";
import { ToneBadge } from "@/components/crm/shared";
import { BarRow, StatTile } from "@/components/dashboard/shared";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { InlineError, SELECT_CLASS } from "@/components/proyectos/ui";
import { ESTADO_PROYECTO_META, formatFechaCalendario } from "@/components/proyectos/project-display";
import { formatPct } from "@/components/proyectos/project-kpis-panel";
import { SemaforoChip } from "@/components/proyectos/semaforo-chip";
import { ProjectFichaDialog } from "@/components/proyectos/project-ficha-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useClientOptions } from "@/hooks/kanban";
import { useUsers } from "@/hooks/crm";
import {
  downloadPortfolioExport,
  useMunicipalities,
  useProjectsPortfolio,
  useStrategicLines,
  type ColorSemaforo,
  type PortfolioFilters,
  type PortfolioProject,
} from "@/hooks/projects";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import type { EstadoProyecto } from "@prisma/client";

const ESTADOS: EstadoProyecto[] = ["PLANIFICACION", "BORRADOR", "EN_EJECUCION", "SUSPENDIDO", "CERRADO", "CANCELADO"];
const TABLERO_ERROR = "No pudimos cargar el tablero de proyectos. Inténtalo de nuevo.";

type FiltroKey = keyof PortfolioFilters;

export function ProjectDashboard() {
  const [valores, setValores] = useState<Record<FiltroKey, string>>({
    corte: "",
    estado: "",
    cliente_id: "",
    linea_id: "",
    municipio_id: "",
    responsable_id: "",
  });
  const [fichaId, setFichaId] = useState<string | null>(null);
  // Solo viajan los filtros con valor: cada cambio es otra clave de consulta.
  const filters = useMemo<PortfolioFilters>(
    () => Object.fromEntries(Object.entries(valores).filter(([, valor]) => valor !== "")) as PortfolioFilters,
    [valores],
  );
  const query = useProjectsPortfolio(filters);
  const data = query.data;

  const lineas = useStrategicLines().data ?? [];
  const municipios = useMunicipalities().data ?? [];
  const clientes = useClientOptions().data ?? [];
  const responsables = useUsers().data ?? [];
  const set = (key: FiltroKey) => (event: { target: { value: string } }) =>
    setValores((previo) => ({ ...previo, [key]: event.target.value }));

  const exportar = async () => {
    try {
      await downloadPortfolioExport(filters);
    } catch (error) {
      toast.error(errorMessage(error, "No pudimos generar el archivo. Inténtalo de nuevo."));
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="tablero">
      <section className="rounded-[22px] border border-ink-200 bg-panel">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-200 p-4 lg:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Filtro label="Estado">
              <select aria-label="Estado" value={valores.estado} onChange={set("estado")} className={SELECT_CLASS}>
                <option value="">Todos</option>
                {ESTADOS.map((estado) => (
                  <option key={estado} value={estado}>
                    {ESTADO_PROYECTO_META[estado].label}
                  </option>
                ))}
              </select>
            </Filtro>
            <Filtro label="Línea estratégica">
              <select aria-label="Línea estratégica" value={valores.linea_id} onChange={set("linea_id")} className={SELECT_CLASS}>
                <option value="">Todas</option>
                {lineas.map((linea) => (
                  <option key={linea.id} value={linea.id}>
                    {`${linea.codigo} ${linea.nombre}`}
                  </option>
                ))}
              </select>
            </Filtro>
            <Filtro label="Municipio">
              <select aria-label="Municipio" value={valores.municipio_id} onChange={set("municipio_id")} className={SELECT_CLASS}>
                <option value="">Todos</option>
                {municipios.map((municipio) => (
                  <option key={municipio.id} value={municipio.id}>
                    {municipio.nombre}
                  </option>
                ))}
              </select>
            </Filtro>
            <Filtro label="Cliente">
              <select aria-label="Cliente" value={valores.cliente_id} onChange={set("cliente_id")} className={SELECT_CLASS}>
                <option value="">Todos</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nombre}
                  </option>
                ))}
              </select>
            </Filtro>
            <Filtro label="Responsable">
              <select aria-label="Responsable" value={valores.responsable_id} onChange={set("responsable_id")} className={SELECT_CLASS}>
                <option value="">Todos</option>
                {responsables.map((usuario) => (
                  <option key={usuario.id} value={usuario.id}>
                    {usuario.nombre}
                  </option>
                ))}
              </select>
            </Filtro>
            <Filtro label="Corte">
              <input type="date" aria-label="Corte" value={valores.corte} onChange={set("corte")} className={SELECT_CLASS} />
            </Filtro>
          </div>
          <div className="flex items-center gap-2">
            {data && !data.confirmado && <ToneBadge tone="neutro" label="No confirmado" />}
            <Button size="lg" variant="outline" className="rounded-12" onClick={() => void exportar()}>
              <Download className="size-4" />
              Exportar Excel
            </Button>
          </div>
        </header>

        {query.isError ? (
          <InlineError className="p-4 lg:p-5" message={errorMessage(query.error, TABLERO_ERROR)} />
        ) : query.isLoading || !data ? (
          <TableroSkeleton />
        ) : data.proyectos.length === 0 ? (
          <TableroVacio />
        ) : (
          <div className="flex flex-col gap-4 p-4 lg:p-5">
            <Resumen data={data} />
            <TablaProyectos proyectos={data.proyectos} onOpenFicha={setFichaId} />
          </div>
        )}
      </section>

      {fichaId !== null && <ProjectFichaDialog projectId={fichaId} onClose={() => setFichaId(null)} />}
    </div>
  );
}

function Filtro({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
      {label}
      {children}
    </label>
  );
}

/* ── Resumen ───────────────────────────────────────────────────────────── */

function Resumen({ data }: { data: NonNullable<ReturnType<typeof useProjectsPortfolio>["data"]> }) {
  const { agregado } = data;
  const estados = Object.entries(data.por_estado) as [EstadoProyecto, number][];
  const total = estados.reduce((suma, [, cantidad]) => suma + cantidad, 0);
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      <StatTile label="Proyectos" value={total} foot={`Corte al ${formatFechaCalendario(data.corte)}`} />
      <StatTile
        label="Avance real promedio"
        value={formatPct(agregado.tecnico.avance_real)}
        foot={`Programado ${formatPct(agregado.tecnico.avance_programado)}`}
      />
      <div data-testid="tablero-ea">
        <StatTile
          label="Ejecutado / asignado"
          value={formatPct(agregado.financiero.ea)}
          foot={`Ejecutado / programado ${formatPct(agregado.financiero.ep)}`}
        />
      </div>
      <div data-testid="tablero-ejecutado">
        <StatTile
          label="Ejecutado"
          mono
          value={formatCOP(toCents(agregado.financiero.ejecutado))}
          foot={`Asignado ${formatCOP(toCents(agregado.financiero.asignado))}`}
        />
      </div>
      <div data-testid="tablero-estados" className="flex flex-col gap-2 rounded-[20px] border border-ink-200 bg-panel p-[18px] md:col-span-2 xl:col-span-4">
        <span className="text-[12px] font-semibold text-ink-600">Proyectos por estado</span>
        {estados.map(([estado, cantidad]) => (
          <BarRow
            key={estado}
            label={ESTADO_PROYECTO_META[estado]?.label ?? estado}
            tone={ESTADO_PROYECTO_META[estado]?.tone}
            count={cantidad}
            total={total}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Tabla ─────────────────────────────────────────────────────────────── */

function TablaProyectos({ proyectos, onOpenFicha }: { proyectos: PortfolioProject[]; onOpenFicha: (id: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[1020px]">
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Proyecto</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Semáforo técnico</TableHead>
            <TableHead>Semáforo financiero</TableHead>
            <TableHead className="text-right">Avance real</TableHead>
            <TableHead className="text-right">Ejecutado / asignado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {proyectos.map((proyecto) => (
            <TableRow key={proyecto.id} data-testid={`tablero-fila-${proyecto.id}`}>
              <TableCell className="font-mono text-[12px] font-semibold text-ink-700 tabular-nums">{proyecto.codigo}</TableCell>
              <TableCell className="max-w-[300px]">
                <p className="truncate font-semibold text-ink-950">{proyecto.nombre}</p>
                <p className="truncate text-[11.5px] text-ink-600">{proyecto.cliente.nombre}</p>
              </TableCell>
              <TableCell>
                <ToneBadge tone={ESTADO_PROYECTO_META[proyecto.estado].tone} label={ESTADO_PROYECTO_META[proyecto.estado].label} />
              </TableCell>
              <TableCell>
                <Semaforo testId="chip-tecnico" color={proyecto.semaforo_tecnico} />
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Semaforo testId="chip-financiero" color={proyecto.semaforo_financiero} />
                  {proyecto.alerta_retraso && <ToneBadge tone="alerta" label="Posible retraso" />}
                </div>
              </TableCell>
              <TableCell className="text-right font-mono text-[12.5px] tabular-nums">
                {formatPct(proyecto.kpis.tecnico?.avance_real ?? null)}
              </TableCell>
              <TableCell className="text-right font-mono text-[12.5px] tabular-nums">
                {formatPct(proyecto.kpis.financiero?.ea ?? null)}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenFicha(proyecto.id)}
                  className="h-8 rounded-11 border-ink-200 bg-panel px-3 text-[12px] font-semibold text-ink-700 hover:bg-ink-100"
                >
                  <Eye className="size-3.5" strokeWidth={1.8} />
                  Ver detalle
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** El color del servidor, verbatim; sin color (proyecto no medible) no hay chip, solo "Sin medir". */
function Semaforo({ testId, color }: { testId: string; color: ColorSemaforo | null }) {
  if (color === null) return <span className="text-[12px] text-ink-500">Sin medir</span>;
  return (
    <SemaforoChip data-testid={testId} color={color} />
  );
}

function TableroSkeleton() {
  return (
    <div data-testid="tablero-skeleton" className="space-y-3 p-4 lg:p-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-[10px]" />
      ))}
    </div>
  );
}

function TableroVacio() {
  return (
    <div className="grid min-h-[260px] place-items-center px-6 py-12 text-center">
      <div className="max-w-[42ch]">
        <span className="mx-auto grid size-12 place-items-center rounded-[16px_16px_16px_6px] bg-rose-100 text-rose-700 dark:text-rose-400">
          <FolderKanban className="size-6" strokeWidth={1.7} />
        </span>
        <h3 className="mt-4 font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">No hay proyectos para mostrar</h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-600">
          Prueba con otros filtros. Si no ves ninguno, puede que no tengas proyectos a tu cargo todavía.
        </p>
      </div>
    </div>
  );
}
