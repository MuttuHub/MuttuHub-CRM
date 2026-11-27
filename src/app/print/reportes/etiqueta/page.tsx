// Printable tag report (T3, S6): a page outside the shell (no sidebar). It reads `?etiqueta=&desde=&hasta=` and
// paints the same report as the Reportes › Etiqueta tab; its toolbar brings «Volver» (fallback: /reportes) and
// «Imprimir».

import { Suspense } from "react";
import type { Metadata } from "next";
import { PrintReporteEtiqueta } from "@/components/reportes/print-reporte-etiqueta";

export const metadata: Metadata = {
  title: "Reporte por etiqueta",
};

export const dynamic = "force-dynamic";

export default function PrintReporteEtiquetaPage() {
  return (
    <Suspense>
      <PrintReporteEtiqueta />
    </Suspense>
  );
}
