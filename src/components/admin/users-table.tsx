"use client";

// Users administration table (PRD §3.3): list, "Nuevo usuario" dialog, role
// change dropdown and soft-deactivate confirmation. All mutations hit the
// /api/v1/users routes; errors surface in Spanish. Uses the shared
// ROLE_LABELS map so labels stay consistent across modules.

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  LoaderCircle,
  Plus,
  ShieldOff,
  UserRoundPlus,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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

export type UsuarioRow = {
  id: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
  activo: boolean;
  created_at: Date | string;
};

const PASSWORD_POLICY = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

function initials(nombre: string): string {
  const parts = nombre.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + second).toUpperCase();
}

function roleBadgeClass(rol: RolUsuario): string {
  switch (rol) {
    case "ADMINISTRADOR":
      return "bg-rose-50 text-rose-700";
    case "GERENCIA":
      return "bg-info-bg text-info";
    case "COORDINADOR":
      return "bg-exito-bg text-exito";
    default:
      return "bg-ink-100 text-ink-700";
  }
}

type ApiErrorBody = { error?: string };

async function readError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  return body?.error ?? fallback;
}

export function UsersTable({
  usuarios,
  currentUserId,
  unconfigured,
  loadError,
}: {
  usuarios: UsuarioRow[];
  currentUserId?: string;
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

  async function patchRole(id: string, rol: RolUsuario) {
    setBusyId(id);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rol }),
      });
      if (!res.ok) {
        setNotice(await readError(res, "No pudimos actualizar el rol."));
        return;
      }
      router.refresh();
    } catch {
      setNotice("No pudimos actualizar el rol.");
    } finally {
      setBusyId(null);
    }
  }

  async function deactivate(id: string) {
    setBusyId(id);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/users/${id}/deactivate`, {
        method: "POST",
      });
      if (!res.ok) {
        setNotice(await readError(res, "No pudimos desactivar el usuario."));
        return;
      }
      router.refresh();
    } catch {
      setNotice("No pudimos desactivar el usuario.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {notice && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-[14px] border border-destructivo/25 bg-destructivo-bg px-4 py-3 text-[13px] font-medium text-destructivo"
        >
          <AlertTriangle className="size-4 shrink-0" strokeWidth={1.9} />
          {notice}
        </div>
      )}

      <NewUserDialog
        onError={setNotice}
        onSuccess={() => router.refresh()}
      />

      <div className="overflow-hidden rounded-[22px] border border-ink-200 bg-white">
        {usuarios.length === 0 ? (
          <div className="grid min-h-[220px] place-items-center px-6 py-12 text-center">
            <div>
              <span className="mx-auto grid size-11 place-items-center rounded-[15px_15px_15px_5px] bg-ink-100 text-ink-700">
                <UserRoundPlus className="size-5" strokeWidth={1.7} />
              </span>
              <h3 className="mt-4 font-display text-[17px] font-bold tracking-[-0.02em] text-ink-950">
                Aún no hay usuarios
              </h3>
              <p className="mt-1 text-[13px] text-ink-600">
                Crea el primer usuario con el botón &quot;Nuevo usuario&quot;.
              </p>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5 text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                  Usuario
                </TableHead>
                <TableHead className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                  Rol
                </TableHead>
                <TableHead className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                  Estado
                </TableHead>
                <TableHead className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                  Ingreso
                </TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.map((usuario) => {
                const isSelf = usuario.id === currentUserId;
                return (
                  <TableRow key={usuario.id} className="hover:bg-ink-100/60">
                    <TableCell className="pl-5">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-rose-50 text-[11px] font-bold text-rose-700">
                          {initials(usuario.nombre)}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-[13.5px] font-semibold text-ink-950">
                            {usuario.nombre}
                            {isSelf && (
                              <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-600">
                                Tú
                              </span>
                            )}
                          </div>
                          <div className="truncate text-[12.5px] text-ink-600">
                            {usuario.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex h-[24px] items-center rounded-full px-2.5 text-[11px] font-bold whitespace-nowrap ${roleBadgeClass(usuario.rol)}`}
                      >
                        {ROLE_LABELS[usuario.rol]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex h-[24px] items-center gap-1.5 rounded-full px-2.5 text-[11px] font-bold whitespace-nowrap ${
                          usuario.activo
                            ? "bg-exito-bg text-exito"
                            : "bg-ink-100 text-ink-600"
                        }`}
                      >
                        <span
                          className={`size-[6px] rounded-full ${
                            usuario.activo ? "bg-exito" : "bg-ink-500"
                          }`}
                        />
                        {usuario.activo ? "Activo" : "Inactivo"}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-[12px] text-ink-600">
                      {new Date(usuario.created_at).toLocaleDateString("es-CO", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <RowMenu
                        usuario={usuario}
                        busy={busyId === usuario.id}
                        onPatchRole={(rol) => void patchRole(usuario.id, rol)}
                        onDeactivate={() => void deactivate(usuario.id)}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function RowMenu({
  usuario,
  busy,
  onPatchRole,
  onDeactivate,
}: {
  usuario: UsuarioRow;
  busy: boolean;
  onPatchRole: (rol: RolUsuario) => void;
  onDeactivate: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Pending role change waiting for confirmation (null = no dialog).
  const [rolPendiente, setRolPendiente] = useState<RolUsuario | null>(null);

  return (
    <div className="flex items-center justify-end gap-1">
      {busy && <LoaderCircle className="size-4 animate-spin text-ink-500" />}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Acciones de ${usuario.nombre}`}
            />
          }
        />
        <DropdownMenuContent align="end" alignOffset={-8}>
          <DropdownMenuLabel>Cambiar rol</DropdownMenuLabel>
          {ALL_ROLES.map((rol) => (
            <DropdownMenuItem
              key={rol}
              onClick={() => setRolPendiente(rol)}
              className={usuario.rol === rol ? "font-semibold text-rose-700" : ""}
            >
              <span
                className={`size-2 rounded-full ${
                  usuario.rol === rol ? "bg-rose-500" : "bg-ink-300"
                }`}
              />
              {ROLE_LABELS[rol]}
            </DropdownMenuItem>
          ))}
          {usuario.activo && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setConfirmOpen(true)}
              >
                <ShieldOff />
                Desactivar
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={rolPendiente !== null}
        onOpenChange={(open) => !open && setRolPendiente(null)}
      >
        <DialogContent className="rounded-[20px] sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="font-display text-[17px] font-bold text-ink-950">
              Cambiar el rol de {usuario.nombre}
            </DialogTitle>
            <DialogDescription>
              ¿Cambiar el rol de {usuario.nombre} de {ROLE_LABELS[usuario.rol]} a{" "}
              {rolPendiente ? ROLE_LABELS[rolPendiente] : ""}? El rol define los
              módulos a los que puede acceder en el Hub.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRolPendiente(null)}
            >
              Cancelar
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                const rol = rolPendiente;
                setRolPendiente(null);
                if (rol) onPatchRole(rol);
              }}
            >
              {busy && <LoaderCircle className="size-4 animate-spin" />}
              Cambiar rol
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="rounded-[20px] sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="font-display text-[17px] font-bold text-ink-950">
              Desactivar a {usuario.nombre}
            </DialogTitle>
            <DialogDescription>
              El usuario conserva su historial. No estará habilitado para
              ingresar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setConfirmOpen(false);
                onDeactivate();
              }}
            >
              {busy && <LoaderCircle className="size-4 animate-spin" />}
              Desactivar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewUserDialog({
  onError,
  onSuccess,
}: {
  onError: (message: string) => void;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<RolUsuario>("COLABORADOR");
  const [password, setPassword] = useState("");
  // Invitation mode is the default: the user receives an email with a link to
  // set their own password (no password field shown).
  const [invite, setInvite] = useState(true);

  function reset() {
    setNombre("");
    setEmail("");
    setRol("COLABORADOR");
    setPassword("");
    setInvite(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError("");

    if (!nombre.trim() || !email.trim()) {
      onError("Nombre y correo son obligatorios.");
      return;
    }
    if (!invite && !PASSWORD_POLICY.test(password)) {
      onError("La contraseña debe tener al menos 8 caracteres, con letras y números.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/v1/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          invite
            ? { nombre, email, rol, invite: true }
            : { nombre, email, rol, password },
        ),
      });
      if (!res.ok) {
        onError(await readError(res, "No pudimos crear el usuario."));
        return;
      }
      reset();
      setOpen(false);
      onSuccess();
    } catch {
      onError("No pudimos crear el usuario.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex justify-end">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
            <Button className="rounded-[13px] px-4 font-bold">
              <Plus />
              Nuevo usuario
            </Button>
          }
        />
        <DialogContent className="rounded-[20px] sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="font-display text-[17px] font-bold text-ink-950">
              Nuevo usuario
            </DialogTitle>
            <DialogDescription>
              {invite
                ? "El usuario recibirá un email con un enlace para elegir su contraseña."
                : "El usuario recibirá acceso con la contraseña que definas."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="nuevo-nombre">Nombre completo</Label>
              <Input
                id="nuevo-nombre"
                required
                placeholder="Nombre y apellido"
                className="h-10 rounded-[12px] bg-white px-3"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="nuevo-email">Correo electrónico</Label>
              <Input
                id="nuevo-email"
                type="email"
                required
                placeholder="nombre@muttu.co"
                className="h-10 rounded-[12px] bg-white px-3"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Rol</Label>
              <Select value={rol} onValueChange={(v) => setRol(v as RolUsuario)}>
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
            <div className="flex flex-col gap-2">
              <Label>Cómo crea su acceso</Label>
              <Select
                value={invite ? "invite" : "password"}
                onValueChange={(v) => setInvite(v === "invite")}
              >
                <SelectTrigger className="h-10 w-full rounded-[12px] bg-white px-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="invite">
                    Enviar invitación por email
                  </SelectItem>
                  <SelectItem value="password">Definir contraseña</SelectItem>
                </SelectContent>
              </Select>
              {invite && (
                <p className="text-[12px] leading-relaxed text-ink-600">
                  El usuario recibirá un email para elegir su contraseña.
                </p>
              )}
            </div>
            {!invite && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="nuevo-password">Contraseña</Label>
                <Input
                  id="nuevo-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres, con letras y números"
                  className="h-10 rounded-[12px] bg-white px-3"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}
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
                {loading
                  ? invite
                    ? "Enviando…"
                    : "Creando…"
                  : invite
                    ? "Enviar invitación"
                    : "Crear usuario"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
