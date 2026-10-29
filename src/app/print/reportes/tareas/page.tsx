// Reporte imprimible de tareas (PRD §5.4): página fuera del shell (sin
// sidebar), lee los filtros del tablero (rango, responsable, cliente) y
// re-descarga /api/v1/tasks/report. Se auto-imprime al cargar; en pantalla
// muestra una barra con el botón "Imprimir". Como se abre en la misma pestaña
// (S4), la página le pone «Volver» encima (respaldo: /reportes).

import { Suspense } from "react";
import type { Metadata } from "next";
import { PrintReportes } from "@/components/kanban/print-report";
import { PrintBackLink } from "@/components/print/print-toolbar";

export const metadata: Metadata = {
  title: "Reporte de tareas",
};

export const dynamic = "force-dynamic";

export default function PrintReportesPage() {
  return (
    <>
      <div className="print-hide bg-white px-6 pt-6 sm:px-10">
        <PrintBackLink fallbackHref="/reportes" />
      </div>
      <Suspense>
        <PrintReportes />
      </Suspense>
    </>
  );
}