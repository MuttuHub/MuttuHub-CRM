// Fila de KPIs del libro de Gastos (v6): total registrado, validados, por validar, con soporte y observados.
// Solo pinta lo que calcula el servidor (`totales` por estado y `resumen`); el cliente no recalcula conteos ni
// sumas. D5: "observado" no es un estado, es un REGISTRADO con alerta de sobregasto o con datos incompletos.
// Dinero en estilo compacto (`formatMillones`) con el monto exacto en `title`.

"use client";

import { errorMessage, plural } from "@/components/proyectos/estructura-ui";
import { InlineError } from "@/components/proyectos/ui";
import { KpiTile } from "@/components/ui/kpi-tile";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectExpenses } from "@/hooks/projects";
import { formatMillones } from "@/lib/format/millones";
import { formatCOP, toCents } from "@/lib/proyectos/money";

export const GASTOS_ERROR = "No pudimos cargar los gastos. Inténtalo de nuevo.";

const GRID = "grid grid-cols-2 gap-3 lg:grid-cols-5";
const TILE = "surface p-4 lg:p-5";
const numero = new Intl.NumberFormat("es-CO");

/** Compacto con el monto exacto en `title` (el decimal llega como string y se opera en centavos). */
function Dinero({ cents }: { cents: bigint }) {
  return <span title={formatCOP(cents)}>{formatMillones(cents)}</span>;
}

export function GastosKpis({
  data,
  isLoading,
  isError,
  error,
}: {
  data: ProjectExpenses | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
}) {
  if (isError) return <InlineError message={errorMessage(error, GASTOS_ERROR)} />;

  if (isLoading || !data) {
    return (
      <div className={GRID} data-testid="gastos-kpis-cargando">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] w-full rounded-card" />
        ))}
      </div>
    );
  }

  const { totales, resumen } = data;
  const vigente = toCents(totales.REGISTRADO.valor) + toCents(totales.VALIDADO.valor);
  const gastos = (cantidad: number) => plural(cantidad, "gasto", "gastos");

  return (
    <div className={GRID} data-testid="gastos-kpis">
      <KpiTile
        data-testid="gastos-kpi-total"
        className={TILE}
        label="Total registrado"
        value={<Dinero cents={vigente} />}
        hint={`${gastos(resumen.vigentes)} vigentes`}
      />
      <KpiTile
        data-testid="gastos-kpi-validados"
        className={TILE}
        label="Validados"
        tone="exito"
        value={<Dinero cents={toCents(totales.VALIDADO.valor)} />}
        hint={gastos(totales.VALIDADO.cantidad)}
      />
      <KpiTile
        data-testid="gastos-kpi-por-validar"
        className={TILE}
        label="Por validar"
        value={<Dinero cents={toCents(totales.REGISTRADO.valor)} />}
        hint={gastos(totales.REGISTRADO.cantidad)}
      />
      <KpiTile
        data-testid="gastos-kpi-con-soporte"
        className={TILE}
        label="Con soporte"
        value={
          resumen.con_soporte === undefined
            ? "—"
            : `${numero.format(resumen.con_soporte)} de ${numero.format(resumen.vigentes)}`
        }
        hint={resumen.con_soporte === undefined ? "Sin acceso a soportes" : "Gastos vigentes con soporte"}
      />
      <KpiTile
        data-testid="gastos-kpi-observados"
        className={TILE}
        label="Observados"
        tone={resumen.observados.cantidad > 0 ? "alerta" : undefined}
        value={numero.format(resumen.observados.cantidad)}
        hint={<Dinero cents={toCents(resumen.observados.valor)} />}
      />
    </div>
  );
}
