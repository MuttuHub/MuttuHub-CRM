// Ficha imprimible del proyecto (F13, RF-32, PO-2): el PDF sale de la impresión del navegador, sin motor en el
// servidor. Vive dentro del shell de la app (misma sesión y mismo acceso que la ficha: `useProject` y el resto de
// consultas son las de la ficha, así que el 403/404 de la API se dice con claridad y no hay hoja). Al imprimir,
// una regla `@media print` oculta el shell y deja solo la hoja; la hoja es siempre clara (papel), también en tema
// oscuro. Modelada sobre `crm/print-ficha.tsx`: barra de herramientas con `print-hide` y secciones simples.

"use client";

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { PrintToolbar } from "@/components/print/print-toolbar";
import {
  SALUD_LABEL,
  fraseFinanciera,
  fraseTecnica,
} from "@/components/proyectos/ficha/ficha-resumen";
import { ESTADO_PROYECTO_META, formatFechaCalendario } from "@/components/proyectos/project-display";
import { KPIS_NO_MEDIBLE_NOTE, formatPct } from "@/components/proyectos/project-kpis-panel";
import {
  useProject,
  useProjectAttention,
  useProjectFinancialSheet,
  useProjectKpis,
  useProjectObjectives,
  useProjectTechnicalStatus,
  type ProjectListRow,
} from "@/hooks/projects";
import { ApiError } from "@/lib/api/http";
import { formatCOP, toCents } from "@/lib/proyectos/money";

const SIN_DATO = "—";

/**
 * Al imprimir solo queda la hoja: todo lo demás del documento se oculta (visibility, para no tocar el shell) y la
 * hoja pasa a ocupar el ancho de la página. Las variables fijan la paleta clara: la hoja es papel en cualquier tema.
 */
const PRINT_CSS = `
[data-print-root] {
  --panel: #ffffff;
  --ink-100: #f7f3f4;
  --ink-200: #ece5e7;
  --ink-300: #ddd2d5;
  --ink-500: #725d62;
  --ink-600: #725d62;
  --ink-700: #5a474c;
  --ink-800: #3f2f33;
  --ink-900: #281d20;
  --ink-950: #191113;
  background: #ffffff;
  color: #281d20;
}
@media print {
  @page { margin: 14mm; }
  body * { visibility: hidden !important; }
  [data-print-root], [data-print-root] * { visibility: visible !important; }
  [data-print-root] { position: absolute; top: 0; left: 0; width: 100%; padding: 0 !important; }
}
`;

function formatEntero(value: number | null): string {
  return value === null ? SIN_DATO : new Intl.NumberFormat("es-CO").format(value);
}

function formatMonto(value: string | null): string {
  return value === null ? SIN_DATO : formatCOP(toCents(value));
}

function fechaDeGeneracion(): string {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" }).format(
    new Date(),
  );
}

/* ── Contenedor ────────────────────────────────────────────────────────── */

export function ProjectPrintSheet({ projectId }: { projectId: string }) {
  const query = useProject(projectId);
  const proyecto = query.data;

  return (
    <div data-print-root className="mx-auto w-full max-w-4xl min-w-0 rounded-[16px] bg-white p-6 sm:p-8">
      <style>{PRINT_CSS}</style>
      {query.isError ? (
        <ImprimirError error={query.error} />
      ) : proyecto ? (
        <>
          <PrintToolbar
            description="Vista de impresión de la ficha del proyecto."
            fallbackHref={`/proyectos/${encodeURIComponent(projectId)}`}
            printLabel="Imprimir / Guardar PDF"
          />
          <Hoja proyecto={proyecto} />
        </>
      ) : (
        <p className="py-20 text-center text-[13px] text-ink-500">Preparando la ficha…</p>
      )}
    </div>
  );
}

