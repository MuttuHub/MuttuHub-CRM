"use client";

// Vista de impresión del reporte semanal (S5): fuera del shell, lee la semana de la URL y pinta el mismo
// cuerpo que la pestaña «Semanal». Se auto-imprime al cargar, como las demás vistas de impresión; se abre en la
// misma pestaña (S4), así que la barra compartida trae «Volver» (respaldo: /reportes) junto a «Imprimir».

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { ReporteSemanalContenido, etiquetaSemana } from "@/components/reportes/reporte-semanal";
import { useReporteSemanal } from "@/hooks/reportes";

export function PrintReporteSemanal() {
  const semana = useSearchParams().get("semana") || null;
  const query = useReporteSemanal(semana);
  const data = query.data;

  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => window.print(), 250);
    return () => clearTimeout(t);
  }, [data]);

  return (
    <main className="min-h-screen bg-white px-6 py-6 text-ink-900 sm:px-10 print:bg-white print:p-0">
      <PrintToolbar description="Vista de impresión del reporte semanal." fallbackHref="/reportes" />
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
    </main>
  );
}
