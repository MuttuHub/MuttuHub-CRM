// Sección "Modificaciones" de la ficha (S8 U6, E-26). La cola de solicitudes de modificación: quien
// gestiona proyectos aprueba o rechaza las pendientes (el rechazo exige comentario) y quien gestiona o es
// COORDINADOR integrante puede solicitar una nueva (A-01). Los botones por rol son comodidad: la API es la
// autoridad y sus errores (reglas incumplidas, solicitud obsoleta, ya decidida) se muestran en línea.

"use client";

import { useState } from "react";
import { FilePen, LoaderCircle } from "lucide-react";
import { ToneBadge } from "@/components/crm/shared";
import { SolicitarModificacion, TIPO_MODIFICACION_LABEL } from "@/components/proyectos/modificacion-form";
import { formatFechaHora } from "@/components/proyectos/project-display";
import { CAMPO_LABEL } from "@/components/proyectos/project-versiones";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { EmptyBlock, InlineError, SectionHeader } from "@/components/proyectos/ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/hooks/kanban";
import {
  ModificacionReglasError,
  useApproveModification,
  useProjectMembers,
  useProjectModifications,
  useRejectModification,
  type ModificacionDetalleItem,
  type ModificacionRegla,
  type ProjectListRow,
  type ProjectModificacion,
} from "@/hooks/projects";
import { PROJECT_MEMBER_ROLES, canApproveModification, canManageProjects } from "@/lib/permissions";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import type { UiTone } from "@/lib/catalogs";

const LISTA_ERROR = "No pudimos cargar las solicitudes de modificación. Inténtalo de nuevo.";
export const MODIFICACIONES_BORRADOR_HINT =
  "Las modificaciones estarán disponibles cuando la línea base esté aprobada.";

const ESTADO_META: Record<ProjectModificacion["estado"], { tone: UiTone; label: string }> = {
  PENDIENTE: { tone: "alerta", label: "Pendiente" },
  APROBADA: { tone: "exito", label: "Aprobada" },
  RECHAZADA: { tone: "riesgo", label: "Rechazada" },
};

const CAMPOS_MONEDA = new Set(["asignado", "valor"]);

function formatValor(item: ModificacionDetalleItem, valor: string): string {
  const campo = item.campo ?? (item.elemento === "presupuesto" ? "asignado" : "valor");
  if (!CAMPOS_MONEDA.has(campo)) return valor;
  try {
    return formatCOP(toCents(valor));
  } catch {
    return valor;
  }
}

export function ProjectModificaciones({ proyecto }: { proyecto: ProjectListRow }) {
  return (
    <section data-testid="modificaciones">
      <SectionHeader icon={<FilePen className="size-3.5" strokeWidth={2} />}>Modificaciones</SectionHeader>
      {proyecto.estado === "BORRADOR" ? (
        <p className="mt-1.5 text-[12.5px] text-ink-500">{MODIFICACIONES_BORRADOR_HINT}</p>
      ) : (
        <ModificacionesContent proyecto={proyecto} />
      )}
    </section>
  );
}

