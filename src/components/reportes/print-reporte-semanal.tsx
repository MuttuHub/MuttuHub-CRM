"use client";

// Vista de impresión del reporte semanal (S5): fuera del shell, lee la semana de la URL y pinta el mismo
// cuerpo que la pestaña «Semanal». La hoja compartida de impresión (PR-R2) la auto-imprime cuando los datos y
// las fuentes están listos, como las demás vistas de impresión; se abre en la
// misma pestaña (S4), así que la barra compartida trae «Volver» (respaldo: /reportes) junto a «Imprimir».

import { useSearchParams } from "next/navigation";
import { PrintSheet } from "@/components/print/print-sheet";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { ReporteSemanalContenido, etiquetaSemana } from "@/components/reportes/reporte-semanal";
import { useReporteSemanal } from "@/hooks/reportes";

export function PrintReporteSemanal() {
  const semana = useSearchParams().get("semana") || null;
  const query = useReporteSemanal(semana);
  const data = query.data;

  return (
    <PrintSheet
      title="Reporte semanal"
      ready={Boolean(data)}
      toolbar={{ description: "Vista de impresión del reporte semanal.", fallbackHref: "/reportes" }}
    >
      {query.isLoading && <p className="py-20 text-center text-[13px] text-ink-500">Preparando el reporte…</p>}
      {query.isError && (
        <p role="alert" className="py-20 text-center text-[13px] text-destructivo">
          {errorMessage(query.error, "No pudimos generar el reporte semanal. Inténtalo de nuevo.")}
        </p>
      )}
      {data && (
        <>
          <header className="mb-6 border-b-2 border-ink-950 pb-4">
            <p className="font-display text-[13px] font-extrabold tracking-[0.14em] text-rose-500 uppercase">Muttu Hub</p>
            <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink-950">Reporte semanal</h1>
            <p className="text-[13px] text-ink-600">{etiquetaSemana(data.semana)}</p>
          </header>
          <ReporteSemanalContenido data={data} />
        </>
      )}
    </PrintSheet>
  );
}
