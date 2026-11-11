// Página «Novedades de Proyectos» (rediseño S2, tablero Ayudas y novedades): solo lectura, una columna en el
// teléfono. El contenido es texto fijo de esta entrega (de dónde sale en adelante sigue abierto con la PO). La
// «guía rápida por rol» del diseño no se publica todavía: el propio diseño pide mostrarla solo cuando existan
// los flujos que describe.

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const CAMBIOS = [
  {
    titulo: "Registrar avance",
    antes: "Solo la persona responsable de la actividad veía el botón.",
    ahora: "Cualquier integrante del equipo lo registra, también desde la cabecera del proyecto.",
  },
  {
    titulo: "Historial de avances",
    antes: "Mostraba un código en lugar de la persona.",
    ahora: "Muestra el nombre de quien registró cada avance.",
  },
  {
    titulo: "Actividades finalizadas",
    antes: "Seguían ofreciendo «Registrar avance».",
    ahora: "Explican que ya no reciben avances y cómo corregir un error.",
  },
  {
    titulo: "Finanzas",
    antes: "Un porcentaje con siglas y barras sin color.",
    ahora: "«40,3 % de lo programado» y cada barra con el color de su semáforo.",
  },
  {
    titulo: "Lista de gastos",
    antes: "«IVA $ 0» y sin periodo.",
    ahora: "El periodo bajo la fecha y «Sin IVA» o el subtotal más IVA bajo el total.",
  },
  {
    titulo: "Adjuntar archivos",
    antes: "El botón del navegador decía «Choose File».",
    ahora: "«Elegir archivo» y el nombre del archivo elegido.",
  },
  {
    titulo: "Contadores",
    antes: "Había que abrir cada sección para saber si tenía datos.",
    ahora: "«Gastos · 5», «Modificaciones · N» y «Versiones · N».",
  },
] as const;

const VOLVER_CLASS =
  "inline-flex min-h-11 w-fit items-center gap-1.5 text-[13px] font-semibold text-ink-700 hover:text-ink-950";

export function NovedadesProyectos({ desdeProyectoId = null }: { desdeProyectoId?: string | null }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-5">
      {desdeProyectoId ? (
        <Link href={`/proyectos/${encodeURIComponent(desdeProyectoId)}`} className={VOLVER_CLASS}>
          <ArrowLeft className="size-4" strokeWidth={1.8} aria-hidden="true" />
          Volver al proyecto
        </Link>
      ) : (
        <Link href="/proyectos" className={VOLVER_CLASS}>
          <ArrowLeft className="size-4" strokeWidth={1.8} aria-hidden="true" />
          Volver a Proyectos
        </Link>
      )}

      <header className="flex flex-col gap-1.5">
        <p className="text-[12px] font-bold tracking-[0.08em] text-ink-500 uppercase">Novedades · 05 nov 2026</p>
        <h1 className="font-display text-[24px] font-bold tracking-[-0.02em] text-ink-950">Qué cambió en Proyectos</h1>
        <p className="text-[14px] leading-relaxed text-ink-700">
          Estos cambios responden a los ajustes que pidió Coordinación. Ya están en la app.
        </p>
      </header>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CAMBIOS.map((cambio) => (
          <li key={cambio.titulo}>
            <article className="surface flex h-full flex-col gap-2.5 p-4">
              <h2 className="text-[14.5px] font-semibold text-ink-950">{cambio.titulo}</h2>
              <dl className="flex flex-col gap-2 text-[13px] leading-relaxed">
                <div>
                  <dt className="font-semibold text-ink-500">Antes</dt>
                  <dd className="text-ink-700">{cambio.antes}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-exito">Ahora</dt>
                  <dd className="text-ink-900">{cambio.ahora}</dd>
                </div>
              </dl>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
