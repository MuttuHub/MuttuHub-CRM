"use client";

// Email-confirmation landing: verifies the confirmation link sent by Supabase
// (token+type via verifyOtp, or PKCE code via exchangeCodeForSession) and
// redirects to /login after a short success confirmation.

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, LoaderCircle, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const REDIRECT_DELAY_MS = 3000;

const OTP_TYPES = [
  "signup",
  "email_change",
  "recovery",
  "invite",
  "magiclink",
] as const;
type OtpType = (typeof OTP_TYPES)[number];

function isOtpType(value: string | null): value is OtpType {
  return OTP_TYPES.includes(value as OtpType);
}

function ConfirmInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const code = searchParams.get("code");
  const token = searchParams.get("token");
  const email = searchParams.get("email") ?? "";
  const rawType = searchParams.get("type");
  const type: OtpType = isOtpType(rawType) ? rawType : "signup";

  const [status, setStatus] = useState<"loading" | "done" | "error">(
    "loading",
  );

  const unconfigured =
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const hasLink = Boolean(token || code);

  useEffect(() => {
    if (unconfigured || !hasLink) return;
    let cancelled = false;

    async function verify() {
      try {
        const supabase = createClient();
        const result = code
          ? await supabase.auth.exchangeCodeForSession(code)
          : await supabase.auth.verifyOtp({
              type,
              token: token as string,
              email,
            });
        if (result.error) throw result.error;
        if (!cancelled) setStatus("done");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void verify();
    return () => {
      cancelled = true;
    };
  }, [unconfigured, hasLink, code, token, type, email]);

  useEffect(() => {
    if (status !== "done") return;
    const timer = setTimeout(() => {
      router.replace("/login");
    }, REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status, router]);

  if (unconfigured) {
    return (
      <>
        <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink-950">
          Plataforma no configurada
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
          La confirmación de correo requiere un proyecto de Supabase. Revisa el
          archivo{" "}
          <code className="rounded-md bg-ink-100 px-1.5 py-0.5 font-mono text-[12px] text-ink-800">
            .env
          </code>{" "}
          y los pasos del README.
        </p>
      </>
    );
  }

  if (!hasLink) {
    return (
      <>
        <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink-950">
          Enlace no válido
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
          El enlace de confirmación es inválido o ya expiró. Solicita uno nuevo
          para continuar.
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
          ¡Correo verificado!
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
          Tu correo quedó confirmado. Te redirigimos al inicio de sesión…
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

  if (status === "error") {
    return (
      <>
        <span className="mx-auto grid size-11 place-items-center rounded-[15px_15px_15px_5px] bg-rose-50 text-rose-700">
          <XCircle className="size-5" strokeWidth={1.7} />
        </span>
        <h1 className="mt-4 font-display text-[22px] font-bold tracking-[-0.02em] text-ink-950">
          No pudimos verificar el correo
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
          El enlace es inválido o ya expiró. Solicita uno nuevo para continuar.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-[13px] bg-primary text-[14px] font-bold text-primary-foreground transition-colors hover:bg-primary/80"
        >
          Volver a iniciar sesión
        </Link>
      </>
    );
  }

  return (
    <>
      <span className="mx-auto grid size-11 place-items-center rounded-[15px_15px_15px_5px] bg-rose-50 text-rose-700">
        <LoaderCircle className="size-5 animate-spin" strokeWidth={1.7} />
      </span>
      <h1 className="mt-4 font-display text-[22px] font-bold tracking-[-0.02em] text-ink-950">
        Verificando tu correo…
      </h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
        Un momento, por favor.
      </p>
    </>
  );
}

export default function ConfirmPage() {
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
          <ConfirmInner />
        </div>
      </div>
    </Suspense>
  );
}
