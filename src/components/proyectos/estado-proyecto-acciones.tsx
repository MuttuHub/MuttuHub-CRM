// B7: cambiar el estado del proyecto desde la ficha (suspender, reactivar, cerrar, reabrir o cancelar).
// El botón lo ven Gerencia y Administración cuando el estado actual admite alguna acción; es comodidad
// de interfaz: la autoridad es la API (403 a otros roles, 409 si la transición ya no aplica). Las
// acciones salen de la misma tabla que usa la API (`accionesDisponibles`), así que nunca divergen.

"use client";

import { useId, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { EstadoProyecto } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { CAPTURE_TEXTAREA, InlineError } from "@/components/proyectos/ui";
import { useCurrentUser } from "@/hooks/kanban";
import { useChangeProjectEstado, type ProjectListRow } from "@/hooks/projects";
import { canManageProjects } from "@/lib/permissions";
import { accionesDisponibles, type AccionEstado } from "@/lib/proyectos/transiciones-estado";

const MOTIVO_MAXIMO = 1000;

const ACCION_META: Record<AccionEstado, { label: string; efecto: string }> = {
  SUSPENDER: {
    label: "Suspender",
    efecto: "El proyecto queda congelado: nadie registra avances, gastos ni documentos hasta que se reactive.",
  },
  REACTIVAR: { label: "Reactivar", efecto: "El proyecto vuelve a En ejecución y el equipo puede seguir registrando." },
  CERRAR: { label: "Cerrar", efecto: "El proyecto queda en solo lectura. Gerencia o Administración pueden reabrirlo." },
  REABRIR: { label: "Reabrir", efecto: "El proyecto vuelve a En ejecución." },
  CANCELAR: { label: "Cancelar", efecto: "El proyecto queda cancelado y en solo lectura. No se puede deshacer." },
};

const AVISO_CONGELADO: Partial<Record<EstadoProyecto, string>> = {
  SUSPENDIDO: "Proyecto suspendido: está congelado hasta que Gerencia o Administración lo reactive.",
  CERRADO: "Proyecto cerrado: es de solo lectura hasta que Gerencia o Administración lo reabra.",
  CANCELADO: "Proyecto cancelado: es de solo lectura.",
};

/** Explica por qué la ficha no deja registrar nada (S5). Lo ve cualquier rol. */
export function AvisoCongelado({ estado }: { estado: EstadoProyecto }) {
  const texto = AVISO_CONGELADO[estado];
  if (!texto) return null;
  return (
    <p role="status" className="mt-1 text-[13px] text-ink-600">
      {texto}
    </p>
  );
}

export function EstadoProyectoAcciones({ proyecto }: { proyecto: ProjectListRow }) {
  const usuario = useCurrentUser().data;
  const acciones = accionesDisponibles(proyecto.estado);
  if (acciones.length === 0) return null;
  if (!usuario || !canManageProjects({ id: usuario.id, rol: usuario.rol })) return null;
  return <CambioEstadoControl proyectoId={proyecto.id} acciones={acciones} />;
}

function CambioEstadoControl({ proyectoId, acciones }: { proyectoId: string; acciones: AccionEstado[] }) {
  const cambiar = useChangeProjectEstado(proyectoId);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [accion, setAccion] = useState<AccionEstado | null>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  function cambiarApertura(abierto: boolean) {
    setOpen(abierto);
    if (!abierto) {
      setAccion(null);
      setMotivo("");
      setError(null);
    }
  }

  async function confirmar() {
    if (accion === null) return;
    setError(null);
    try {
      await cambiar.mutateAsync({ accion, motivo: motivo.trim() });
      cambiarApertura(false);
    } catch (err) {
      setError(errorMessage(err, "No pudimos cambiar el estado del proyecto. Inténtalo de nuevo."));
    }
  }

  const listo = accion !== null && motivo.trim() !== "" && !cambiar.isPending;

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => cambiarApertura(true)}>
        Cambiar estado
      </Button>

      <Dialog open={open} onOpenChange={cambiarApertura}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[min(560px,calc(100%-2rem))]">
          <DialogHeader>
            <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
              Cambiar estado del proyecto
            </DialogTitle>
            <DialogDescription>Elige la acción y escribe el motivo; queda en el historial.</DialogDescription>
          </DialogHeader>

          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Acción</legend>
            {acciones.map((opcion) => (
              <label key={opcion} className="surface-inner flex cursor-pointer items-start gap-3 p-3">
                <input
                  type="radio"
                  name={`${id}-accion`}
                  value={opcion}
                  checked={accion === opcion}
                  onChange={() => setAccion(opcion)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-[13px] font-semibold text-ink-900">{ACCION_META[opcion].label}</span>
                  <span className="block text-[12px] text-ink-600">{ACCION_META[opcion].efecto}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-motivo`} className="text-[12px] text-ink-600">
              Motivo
            </Label>
            <textarea
              id={`${id}-motivo`}
              value={motivo}
              maxLength={MOTIVO_MAXIMO}
              onChange={(event) => setMotivo(event.target.value)}
              className={CAPTURE_TEXTAREA}
            />
          </div>

          <InlineError message={error} />

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => cambiarApertura(false)} disabled={cambiar.isPending}>
              Volver
            </Button>
            <Button type="button" disabled={!listo} onClick={() => void confirmar()}>
              {cambiar.isPending && <LoaderCircle className="animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
