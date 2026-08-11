"use client";

// Admin queue of public access requests (PRD §3.1): pending requests with
// Approve (role picker dialog) / Reject actions, plus the history of already
// reviewed ones. Mutations hit /api/v1/solicitudes-acceso/:id routes; the
// page refreshes after each success. Spanish copy, same visual language as
// users-table.tsx (Dialog/Select/Table/Button).

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Inbox,
  LoaderCircle,
  UserRoundCheck,
  XCircle,
} from "lucide-react";
import type { RolUsuario } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ALL_ROLES, ROLE_LABELS } from "@/lib/auth/types";
import { SinConexionCard } from "@/components/shared/sin-conexion-card";

export type SolicitudRow = {
  id: string;
  nombre: string;
  email: string;
  cargo: string | null;
  origen: string;
  estado: string;
  revisado_por: string | null;
  revisado_at: Date | string | null;
  created_at: Date | string;
};

type ApiErrorBody = { error?: string };

async function readError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  return body?.error ?? fallback;
}

function origenBadgeClass(origen: string): string {
  return origen === "google"
    ? "bg-info-bg text-info"
    : "bg-ink-100 text-ink-700";
}

function origenLabel(origen: string): string {
  return origen === "google" ? "Google" : "Formulario";
}

function formatFecha(iso: Date | string): string {
  return new Date(iso).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function initials(nombre: string): string {
  const parts = nombre.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + second).toUpperCase();
}

