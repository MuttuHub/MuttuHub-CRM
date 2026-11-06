// Aviso «Novedades» del Resumen de la ficha (rediseño S2, tablero Ayudas y novedades). Franja informativa con
// lo último que cambió en Proyectos y el enlace a la página de Novedades. El ✕ la cierra y lo recuerda EN ESTE
// NAVEGADOR para ESTA novedad: una novedad nueva vuelve a mostrarse. Dónde se guarda el cierre (navegador o por
// usuario en el servidor) y cuándo vuelve a salir siguen abiertos con la PO; si el navegador bloquea el
// almacenamiento, el aviso se cierra igual hasta recargar.

"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Megaphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FICHA_TITULO_ID } from "@/components/proyectos/ficha/ficha-header";

/** La novedad vigente. Al publicar otra, cambia `id` y el aviso vuelve a mostrarse a todos. */
export const NOVEDAD_ACTUAL = {
  id: "2026-11-05",
  texto:
    "Desde el 05 de nov cualquier integrante del equipo puede registrar avance, el historial muestra quién lo hizo y Finanzas habla en «% de lo programado».",
  textoCorto: "Cualquier integrante del equipo ya puede registrar avance.",
} as const;

/** Página de Novedades; `desde` es el proyecto al que vuelve su enlace «Volver al proyecto». */
export function novedadesHref(proyectoId: string): string {
  return `/proyectos/novedades?desde=${encodeURIComponent(proyectoId)}`;
}

const CLAVE = "muttu.proyectos.novedades.cerrada";

const oyentes = new Set<() => void>();
// Respaldo cuando el navegador no deja escribir: cerrado hasta recargar.
let cerradaEnMemoria: string | null = null;

function leerCerrada(): string | null {
  try {
    return window.localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

function suscribir(onChange: () => void): () => void {
  oyentes.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    oyentes.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function cerrada(): boolean {
  return cerradaEnMemoria === NOVEDAD_ACTUAL.id || leerCerrada() === NOVEDAD_ACTUAL.id;
}

function cerrar(): void {
  try {
    window.localStorage.setItem(CLAVE, NOVEDAD_ACTUAL.id);
  } catch {
    cerradaEnMemoria = NOVEDAD_ACTUAL.id;
  }
  oyentes.forEach((onChange) => onChange());
}

export function AvisoNovedades({ proyectoId }: { proyectoId: string }) {
  // En el servidor no hay almacenamiento: no se pinta, así nunca aparece y desaparece al hidratar.
  const oculta = useSyncExternalStore(suscribir, cerrada, () => true);
  if (oculta) return null;

  return (
    <div
      role="status"
      data-testid="aviso-novedades"
      className="flex items-start gap-3 rounded-inner border border-ink-200 bg-info-bg py-1.5 pr-1.5 pl-4"
    >
      <Megaphone className="mt-3 size-4 shrink-0 text-info" strokeWidth={1.8} aria-hidden="true" />
      <p className="min-w-0 flex-1 py-2.5 text-[13px] leading-relaxed text-ink-800">
        <span className="font-semibold text-ink-950">Novedades</span>{" "}
        <span className="hidden sm:inline">{NOVEDAD_ACTUAL.texto}</span>
        <span className="sm:hidden">{NOVEDAD_ACTUAL.textoCorto}</span>{" "}
        <Link
          href={novedadesHref(proyectoId)}
          className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4 sm:min-h-0"
        >
          Ver qué cambió
        </Link>
      </p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Cerrar aviso de novedades"
        onClick={() => {
          cerrar();
          // El foco no se pierde: pasa al título de la ficha.
          document.getElementById(FICHA_TITULO_ID)?.focus();
        }}
      >
        <X className="size-4" strokeWidth={1.8} />
      </Button>
    </div>
  );
}
