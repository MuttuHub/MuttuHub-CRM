"use client";

// User menu in the shell header: avatar with initials + name; dropdown shows
// the profile (name/role) and "Cerrar sesión". Without a configured Supabase
// backend (dev mode) useCurrentUser resolves to null and we fall back to the
// demo user so the shell keeps working (same demo-mode policy as the rest of
// the dashboard). Logout is a plain POST to the idempotent 204 API route;
// state cleanup mirrors session-banner.tsx.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/kanban";
import { ROLE_LABELS, SESSION_STORAGE_KEY } from "@/lib/auth/types";
import { DEMO_USER, iniciales } from "@/lib/mock/demo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu() {
  const router = useRouter();
  const userQuery = useCurrentUser();
  const [cerrando, setCerrando] = useState(false);

  const user = userQuery.data;
  const nombre = user?.nombre ?? DEMO_USER.nombre;
  const rolLabel = user?.rol ? ROLE_LABELS[user.rol] : "Modo demo";

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menú de usuario"
        className="relative flex h-10 cursor-pointer items-center gap-2.5 rounded-full border border-ink-200 bg-panel py-1 pr-4 pl-1 text-[13px] font-semibold text-ink-900 transition-colors after:absolute after:content-[''] after:-inset-0.5 hover:bg-ink-100"
      >
        <Avatar>
          <AvatarFallback className="bg-rose-100 text-[11px] font-bold text-rose-700 dark:text-rose-400">
            {iniciales(nombre)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden sm:block">{nombre}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="flex flex-col gap-0.5 py-1.5">
          <span className="text-[13px] font-bold text-ink-900">{nombre}</span>
          <span className="text-[11.5px] font-medium text-ink-500">{rolLabel}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={cerrando}
          onClick={() => void cerrarSesion()}
        >
          {cerrando ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <LogOut className="size-4" />
          )}
          {cerrando ? "Cerrando sesión…" : "Cerrar sesión"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}