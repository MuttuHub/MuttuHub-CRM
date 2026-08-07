"use client";

// New-password step (PRD §3.1): reads the recovery code from the URL and
// completes the password reset with the direct Supabase flow
// (exchangeCodeForSession + updateUser). If that flow fails, the thin
// /api/v1/auth/reset-password/confirm route is used as a fallback.

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, KeyRound, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

const PASSWORD_POLICY_HINT = "Mínimo 8 caracteres, con letras y números.";
const PASSWORD_STRENGTH = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

function ResetConfirmInner() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const unconfigured =
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!PASSWORD_STRENGTH.test(password)) {
      setError(PASSWORD_POLICY_HINT);
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setStatus("loading");

    try {
      const supabase = createClient();

      // Primary flow: direct Supabase client calls (PKCE recovery link).
      if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) throw updateError;

      setStatus("done");
    } catch {
      // Fallback: thin server-side switch (also validates the password).
      try {
        const res = await fetch("/api/v1/auth/reset-password/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newPassword: password,
            ...(code ? { code } : {}),
          }),
        });
        const body = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;

        if (res.ok && body?.ok) {
          setStatus("done");
        } else {
          setError(body?.error ?? "No pudimos actualizar tu contraseña.");
          setStatus("error");
        }
      } catch {
        setError("No pudimos actualizar tu contraseña. Inténtalo de nuevo.");
        setStatus("error");
      }
    }
  }

  if (unconfigured) {
    return (
      <>
        <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink-950">
          Plataforma no configurada
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
          La confirmación de contraseña requiere un proyecto de Supabase.
          Revisa el archivo{" "}
          <code className="rounded-md bg-ink-100 px-1.5 py-0.5 font-mono text-[12px] text-ink-800">
            .env
          </code>{" "}
          y los pasos del README.
        </p>
      </>
    );
  }

  if (!code) {
    return (
      <>
        <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink-950">
          Enlace no válido
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
          El enlace de recuperación es inválido o ya expiró. Solicita uno nuevo
          para restablecer tu contraseña.
        </p>
      </>
    );
  }

  if (status === "done") {
    return (
      <>
        <span className="mx-auto grid size-11 place-items-center rounded-[15px_15px_15px_5px] bg-exito-bg text-exito">
          <CheckCircle2 className="size-5" strokeWidth={1.7} />
        </span>
        <h1 className="mt-4 font-display text-[22px] font-bold tracking-[-0.02em] text-ink-950">
          Contraseña actualizada
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
          Ya puedes iniciar sesión con tu nueva contraseña.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-[13px] bg-primary text-[14px] font-bold text-primary-foreground transition-colors hover:bg-primary/80"
        >
          Ir a iniciar sesión
        </Link>
      </>
    );
  }

  return (
    <>
      <span className="mx-auto grid size-11 place-items-center rounded-[15px_15px_15px_5px] bg-rose-50 text-rose-700">
        <KeyRound className="size-5" strokeWidth={1.7} />
      </span>
      <h1 className="mt-4 font-display text-[22px] font-bold tracking-[-0.02em] text-ink-950">
        Nueva contraseña
      </h1>
      <p className="mt-1 text-[13.5px] text-ink-600">
        {PASSWORD_POLICY_HINT}
      </p>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-[14px] border border-destructivo/25 bg-destructivo-bg px-4 py-3 text-[13px] font-medium text-destructivo"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Contraseña nueva</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            placeholder="••••••••"
            className="h-11 rounded-[13px] bg-white px-3.5"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm">Confirmar contraseña</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            placeholder="••••••••"
            className="h-11 rounded-[13px] bg-white px-3.5"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        <Button
          type="submit"
          disabled={status === "loading"}
          className="mt-1 h-11 rounded-[13px] text-[14px] font-bold"
        >
          {status === "loading" && (
            <LoaderCircle className="size-4 animate-spin" strokeWidth={2} />
          )}
          {status === "loading" ? "Guardando…" : "Actualizar contraseña"}
        </Button>
      </form>
    </>
  );
}

export default function ResetPasswordConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full rounded-[26px] border border-ink-200 bg-panel p-7">
          Cargando…
        </div>
      }
    >
      <div className="flex flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo-color.svg"
          alt="Muttu"
          className="mb-7 w-[124px]"
        />
        <div className="w-full rounded-[26px] border border-ink-200 bg-panel p-7 text-center shadow-[0_18px_50px_-28px_rgba(25,17,19,0.35)]">
          <ResetConfirmInner />
        </div>
      </div>
    </Suspense>
  );
}