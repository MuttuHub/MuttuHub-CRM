"use client";

// Email-confirmation landing: verifies the confirmation link in every format
// Supabase can deliver it — PKCE `code`, OTP `token`, or implicit
// `#access_token` hash / query params — and, for invited users (who have no
// password yet), shows an inline "create your password" step instead of
// bouncing them to /login.

import {
  Suspense,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  KeyRound,
  LoaderCircle,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

const REDIRECT_DELAY_MS = 3000;

const PASSWORD_POLICY_HINT = "Mínimo 8 caracteres, con letras y números.";
const PASSWORD_STRENGTH = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

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

// Supabase implicit links deliver the session in the URL hash:
// #access_token=...&refresh_token=... Only readable at runtime (client-only).
function readHashTokens(): {
  access_token: string | null;
  refresh_token: string | null;
} {
  if (typeof window === "undefined") {
    return { access_token: null, refresh_token: null };
  }
  const raw = window.location.hash;
  if (!raw || raw === "#") {
    return { access_token: null, refresh_token: null };
  }
  const params = new URLSearchParams(raw.replace(/^#/, ""));
  return {
    access_token: params.get("access_token"),
    refresh_token: params.get("refresh_token"),
  };
}

function InvalidLinkCard({ email }: { email: string }) {
  const [resend, setResend] = useState<"idle" | "sending" | "done" | "error">(
    "idle",
  );

  async function handleResend() {
    if (!email || resend === "sending") return;
    setResend("sending");
    try {
      const res = await fetch("/api/v1/auth/reinvite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setResend(res.ok ? "done" : "error");
    } catch {
      setResend("error");
    }
  }

  return (
    <>
      <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink-950">
        Enlace no válido
      </h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
        El enlace de confirmación es inválido o ya expiró. Puede que el enlace
        se haya cortado al copiarlo y pegarlo.
      </p>

      {email ? (
        resend === "done" ? (
          <p className="mt-4 rounded-xl bg-exito-bg px-4 py-3 text-[13px] font-medium text-exito">
            Si el correo está registrado y tiene una invitación pendiente, te
            la reenviamos. Revisa tu bandeja.
          </p>
        ) : resend === "error" ? (
          <p className="mt-4 rounded-xl bg-destructivo-bg px-4 py-3 text-[13px] font-medium text-destructivo">
            No pudimos reenviar el correo. Inténtalo de nuevo.
          </p>
        ) : (
          <Button
            type="button"
            onClick={() => void handleResend()}
            disabled={resend === "sending"}
            className="mt-5 h-11 w-full rounded-lg text-[14px] font-bold"
          >
            {resend === "sending" && (
              <LoaderCircle className="size-4 animate-spin" strokeWidth={2} />
            )}
            {resend === "sending"
              ? "Enviando…"
              : "Solicitar de nuevo el enlace"}
          </Button>
        )
      ) : (
        <Link
          href="/login"
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary text-[14px] font-bold text-primary-foreground transition-colors hover:bg-primary/80"
        >
          Volver a iniciar sesión
        </Link>
      )}
    </>
  );
}

function ConfirmInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const code = searchParams.get("code");
  const token = searchParams.get("token");
  const tokenHash = searchParams.get("token_hash");
  const email = searchParams.get("email") ?? "";
  const rawType = searchParams.get("type");
  // Missing/unknown type falls back to "invite": the app has no public
  // signup, so most non-OAuth confirmations are invitations.
  const type: OtpType = isOtpType(rawType) ? rawType : "invite";

  const queryAccessToken = searchParams.get("access_token");
  const queryRefreshToken = searchParams.get("refresh_token");
  const hashTokens = readHashTokens();
  const accessToken = queryAccessToken ?? hashTokens.access_token;
  const refreshToken =
    queryRefreshToken ?? hashTokens.refresh_token ?? "";

  // "set-password" = invited user verified, show the create-password form.
  const [status, setStatus] = useState<
    "loading" | "set-password" | "done" | "error"
  >("loading");
  const [invite, setInvite] = useState(false);

  const unconfigured =
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const hasLink = Boolean(token || code || accessToken || tokenHash);

  useEffect(() => {
    if (unconfigured || !hasLink) return;
    let cancelled = false;

    async function verify() {
      const supabase = createClient();
      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (token) {
          const { error } = await supabase.auth.verifyOtp({
            type,
            token,
            email,
          });
          if (error) throw error;
        } else if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            type,
            token_hash: tokenHash,
            email,
          });
          if (error) throw error;
        } else if (accessToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          // Do not keep the token in the address bar after recovering it.
          const cleanParams = new URLSearchParams(window.location.search);
          cleanParams.delete("access_token");
          cleanParams.delete("refresh_token");
          const cleanSearch = cleanParams.toString();
          window.history.replaceState(
            null,
            "",
            cleanSearch
              ? `${window.location.pathname}?${cleanSearch}`
              : window.location.pathname,
          );
        }

        if (cancelled) return;

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError) throw userError;

        // Invitation detection: explicit `type=invite`, or any token that
        // arrives without a `type` carrying rol metadata (inviteUserByEmail
        // always sends data: { nombre, rol }). There is no public signup.
        // Uses `rawType` (not the `type` fallback above, which always
        // resolves to "invite" when `rawType` is absent) so the rol check
        // below actually gets a chance to run instead of being dead code.
        const isInvite =
          rawType === "invite" ||
          (!rawType && Boolean(user?.user_metadata?.rol));

        if (!cancelled) {
          setInvite(isInvite);
          setStatus(isInvite ? "set-password" : "done");
        }
      } catch {
        if (cancelled) return;
        // A failed verification isn't necessarily a dead link: Supabase
        // invite tokens are single-use, and the email offers the SAME link
        // twice (button + plain-text fallback right below it) — an
        // impatient or unsure second tap redeems an already-spent token.
        // If the browser already holds a valid session (the first tap
        // succeeded), treat this the same as success instead of scaring
        // the user with "invalid link" after it actually worked.
        try {
          const {
            data: { user: fallbackUser },
          } = await supabase.auth.getUser();
          if (fallbackUser && !cancelled) {
            const fallbackIsInvite =
              rawType === "invite" ||
              (!rawType && Boolean(fallbackUser.user_metadata?.rol));
            setInvite(fallbackIsInvite);
            setStatus(fallbackIsInvite ? "set-password" : "done");
            return;
          }
        } catch {
          // No session either — fall through to the error state below.
        }
        if (!cancelled) setStatus("error");
      }
    }

    void verify();
    return () => {
      cancelled = true;
    };
  }, [
    unconfigured,
    hasLink,
    code,
    token,
    tokenHash,
    rawType,
    type,
    email,
    accessToken,
    refreshToken,
  ]);

  // Non-invite verifications keep the 3s bounce to /login afterwards.
  useEffect(() => {
    if (status !== "done" || invite) return;
    const timer = setTimeout(() => {
      router.replace("/login");
    }, REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status, invite, router]);

  // Create-password form state (invite step).
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!PASSWORD_STRENGTH.test(password)) {
      setFormError(PASSWORD_POLICY_HINT);
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Las contraseñas no coinciden.");
      return;
    }

    setSubmitting(true);
    try {
      // Session is already active after verification (the browser client is
      // a singleton), so updateUser sets the password for the invited user.
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setStatus("done");
    } catch {
      setFormError("No pudimos crear tu contraseña. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

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

  if (status === "error") {
    // A failed invite-type link (expired or already redeemed) isn't a dead
    // end: it carried a real token/code, so offer the same resend action as
    // a stray page visit instead of bouncing to /login with no way out.
    // Non-invite flows (e.g. password recovery) keep the generic message —
    // resending an invite would be the wrong CTA there.
    if (hasLink && rawType === "invite") {
      return <InvalidLinkCard email={email} />;
    }

    return (
      <>
        <span className="mx-auto grid size-11 place-items-center rounded-[15px_15px_15px_5px] bg-rose-50 text-rose-700 dark:text-rose-400">
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
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary text-[14px] font-bold text-primary-foreground transition-colors hover:bg-primary/80"
        >
          Volver a iniciar sesión
        </Link>
      </>
    );
  }

  if (status === "set-password") {
    return (
      <>
        <span className="mx-auto grid size-11 place-items-center rounded-[15px_15px_15px_5px] bg-rose-50 text-rose-700 dark:text-rose-400">
          <KeyRound className="size-5" strokeWidth={1.7} />
        </span>
        <h1 className="mt-4 font-display text-[22px] font-bold tracking-[-0.02em] text-ink-950">
          Crea tu contraseña
        </h1>
        <p className="mt-1 text-[13.5px] text-ink-600">
          {PASSWORD_POLICY_HINT}
        </p>

        {formError && (
          <div
            role="alert"
            className="mt-4 rounded-14 border border-destructivo/25 bg-destructivo-bg px-4 py-3 text-[13px] font-medium text-destructivo"
          >
            {formError}
          </div>
        )}

        <form onSubmit={handleCreatePassword} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              placeholder="••••••••"
              className="h-11 rounded-lg bg-panel px-3.5"
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
              className="h-11 rounded-lg bg-panel px-3.5"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="mt-1 h-11 rounded-lg text-[14px] font-bold"
          >
            {submitting && (
              <LoaderCircle className="size-4 animate-spin" strokeWidth={2} />
            )}
            {submitting ? "Guardando…" : "Guardar contraseña"}
          </Button>
        </form>
      </>
    );
  }

  if (status === "done") {
    if (invite) {
      return (
        <>
          <span className="mx-auto grid size-11 place-items-center rounded-[15px_15px_15px_5px] bg-exito-bg text-exito">
            <CheckCircle2 className="size-5" strokeWidth={1.7} />
          </span>
          <h1 className="mt-4 font-display text-[22px] font-bold tracking-[-0.02em] text-ink-950">
            Contraseña creada
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
            Ya puedes iniciar sesión con tu nueva contraseña.
          </p>
          <Link
            href="/login"
            className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary text-[14px] font-bold text-primary-foreground transition-colors hover:bg-primary/80"
          >
            Ir a iniciar sesión
          </Link>
        </>
      );
    }

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
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary text-[14px] font-bold text-primary-foreground transition-colors hover:bg-primary/80"
        >
          Ir a iniciar sesión
        </Link>
      </>
    );
  }

  if (!hasLink) {
    return <InvalidLinkCard email={email} />;
  }

  return (
    <>
      <span className="mx-auto grid size-11 place-items-center rounded-[15px_15px_15px_5px] bg-rose-50 text-rose-700 dark:text-rose-400">
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