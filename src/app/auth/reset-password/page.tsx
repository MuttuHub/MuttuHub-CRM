"use client";

// Password recovery request form (PRD §3.1): emails a one-time link via
// Supabase. No user enumeration: the success copy is the same regardless.

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ApiResponse = { ok: boolean; message?: string; error?: string };

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const unconfigured =
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setError(null);

    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json().catch(() => null)) as ApiResponse | null;

      if (res.ok && body?.ok) {
        setStatus("sent");
      } else {
        setError(
          body?.error ?? "No pudimos enviar el correo. Inténtalo de nuevo.",
        );
        setStatus("error");
      }
    } catch {
      setError("No pudimos enviar el correo. Inténtalo de nuevo.");
      setStatus("error");
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

      <div className="w-full rounded-[26px] border border-ink-200 bg-panel p-7 shadow-[0_18px_50px_-28px_rgba(25,17,19,0.35)]">
        {unconfigured ? (
          <>
            <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink-950">
              Plataforma no configurada
            </h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
              La recuperación de contraseña requiere un proyecto de Supabase.
              Revisa el archivo <code className="rounded-md bg-ink-100 px-1.5 py-0.5 font-mono text-[12px] text-ink-800">.env</code>{" "}
              y los pasos del README.
            </p>
          </>
        ) : status === "sent" ? (
          <>
            <span className="mx-auto grid size-11 place-items-center rounded-[15px_15px_15px_5px] bg-exito-bg text-exito">
              <MailCheck className="size-5" strokeWidth={1.7} />
            </span>
            <h1 className="mt-4 font-display text-[22px] font-bold tracking-[-0.02em] text-ink-950">
              Revisa tu correo
            </h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
              Si el correo está registrado, recibirás un enlace para restablecer
              tu contraseña. El enlace vence en una hora.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display text-[24px] font-bold tracking-[-0.02em] text-ink-950">
              Recuperar contraseña
            </h1>
            <p className="mt-1 text-[13.5px] text-ink-600">
              Te enviaremos un enlace de un solo uso a tu correo.
            </p>

            {error && (
              <div
                role="alert"
                className="mt-4 rounded-14 border border-destructivo/25 bg-destructivo-bg px-4 py-3 text-[13px] font-medium text-destructivo"
              >
                {error}
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
                  className="h-11 rounded-lg bg-white px-3.5"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <Button
                type="submit"
                disabled={status === "loading"}
                className="mt-1 h-11 rounded-lg text-[14px] font-bold"
              >
                {status === "loading" && (
                  <LoaderCircle className="size-4 animate-spin" strokeWidth={2} />
                )}
                {status === "loading" ? "Enviando…" : "Enviar enlace"}
              </Button>
            </form>
          </>
        )}

        <div className="mt-5 border-t border-ink-100 pt-4">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-rose-700 transition-colors hover:text-rose-500"
          >
            <ArrowLeft className="size-3.5" strokeWidth={2} />
            Volver a iniciar sesión
          </Link>
        </div>
      </div>
    </div>
  );
}