function ImprimirError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "No pudimos cargar el proyecto. Inténtalo de nuevo.";
  // La API decide el acceso: 404 (no existe) y 403 (no es miembro). Aquí solo se dice con claridad.
  const status = error instanceof ApiError ? error.status : null;
  const title =
    status === 404
      ? "Proyecto no encontrado"
      : status === 403
        ? "No tienes acceso a este proyecto"
        : "No pudimos preparar la ficha";
  return (
    <div role="alert" className="grid min-h-[240px] place-items-center px-6 py-10 text-center">
      <div className="max-w-[42ch]">
        <span className="mx-auto grid size-12 place-items-center rounded-[16px_16px_16px_6px] bg-destructivo-bg text-destructivo">
          <AlertTriangle className="size-6" strokeWidth={1.7} />
        </span>
        <h1 className="mt-4 font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">{title}</h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-600">{message}</p>
      </div>
    </div>
  );
}

/* ── Hoja ──────────────────────────────────────────────────────────────── */

function Hoja({ proyecto }: { proyecto: ProjectListRow }) {
  const enBorrador = proyecto.estado === "BORRADOR";
  return (
    <article className="text-ink-900">
      <Encabezado proyecto={proyecto} />
      {enBorrador ? (
        <p data-testid="imprimir-sin-medicion" className="mt-6 text-[12.5px] leading-relaxed text-ink-700">
          El proyecto está en borrador: todavía no hay estado técnico ni ejecución financiera que imprimir.
        </p>
      ) : (
        <>
          <EstadoTecnico proyecto={proyecto} />
          <ActividadesPorObjetivo proyectoId={proyecto.id} />
          <ResumenFinanciero proyectoId={proyecto.id} />
        </>
      )}
    </article>
  );
}

