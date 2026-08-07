"use client";

// Login page (PRD §3.1): email + password, brand card. Server-first flow:
// POST /api/v1/auth/login signs in via Supabase and validates Usuario.activo;
// on success the client stores the session deadline (4h) that drives the
// session banner, then navigates to ?next or home.

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SESSION_STORAGE_KEY } from "@/lib/auth/types";

type LoginError = { message: string };

function LoginCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const expired = searchParams.get("expired") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<LoginError | null>(null);
  const [loading, setLoading] = useState(false);

  const unconfigured =
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError({ message: "Ingresa tu correo y tu contraseña." });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const body = (await res.json().catch(() => null)) as
        | { usuario?: { nombre: string }; sessionExpiresAt?: string; error?: string }
        | null;

      if (!res.ok || !body) {
        if (res.status === 401) {
          setError({ message: "Correo o contraseña incorrectos." });
        } else if (res.status === 403) {
          setError({
            message: "Tu cuenta está inactiva. Contacta al administrador.",
          });
        } else {
          setError({
            message: body?.error ?? "No pudimos iniciar sesión. Inténtalo de nuevo.",
          });
        }
        return;
      }

      if (body.sessionExpiresAt) {
        localStorage.setItem(SESSION_STORAGE_KEY, body.sessionExpiresAt);
      }
      router.push(next);
      router.refresh();
    } catch {
      setError({ message: "No pudimos iniciar sesión. Inténtalo de nuevo." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/logo-color.svg"
        alt="Muttu"
        className="mb-7 w-[124px]"
      />

      {unconfigured ? (
        <div className="w-full rounded-[26px] border border-ink-200 bg-panel p-7 text-center shadow-[0_18px_50px_-28px_rgba(25,17,19,0.35)]">
          <span className="mx-auto grid size-11 place-items-center rounded-[15px_15px_15px_5px] bg-alerta-bg text-alerta">
            <Lock className="size-5" strokeWidth={1.7} />
          </span>
          <h1 className="mt-4 font-display text-[21px] font-bold tracking-[-0.02em] text-ink-950">
            Plataforma no configurada
          </h1>
          <p className="mx-auto mt-2 max-w-[34ch] text-[13.5px] leading-relaxed text-ink-600">
            El acceso requiere un proyecto de Supabase. Revisa el archivo{" "}
            <code className="rounded-md bg-ink-100 px-1.5 py-0.5 font-mono text-[12px] text-ink-800">
              .env
            </code>{" "}
            y sigue los pasos de la sección &quot;Puesta en marcha&quot; del
            README.
          </p>
        </div>
      ) : (
        <div className="w-full rounded-[26px] border border-ink-200 bg-panel p-7 shadow-[0_18px_50px_-28px_rgba(25,17,19,0.35)]">
          <h1 className="font-display text-[24px] font-bold tracking-[-0.02em] text-ink-950">
            Inicia sesión
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-600">
            Ingresa con tu correo institucional de Muttu.
          </p>

          {expired && (
            <div className="mt-4 rounded-[14px] border border-alerta/30 bg-alerta-bg px-4 py-3 text-[13px] font-medium text-alerta">
              Tu sesión expiró. Inicia sesión nuevamente para continuar.
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-[14px] border border-destructivo/25 bg-destructivo-bg px-4 py-3 text-[13px] font-medium text-destructivo"
            >
              {error.message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder="nombre@muttu.co"
                className="h-11 rounded-[13px] bg-white px-3.5"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="h-11 rounded-[13px] bg-white px-3.5"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="mt-1 h-11 rounded-[13px] text-[14px] font-bold"
            >
              {loading && (
                <LoaderCircle className="size-4 animate-spin" strokeWidth={2} />
              )}
              {loading ? "Ingresando…" : "Ingresar"}
            </Button>
          </form>

          <div className="mt-5 border-t border-ink-100 pt-4 text-center">
            <Link
              href="/auth/reset-password"
              className="text-[13px] font-semibold text-rose-700 transition-colors hover:text-rose-500"
            >
              Recuperar contraseña
            </Link>
          </div>
        </div>
      )}

      <p className="mt-6 text-center text-[11.5px] text-ink-500">
        Muttu Innovación Social · Plataforma integral del Hub
      </p>
    </div>
  );
}


export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full rounded-[26px] border border-ink-200 bg-panel p-7 text-center">
          Cargando…
        </div>
      }
    >
      <LoginCard />
    </Suspense>
  );
}
