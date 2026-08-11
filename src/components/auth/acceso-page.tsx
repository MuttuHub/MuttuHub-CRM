"use client";

// Login page redesign — pixel-faithful port of the approved design mock
// (Downloads/muttu-hub-acceso.html): dark aside with brand video + aurora
// fallback, segmented card with 4 vistas (Entrar / Solicitar acceso /
// Recuperar / Enviado), password strength, SSO placeholders.
//
// Real flows wired: login -> POST /api/v1/auth/login (session deadline 4h);
// recuperar -> POST /api/v1/auth/reset-password (no user enumeration);
// enviado -> re-send. Registro keeps the mock's informational aviso: access
// is granted exclusively by the administradora (PRD §3.1) — no public signup.

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SESSION_STORAGE_KEY } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/client";

// ── Design tokens del mock (PRD §1.0/diseño) ──────────────────────────────
const C = {
  rose: "#CD1560",
  rose600: "#B41153",
  rose700: "#940D44",
  ink950: "#191113",
  ink900: "#281D20",
  ink800: "#3F2F33",
  ink700: "#5A474C",
  ink600: "#725D62",
  ink300: "#DDD2D5",
  ink200: "#ECE5E7",
  ink100: "#F7F3F4",
  exito: "#127C4A",
  exitoBg: "#E7F5ED",
  alerta: "#B45309",
  alertaBg: "#FEF4E6",
  destructivo: "#B3261E",
  destructivoBg: "#FDECEA",
  info: "#1E5FA8",
  infoBg: "#EAF2FC",
};

const VISTAS = {
  login: {
    titulo: "Entra al Hub",
    sub: "Usa el correo corporativo que te asignó la administradora.",
    submit: "Entrar",
    pie: ["¿Aún no tienes cuenta?", "Solicita acceso"],
    campos: ["email", "password"] as const,
  },
  registro: {
    titulo: "Solicita tu acceso",
    sub: "La administración revisa cada solicitud y asigna el rol antes de activarte.",
    submit: "Enviar solicitud",
    pie: ["¿Ya tienes cuenta?", "Entrar"],
    campos: ["nombre", "email", "cargo"] as const,
  },
  recuperar: {
    titulo: "Recupera tu contraseña",
    sub: "Te enviamos un enlace de un solo uso que vence en 30 minutos.",
    submit: "Enviar enlace",
    pie: ["¿Recordaste la contraseña?", "Volver a entrar"],
    campos: ["email"] as const,
  },
  enviado: {
    titulo: "Revisa tu correo",
    sub: "Si el correo existe en el Hub, el enlace ya va en camino. No lo compartas con nadie.",
    submit: "Reenviar enlace",
    pie: ["¿Escribiste mal el correo?", "Cambiar correo"],
    campos: [] as const,
  },
} as const;

type Vista = keyof typeof VISTAS;

const PUNTOS = [
  "Cartera de aliados con bitácora inmutable y compromisos con responsable y fecha.",
  "Tablero compartido: nada se pierde entre correos y grupos de WhatsApp.",
  "Documentos versionados, con permisos visibles fila por fila.",
];

const VIDEO_URL = "https://muttu.co/wp-content/uploads/2024/08/Comp-1_10_1.mp4";

/** "Recuérdame": persisted email only — never the password. */
const REMEMBERED_EMAIL_KEY = "rememberedEmail";

type Campo = { label: string; type: string; value: string; placeholder: string; autoComplete: string; pista?: string; error?: string };

