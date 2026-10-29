// Reporte semanal imprimible (S5): página fuera del shell (sin sidebar). Lee `?semana=` y pinta el mismo
// reporte que la pestaña Reportes › Semanal; su barra trae «Volver» (respaldo: /reportes) e «Imprimir».

import { Suspense } from "react";
import type { Metadata } from "next";
import { PrintReporteSemanal } from "@/components/reportes/print-reporte-semanal";

export const metadata: Metadata = {
  title: "Reporte semanal",
};

export const dynamic = "force-dynamic";

export default function PrintReporteSemanalPage() {
  return (
    <Suspense>
      <PrintReporteSemanal />
    </Suspense>
  );
}
