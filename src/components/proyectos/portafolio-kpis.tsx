// Fila de KPIs del Portafolio (v6): proyectos, presupuesto activo, beneficiarios y actividades atrasadas.
// Lee dos fuentes ya cargadas por el listado: las filas (`GET projects`: conteo y `valor_total`) y el
// agregado del servidor (`GET dashboard/portfolio`: beneficiarios y atrasadas por AJ-03). Aquí solo se pinta:
// el cliente no recalcula ningún semáforo ni cuenta actividades.
// Presupuesto activo (D8) = suma del `valor_total` de los proyectos EN_EJECUCION, en centavos exactos.

"use client";

import { InlineError } from "@/components/proyectos/ui";
import { formatFechaCalendario } from "@/components/proyectos/project-display";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiTile } from "@/components/ui/kpi-tile";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectListRow, ProjectsPortfolio } from "@/hooks/projects";
import { formatMillones } from "@/lib/format/millones";
import { formatCOP, toCents } from "@/lib/proyectos/money";

const KPIS_ERROR = "No pudimos cargar el resumen del portafolio. Inténtalo de nuevo.";
const GRID = "grid grid-cols-2 gap-3 lg:grid-cols-4";
const TILE = "surface p-4 lg:p-5";

const numero = new Intl.NumberFormat("es-CO");

/** D8: solo los proyectos EN_EJECUCION; el decimal llega como string y se suma en centavos. */
function presupuestoActivo(lista: readonly ProjectListRow[]): bigint {
  return lista
    .filter((proyecto) => proyecto.estado === "EN_EJECUCION" && proyecto.valor_total !== null)
    .reduce((suma, proyecto) => suma + toCents(proyecto.valor_total as string), BigInt(0));
}

export function PortafolioKpis({
  lista,
  portafolio,
  isLoading,
  isError,
}: {
  lista: readonly ProjectListRow[] | undefined;
  portafolio: ProjectsPortfolio | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isError) return <InlineError message={KPIS_ERROR} />;

  if (lista && lista.length === 0) {
    return (
      <EmptyState
        bordered
        data-testid="portafolio-kpis-vacio"
        title="Aún no hay nada que resumir"
        description="Cuando haya proyectos visibles aparecerán aquí sus totales."
      />
    );
  }

  if (isLoading || !lista || !portafolio) {
    return (
      <div className={GRID} data-testid="portafolio-kpis-cargando">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] w-full rounded-card" />
        ))}
      </div>
    );
  }

  const { beneficiarios, atrasadas } = portafolio.agregado;
  const presupuesto = presupuestoActivo(lista);
  const enEjecucion = lista.filter((proyecto) => proyecto.estado === "EN_EJECUCION").length;

  return (
    <div className={GRID} data-testid="portafolio-kpis">
      <KpiTile
        data-testid="kpi-proyectos"
        className={TILE}
        label="Proyectos"
        value={numero.format(lista.length)}
        hint={`${enEjecucion} en ejecución`}
      />
      <KpiTile
        data-testid="kpi-presupuesto"
        className={TILE}
        label="Presupuesto activo"
        value={<span title={formatCOP(presupuesto)} className="block max-w-full truncate text-[24px] sm:text-[28px]">{formatMillones(presupuesto)}</span>}
        hint="Valor total en ejecución"
      />
      <KpiTile
        data-testid="kpi-beneficiarios"
        className={TILE}
        label="Beneficiarios"
        value={numero.format(beneficiarios.total)}
        hint="Suma de los proyectos"
      />
      <KpiTile
        data-testid="kpi-atrasadas"
        className={TILE}
        label="Actividades atrasadas"
        value={numero.format(atrasadas)}
        hint={`Vencidas al corte del ${formatFechaCalendario(portafolio.corte)}`}
      />
    </div>
  );
}