export function AccesoPage({
  next = "/",
  expired = false,
  solicitud = false,
  errorOauth = false,
}: {
  next: string;
  expired: boolean;
  solicitud: boolean;
  errorOauth: boolean;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [vista, setVista] = useState<Vista>("login");
  const [angosto, setAngosto] = useState(false);
  const [ver, setVer] = useState(false);
  const [recordar, setRecordar] = useState(false);
  const [terminos, setTerminos] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [videoFalla, setVideoFalla] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [val, setVal] = useState({ email: "", password: "", nombre: "", cargo: "" });
  const [tocado, setTocado] = useState<Record<string, boolean>>({});

  const unconfigured =
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Arranca el video de marca; si el origen remoto no responde en 3,5 s → aurora
  useEffect(() => {
    const onResize = () => setAngosto(window.innerWidth < 940);
    onResize();
    window.addEventListener("resize", onResize);

    setTimeout(() => {
      const v = videoRef.current;
      if (v && v.readyState < 2) setVideoFalla(true);
    }, 3500);

    return () => window.removeEventListener("resize", onResize);
  }, []);

  // "Recuérdame": prefill the email field and check the box when a previous
  // login opted in. Deferred past mount (setTimeout 0): the React Compiler
  // lint forbids synchronous setState in an effect body, and reading
  // localStorage during render would mismatch the SSR HTML.
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        const guardado = window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
        if (guardado) {
          setRecordar(true);
          setVal((st) => ({ ...st, email: guardado }));
        }
      } catch {
        // localStorage unavailable (private mode): leave the defaults.
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  const ir = (v: Vista) => () => {
    setVista(v);
    setError("");
    setTocado({});
    setExito("");
  };

  const campo = (k: keyof typeof val) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setVal((st) => ({ ...st, [k]: v }));
    setTocado((st) => ({ ...st, [k]: true }));
  };

  const emailMal =
    !!tocado.email &&
    val.email.length > 0 &&
    !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(val.email);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setExito("");

    if (vista === "login") {
      if (!val.email.trim() || !val.password) {
        setError("Ingresa tu correo y tu contraseña.");
        return;
      }
      setEnviando(true);
      try {
        const res = await fetch("/api/v1/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: val.email, password: val.password }),
        });
        const body = (await res.json().catch(() => null)) as
          | { sessionExpiresAt?: string; error?: string }
          | null;
        if (!res.ok || !body) {
          const statusMsgs: Record<number, string> = {
            401: "Correo o contraseña incorrectos.",
            403: "Tu cuenta está inactiva. Contacta al administrador.",
          };
          setError(body?.error && res.status === 500
            ? body.error
            : statusMsgs[res.status] ?? "No pudimos iniciar sesión. Inténtalo de nuevo.");
          return;
        }
        if (body.sessionExpiresAt) {
          localStorage.setItem(SESSION_STORAGE_KEY, body.sessionExpiresAt);
        }
        // "Recuérdame": persist only the email, never the password.
        try {
          if (recordar) {
            localStorage.setItem(REMEMBERED_EMAIL_KEY, val.email.trim());
          } else {
            localStorage.removeItem(REMEMBERED_EMAIL_KEY);
          }
        } catch {
          // localStorage unavailable: the login itself already succeeded.
        }
        router.push(next);
        router.refresh();
      } catch {
        setError("No pudimos iniciar sesión. Inténtalo de nuevo.");
      } finally {
        setEnviando(false);
      }
      return;
    }

    if (vista === "recuperar" || vista === "enviado") {
      if (vista === "recuperar" && !val.email.trim()) {
        setError("Ingresa tu correo para enviar el enlace.");
        return;
      }
      setEnviando(true);
      try {
        const res = await fetch("/api/v1/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: val.email }),
        });
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) {
          setError(body?.error ?? "No pudimos enviar el enlace. Inténtalo de nuevo.");
          return;
        }
        setExito(`Enlace enviado a ${val.email} · vence en 30 minutos.`);
        setVista("enviado");
      } catch {
        setError("No pudimos enviar el enlace. Inténtalo de nuevo.");
      } finally {
        setEnviando(false);
      }
      return;
    }

    // registro — solicitud pública: no password en este flujo (la elige el
    // usuario cuando acepta el correo de invitación enviado tras la
    // aprobación del admin). El POST es anónimo (sin sesión).
    if (!terminos) {
      setError("Debes aceptar la política de tratamiento de datos para continuar.");
      return;
    }
    if (emailMal || !val.nombre.trim() || !val.email.trim()) {
      setError("Completa tu nombre y un correo válido.");
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch("/api/v1/auth/solicitud-acceso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: val.nombre,
          email: val.email,
          cargo: val.cargo || undefined,
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? "No pudimos enviar tu solicitud. Inténtalo de nuevo.");
        return;
      }
      setExito("¡Listo! Tu solicitud quedó en revisión: la administración asigna el rol antes de darte acceso.");
    } catch {
      setError("No pudimos enviar tu solicitud. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  async function entrarConGoogle() {
    setError("");
    setExito("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) {
        toast.error("No pudimos iniciar con Google. Inténtalo de nuevo.");
      }
    } catch {
      toast.error("No pudimos iniciar con Google. Inténtalo de nuevo.");
    }
  }

  const DEF: Record<string, Partial<Campo>> = {
    nombre: { label: "Nombre completo", placeholder: "Adriana Gómez Restrepo", autoComplete: "name" },
    cargo: { label: "Cargo en la organización", placeholder: "Coordinadora de proyectos", autoComplete: "organization-title" },
    email: {
      label: "Correo corporativo",
      placeholder: "nombre@muttu.co",
      autoComplete: "email",
      pista: vista === "registro" ? "Debe ser el dominio @muttu.co o el de tu organización aliada." : "",
    },
    password: {
      label: "Contraseña",
      placeholder: "••••••••••••",
      autoComplete: vista === "registro" ? "new-password" : "current-password",
    },
  };

  const campos = VISTAS[vista].campos.map((k) => {
    const d = DEF[k] ?? { label: k, placeholder: "", autoComplete: "on" };
    const errorCampo = k === "email" && emailMal ? "Escribe un correo válido, por ejemplo nombre@muttu.co" : "";
    const malo = !!errorCampo;
    return {
      k,
      label: d.label ?? k,
      type: k === "password" ? (ver ? "text" : "password") : k === "email" ? "email" : "text",
      value: val[k],
      placeholder: d.placeholder ?? "",
      autoComplete: d.autoComplete ?? "on",
      pista: d.pista ?? "",
      error: errorCampo,
      malo,
      puedeVer: k === "password",
      inputStyle: {
        width: "100%",
        height: 46,
        padding: `0 ${k === "password" ? 86 : 14}px 0 14px`,
        fontFamily: "inherit",
        fontSize: 14,
        color: C.ink900,
        background: malo ? C.destructivoBg : "#fff",
        border: `1px solid ${malo ? C.destructivo : C.ink300}`,
        borderRadius: 13,
        // focus-visible ring via the shared .login-focus rule (globals.css).
        outline: "none",
      } as React.CSSProperties,
    };
  });

  const aviso = error
    ? { txt: error, bg: C.destructivoBg, fg: C.destructivo, icon: "✕" }
    : exito
      ? { txt: exito, bg: C.exitoBg, fg: C.exito, icon: "✓" }
      : errorOauth && vista === "login"
        ? { txt: "No pudimos completar el inicio con Google. Inténtalo de nuevo.", bg: C.destructivoBg, fg: C.destructivo, icon: "✕" }
        : solicitud && vista === "login"
          ? { txt: "Tu solicitud quedó en revisión: la administración asigna el rol antes de darte acceso.", bg: C.infoBg, fg: C.info, icon: "i" }
          : vista === "registro"
            ? { txt: "Tu solicitud queda en revisión: la administración asigna el rol antes de darte acceso.", bg: C.infoBg, fg: C.info, icon: "i" }
            : null;

  const avisoEsError = error !== "" || (errorOauth && vista === "login");

  const tabDeshabilitado = vista === "recuperar" || vista === "enviado";

  return (
    <div style={{ minHeight: "100vh", padding: 14, background: "#EFEAEB" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: angosto ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(0,1.05fr)",
          gap: 14,
          minHeight: "calc(100vh - 28px)",
        }}
      >
        {/* Panel oscuro de marca (oculto en móvil) */}
        <aside
          style={{
            position: "relative",
            overflow: "hidden",
            isolation: "isolate",
            display: angosto ? "none" : "flex",
            flexDirection: "column",
            gap: 26,
            padding: "34px 34px 30px",
            background: C.ink950,
            borderRadius: 26,
          }}
        >
          {videoFalla ? (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: "-30%",
                background:
                  "radial-gradient(46% 40% at 26% 22%,rgba(205,21,96,.55) 0%,rgba(205,21,96,0) 68%)," +
                  "radial-gradient(40% 38% at 76% 34%,rgba(228,86,154,.34) 0%,rgba(228,86,154,0) 70%)," +
                  "radial-gradient(52% 44% at 50% 86%,rgba(148,13,68,.42) 0%,rgba(148,13,68,0) 72%)",
                filter: "blur(6px)",
              }}
            />
          ) : (
            <video
              ref={videoRef}
              src={VIDEO_URL}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              onError={() => setVideoFalla(true)}
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                opacity: 0.5,
              }}
            />
          )}
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(175deg,rgba(25,17,19,.42) 0%,rgba(25,17,19,.72) 46%,rgba(25,17,19,.94) 100%)",
            }}
          />

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-blanco.svg" alt="Muttu · Innovación social" style={{ display: "block", position: "relative", width: 118, height: "auto" }} />

          <div style={{ position: "relative", marginTop: "auto" }}>
            <p
              style={{
                margin: "0 0 18px",
                fontFamily: "'Bricolage Grotesque',sans-serif",
                fontSize: 27,
                fontWeight: 700,
                letterSpacing: "-.025em",
                lineHeight: 1.22,
                color: "#fff",
                textWrap: "pretty",
              }}
            >
              Un solo lugar para la cartera de aliados, los compromisos y los
              documentos del equipo.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {PUNTOS.map((p) => (
                <div key={p} style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 22,
                      height: 22,
                      flex: "0 0 22px",
                      marginTop: 1,
                      borderRadius: 8,
                      background: "rgba(205,21,96,.22)",
                      color: "#F5BAD2",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    ✓
                  </span>
                  <span style={{ fontSize: 13.5, lineHeight: 1.45, color: "#C9BCC0" }}>{p}</span>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              position: "relative",
              marginTop: "auto",
              paddingTop: 26,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#7A6569" }}>
              v1.0 · Agosto 2026
            </span>
            <span style={{ flex: "1 1 auto", height: 1, background: "#2E2225" }} />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "#F5BAD2" }}>Soporte</span>
          </div>
        </aside>

        {/* Lado de la tarjeta */}
        <main style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: angosto ? "22px 4px" : 34 }}>
          <div
            style={{
              width: "100%",
              maxWidth: 452,
              margin: "0 auto",
              background: "#fff",
              border: `1px solid ${C.ink200}`,
              borderRadius: 26,
              padding: angosto ? "26px 22px" : "32px 34px",
            }}
          >
            {/* Segmented control */}
            {!tabDeshabilitado && (
              <div style={{ display: "flex", gap: 2, background: C.ink100, padding: 3, borderRadius: 13, marginBottom: 24 }}>
                {(["login", "registro"] as Vista[]).map((v) => {
                  const on = vista === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={ir(v)}
                      className="login-focus"
                      style={{
                        flex: "1 1 0",
                        height: 36,
                        border: 0,
                        borderRadius: 10,
                        cursor: "pointer",
                        fontSize: 13,
                        fontWeight: on ? 700 : 600,
                        background: on ? "#fff" : "transparent",
                        color: on ? C.rose700 : C.ink600,
                        boxShadow: on ? "0 1px 2px rgba(41,29,32,.09)" : "none",
                      }}
                    >
                      {v === "login" ? "Entrar" : "Solicitar acceso"}
                    </button>
                  );
                })}
              </div>
            )}

            <h1 style={{ margin: "0 0 6px", fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 28, fontWeight: 800, letterSpacing: "-.03em", lineHeight: 1.12, color: "#191113" }}>
              {VISTAS[vista].titulo}
            </h1>
            <p style={{ margin: "0 0 22px", fontSize: 14, color: C.ink600, lineHeight: 1.5 }}>{VISTAS[vista].sub}</p>

            {expired && (
              <div
                role="alert"
                style={{ display: "flex", gap: 10, marginBottom: 18, padding: "11px 13px", borderRadius: 13, background: C.destructivoBg, color: C.destructivo, fontSize: 12.5, fontWeight: 500 }}
              >
                <span style={{ fontWeight: 700 }}>✕</span>
                <span>Tu sesión expiró. Inicia sesión nuevamente para continuar.</span>
              </div>
            )}

            {aviso && (
              <div role={avisoEsError ? "alert" : "status"} style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 18, padding: "11px 13px", borderRadius: 13, background: aviso.bg, color: aviso.fg, fontSize: 12.5, fontWeight: 500, lineHeight: 1.45 }}>
                <span aria-hidden="true" style={{ fontWeight: 700 }}>{aviso.icon}</span>
                <span>{aviso.txt}</span>
              </div>
            )}

            {unconfigured ? (
              <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
                <p style={{ fontSize: 13.5, color: C.ink700, margin: "0 0 14px" }}>
                  El acceso requiere un proyecto de Supabase configurado.
                </p>
                <button type="button" onClick={() => toast.info('Revisa la sección "Puesta en marcha" del README y completa el archivo .env')} style={{ height: 44, background: C.rose600, color: "#fff", border: 0, borderRadius: 14, fontSize: 14, fontWeight: 700, cursor: "pointer", padding: "0 22px" }}>
                  Ver pasos de configuración
                </button>
              </div>
            ) : (
              <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {campos.map((f) => (
                  <label key={f.k} style={{ display: "block" }}>
                    <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: "#3F2F33" }}>{f.label}</span>
                    </span>
                    <span style={{ position: "relative", display: "block" }}>
                      <input
                        type={f.type}
                        value={f.value}
                        onChange={campo(f.k)}
                        autoComplete={f.autoComplete}
                        placeholder={f.placeholder}
                        className="login-focus"
                        style={f.inputStyle}
                      />
                      {f.puedeVer && (
                        <button
                          type="button"
                          onClick={() => setVer((v) => !v)}
                          aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
                          style={{
                            position: "absolute",
                            right: 6,
                            top: "50%",
                            transform: "translateY(-50%)",
                            height: 32,
                            padding: "0 11px",
                            background: C.ink100,
                            border: 0,
                            borderRadius: 9,
                            fontSize: 11.5,
                            fontWeight: 700,
                            color: C.ink700,
                            cursor: "pointer",
                          }}
                        >
                          {ver ? "Ocultar" : "Ver"}
                        </button>
                      )}
                    </span>
                    {f.error && (
                      <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 12, fontWeight: 500, color: C.destructivo }}>
                        <span aria-hidden="true">✕</span>
                        {f.error}
                      </span>
                    )}
                    {f.pista && (
                      <span style={{ display: "block", marginTop: 6, fontSize: 11.5, color: C.ink600 }}>{f.pista}</span>
                    )}
                  </label>
                ))}

                {vista === "login" && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={recordar}
                        onChange={() => setRecordar((r) => !r)}
                        className="login-focus"
                        style={{ width: 17, height: 17, accentColor: "#CD1560", cursor: "pointer" }}
                      />
                      <span style={{ fontSize: 13, color: C.ink800 }}>Recuérdame</span>
                    </label>
                    <button type="button" onClick={ir("recuperar")} style={{ background: "none", border: 0, padding: 0, fontSize: 13, fontWeight: 600, color: C.rose, cursor: "pointer" }}>
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                )}

                {vista === "registro" && (
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={terminos}
                      onChange={() => setTerminos((t) => !t)}
                      className="login-focus"
                      style={{ width: 17, height: 17, marginTop: 2, accentColor: "#CD1560", cursor: "pointer", flex: "0 0 17px" }}
                    />
                    <span style={{ fontSize: 12.5, lineHeight: 1.45, color: C.ink600 }}>
                      Acepto la política de trataamiento de datos de Muttu y entiendo que mi actividad en el Hub queda registrada en la bitácora.
                    </span>
                  </label>
                )}

                {vista === "registro" && (
                  <p style={{ margin: "-6px 0 0", fontSize: 11.5, lineHeight: 1.45, color: C.ink600 }}>
                    No pedimos contraseña en la solicitud: la elegirás cuando aceptes el correo de invitación tras la aprobación.
                  </p>
                )}

                <button
                  type="submit"
                  disabled={enviando}
                  className="login-focus"
                  style={{
                    height: 48,
                    marginTop: 4,
                    background: enviando ? C.rose700 : C.rose,
                    color: "#fff",
                    border: 0,
                    borderRadius: 14,
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: enviando ? "progress" : "pointer",
                  }}
                  onMouseEnter={(e) => !enviando && (e.currentTarget.style.background = C.rose700)}
                  onMouseLeave={(e) => !enviando && (e.currentTarget.style.background = C.rose)}
                >
                  {enviando ? "Verificando…" : VISTAS[vista].submit}
                </button>

                {vista !== "enviado" && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "4px 0 14px" }}>
                      <span style={{ flex: "1 1 auto", height: 1, background: "#ECE5E7" }} />
                      <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: ".07em", textTransform: "uppercase", color: C.ink600 }}>o continúa con</span>
                      <span style={{ flex: "1 1 auto", height: 1, background: "#ECE5E7" }} />
                    </div>
                    <button
                      type="button"
                      onClick={() => void entrarConGoogle()}
                      className="login-focus"
                      style={ssoStyle}
                    >
                      <GoogleIcon /> Google
                    </button>
                  </div>
                )}
              </form>
            )}

            <p style={{ margin: "22px 0 0", fontSize: 13, color: C.ink600 }}>
              {VISTAS[vista].pie[0]}{" "}
              <button
                type="button"
                onClick={ir(piePaso(vista))}
                style={{ background: "none", border: 0, padding: 0, fontSize: 13, fontWeight: 700, color: C.rose, cursor: "pointer" }}
              >
                {VISTAS[vista].pie[1]}
              </button>
            </p>
          </div>

          <p style={{ margin: "18px auto 0", maxWidth: 420, textAlign: "center", fontSize: 12, lineHeight: 1.5, color: C.ink600 }}>
            Muttu Innovación Social S.A.S. · Barranquilla, Colombia · el acceso queda registrado con fecha, hora e IP.
          </p>
        </main>
      </div>
    </div>
  );
}

const ssoStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 9,
  background: "#fff",
  border: `1px solid #DDD2D5`,
  borderRadius: 13,
  fontSize: 13.5,
  fontWeight: 600,
  color: "#3F2F33",
  cursor: "pointer",
};

function piePaso(v: Vista): Vista {
  switch (v) {
    case "login": return "registro";
    case "registro": return "login";
    case "recuperar": return "login";
    case "enviado": return "recuperar";
  }
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 3.4c1.2 0 2.2.4 3 1.2l2.2-2.2A7.6 7.6 0 0 0 8 .4a7.6 7.6 0 0 0-6.8 4.2l2.6 2A4.6 4.6 0 0 1 8 3.4Z" fill="#EA4335" />
      <path d="M15.4 8.2c0-.5 0-1-.1-1.5H8v3h4.1a3.6 3.6 0 0 1-1.5 2.3l2.5 2a7.4 7.4 0 0 0 2.3-5.8Z" fill="#4285F4" />
      <path d="M3.8 9.4A4.6 4.6 0 0 1 3.6 8c0-.5.1-1 .2-1.4l-2.6-2A7.6 7.6 0 0 0 .4 8c0 1.2.3 2.4.8 3.4l2.6-2Z" fill="#FBBC05" />
      <path d="M8 15.6c2 0 3.8-.7 5.1-1.9l-2.5-2c-.7.5-1.6.8-2.6.8a4.6 4.6 0 0 1-4.2-3l-2.6 2A7.6 7.6 0 0 0 8 15.6Z" fill="#34A853" />
    </svg>
  );
}