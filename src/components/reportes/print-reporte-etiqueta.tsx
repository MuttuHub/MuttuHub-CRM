"use client";

// Print view of the tag report (T3, S6): outside the shell, it reads the tag and period from the URL and paints the
// same body as the «Etiqueta» tab. The shared print sheet auto-prints it once the data and fonts are ready; it opens
// in the same tab, so the shared toolbar brings «Volver» (fallback: /reportes) next to «Imprimir».

import { useSearchParams } from "next/navigation";
import { PrintSheet } from "@/components/print/print-sheet";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { ELIGE_ETIQUETA, ReporteEtiquetaContenido, etiquetaPeriodo } from "@/components/reportes/reporte-etiqueta";
import { useReporteEtiqueta } from "@/hooks/reportes";

export function PrintReporteEtiqueta() {
  const searchParams = useSearchParams();
  const params = {
    etiqueta: searchParams.get("etiqueta")?.trim() ?? "",
    desde: searchParams.get("desde") ?? "",
    hasta: searchParams.get("hasta") ?? "",
  };
  const query = useReporteEtiqueta(params);
  const data = params.etiqueta ? query.data : undefined;
  const titulo = params.etiqueta ? `Reporte por etiqueta · ${params.etiqueta}` : "Reporte por etiqueta";

  return (
    <PrintSheet
      title={titulo}
      ready={Boolean(data)}
      toolbar={{ description: "Vista de impresión del reporte por etiqueta.", fallbackHref: "/reportes" }}
    >
      {!params.etiqueta && (
        <p role="alert" className="py-20 text-center text-[13px] text-ink-600">
          {ELIGE_ETIQUETA}
        </p>
      )}
      {params.etiqueta && query.isLoading && (
        <p className="py-20 text-center text-[13px] text-ink-500">Preparando el reporte…</p>
      )}
      {params.etiqueta && query.isError && (
        <p role="alert" className="py-20 text-center text-[13px] text-destructivo">
          {errorMessage(query.error, "No pudimos generar el reporte por etiqueta. Inténtalo de nuevo.")}
        </p>
      )}
      {data && !query.isError && (
        <>
          <header className="mb-6 border-b-2 border-ink-950 pb-4">
            <p className="font-display text-[13px] font-extrabold tracking-[0.14em] text-rose-500 uppercase">Muttu Hub</p>
            <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink-950">{titulo}</h1>
            <p className="text-[13px] text-ink-600">{etiquetaPeriodo(data)}</p>
          </header>
          <ReporteEtiquetaContenido data={data} />
        </>
      )}
    </PrintSheet>
  );
}
