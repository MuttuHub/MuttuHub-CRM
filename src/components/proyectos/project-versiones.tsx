// Historial › Versiones del plan (S8 U6, E-27; rediseño «Versiones-propuesta» / «Interacciones-Historial»). Solo
// lectura: una tarjeta por versión (la línea base es la «Versión original»; cada modificación aprobada suma una),
// el comparador entre dos de ellas cuando hay más de una, «Cómo cambia el plan» y el acceso a las solicitudes. Las
// diferencias las calcula el servidor: aquí solo se agrupan y se formatean.

"use client";

import { useState } from "react";
import { fechaCorta } from "@/components/proyectos/ficha/historial/fechas";
import { CAMPO_LABEL } from "@/components/proyectos/ficha/historial/campos";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { SolicitudesVacias, usePuedeSolicitarModificacion } from "@/components/proyectos/project-modificaciones";
import { InlineError, SELECT_CLASS_LG } from "@/components/proyectos/ui";
import { Button } from "@/components/ui/button";
import { HelpHint } from "@/components/ui/help-hint";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import {
  useProjectModifications,
  useProjectVersionCompare,
  useProjectVersions,
  type ProjectDiferencia,
  type ProjectListRow,
  type ProjectVersion,
} from "@/hooks/projects";
import { formatCOP, toCents } from "@/lib/proyectos/money";

export { CAMPO_LABEL };

const VERSIONES_ERROR = "No pudimos cargar las versiones. Inténtalo de nuevo.";
const COMPARACION_ERROR = "No pudimos comparar las versiones. Inténtalo de nuevo.";
export const SIN_LINEA_BASE_NOTE = "La línea base aún no está aprobada.";

const ELEMENTO_LABEL: Record<ProjectDiferencia["elemento"], string> = {
  proyecto: "Proyecto",
  presupuesto: "Presupuesto",
  programacion: "Programación",
  actividad: "Actividades",
  entregable: "Entregables",
  indicador: "Indicadores",
};

const CAMPOS_MONEDA = new Set(["valor_total", "asignado", "valor"]);

function valorDe(diferencia: ProjectDiferencia, valor: string | null): string {
  if (diferencia.campo === "existencia") return valor === null ? "Desaparece" : "Aparece";
  if (valor === null) return "—";
  return CAMPOS_MONEDA.has(diferencia.campo) ? formatCOP(toCents(valor)) : valor;
}

const claveDe = (clave: string) => clave.replace("|", " · ");

/** «Versión original» for the baseline (v0), «Versión N» for the rest. */
export const nombreVersion = (numero: number) => (numero === 0 ? "Versión original" : `Versión ${numero}`);

export function ProjectVersiones({
  proyecto,
  onVerSolicitudes,
}: {
  proyecto: ProjectListRow;
  /** Opens Historial › Solicitudes de modificación. Without it the mentions stay as plain text. */
  onVerSolicitudes?: () => void;
}) {
  return (
    <section data-testid="versiones" className="flex flex-col gap-5">
      <div>
        <div className="flex items-center gap-1.5">
          <h3 className="font-display text-[17px] font-bold text-ink-950">Versiones del plan</h3>
          <HelpHint label="Qué es una versión del plan" className="after:-inset-3">
            El plan aprobado de actividades, cronograma y presupuesto. Cada modificación aprobada crea una versión
            nueva; la original queda guardada para comparar.
          </HelpHint>
        </div>
        {proyecto.estado === "BORRADOR" ? (
          <p className="mt-1.5 text-[12.5px] text-ink-500">{SIN_LINEA_BASE_NOTE}</p>
        ) : (
          <VersionesContent proyectoId={proyecto.id} />
        )}
      </div>
      {proyecto.estado !== "BORRADOR" && (
        <>
          <ComoCambiaElPlan onVerSolicitudes={onVerSolicitudes} />
          <SolicitudesDesdeVersiones proyecto={proyecto} onVerSolicitudes={onVerSolicitudes} />
        </>
      )}
    </section>
  );
}