function ModificacionesContent({ proyecto }: { proyecto: ProjectListRow }) {
  const query = useProjectModifications(proyecto.id);
  const userQuery = useCurrentUser();
  const membersQuery = useProjectMembers(proyecto.id);
  const aprobar = useApproveModification(proyecto.id);
  const rechazar = useRejectModification(proyecto.id);

  const [rechazando, setRechazando] = useState<string | null>(null);
  const [comentario, setComentario] = useState("");
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [fallos, setFallos] = useState<Record<string, { mensaje: string; reglas: ModificacionRegla[] }>>({});

  const usuario = userQuery.data;
  const esGestor = usuario ? canManageProjects({ id: usuario.id, rol: usuario.rol }) : false;
  const esMiembro = Boolean(
    usuario &&
      PROJECT_MEMBER_ROLES.includes(usuario.rol) &&
      (membersQuery.data ?? []).some((m) => m.usuario.id === usuario.id),
  );
  const puedeSolicitar = proyecto.estado === "EN_EJECUCION" && (esGestor || esMiembro);
  const puedeDecidir = proyecto.estado === "EN_EJECUCION" && usuario ? canApproveModification({ id: usuario.id, rol: usuario.rol }) : false;

  function registrarFallo(id: string, err: unknown) {
    setFallos((previo) => ({
      ...previo,
      [id]: {
        mensaje: errorMessage(err, "No pudimos completar la acción. Inténtalo de nuevo."),
        reglas: err instanceof ModificacionReglasError ? err.reglas : [],
      },
    }));
  }

  async function decidirAprobar(id: string) {
    setTrabajando(id);
    setFallos((previo) => ({ ...previo, [id]: { mensaje: "", reglas: [] } }));
    try {
      await aprobar.mutateAsync(id);
    } catch (err) {
      registrarFallo(id, err);
    } finally {
      setTrabajando(null);
    }
  }

  async function decidirRechazar(id: string) {
    setTrabajando(id);
    setFallos((previo) => ({ ...previo, [id]: { mensaje: "", reglas: [] } }));
    try {
      await rechazar.mutateAsync({ solicitudId: id, comentario: comentario.trim() });
      setRechazando(null);
      setComentario("");
    } catch (err) {
      registrarFallo(id, err);
    } finally {
      setTrabajando(null);
    }
  }

  const solicitudes = [...(query.data ?? [])].sort((a, b) => {
    if ((a.estado === "PENDIENTE") !== (b.estado === "PENDIENTE")) return a.estado === "PENDIENTE" ? -1 : 1;
    // The queue is worked oldest first; what is already decided reads newest first.
    return a.estado === "PENDIENTE"
      ? a.solicitado_at.localeCompare(b.solicitado_at)
      : b.solicitado_at.localeCompare(a.solicitado_at);
  });

  return (
    <div className="mt-2 flex flex-col gap-2.5">
      {puedeSolicitar && (
        <div>
          <SolicitarModificacion proyecto={proyecto} />
        </div>
      )}

      {query.isError ? (
        <InlineError message={errorMessage(query.error, LISTA_ERROR)} />
      ) : query.isLoading || !query.data ? (
        <Skeleton className="h-16 w-full rounded-[14px]" />
      ) : solicitudes.length === 0 ? (
        <EmptyBlock>Aún no hay solicitudes de modificación.</EmptyBlock>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {solicitudes.map((solicitud) => {
            const meta = ESTADO_META[solicitud.estado];
            const fallo = fallos[solicitud.id];
            const ocupada = trabajando === solicitud.id;
            return (
              <li
                key={solicitud.id}
                data-testid="solicitud"
                data-estado={solicitud.estado}
                className="rounded-inner border border-border bg-panel p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <ToneBadge tone={meta.tone} label={meta.label} />
                  <span className="text-[12.5px] font-semibold text-ink-900">{TIPO_MODIFICACION_LABEL[solicitud.tipo]}</span>
                  <span className="text-[11.5px] text-ink-500">
                    {solicitud.solicitado_por.nombre ?? "Usuario no disponible"} · {formatFechaHora(solicitud.solicitado_at)}
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-ink-800">{solicitud.motivo}</p>

                <ul className="mt-1.5 flex flex-col gap-0.5 text-[12px] text-ink-700">
                  {solicitud.detalle.map((item, indice) => (
                    <li key={`${item.elemento}-${item.clave}-${item.campo ?? ""}-${indice}`}>
                      <span className="font-mono text-[11.5px] text-ink-500">{item.clave.replace("|", " · ")} </span>
                      {CAMPO_LABEL[item.campo ?? (item.elemento === "presupuesto" ? "asignado" : "valor")] ?? item.campo}:{" "}
                      <span className="text-ink-500 line-through">{formatValor(item, item.antes)}</span>
                      {" → "}
                      <span className="font-semibold">{formatValor(item, item.despues)}</span>
                    </li>
                  ))}
                </ul>

                {solicitud.estado !== "PENDIENTE" && (
                  <p className="mt-1.5 text-[12px] text-ink-600">
                    {solicitud.estado === "APROBADA" ? "Aprobada" : "Rechazada"} por {solicitud.decidido_por?.nombre ?? "Usuario no disponible"}
                    {solicitud.decidido_at ? ` · ${formatFechaHora(solicitud.decidido_at)}` : ""}
                    {solicitud.version_numero !== null ? ` · Versión ${solicitud.version_numero}` : ""}
                    {solicitud.comentario_decision ? ` — ${solicitud.comentario_decision}` : ""}
                  </p>
                )}

                {fallo?.mensaje && fallo.reglas.length === 0 && <InlineError message={fallo.mensaje} className="mt-1.5" />}
                {fallo && fallo.reglas.length > 0 && (
                  <ul data-testid="solicitud-reglas" role="alert" className="mt-1.5 list-disc pl-5 text-[12.5px] text-destructivo">
                    {fallo.reglas.map((regla, indice) => (
                      <li key={`${regla.codigo}-${indice}`}>{regla.mensaje}</li>
                    ))}
                  </ul>
                )}

                {solicitud.estado === "PENDIENTE" && puedeDecidir && (
                  <div className="mt-2 flex flex-col gap-2">
                    {rechazando === solicitud.id ? (
                      <>
                        <textarea
                          aria-label="Comentario del rechazo"
                          value={comentario}
                          onChange={(event) => setComentario(event.target.value)}
                          rows={2}
                          maxLength={1000}
                          className="rounded-12 border border-border-strong bg-input-bg px-3 py-2 text-base text-ink-900 md:text-[13px]"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={ocupada || comentario.trim() === ""}
                            onClick={() => void decidirRechazar(solicitud.id)}
                          >
                            {ocupada && <LoaderCircle className="animate-spin" />}
                            Confirmar rechazo
                          </Button>
                          <Button type="button" size="sm" variant="ghost" disabled={ocupada} onClick={() => setRechazando(null)}>
                            Cancelar
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" disabled={ocupada} onClick={() => void decidirAprobar(solicitud.id)}>
                          {ocupada && <LoaderCircle className="animate-spin" />}
                          Aprobar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={ocupada}
                          onClick={() => {
                            setRechazando(solicitud.id);
                            setComentario("");
                          }}
                        >
                          Rechazar
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
