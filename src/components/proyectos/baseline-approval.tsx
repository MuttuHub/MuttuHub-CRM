// Aprobación de la línea base (S8 U3, E-25). El botón lo ve quien gestiona proyectos mientras el proyecto
// está en BORRADOR; es comodidad de interfaz: la autoridad es la API (403 a otros roles, 409 fuera de
// BORRADOR). El diálogo muestra en línea los requisitos pendientes que devuelve el 409: la interfaz no
// los recalcula.

"use client";

import { useState } from "react";
import { LoaderCircle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { InlineError } from "@/components/proyectos/ui";
import { useCurrentUser } from "@/hooks/kanban";
import {
  BaselinePrecondicionesError,
  useApproveBaseline,
  type BaselinePrecondicion,
  type ProjectListRow,
} from "@/hooks/projects";
import { canApproveBaseline } from "@/lib/permissions";

export function BaselineApproval({ proyecto }: { proyecto: ProjectListRow }) {
  if (proyecto.estado !== "BORRADOR") return null;
  return <BaselineApprovalControl proyecto={proyecto} />;
}

function BaselineApprovalControl({ proyecto }: { proyecto: ProjectListRow }) {
  const userQuery = useCurrentUser();
  const usuario = userQuery.data;
  const aprobar = useApproveBaseline(proyecto.id);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [precondiciones, setPrecondiciones] = useState<BaselinePrecondicion[]>([]);

  if (!usuario || !canApproveBaseline({ id: usuario.id, rol: usuario.rol })) return null;

  function cambiarApertura(abierto: boolean) {
    setOpen(abierto);
    if (!abierto) {
      setError(null);
      setPrecondiciones([]);
    }
  }

  async function confirmar() {
    setError(null);
    setPrecondiciones([]);
    try {
      await aprobar.mutateAsync();
      cambiarApertura(false);
    } catch (err) {
      if (err instanceof BaselinePrecondicionesError) {
        setPrecondiciones(err.precondiciones);
        setError(err.message);
      } else {
        setError(errorMessage(err, "No pudimos aprobar la línea base. Inténtalo de nuevo."));
      }
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => cambiarApertura(true)}>
        <Lock />
        Aprobar línea base
      </Button>

      <Dialog open={open} onOpenChange={cambiarApertura}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-[22px] sm:max-w-[min(560px,calc(100%-2rem))]">
          <DialogHeader>
            <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
              Aprobar línea base
            </DialogTitle>
            <DialogDescription>
              Al aprobar, la estructura y el presupuesto quedan congelados (versión 0) y el proyecto pasa a En
              ejecución. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>

          <InlineError message={error} />
          {precondiciones.length > 0 && (
            <ul data-testid="baseline-precondiciones" className="list-disc pl-5 text-[13px] text-ink-800">
              {precondiciones.map((precondicion, indice) => (
                <li key={`${precondicion.codigo}-${indice}`}>{precondicion.mensaje}</li>
              ))}
            </ul>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => cambiarApertura(false)} disabled={aprobar.isPending}>
              Cancelar
            </Button>
            <Button type="button" disabled={aprobar.isPending} onClick={() => void confirmar()}>
              {aprobar.isPending && <LoaderCircle className="animate-spin" />}
              Aprobar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
