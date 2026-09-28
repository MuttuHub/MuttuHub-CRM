// Gráfica de Curva S para el Tablero de Control Gerencial
// Muestra el acumulado mensual de peso (planificado) vs gasto (ejecutado)
//
// gestion-proyectos-workspace, Phase 4 (design.md T6): `CurveSChart` is now
// exported (props only) and `CurveSChartContainer` reads
// `useProjectDashboard` instead of self-fetching. `CurveSChartContainer`
// keeps its exact default-export name and a zero-arg-compatible signature
// (F1.6: the standalone `/tablero-gerencial-client.tsx` that motivated it
// was removed, but nothing calls this with `projectId` and expects the
// per-project behavior to break — kept as-is, out of scope for that change);
// the Resumen tab reuses it with `projectId` set.

'use client';

import { BarChart2, Activity } from 'lucide-react';
import { useProjectDashboard, type ProjectDashboard } from '@/hooks/projects';

type CurveSData = ProjectDashboard['curva_s'];

interface CurveSChartProps {
  data: CurveSData | null;
}

export function CurveSChart({ data }: CurveSChartProps) {
  if (!data || !data.meses.length) {
    return (
      <div className="bg-panel border border-ink-200 rounded-xl p-4">
        <h3 className="text-[14px] font-medium mb-2">Curva S</h3>
        <p className="text-[12px] text-ink-500">Sin datos disponibles</p>
      </div>
    );
  }

  // Encontrar el valor máximo para escalar el eje Y
  const maxValor = Math.max(
    ...data.planificado,
    ...data.ejecutado,
    0
  );

  return (
    <div className="bg-panel border border-ink-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-medium">Curva S</h3>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="flex items-center gap-1">
            <BarChart2 className="size-4 stroke-1.9 text-exito" />
            <span>Planificado</span>
          </span>
          <span className="flex items-center gap-1">
            <Activity className="size-4 stroke-1.9 text-destructivo" />
            <span>Ejecutado</span>
          </span>
        </div>
      </div>

      {/* Gráfico de barras simple */}
      <div className="h-[200px] relative">
        {/* Eje Y - marcas de porcentaje
            Cada marca necesita un `top` explícito: sin él, un `position:
            absolute` cae en su "static position" y, al ser hermanas
            consecutivas sin altura en el flujo, las 5 colapsan en el mismo
            punto. 100% arriba (top: 0%) y 0% abajo (top: 100%): eje
            invertido respecto al valor. `translateY(-50%)` centra la línea
            sobre el punto exacto en vez de apoyar el borde superior ahí. */}
        {[0, 25, 50, 75, 100].map((pct) => (
          <div
            key={pct}
            data-testid={`y-axis-mark-${pct}`}
            className="absolute left-0 right-0"
            style={{ top: `${100 - pct}%`, transform: 'translateY(-50%)' }}
          >
            <div className="flex h-[1px] items-center justify-between">
              <div className="w-[80%] bg-ink-200" />
              <div className="text-[10px] text-ink-400">{pct}%</div>
            </div>
          </div>
        ))}

        {/* Barras de datos */}
        <div className="absolute inset-0 flex items-end justify-between px-4 pb-2">
          {data.meses.map((mes, index) => {
            const planPct = maxValor > 0 ? (data.planificado[index] / maxValor) * 100 : 0;
            const ejecPct = maxValor > 0 ? (data.ejecutado[index] / maxValor) * 100 : 0;
            return (
              <div key={index} className="flex flex-col items-center gap-1">
                <div className="flex items-end gap-0.5" style={{ height: '160px' }}>
                  <div
                    className="w-[8px] bg-exito rounded-t-sm"
                    style={{ height: `${planPct}%` }}
                  />
                  <div
                    className="w-[8px] bg-destructivo rounded-t-sm"
                    style={{ height: `${ejecPct}%` }}
                  />
                </div>
                <span className="text-[10px] text-ink-400">
                  {mes.substring(0, 3)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Container: `projectId` omitted (or `undefined`) keeps the org-wide
 * aggregate (used by `CaraGerencial`, the 5.ª cara — F1.6); a project id
 * scopes it to that project's Resumen tab (design.md T6). */
export default function CurveSChartContainer({ projectId }: { projectId?: string | null } = {}) {
  const query = useProjectDashboard(projectId ?? null);

  if (query.isLoading) {
    return <div className="flex h-[300px] items-center justify-center">Cargando curva S...</div>;
  }
  if (query.isError) {
    return (
      <div className="flex h-[300px] items-center justify-center text-destructivo">
        No se pudo cargar la curva S
      </div>
    );
  }

  return <CurveSChart data={query.data ? query.data.curva_s : null} />;
}