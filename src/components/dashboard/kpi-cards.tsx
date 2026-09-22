// Componentes de tarjetas KPI para el Tablero de Control Gerencial
// Muestra los 6 KPIs del PRD con sus colores de semaforización

'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, CheckCheck, ListChecks, PieChart, BarChart3, Users, TrendingUp } from 'lucide-react';

const COLOR_MAP: Record<string, { bg: string; border: string; text: string }> = {
  verde: { bg: 'bg-panel', border: 'border-exito/30', text: 'text-exito' },
  amarillo: { bg: 'bg-panel', border: 'border-alerta/30', text: 'text-alerta' },
  rojo: { bg: 'bg-panel', border: 'border-destructivo/30', text: 'text-destructivo' },
};

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  colorClass?: string;
  trend?: 'up' | 'down' | 'neutral';
}

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend = 'neutral',
}: KpiCardProps) {
  const formattedValue = typeof value === 'number' ? value.toLocaleString() : value;

  return (
    <div className={`bg-panel border border-ink-200 rounded-xl p-4 flex-1 min-w-0`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="size-5" strokeWidth={1.9} />
          <h3 className="text-[14px] font-medium text-ink-950">{title}</h3>
        </div>
        {trend !== 'neutral' && (
          <span className={`text-[12px] font-medium ${trend === 'up' ? 'text-exito' : 'text-destructivo'}`}>
            {trend === 'up' ? <ArrowUpRight className="size-3" strokeWidth={1.9} /> : ''}
          </span>
        )}
      </div>
      <p className="text-[32px] font-bold text-ink-950 leading-none">{formattedValue}</p>
      {subtitle && <p className="text-[12px] text-ink-500 mt-1">{subtitle}</p>}
    </div>
  );
}

interface KpiData {
  avance_tecnico: number;
  avance_financiero: number;
  cumplimiento_indicadores: number;
  cumplimiento_cronograma: number;
  productos_entregados: number;
  productos_programados: number;
  beneficiarios_atendidos: number;
  beneficiarios_meta: number;
  color_tecnico: string;
  color_financiero: string;
  curva_s: {
    meses: string[];
    planificado: number[];
    ejecutado: number[];
  };
}

export function KpiCards() {
  const [data, setData] = useState<KpiData | null>(null);
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
        setData(json);
        setError(null);
      } catch (err) {
        setError('No se pudo cargar el tablero gerencial');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) return <div className="flex h-[300px] items-center justify-center">Cargando...</div>;
  if (error) return <div className="flex h-[300px] items-center justify-center text-destructivo">{error}</div>;
  if (!data) return <div className="flex h-[300px] items-center justify-center">Sin datos</div>;

  // Calcular porcentajes para los KPIs
  const avanceTecnicoPct = Math.round(data.avance_tecnico);
  const avanceFinancieroPct = Math.round(data.avance_financiero);
  const cumplIndicadoresPct = Math.round(data.cumplimiento_indicadores);
  const cumplCronogramaPct = Math.round(data.cumplimiento_cronograma);
  const productosPct = data.productos_programados > 0
    ? Math.round((data.productos_entregados / data.productos_programados) * 100)
    : 0;
  const beneficiariosPct = data.beneficiarios_meta > 0
    ? Math.round((data.beneficiarios_atendidos / data.beneficiarios_meta) * 100)
    : 0;

  return (
    <div className="grid gap-4 w-full">
      {/* Primera fila: 3 KPIs con colores de semaforo */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          title="Avance Técnico"
          value={`${avanceTecnicoPct}%`}
          subtitle="Promedio ponderado del progreso de actividades"
          icon={PieChart}
          colorClass={COLOR_MAP[data.color_tecnico]?.text ?? 'text-ink-600'}
          trend={avanceTecnicoPct >= 85 ? 'up' : avanceTecnicoPct >= 60 ? 'neutral' : 'down'}
        />
        <KpiCard
          title="Avance Financiero"
          value={`${avanceFinancieroPct}%`}
          subtitle="Presupuesto ejecutado vs proyectado"
          icon={BarChart3}
          colorClass={COLOR_MAP[data.color_financiero]?.text ?? 'text-ink-600'}
          trend={avanceFinancieroPct >= 85 && avanceFinancieroPct <= 115 ? 'up' : 'down'}
        />
        <KpiCard
          title="Cumplimiento de Indicadores"
          value={`${cumplIndicadoresPct}%`}
          subtitle="Indicadores alcanzados vs meta"
          icon={CheckCheck}
          colorClass="text-ink-600"
          trend={cumplIndicadoresPct >= 80 ? 'up' : 'neutral'}
        />
      </div>

      {/* Segunda fila: otros 3 KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          title="Cumplimiento de Cronograma"
          value={`${cumplCronogramaPct}%`}
          subtitle="Actividades a tiempo vs resueltas"
          icon={ListChecks}
          colorClass="text-ink-600"
          trend={cumplCronogramaPct >= 80 ? 'up' : 'neutral'}
        />
        <KpiCard
          title="Entregables"
          value={`${data.productos_entregados}/${data.productos_programados}`}
          subtitle="Productos entregados vs programados"
          icon={Users}
          colorClass="text-ink-600"
          trend={productosPct >= 80 ? 'up' : 'neutral'}
        />
        <KpiCard
          title="Beneficiarios"
          value={`${data.beneficiarios_atendidos}/${data.beneficiarios_meta}`}
          subtitle="Personas impactadas vs meta poblacional"
          icon={TrendingUp}
          colorClass="text-ink-600"
          trend={beneficiariosPct >= 80 ? 'up' : 'neutral'}
        />
      </div>
    </div>
  );
}