export function SolicitudesSection({
  solicitudes,
  unconfigured,
  loadError,
}: {
  solicitudes: SolicitudRow[];
  unconfigured: boolean;
  loadError: boolean;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (unconfigured || loadError) {
    // unconfigured (dev sin env) → card técnica; loadError → copy de usuario
    // + reintento vía refresh del server component.
    return (
      <SinConexionCard
        unconfigured={unconfigured}
        onRetry={() => router.refresh()}
      />
    );
  }

  const pendientes = solicitudes.filter((s) => s.estado === "PENDIENTE");
  const historial = solicitudes.filter((s) => s.estado !== "PENDIENTE");

  async function aprobar(id: string, rol: RolUsuario) {
    setBusyId(id);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/solicitudes-acceso/${id}/aprobar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rol }),
      });
      if (!res.ok) {
        setNotice(await readError(res, "No pudimos aprobar la solicitud."));
        return;
      }
      toast.success("Solicitud aprobada. La invitación va en camino.");
      router.refresh();
    } catch {
      setNotice("No pudimos aprobar la solicitud.");
    } finally {
      setBusyId(null);
    }
  }

  async function rechazar(id: string) {
    setBusyId(id);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/solicitudes-acceso/${id}/rechazar`, {
        method: "POST",
      });
      if (!res.ok) {
        setNotice(await readError(res, "No pudimos rechazar la solicitud."));
        return;
      }
      toast.success("Solicitud rechazada.");
      router.refresh();
    } catch {
      setNotice("No pudimos rechazar la solicitud.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {notice && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-[14px] border border-destructivo/25 bg-destructivo-bg px-4 py-3 text-[13px] font-medium text-destructivo"
        >
          <AlertTriangle className="size-4 shrink-0" strokeWidth={1.9} />
          {notice}
        </div>
      )}

      <section className="overflow-hidden rounded-[22px] border border-ink-200 bg-white">
        <div className="flex items-center gap-2.5 border-b border-ink-100 px-5 py-4">
          <Inbox className="size-4 text-ink-600" strokeWidth={1.8} />
          <h3 className="font-display text-[15px] font-bold tracking-[-0.02em] text-ink-950">
            Pendientes
          </h3>
          <span className="rounded-full bg-alerta-bg px-2 py-0.5 text-[10px] font-bold text-alerta">
            {pendientes.length}
          </span>
        </div>
        {pendientes.length === 0 ? (
          <div className="grid min-h-[160px] place-items-center px-6 py-10 text-center">
            <div>
              <span className="mx-auto grid size-11 place-items-center rounded-[15px_15px_15px_5px] bg-exito-bg text-exito">
                <CheckCircle2 className="size-5" strokeWidth={1.7} />
              </span>
              <h4 className="mt-4 font-display text-[16px] font-bold tracking-[-0.02em] text-ink-950">
                Nada por revisar
              </h4>
              <p className="mt-1 text-[13px] text-ink-600">
                Cuando alguien pida acceso desde el login, aparece aquí.
              </p>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5 text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                  Solicitante
                </TableHead>
                <TableHead className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                  Origen
                </TableHead>
                <TableHead className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                  Recibida
                </TableHead>
                <TableHead className="w-[210px] pr-5 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendientes.map((s) => (
                <TableRow key={s.id} className="hover:bg-ink-100/60">
                  <TableCell className="pl-5">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-rose-50 text-[11px] font-bold text-rose-700">
                        {initials(s.nombre)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[13.5px] font-semibold text-ink-950">
                          {s.nombre}
                        </div>
                        <div className="truncate text-[12.5px] text-ink-600">
                          {s.email}
                          {s.cargo ? ` · ${s.cargo}` : ""}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex h-[24px] items-center rounded-full px-2.5 text-[11px] font-bold whitespace-nowrap ${origenBadgeClass(s.origen)}`}
                    >
                      {origenLabel(s.origen)}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-[12px] text-ink-600">
                    {formatFecha(s.created_at)}
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {busyId === s.id && (
                        <LoaderCircle className="size-4 animate-spin text-ink-500" />
                      )}
                      <AprobarDialog
                        solicitud={s}
                        disabled={busyId !== null}
                        onAprobar={(rol) => void aprobar(s.id, rol)}
                      />
                      <RechazarDialog
                        solicitud={s}
                        disabled={busyId !== null}
                        onRechazar={() => void rechazar(s.id)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="overflow-hidden rounded-[22px] border border-ink-200 bg-white">
        <div className="flex items-center gap-2.5 border-b border-ink-100 px-5 py-4">
          <UserRoundCheck className="size-4 text-ink-600" strokeWidth={1.8} />
          <h3 className="font-display text-[15px] font-bold tracking-[-0.02em] text-ink-950">
            Historial
          </h3>
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-600">
            {historial.length}
          </span>
        </div>
        {historial.length === 0 ? (
          <div className="grid min-h-[120px] place-items-center px-6 py-8 text-center">
            <p className="text-[13px] text-ink-600">
              Aún no hay solicitudes aprobadas ni rechazadas.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5 text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                  Solicitante
                </TableHead>
                <TableHead className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                  Origen
                </TableHead>
                <TableHead className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                  Resolución
                </TableHead>
                <TableHead className="pr-5 text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                  Revisada
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historial.map((s) => {
                const aprobada = s.estado === "APROBADA";
                return (
                  <TableRow key={s.id} className="hover:bg-ink-100/60">
                    <TableCell className="pl-5">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink-100 text-[11px] font-bold text-ink-700">
                          {initials(s.nombre)}
                        </span>
                        <div className="min-w-0">
                          <div className="text-[13.5px] font-semibold text-ink-950">
                            {s.nombre}
                          </div>
                          <div className="truncate text-[12.5px] text-ink-600">
                            {s.email}
                            {s.cargo ? ` · ${s.cargo}` : ""}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex h-[24px] items-center rounded-full px-2.5 text-[11px] font-bold whitespace-nowrap ${origenBadgeClass(s.origen)}`}
                      >
                        {origenLabel(s.origen)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex h-[24px] items-center gap-1.5 rounded-full px-2.5 text-[11px] font-bold whitespace-nowrap ${
                          aprobada
                            ? "bg-exito-bg text-exito"
                            : "bg-destructivo-bg text-destructivo"
                        }`}
                      >
                        {aprobada ? (
                          <CheckCircle2 className="size-3" strokeWidth={2} />
                        ) : (
                          <XCircle className="size-3" strokeWidth={2} />
                        )}
                        {aprobada ? "Aprobada" : "Rechazada"}
                      </span>
                    </TableCell>
                    <TableCell className="pr-5 font-mono text-[12px] text-ink-600">
                      {s.revisado_at ? formatFecha(s.revisado_at) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function AprobarDialog({
  solicitud,
  disabled,
  onAprobar,
}: {
  solicitud: SolicitudRow;
  disabled: boolean;
  onAprobar: (rol: RolUsuario) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rol, setRol] = useState<RolUsuario>("COLABORADOR");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      onAprobar(rol);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  const esGoogle = solicitud.origen === "google";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            className="rounded-[10px] font-semibold"
          >
            Aprobar
          </Button>
        }
      />
      <DialogContent className="rounded-[20px] sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[17px] font-bold text-ink-950">
            Aprobar acceso de {solicitud.nombre}
          </DialogTitle>
          <DialogDescription>
            {esGoogle
              ? "El solicitante ya tiene su cuenta de Google: al aprobar podrá entrar de inmediato."
              : "Al aprobar se envía una invitación por correo para que el solicitante elija su contraseña."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Rol</Label>
            <Select
              value={rol}
              onValueChange={(v) => setRol(v as RolUsuario)}
            >
              <SelectTrigger className="h-10 w-full rounded-[12px] bg-white px-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="mt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <LoaderCircle className="size-4 animate-spin" />}
              Aprobar y enviar invitación
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RechazarDialog({
  solicitud,
  disabled,
  onRechazar,
}: {
  solicitud: SolicitudRow;
  disabled: boolean;
  onRechazar: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            className="rounded-[10px] font-semibold text-destructivo hover:text-destructivo"
          >
            Rechazar
          </Button>
        }
      />
      <DialogContent className="rounded-[20px] sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[17px] font-bold text-ink-950">
            Rechazar a {solicitud.nombre}
          </DialogTitle>
          <DialogDescription>
            La solicitud quedará registrada como rechazada. El solicitante podrá
            volver a pedir acceso cuando quiera.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={disabled}
            onClick={() => {
              setOpen(false);
              onRechazar();
            }}
          >
            Rechazar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}