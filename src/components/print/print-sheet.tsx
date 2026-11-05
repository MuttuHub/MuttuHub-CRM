// Shared print sheet for every /print/* view (PR-R2, R9). It owns what all printed reports have in common:
// a US-letter page, exact colors, a header (logo + classification label) and footer (report title, who
// generated it and when, a usage note, and «Página X de Y») that repeat on every printed page, rows that
// don't split across pages, and auto-printing only once the data is ready and the web fonts have loaded
// (it replaces the old 250 ms timer, which could print with fallback fonts).
//
// Screen vs. paper: on screen the header and footer sit above and below the content. When printing, the
// sheet becomes a CSS table whose header/footer groups Chromium repeats on each page. The page number lives
// in an @page margin box (`counter(page)` / `counter(pages)`), which only Chromium 131+ renders; other
// browsers print without it.

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { apiGet } from "@/lib/api/http";

export type PrintClassification = "interno" | "personal";

const CLASSIFICATION_NOTE: Record<PrintClassification, string> = {
  interno: "Uso interno de Muttu · no compartir fuera de la organización",
  personal: "Solo para la persona indicada",
};

/**
 * CSS for the printed sheet.
 *
 * The repeating header and footer are `@page` margin boxes, not in-flow elements: Chromium does
 * not repeat `table-header-group` / `table-footer-group` when the page break falls inside a single
 * anonymous row (which is what a wrapper div around arbitrary content produces), and a fixed
 * element pinned to the content area repeats but paints over the body. Margin boxes are painted by
 * the pager itself, in the page margin, on every page — the only mechanism that repeats without
 * overlapping. They take plain strings, so the texts are interpolated here.
 */
