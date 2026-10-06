// Ficha de proyecto de solo lectura (E-06). Se abre desde el listado con el id
// de la fila y monta su propia consulta (`useProject`). No tiene ningún control
// de escritura ni `useEffect` de carga: el estado del request (loading, error,
// data) sale entero de la query.
//
// Reutiliza las piezas que ya existen en el módulo en vez de reinventarlas:
// `ESTADO_PROYECTO_META`, `ORIGEN_PROYECTO_META` y `formatFechaCalendario` del
// módulo compartido `project-display` (el que también usa el listado), más
// `FieldValue` de la ficha de cliente y `formatCOP`/`toCents` para los
// decimales, que llegan por HTTP como string.

"use client";

import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { FieldValue, ToneBadge } from "@/components/crm/shared";
import {
  ESTADO_PROYECTO_META,
  ORIGEN_PROYECTO_META,
  formatFechaCalendario,
} from "@/components/proyectos/project-display";
import { useProject, type ProjectListRow } from "@/hooks/projects";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import { cn } from "@/lib/utils";

const SIN_DATO = "—";

/** Los decimales llegan como string: `toCents` los pasa a centavos exactos. */
function formatMonto(value: string | null): string {
  return value === null ? SIN_DATO : formatCOP(toCents(value));
}

function formatEntero(value: number | null): string {
  return value === null ? SIN_DATO : new Intl.NumberFormat("es-CO").format(value);
}

function formatDuracion(semanas: number | null): string {
  if (semanas === null) return SIN_DATO;
  return semanas === 1 ? "1 semana" : `${semanas} semanas`;
}

export function ProjectFichaDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const query = useProject(projectId);
  const proyecto = query.data;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="flex max-h-[88dvh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(720px,calc(100%-2rem))]">
        <DialogTitle className="sr-only">
          {proyecto ? `Ficha de ${proyecto.nombre}` : "Ficha de proyecto"}
        </DialogTitle>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {query.isError ? (
            <FichaError error={query.error} />
          ) : proyecto ? (
            <FichaContent proyecto={proyecto} />
          ) : (
            <FichaSkeleton />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Estado cargado ────────────────────────────────────────────────────── */

function FichaContent({ proyecto }: { proyecto: ProjectListRow }) {
  const estado = ESTADO_PROYECTO_META[proyecto.estado];

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-200 p-5">
        <div className="min-w-0">
          <span className="font-mono text-[12px] font-semibold text-ink-600 tabular-nums">
            {proyecto.codigo}
          </span>
          <h2 className="mt-0.5 font-display text-[19px] font-bold tracking-[-0.02em] text-ink-950">
            {proyecto.nombre}
          </h2>
        </div>
        <ToneBadge tone={estado.tone} label={estado.label} />
      </header>

      <div className="flex flex-col gap-6 p-5">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
          <FieldValue
            label="Origen"
            value={proyecto.origen ? ORIGEN_PROYECTO_META[proyecto.origen] : SIN_DATO}
          />
          <FieldValue label="Cliente" value={proyecto.cliente.nombre} />
          <FieldValue
            label="Responsable"
            value={proyecto.responsable?.nombre ?? "Sin asignar"}
          />
          <FieldValue
            label="Fecha de inicio"
            value={formatFechaCalendario(proyecto.fecha_inicio)}
            mono
          />
          <FieldValue label="Fecha de fin" value={formatFechaCalendario(proyecto.fecha_fin)} mono />
          <FieldValue label="Duración" value={formatDuracion(proyecto.duracion_semanas)} mono />
          <FieldValue label="Valor total" value={formatMonto(proyecto.valor_total)} mono />
          {proyecto.beneficiarios_meta !== null && (
            <FieldValue
              label="Beneficiarios meta"
              value={formatEntero(proyecto.beneficiarios_meta)}
              mono
            />
          )}
          {proyecto.diferencia_valor_oportunidad !== null && (
            <FieldValue
              label="Diferencia valor oportunidad"
              value={formatMonto(proyecto.diferencia_valor_oportunidad)}
              mono
            />
          )}
        </dl>

        <section>
          <h3 className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
            Líneas estratégicas
          </h3>
          {proyecto.lineas.length === 0 ? (
            <p className="mt-1.5 text-[13px] text-ink-500">Sin líneas estratégicas.</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {proyecto.lineas.map((linea) => (
                <li
                  key={linea.id}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px]",
                    linea.principal
                      ? "border-rose-300 bg-rose-50 text-rose-800"
                      : "border-ink-200 bg-panel text-ink-700",
                  )}
                >
                  <span className="font-mono text-[11px] text-ink-500 tabular-nums">
                    {linea.codigo}
                  </span>
                  <span className="font-semibold">{linea.nombre}</span>
                  {linea.principal && (
                    <span className="rounded-full bg-rose-600 px-2 py-[1px] text-[10px] font-bold text-white">
                      Principal
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
            Municipios
          </h3>
          {proyecto.municipios.length === 0 ? (
            <p className="mt-1.5 text-[13px] text-ink-500">Sin municipios.</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {proyecto.municipios.map((municipio) => (
                <li
                  key={municipio.id}
                  className="rounded-full border border-ink-200 bg-panel px-3 py-1.5 text-[12.5px] text-ink-700"
                >
                  {`${municipio.nombre} · ${municipio.departamento}`}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

/* ── Estado de carga ───────────────────────────────────────────────────── */

function FichaSkeleton() {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-[10px]" />
      ))}
    </div>
  );
}

/* ── Estado de error ───────────────────────────────────────────────────── */

function FichaError({ error }: { error: unknown }) {
  const message =
    error instanceof Error
      ? error.message
      : "No pudimos cargar el proyecto. Inténtalo de nuevo.";

  return (
    <div role="alert" className="grid min-h-[240px] place-items-center px-6 py-10 text-center">
      <div className="max-w-[42ch]">
        <span className="mx-auto grid size-12 place-items-center rounded-[16px_16px_16px_6px] bg-destructivo-bg text-destructivo">
          <AlertTriangle className="size-6" strokeWidth={1.7} />
        </span>
        <h3 className="mt-4 font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
          No pudimos abrir la ficha
        </h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-600">{message}</p>
      </div>
    </div>
  );
}
