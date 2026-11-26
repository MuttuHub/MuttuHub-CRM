"use client";

// Print view of the project report (T9c, S17): outside the shell, it reads the project from the URL and paints the
// same body as the «Proyecto» tab. The shared print sheet auto-prints it once the data and fonts are ready; it opens
// in the same tab, so the shared toolbar brings «Volver» (fallback: /reportes) next to «Imprimir».

import { useSearchParams } from "next/navigation";
import { PrintSheet } from "@/components/print/print-sheet";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import {
  ELIGE_PROYECTO,
  ReporteProyectoContenido,
  proyectoSubtitulo,
  proyectoTitulo,
} from "@/components/reportes/reporte-proyecto";
import { useReporteProyecto } from "@/hooks/reportes";

export function PrintReporteProyecto() {
  const proyectoId = useSearchParams().get("proyecto")?.trim() ?? "";
  const query = useReporteProyecto(proyectoId);
  const data = proyectoId ? query.data : undefined;
  const titulo = data ? `Reporte de proyecto · ${proyectoTitulo(data)}` : "Reporte de proyecto";

  return (
    <PrintSheet
      title={titulo}
      ready={Boolean(data)}
      toolbar={{ description: "Vista de impresión del reporte de proyecto.", fallbackHref: "/reportes" }}
    >
      {!proyectoId && (
        <p role="alert" className="py-20 text-center text-[13px] text-ink-600">
          {ELIGE_PROYECTO}
        </p>
      )}
      {proyectoId && query.isLoading && (
        <p className="py-20 text-center text-[13px] text-ink-500">Preparando el reporte…</p>
      )}
      {proyectoId && query.isError && (
        <p role="alert" className="py-20 text-center text-[13px] text-destructivo">
          {errorMessage(query.error, "No pudimos generar el reporte del proyecto. Inténtalo de nuevo.")}
        </p>
      )}
      {data && !query.isError && (
        <>
          <header className="mb-6 border-b-2 border-ink-950 pb-4">
            <p className="font-display text-[13px] font-extrabold tracking-[0.14em] text-rose-500 uppercase">Muttu Hub</p>
            <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink-950">{titulo}</h1>
            <p className="text-[13px] text-ink-600">{proyectoSubtitulo(data)}</p>
          </header>
          <ReporteProyectoContenido data={data} />
        </>
      )}
    </PrintSheet>
  );
}
