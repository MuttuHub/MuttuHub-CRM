"use client";

// Profile block pinned at the bottom of the sidebar (D9: sidebar only, no
// header duplicate): avatar with initials, name, role, "Cambiar contraseña"
// and "Salir". In rail mode only the avatar and icon buttons show. Without a configured Supabase
// backend (dev mode) useCurrentUser resolves to null and the menu shows "…"
// instead of a real name — never a demo persona. Logout is a plain POST to
// the idempotent 204 API route; state cleanup mirrors session-banner.tsx.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LoaderCircle, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCurrentUser, type CurrentUser } from "@/hooks/kanban";
import { iniciales } from "@/hooks/crm";
import { ROLE_LABELS, SESSION_STORAGE_KEY } from "@/lib/auth/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ChangePasswordDialog } from "@/components/shell/change-password-dialog";

const ACTION_BASE =
  "relative flex cursor-pointer items-center rounded-12 text-[12.5px] font-medium text-shell-muted transition-colors after:absolute after:content-[''] after:-inset-px hover:bg-shell-chip hover:text-shell focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60";

export function SidebarProfile({
  initialUser,
  rail = false,
}: {
  initialUser?: CurrentUser | null;
  rail?: boolean;
}) {
  const router = useRouter();
  // PR 28 (plan §5): initialData del usuario real (ya en el servidor) — el
  // primer paint muestra el nombre correcto, sin el parpadeo del demo.
  const userQuery = useCurrentUser(initialUser);
  const [cerrando, setCerrando] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const user = userQuery.data;
  const nombre = user?.nombre ?? "…";
  const rolLabel = user?.rol ? ROLE_LABELS[user.rol] : null;

  async function cerrarSesion() {
    setCerrando(true);
    try {
      const res = await fetch("/api/v1/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      localStorage.removeItem(SESSION_STORAGE_KEY);
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("No pudimos cerrar la sesión. Inténtalo de nuevo.");
      setCerrando(false);
    }
  }

  const actionClass = cn(ACTION_BASE, rail ? "size-11 justify-center" : "h-11 w-full gap-2.5 px-3");

  return (
    <>
      <div
        className={cn(
          "mt-3 flex flex-col gap-1 border-t border-shell-border pt-3",
          rail && "items-center",
        )}
      >
        <div
          className={cn("flex items-center gap-2.5", rail ? "justify-center pb-1" : "px-1.5 pb-1")}
          title={rail ? nombre : undefined}
        >
          <Avatar>
            <AvatarFallback className="bg-rose-100 text-[11px] font-bold text-rose-700 dark:text-rose-400">
              {iniciales(nombre)}
            </AvatarFallback>
          </Avatar>
          {!rail && (
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-bold text-shell-text">{nombre}</span>
              {rolLabel && (
                <span className="truncate text-[11.5px] font-medium text-shell-muted">
                  {rolLabel}
                </span>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setChangePasswordOpen(true)}
          aria-label="Cambiar contraseña"
          title={rail ? "Cambiar contraseña" : undefined}
          className={actionClass}
        >
          <KeyRound className={rail ? "size-[19px]" : "size-4"} strokeWidth={1.7} />
          {!rail && "Cambiar contraseña"}
        </button>
        <button
          type="button"
          disabled={cerrando}
          onClick={() => void cerrarSesion()}
          aria-label="Salir"
          title={rail ? "Salir" : undefined}
          className={actionClass}
        >
          {cerrando ? (
            <LoaderCircle className={cn("animate-spin", rail ? "size-[19px]" : "size-4")} />
          ) : (
            <LogOut className={rail ? "size-[19px]" : "size-4"} strokeWidth={1.7} />
          )}
          {!rail && (cerrando ? "Saliendo…" : "Salir")}
        </button>
      </div>
      {/* Sibling of the block (not nested in a menu) to avoid the known
          focus-trap/pointer-events interaction between menu and dialog
          primitives; kept from the former header user menu. */}
      <ChangePasswordDialog
        open={changePasswordOpen}
        onOpenChange={setChangePasswordOpen}
      />
    </>
  );
}