function Seccion({ testId, titulo, children }: { testId: string; titulo: string; children: ReactNode }) {
  return (
    <section data-testid={testId} aria-label={titulo} className="mt-7 break-inside-avoid-page">
      <h2 className="border-b border-ink-300 pb-1.5 font-display text-[14px] font-bold tracking-[-0.01em] text-ink-950">
        {titulo}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Campo({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-semibold tracking-[0.04em] text-ink-600 uppercase">{label}</dt>
      <dd className={mono ? "mt-0.5 font-mono text-[12.5px] tabular-nums" : "mt-0.5 text-[12.5px]"}>{value}</dd>
    </div>
  );
}

function Encabezado({ proyecto }: { proyecto: ProjectListRow }) {
  return (
    <header data-testid="imprimir-encabezado" className="border-b-2 border-ink-950 pb-4">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="font-mono text-[12px] font-semibold text-ink-600 tabular-nums">{proyecto.codigo}</p>
          <h1 className="mt-0.5 font-display text-[22px] font-extrabold tracking-[-0.02em] text-ink-950">
            {proyecto.nombre}
          </h1>
        </div>
        <p data-testid="imprimir-generado" className="shrink-0 text-right font-mono text-[11.5px] text-ink-600">
          Generado el {fechaDeGeneracion()}
        </p>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <Campo label="Cliente" value={proyecto.cliente.nombre} />
        <Campo label="Estado" value={ESTADO_PROYECTO_META[proyecto.estado].label} />
        <Campo label="Responsable" value={proyecto.responsable?.nombre ?? SIN_DATO} />
        <Campo label="Valor total" value={formatMonto(proyecto.valor_total)} mono />
        <Campo label="Inicio" value={formatFechaCalendario(proyecto.fecha_inicio)} />
        <Campo label="Fin" value={formatFechaCalendario(proyecto.fecha_fin)} />
        {proyecto.beneficiarios_meta !== null && (
          <Campo label="Beneficiarios" value={formatEntero(proyecto.beneficiarios_meta)} mono />
        )}
      </dl>
      {proyecto.descripcion && (
        <p className="mt-4 text-[12.5px] leading-relaxed whitespace-pre-line text-ink-800">{proyecto.descripcion}</p>
      )}
    </header>
  );
}

/* ── Estado técnico ────────────────────────────────────────────────────── */

function EstadoTecnico({ proyecto }: { proyecto: ProjectListRow }) {
  const kpisQuery = useProjectKpis(proyecto.id, null, "vigente");
  const atencion = useProjectAttention(proyecto.id).data;
  const kpis = kpisQuery.data;
  const items = atencion?.medible ? atencion.items : [];

  let contenido: ReactNode;
  if (kpisQuery.isError) {
    contenido = <p className="text-[12.5px] text-destructivo">No pudimos cargar el estado técnico.</p>;
  } else if (!kpis) {
    contenido = <p className="text-[12.5px] text-ink-600">Cargando…</p>;
  } else if (!kpis.medible || !kpis.tecnico) {
    contenido = <p className="text-[12.5px] text-ink-700">{KPIS_NO_MEDIBLE_NOTE}</p>;
  } else {
    const { tecnico } = kpis;
    contenido = (
      <>
        <p className="text-[13px]">
          <span className="font-semibold">{SALUD_LABEL[tecnico.color]}</span>
          <span className="text-ink-700"> · corte al {formatFechaCalendario(kpis.corte)}</span>
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-800">{fraseTecnica(tecnico, items)}</p>
      </>
    );
  }

  return (
    <Seccion testId="imprimir-tecnico" titulo="Estado técnico">
      {contenido}
    </Seccion>
  );
}

/* ── Actividades por objetivo ──────────────────────────────────────────── */

function ActividadesPorObjetivo({ proyectoId }: { proyectoId: string }) {
  const tecnicoQuery = useProjectTechnicalStatus(proyectoId, "vigente");
  const objetivos = useProjectObjectives(proyectoId).data;
  const tecnico = tecnicoQuery.data;

  let contenido: ReactNode;
  if (tecnicoQuery.isError) {
    contenido = <p className="text-[12.5px] text-destructivo">No pudimos cargar las actividades.</p>;
  } else if (!tecnico) {
    contenido = <p className="text-[12.5px] text-ink-600">Cargando…</p>;
  } else if (tecnico.actividades.length === 0) {
    contenido = <p className="text-[12.5px] text-ink-700">El proyecto no tiene actividades.</p>;
  } else {
    // Orden de los objetivos como en la ficha; los códigos que solo conoce el servidor van al final.
    const codigos = [
      ...(objetivos ?? []).map((o) => o.codigo),
      ...tecnico.objetivos.map((o) => o.codigo).filter((c) => !(objetivos ?? []).some((o) => o.codigo === c)),
    ];
    contenido = (
      <div className="flex flex-col gap-5">
        {codigos.map((codigo) => {
          const acumulado = tecnico.objetivos.find((o) => o.codigo === codigo);
          const descripcion = objetivos?.find((o) => o.codigo === codigo)?.descripcion;
          const actividades = tecnico.actividades.filter((a) => a.objetivo_codigo === codigo);
          if (actividades.length === 0) return null;
          return (
            <div key={codigo} data-testid={`imprimir-objetivo-${codigo}`} className="break-inside-avoid-page">
              <p className="text-[12.5px] font-semibold">
                <span className="font-mono tabular-nums">{codigo}</span>
                {descripcion ? ` · ${descripcion}` : ""}
              </p>
              <table className="mt-1.5 w-full border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-ink-300 text-left text-[10.5px] tracking-[0.04em] text-ink-600 uppercase">
                    <th scope="col" className="py-1 pr-3 font-semibold">Código</th>
                    <th scope="col" className="py-1 pr-3 font-semibold">Actividad</th>
                    <th scope="col" className="py-1 pr-3 text-right font-semibold">% plan</th>
                    <th scope="col" className="py-1 text-right font-semibold">% real</th>
                  </tr>
                </thead>
                <tbody>
                  {actividades.map((actividad) => (
                    <tr key={actividad.id} className="break-inside-avoid border-b border-ink-200">
                      <td className="py-1 pr-3 font-mono tabular-nums">{actividad.codigo}</td>
                      <td className="py-1 pr-3">{actividad.nombre}</td>
                      <td className="py-1 pr-3 text-right font-mono tabular-nums">{formatPct(actividad.programado)}</td>
                      <td className="py-1 text-right font-mono tabular-nums">{formatPct(actividad.progreso)}</td>
                    </tr>
                  ))}
                  {acumulado && (
                    <tr className="font-semibold">
                      <td className="py-1 pr-3" colSpan={2}>Objetivo</td>
                      <td className="py-1 pr-3 text-right font-mono tabular-nums">{formatPct(acumulado.programado)}</td>
                      <td className="py-1 text-right font-mono tabular-nums">{formatPct(acumulado.ejecutado)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <Seccion testId="imprimir-actividades" titulo="Actividades por objetivo">
      {contenido}
    </Seccion>
  );
}

/* ── Resumen financiero ────────────────────────────────────────────────── */

function ResumenFinanciero({ proyectoId }: { proyectoId: string }) {
  const hojaQuery = useProjectFinancialSheet(proyectoId, null, "vigente");
  const kpis = useProjectKpis(proyectoId, null, "vigente").data;
  const atencion = useProjectAttention(proyectoId).data;
  const items = atencion?.medible ? atencion.items : [];
  const hoja = hojaQuery.data;

  let contenido: ReactNode;
  if (hojaQuery.isError) {
    contenido = <p className="text-[12.5px] text-destructivo">No pudimos cargar el resumen financiero.</p>;
  } else if (!hoja) {
    contenido = <p className="text-[12.5px] text-ink-600">Cargando…</p>;
  } else {
    contenido = (
      <>
        {kpis?.financiero && (
          <p className="mb-2 text-[12.5px] leading-relaxed text-ink-800">
            <span className="font-semibold">{SALUD_LABEL[kpis.financiero.color]}</span>
            {" · "}
            {fraseFinanciera(kpis.financiero, items)}
          </p>
        )}
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-ink-300 text-left text-[10.5px] tracking-[0.04em] text-ink-600 uppercase">
              <th scope="col" className="py-1 pr-3 font-semibold">Rubro</th>
              <th scope="col" className="py-1 pr-3 text-right font-semibold">Asignado</th>
              <th scope="col" className="py-1 pr-3 text-right font-semibold">Programado</th>
              <th scope="col" className="py-1 text-right font-semibold">Ejecutado</th>
            </tr>
          </thead>
          <tbody>
            {hoja.rubros.map((rubro) => (
              <tr key={rubro.rubro_id ?? rubro.nombre} className="break-inside-avoid border-b border-ink-200">
                <td className="py-1 pr-3">{rubro.nombre}</td>
                <td className="py-1 pr-3 text-right font-mono tabular-nums">{formatMonto(rubro.asignado)}</td>
                <td className="py-1 pr-3 text-right font-mono tabular-nums">{formatMonto(rubro.programado)}</td>
                <td className="py-1 text-right font-mono tabular-nums">{formatMonto(rubro.ejecutado)}</td>
              </tr>
            ))}
            <tr data-testid="imprimir-finanzas-total" className="font-semibold">
              <td className="py-1.5 pr-3">Total</td>
              <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{formatMonto(hoja.total.asignado)}</td>
              <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{formatMonto(hoja.total.programado)}</td>
              <td className="py-1.5 text-right font-mono tabular-nums">{formatMonto(hoja.total.ejecutado)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-1.5 text-[11px] text-ink-600">Corte {hoja.corte}.</p>
      </>
    );
  }

  return (
    <Seccion testId="imprimir-finanzas" titulo="Resumen financiero">
      {contenido}
    </Seccion>
  );
}