function VersionesContent({ proyectoId }: { proyectoId: string }) {
  const query = useProjectVersions(proyectoId);
  if (query.isError) return <InlineError message={errorMessage(query.error, VERSIONES_ERROR)} className="mt-1.5" />;
  if (query.isLoading || !query.data) return <Skeleton className="mt-2 h-16 w-full rounded-[14px]" />;
  if (query.data.length === 0) return <p className="mt-1.5 text-[12.5px] text-ink-500">{SIN_LINEA_BASE_NOTE}</p>;
  const versiones = [...query.data].sort((a, b) => b.numero - a.numero);
  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex flex-col gap-2.5">
        {versiones.map((version, indice) => (
          <TarjetaVersion key={version.numero} version={version} vigente={indice === 0} />
        ))}
      </div>
      {versiones.length < 2 ? (
        <p className="rounded-[10px] bg-ink-100 px-3 py-2 text-[12.5px] text-ink-700">
          Cuando Gerencia apruebe una solicitud de modificación, aquí aparecerá la versión 1 y podrás compararla con la
          original.
        </p>
      ) : (
        <Comparacion proyectoId={proyectoId} versiones={versiones} />
      )}
    </div>
  );
}

function TarjetaVersion({ version, vigente }: { version: ProjectVersion; vigente: boolean }) {
  const quien = version.aprobado_por.nombre ?? "Usuario no disponible";
  const aprobada = `Aprobada por ${quien} el ${fechaCorta(version.aprobado_at)}.`;
  return (
    <article data-testid="version-tarjeta" className="surface-inner p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-[14px] font-bold text-ink-950">{nombreVersion(version.numero)}</h4>
        {version.tipo === "LINEA_BASE" ? (
          <StatusChip dot={false} tone="neutro">Línea base</StatusChip>
        ) : (
          <StatusChip dot={false} tone="info">Modificación</StatusChip>
        )}
        {vigente && <StatusChip dot={false} tone="exito">Vigente</StatusChip>}
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-700">
        {version.tipo === "LINEA_BASE"
          ? `${aprobada} Es el plan contra el que se mide el avance programado.`
          : `${aprobada}${version.motivo ? ` Motivo: «${version.motivo}»` : ""}`}
      </p>
    </article>
  );
}