function printSheetCss({
  titulo,
  etiqueta,
  generado,
  nota,
}: {
  titulo: string;
  etiqueta: string;
  generado: string;
  nota: string;
}) {
  const texto = (valor: string) => `"${valor.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return `
@media print {
  @page {
    size: letter;
    margin: 24mm 14mm 20mm;
    @top-left {
      content: ${texto(titulo)};
      font-size: 9pt;
      color: #725d62;
    }
    @top-right {
      content: ${texto(etiqueta)};
      font-size: 9pt;
      font-weight: 700;
      color: #940d44;
    }
    @bottom-left {
      content: ${texto(generado)};
      font-size: 8.5pt;
      color: #725d62;
    }
    @bottom-center {
      content: ${texto(nota)};
      font-size: 8pt;
      color: #725d62;
    }
    @bottom-right {
      content: "Página " counter(page) " de " counter(pages);
      font-size: 9pt;
      color: #725d62;
    }
  }
  html, body {
    background: #ffffff !important;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
  /* The branded header and the footer live in the page margin boxes above, so the on-screen
     versions are hidden when printing to avoid drawing them twice. */
  .print-sheet__head, .print-sheet__foot { display: none; }
  .print-sheet { display: block; width: 100%; }
  .print-sheet__body { display: block; }
  /* A min-width on a table exists so the screen can scroll sideways; on paper it can only clip.
     Any table inside the sheet fits the printable width instead, which means letting the cells
     wrap: on screen they are whitespace-nowrap so columns keep their shape, but a nowrap cell
     below ~9 columns sets an intrinsic width wider than the sheet. */
  .print-sheet table { min-width: 0 !important; width: 100%; }
  .print-sheet th, .print-sheet td {
    white-space: normal !important;
    padding-left: 3pt !important;
    padding-right: 3pt !important;
  }
  .print-sheet th {
    font-size: 7.5pt !important;
    letter-spacing: 0.03em !important;
  }
  .print-sheet td { font-size: 8.5pt !important; }
  /* Real content tables keep their own repeating header row. */
  .print-sheet thead { display: table-header-group; }
  .print-sheet tr, .print-sheet li { break-inside: avoid; page-break-inside: avoid; }
  .print-sheet h2, .print-sheet h3 { break-after: avoid; page-break-after: avoid; }
}
`;
}

/** Prints once `ready` is true and the web fonts have loaded; never prints after unmount. */
function useAutoPrint(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const fontsReady: Promise<unknown> =
      typeof document !== "undefined" && document.fonts?.ready ? document.fonts.ready : Promise.resolve();
    fontsReady.then(() => {
      if (alive) window.print();
    });
    return () => {
      alive = false;
    };
  }, [ready]);
}

type MeState = { settled: boolean; nombre: string | null };

/** Who is generating the report: the given name, or the signed-in user from /api/v1/auth/me. */
function useGeneratedBy(given: string | undefined): MeState {
  const [me, setMe] = useState<MeState>({ settled: false, nombre: null });
  useEffect(() => {
    if (given !== undefined) return;
    let alive = true;
    apiGet<{ usuario: { nombre: string } | null }>("/api/v1/auth/me")
      .then((res) => {
        if (alive) setMe({ settled: true, nombre: res.usuario?.nombre ?? null });
      })
      .catch(() => {
        if (alive) setMe({ settled: true, nombre: null });
      });
    return () => {
      alive = false;
    };
  }, [given]);
  return given !== undefined ? { settled: true, nombre: given } : me;
}

function formatGeneratedAt(date: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Bogota",
  }).format(date);
}

export function PrintSheet({
  title,
  classification = "interno",
  note,
  toolbar,
  ready,
  generatedBy,
  children,
}: {
  /** Report name shown in the footer («Muttu Hub · {title}»). */
  title: string;
  classification?: PrintClassification;
  /** Overrides the classification's default usage note in the footer. */
  note?: string;
  toolbar: { description: ReactNode; fallbackHref: string; printLabel?: string };
  /** True once the report's data is on screen; auto-print waits for it. */
  ready: boolean;
  /** Name of who generates the report; when omitted it is looked up from the session. */
  generatedBy?: string;
  children: ReactNode;
}) {
  const me = useGeneratedBy(generatedBy);
  useAutoPrint(ready && me.settled);

  const label =
    classification === "personal"
      ? me.nombre
        ? `Personal · ${me.nombre}`
        : "Personal"
      : "Interno · Gerencia";
  const generatedLine = ready
    ? `Generado el ${formatGeneratedAt(new Date())}${me.nombre ? ` por ${me.nombre}` : ""}`
    : null;
  const usageNote = note ?? CLASSIFICATION_NOTE[classification];
  const css = printSheetCss({
    titulo: `Muttu Hub · ${title}`,
    etiqueta: label,
    generado: generatedLine ?? "",
    nota: usageNote,
  });

  return (
    <main className="min-h-screen bg-white px-6 py-6 text-ink-900 sm:px-10 print:bg-white print:p-0">
      <style>{css}</style>
      <PrintToolbar
        description={toolbar.description}
        fallbackHref={toolbar.fallbackHref}
        printLabel={toolbar.printLabel}
      />

      <div className="print-sheet">
        <div className="print-sheet__head">
          <div
            data-testid="print-sheet-header"
            className="mb-5 flex items-center justify-between gap-4 border-b border-ink-200 pb-3"
          >
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, must be in the DOM before printing */}
              <img src="/brand/logo-color.svg" alt="Muttu Innovación Social" className="h-auto w-[66px]" />
              <span className="font-display text-[15px] font-bold text-ink-700">Hub</span>
            </div>
            <span
              className={
                classification === "personal"
                  ? "inline-flex h-[22px] items-center rounded-full border border-[#c9daf0] bg-[#eaf1fa] px-2.5 text-[12px] font-bold text-[#1e5fa8]"
                  : "inline-flex h-[22px] items-center rounded-full border border-[#f5bad2] bg-[#fcf1f5] px-2.5 text-[12px] font-bold text-[#940d44]"
              }
            >
              {label}
            </span>
          </div>
        </div>

        <div className="print-sheet__body">{children}</div>

        <div className="print-sheet__foot">
          <div
            data-testid="print-sheet-footer"
            className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-ink-200 pt-2.5 text-[11px] text-ink-500"
          >
            <span>
              <b className="font-bold tracking-[0.08em] text-[#940d44] uppercase">Muttu Hub</b> · {title}
            </span>
            {generatedLine && <span>{generatedLine}</span>}
            <span>{note ?? CLASSIFICATION_NOTE[classification]}</span>
          </div>
        </div>
      </div>
    </main>
  );
}
