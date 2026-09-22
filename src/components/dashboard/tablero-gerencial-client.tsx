// Componente cliente para el Tablero de Control Gerencial
// Separa la lógica de cliente de la página server (para que metadata pueda exportarse)

'use client';

import { KpiCards } from '@/components/dashboard/kpi-cards';
import CurveSChartContainer from '@/components/dashboard/curve-s-chart';

export function TableroGerencialClient() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-[24px] font-bold text-ink-950">Tablero de Control Gerencial</h1>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <KpiCards />
        </div>
        <div>
          <CurveSChartContainer />
        </div>
      </div>
    </div>
  );
}