function Comparacion({ proyectoId, versiones }: { proyectoId: string; versiones: ProjectVersion[] }) {
  const numeros = versiones.map((v) => v.numero).sort((a, b) => a - b);
  const [desde, setDesde] = useState("0");
  const [hasta, setHasta] = useState("vigente");
  const query = useProjectVersionCompare(proyectoId, desde, hasta);

  return (
    <section aria-labelledby="versiones-comparar" className="surface-inner flex flex-col gap-3 p-3 sm:p-4">
      <h4 id="versiones-comparar" className="text-[14px] font-bold text-ink-950">
        Comparar versiones
      </h4>
      <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
        <label className="flex flex-col gap-1 text-[12px] text-ink-600 sm:flex-row sm:items-center sm:gap-1.5">
          Desde
          <select aria-label="Desde" value={desde} onChange={(e) => setDesde(e.target.value)} className={SELECT_CLASS_LG}>
            {numeros.map((n) => (
              <option key={n} value={String(n)}>
                {nombreVersion(n)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-600 sm:flex-row sm:items-center sm:gap-1.5">
          Hasta
          <select aria-label="Hasta" value={hasta} onChange={(e) => setHasta(e.target.value)} className={SELECT_CLASS_LG}>
            {numeros.map((n) => (
              <option key={n} value={String(n)}>
                {nombreVersion(n)}
              </option>
            ))}
            <option value="vigente">Vigente</option>
          </select>
        </label>
      </div>

      {query.isError ? (
        <InlineError message={errorMessage(query.error, COMPARACION_ERROR)} />
      ) : !query.data ? (
        <Skeleton className="h-16 w-full rounded-[14px]" />
      ) : query.data.diferencias.length === 0 ? (
        <p className="text-[12.5px] text-ink-500">Las dos versiones son iguales.</p>
      ) : (
        <Diferencias diferencias={query.data.diferencias} />
      )}
    </section>
  );
}

/** The differences by element, one line each («R12 · Asignado: $ 24.000.000 → $ 23.000.000»); they wrap on phones. */
function Diferencias({ diferencias }: { diferencias: ProjectDiferencia[] }) {
  const grupos = new Map<ProjectDiferencia["elemento"], ProjectDiferencia[]>();
  for (const diferencia of diferencias) {
    grupos.set(diferencia.elemento, [...(grupos.get(diferencia.elemento) ?? []), diferencia]);
  }
  return (
    <div data-testid="versiones-diferencias" className="flex flex-col gap-2.5">
      {[...grupos.entries()].map(([elemento, filas]) => (
        <div key={elemento} data-testid="diferencias-grupo" data-elemento={elemento}>
          <p className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">{ELEMENTO_LABEL[elemento]}</p>
          <ul className="mt-1 flex flex-col divide-y divide-border rounded-[10px] border border-border">
            {filas.map((fila, indice) => (
              <li
                key={`${fila.clave}-${fila.campo}-${indice}`}
                className="flex flex-col gap-0.5 px-3 py-2 text-[12.5px] sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
              >
                <span className="min-w-0 break-words text-ink-700">
                  <span className="font-mono text-[11.5px]">{claveDe(fila.clave)}</span>
                  {" · "}
                  {CAMPO_LABEL[fila.campo] ?? fila.campo}
                </span>
                <span className="text-ink-900 tabular-nums">
                  <span className="text-ink-500">{valorDe(fila, fila.desde)}</span>
                  {" → "}
                  <span className="font-semibold">{valorDe(fila, fila.hasta)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ComoCambiaElPlan({ onVerSolicitudes }: { onVerSolicitudes?: () => void }) {
  const solicitudes = "«Solicitudes de modificación»";
  const pasos = [
    <>
      El equipo pide el cambio (presupuesto, cronograma o entregables) en{" "}
      {onVerSolicitudes ? (
        <Button type="button" variant="link" size="xs" className="px-0 align-baseline" onClick={onVerSolicitudes}>
          {solicitudes}
        </Button>
      ) : (
        solicitudes
      )}
      .
    </>,
    <>Gerencia la aprueba o la rechaza, con su motivo.</>,
    <>Si se aprueba, nace una versión nueva del plan; la original queda guardada.</>,
  ];
  return (
    <section aria-labelledby="versiones-como-cambia" className="flex flex-col gap-2">
      <h4 id="versiones-como-cambia" className="text-[14px] font-bold text-ink-950">
        Cómo cambia el plan
      </h4>
      <ol className="flex flex-col gap-2">
        {pasos.map((paso, indice) => (
          <li key={indice} className="flex items-baseline gap-2.5 text-[12.5px] leading-relaxed text-ink-700">
            <span
              aria-hidden="true"
              className="grid size-5 flex-none place-items-center rounded-full bg-ink-100 text-[11px] font-bold text-ink-700"
            >
              {indice + 1}
            </span>
            <span className="min-w-0">{paso}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The requests seen from Versiones: the empty block with its button, or how many there are with a link to them. */
function SolicitudesDesdeVersiones({
  proyecto,
  onVerSolicitudes,
}: {
  proyecto: ProjectListRow;
  onVerSolicitudes?: () => void;
}) {
  const query = useProjectModifications(proyecto.id);
  const puedeSolicitar = usePuedeSolicitarModificacion(proyecto);
  if (!query.isSuccess) return null;
  const cantidad = query.data.length;
  if (cantidad === 0) return <SolicitudesVacias proyecto={proyecto} puedeSolicitar={puedeSolicitar} />;
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-700">
      {`Hay ${cantidad} ${cantidad === 1 ? "solicitud" : "solicitudes"} de modificación.`}
      {onVerSolicitudes && (
        <Button type="button" variant="link" size="xs" className="px-0" onClick={onVerSolicitudes}>
          Ver solicitudes
        </Button>
      )}
    </p>
  );
}
