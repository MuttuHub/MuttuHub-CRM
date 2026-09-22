// Gráfica de Curva S para el Tablero de Control Gerencial
// Muestra el acumulado mensual de peso (planificado) vs gasto (ejecutado)

'use client';

import { useEffect, useState } from 'react';
import { BarChart2, Activity } from 'lucide-react';

interface CurveSData {
  meses: string[];
  planificado: number[];
  ejecutado: number[];
}

interface CurveSChartProps {
  data: CurveSData | null;
}

function CurveSChart({ data }: CurveSChartProps) {
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
        {/* Eje Y - marcas de porcentaje */}
        {[0, 25, 50, 75, 100].map((pct) => (
          <div key={pct} className="absolute left-0 right-0">
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

export default function CurveSChartContainer() {
  const [data, setData] = useState<CurveSData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch('/api/v1/dashboard/projects');
        if (!response.ok) {
          throw new Error(`Error ${response.status}`);
        }
        const json = await response.json();
        setData({
          meses: json.curva_s.meses,
          planificado: json.curva_s.planificado,
          ejecutado: json.curva_s.ejecutado
        });
        setError(null);
      } catch (err) {
        setError('No se pudo cargar la curva S');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) return <div className="flex h-[300px] items-center justify-center">Cargando curva S...</div>;
  if (error) return <div className="flex h-[300px] items-center justify-center text-destructivo">{error}</div>;

  return <CurveSChart data={data} />;
}