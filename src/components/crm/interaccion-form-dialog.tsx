"use client";

// v7 alignment, unit C3b: the "Registrar interacción" dialog. Interactions are
// the immutable bitácora entries, so there is no dedicated write endpoint: the
// form posts through the per-client log (`POST /clients/:id/log`, hook
// `useAddLogEntry`), which also invalidates the cross-client feed. The aliado
// selector only offers clients the server says the user can write
// (`puede_editar`), i.e. the exact bitácora write gate (canEditClient); the
// server stays the authority (403 otherwise).

import { useState, type FormEvent } from "react";
import type { TipoInteraccion } from "@prisma/client";
import { LoaderCircle, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAddLogEntry, useClients, useOpportunities } from "@/hooks/crm";
import { TIPO_INTERACCION_LABELS, TIPO_INTERACCION_ORDER } from "./interacciones-feed";

/** "none" is the sentinel for "sin oportunidad" inside the Select (base-ui needs a value). */
const SIN_OPORTUNIDAD = "none";

type ClienteOption = { id: string; nombre: string };

/**
 * The create flow for the Interacciones section. `clients` are the writable
 * clients (server `puede_editar`); passing them in keeps the dialog a pure form
 * and lets the caller decide visibility with the same bitácora write gate.
 */
export function InteraccionFormDialog({
  open,
  onOpenChange,
  clients,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: ClienteOption[];
}) {
  const [tipo, setTipo] = useState<TipoInteraccion>("REUNION");
  const [clienteId, setClienteId] = useState("");
  const [oportunidadId, setOportunidadId] = useState(SIN_OPORTUNIDAD);
  const [texto, setTexto] = useState("");
  const [proximoPaso, setProximoPaso] = useState("");
  const [error, setError] = useState<string | null>(null);

  const oportunidadesQuery = useOpportunities(clienteId || null);
  const oportunidades = oportunidadesQuery.data ?? [];
  const addMutation = useAddLogEntry(clienteId);

  const formKey = open ? "open" : "closed";
  const [lastKey, setLastKey] = useState(formKey);
  if (formKey !== lastKey) {
    setLastKey(formKey);
    if (open) {
      setError(null);
      setTipo("REUNION");
      setClienteId("");
      setOportunidadId(SIN_OPORTUNIDAD);
      setTexto("");
      setProximoPaso("");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!clienteId) return setError("Elige el aliado de la interacción.");
    if (!texto.trim()) return setError("El resumen de la interacción es obligatorio.");

    try {
      await addMutation.mutateAsync({
        texto: texto.trim(),
        oportunidad_id: oportunidadId === SIN_OPORTUNIDAD ? null : oportunidadId,
        tipo,
        proximo_paso: proximoPaso.trim() || null,
      });
      onOpenChange(false);
    } catch {
      /* toast handled by the hook */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-[min(560px,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
            Registrar interacción
          </DialogTitle>
          <DialogDescription>
            Reunión, llamada, correo o visita con un aliado. Una vez guardada, la
            interacción no se puede editar ni eliminar.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div
            role="alert"
            className="rounded-12 border border-destructivo/25 bg-destructivo-bg px-4 py-3 text-[13px] font-medium text-destructivo"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>Tipo</Label>
              <Select
                value={tipo}
                onValueChange={(v) => {
                  if (v) setTipo(v as TipoInteraccion);
                }}
              >
                <SelectTrigger className="w-full px-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPO_INTERACCION_ORDER.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_INTERACCION_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>
                Aliado <span className="text-rose-500">*</span>
              </Label>
              <Select
                value={clienteId}
                onValueChange={(v) => {
                  setClienteId(v ?? "");
                  setOportunidadId(SIN_OPORTUNIDAD);
                }}
              >
                <SelectTrigger className="w-full px-3">
                  <SelectValue placeholder="Elige un aliado" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label>Oportunidad (opcional)</Label>
              <Select
                value={oportunidadId}
                onValueChange={(v) => setOportunidadId(v ?? SIN_OPORTUNIDAD)}
              >
                <SelectTrigger className="w-full px-3" disabled={!clienteId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_OPORTUNIDAD}>Sin oportunidad</SelectItem>
                  {oportunidades.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="interaccion-resumen">
              Resumen <span className="text-rose-500">*</span>
            </Label>
            <textarea
              id="interaccion-resumen"
              rows={3}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Qué se habló, acuerdos y quién participó"
              className="w-full resize-none rounded-12 border border-border-strong bg-input-bg px-3 py-2 text-sm text-ink-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="interaccion-proximo-paso">Próximo paso</Label>
            <Input
              id="interaccion-proximo-paso"
              value={proximoPaso}
              onChange={(e) => setProximoPaso(e.target.value)}
              placeholder="Ej. Enviar la propuesta el viernes"
              className="px-3"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={addMutation.isPending} className="px-4 font-bold">
              {addMutation.isPending && <LoaderCircle className="size-4 animate-spin" />}
              {addMutation.isPending ? "Guardando…" : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Entry point of the Interacciones section. It only appears when the server
 * reports at least one client the user can write to (`puede_editar`), which is
 * the same authority the per-client bitácora composer uses; a role with no
 * writable client sees the read-only feed alone.
 */
export function RegistrarInteraccionButton() {
  const clientsQuery = useClients({ limit: 100 });
  const [open, setOpen] = useState(false);
  const writableClients: ClienteOption[] = (clientsQuery.data?.items ?? [])
    .filter((c) => c.puede_editar)
    .map((c) => ({ id: c.id, nombre: c.nombre }));

  if (clientsQuery.isLoading || writableClients.length === 0) return null;

  return (
    <>
      <Button onClick={() => setOpen(true)} className="px-4 font-bold">
        <MessageSquarePlus className="size-4" strokeWidth={1.9} />
        Registrar interacción
      </Button>
      <InteraccionFormDialog open={open} onOpenChange={setOpen} clients={writableClients} />
    </>
  );
}
