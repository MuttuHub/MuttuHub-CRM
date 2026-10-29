// Barra de las vistas de impresión (S4): como estas vistas se abren en la misma pestaña, la barra ofrece
// «Volver» junto a «Imprimir». «Volver» regresa a donde estaba el usuario con el historial del navegador
// (así se conservan los filtros y la ficha abierta en la URL); si la vista se abrió directo, sin página
// anterior, sigue su `href`, la ruta de respaldo. Lleva `print-hide`, así que no sale en el papel.

"use client";

import type { MouseEvent, ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintBackLink({ fallbackHref }: { fallbackHref: string }) {
  function volver(e: MouseEvent<HTMLAnchorElement>) {
    // Ctrl/Cmd/Shift/rueda: el usuario quiere el enlace tal cual (p. ej. en otra pestaña), no el historial.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (window.history.length > 1) {
      e.preventDefault();
      window.history.back();
    }
  }

  return (
    <Link
      href={fallbackHref}
      onClick={volver}
      className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-11 border border-ink-200 bg-white px-3 text-[12.5px] font-semibold text-ink-800 transition-colors hover:bg-ink-100"
    >
      <ArrowLeft className="size-3.5" strokeWidth={1.9} />
      Volver
    </Link>
  );
}

export function PrintToolbar({
  description,
  fallbackHref,
  printLabel = "Imprimir",
}: {
  description: ReactNode;
  fallbackHref: string;
  printLabel?: string;
}) {
  return (
    <div
      /* v6-surface */
      data-testid="imprimir-barra"
      className="print-hide mb-6 flex items-center justify-between gap-3 rounded-[16px] border border-ink-200 bg-panel px-5 py-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        <PrintBackLink fallbackHref={fallbackHref} />
        <p className="hidden text-[13px] text-ink-600 sm:block">{description}</p>
      </div>
      <Button type="button" onClick={() => window.print()} className="shrink-0 px-4 font-bold">
        <Printer className="size-4" strokeWidth={1.8} />
        {printLabel}
      </Button>
    </div>
  );
}
