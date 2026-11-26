// Printable project report (T9c, S17): a page outside the shell (no sidebar). It reads `?proyecto=` and paints the
// same report as the Reportes › Proyecto tab; its toolbar brings «Volver» (fallback: /reportes) and «Imprimir».

import { Suspense } from "react";
import type { Metadata } from "next";
import { PrintReporteProyecto } from "@/components/reportes/print-reporte-proyecto";

export const metadata: Metadata = {
  title: "Reporte de proyecto",
};

export const dynamic = "force-dynamic";

export default function PrintReporteProyectoPage() {
  return (
    <Suspense>
      <PrintReporteProyecto />
    </Suspense>
  );
}
