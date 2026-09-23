// gestion-proyectos-workspace, Phase 4 (design.md T6, spec.md "Tab Resumen
// reutiliza el endpoint agregado"). Reuses the SAME `KpiCards`/
// `CurveSChartContainer` containers the org-wide Tablero Gerencial uses,
// just fed by this project's id instead of no id — both read
// `useProjectDashboard` under the hood, so there is no duplicated KPI markup
// and no client-side avance computation (spec's own MUST NOT).

"use client";

import { KpiCards } from "@/components/dashboard/kpi-cards";
import CurveSChartContainer from "@/components/dashboard/curve-s-chart";

export function ResumenTab({ projectId }: { projectId: string }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <KpiCards projectId={projectId} />
      </div>
      <div>
        <CurveSChartContainer projectId={projectId} />
      </div>
    </div>
  );
}
