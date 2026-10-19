"use client";

// Diálogo "Cambiar contraseña" para un usuario ya logueado (pedido #2 del
// jefe) — abierto desde el dropdown de UserMenu. A diferencia de "olvidé mi
// contraseña" (reset-password/confirm, para alguien SIN sesión), acá se pide
// la contraseña actual: el servidor (POST /api/v1/auth/change-password) la
// reautentica antes de aplicar la nueva.

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { KeyRound, LoaderCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { PASSWORD_POLICY_HINT, PASSWORD_POLICY_REGEX } from "@/lib/auth/password-policy";

type ApiErrorBody = { error?: string };

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirm("");
    setError(null);
  }

  // Single close path for every way the dialog can close (Cancelar, Escape,
  // overlay click, a successful submit) so state never survives a close —
  // code review finding: the Cancelar button used to call onOpenChange(false)
  // directly, bypassing reset() and leaving typed passwords in memory for
  // the next time the dialog opened.
  function close() {
    reset();
    onOpenChange(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!PASSWORD_POLICY_REGEX.test(newPassword)) {
      setError(PASSWORD_POLICY_HINT);
      return;
    }
    if (newPassword !== confirm) {
      setError("Las contraseñas nuevas no coinciden.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; message?: string }
        | ApiErrorBody
        | null;

      if (res.ok && body && "ok" in body && body.ok) {
        toast.success(body.message ?? "Contraseña actualizada correctamente.");
        close();
        return;
      }
      setError(
        (body && "error" in body && body.error) ||
          "No pudimos actualizar tu contraseña.",
      );
    } catch {
      setError("No pudimos actualizar tu contraseña. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          onOpenChange(next);
        } else {
          close();
        }
      }}
    >
      <DialogContent className="rounded-[20px] sm:max-w-[min(400px,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-[17px] font-bold text-ink-950">
            <KeyRound className="size-4" strokeWidth={1.8} />
            Cambiar contraseña
          </DialogTitle>
          <DialogDescription>{PASSWORD_POLICY_HINT}</DialogDescription>
        </DialogHeader>

        {error && (
          <div
            role="alert"
            className="rounded-14 border border-destructivo/25 bg-destructivo-bg px-4 py-3 text-[13px] font-medium text-destructivo"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="current-password">Contraseña actual</Label>
            <PasswordInput
              id="current-password"
              autoComplete="current-password"
              required
              className="h-10 rounded-12 bg-panel px-3"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password">Contraseña nueva</Label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              required
              className="h-10 rounded-12 bg-panel px-3"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-new-password">Confirmar contraseña nueva</Label>
            <PasswordInput
              id="confirm-new-password"
              autoComplete="new-password"
              required
              className="h-10 rounded-12 bg-panel px-3"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          <DialogFooter className="mt-1">
            <Button type="button" variant="outline" onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <LoaderCircle className="size-4 animate-spin" />}
              {loading ? "Guardando…" : "Actualizar contraseña"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
