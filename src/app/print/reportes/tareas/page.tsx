// Reporte imprimible de tareas (PRD §5.4): página fuera del shell (sin
// sidebar), lee los filtros del tablero (rango, responsable, cliente) y
// re-descarga /api/v1/tasks/report. Se auto-imprime al cargar; en pantalla
// muestra una barra con el botón "Imprimir".

import { Suspense } from "react";
import type { Metadata } from "next";
import { PrintReportes } from "@/components/kanban/print-report";

export const metadata: Metadata = {
  title: "Reporte de tareas",
};

export const dynamic = "force-dynamic";

export default function PrintReportesPage() {
  return (
    <Suspense>
      <PrintReportes />
    </Suspense>
  );
}