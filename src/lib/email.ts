// Daily summary email for the notifications cron (Hito 5, PRD §4.4.1). Since PR-M1 the send
// goes through the EmailSender port (`@/lib/email/sender`): Resend by default (same request as
// before — fetch POST to https://api.resend.com/emails with RESEND_API_KEY + EMAIL_FROM), or
// Mailpit locally with EMAIL_TRANSPORT=mailpit. HTML mínimo con estilo de la marca (primario
// #cd1560) y 3 buckets de colores: vencidos rojo, hoy ámbar, próximos 3 días neutro.

import type { Usuario } from "@prisma/client";
import type { AlertBuckets, AlertItem } from "@/lib/alerts";
import type { SinContactoItem } from "@/lib/automatizaciones/reglas";
import { resolveEmailTransport, type SendResult } from "@/lib/email/sender";

export { RESEND_ENDPOINT } from "@/lib/email/resend";
export const DAILY_SUBJECT = "Muttu Hub · Resumen diario";

const BRAND_MAIN = "#cd1560";
const RED = "#b91c1c";
const AMBER = "#b45309";
const SLATE = "#334155";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "2026-08-07" (local del servidor — coincidente con el engine). */
export function fechaCorta(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const ESTADO_LABELS: Record<string, string> = {
  POR_HACER: "Por hacer",
  EN_CURSO: "En curso",
  EN_REVISION: "En revisión",
  BLOQUEADA: "Bloqueada",
  EN_ESPERA: "En espera",
};

function estadoLabel(estado: string): string {
  return ESTADO_LABELS[estado] ?? estado;
}

type Seccion = {
  titulo: string;
  color: string;
  items: AlertItem[];
  vazio: string;
};

function renderSeccion(seccion: Seccion): string {
  if (seccion.items.length === 0) {
    return `
      <h2 style="font-size:16px;color:${seccion.color};margin:0 0 10px">${seccion.titulo}</h2>
      <p style="font-size:13px;color:#98a2b3;margin:0 0 16px">${seccion.vazio}</p>`;
  }
  const rows = seccion.items
    .map(
      (it) => `
        <tr>
          <td style="padding:12px 16px;border:1px solid #eee;border-radius:8px;margin-bottom:8px">
            <div style="font-size:14px;color:#111"><strong>${escapeHtml(it.titulo)}</strong>
              <span style="color:${seccion.color}">${estadoLabel(it.estado)}</span></div>
            <div style="font-size:12px;color:#667085;margin-top:4px">
              ${it.cliente_nombre ? `Cliente: ${escapeHtml(it.cliente_nombre)} · ` : ""}
              Responsable: ${escapeHtml(it.responsable_nombre)} · Entrega: ${fechaCorta(it.fecha_entrega)}
            </div>
          </td>
        </tr>`,
    )
    .join("");
  return `
    <h2 style="font-size:16px;color:${seccion.color};margin:0 0 10px">${seccion.titulo}</h2>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${rows}</table>`;
}

/**
 * V8 sections of the digest. A rule that is off is simply absent, and then the
 * digest renders exactly as it did before V8.
 */
export type DigestReglas = {
  /** «Recordar compromisos N días antes»: open tasks due exactly `dias` days from today. */
  recordatorios?: { dias: number; items: AlertItem[] };
  /** «Alertar N días sin contacto»: the recipient's clients without contact for `dias`+ days. */
  sinContacto?: { dias: number; items: SinContactoItem[] };
};

/** "1 día" / "2 días". */
function diasTexto(dias: number): string {
  return dias === 1 ? "1 día" : `${dias} días`;
}

function ultimoContactoTexto(item: SinContactoItem): string {
  if (item.ultimo_contacto === null || item.dias_sin_gestion === null) return "Sin contacto registrado";
  return `Último contacto: ${fechaCorta(item.ultimo_contacto)} (hace ${diasTexto(item.dias_sin_gestion)})`;
}

function renderSinContacto(dias: number, items: SinContactoItem[]): string {
  const titulo = `Aliados con ${diasTexto(dias)} o más sin contacto`;
  if (items.length === 0) {
    return `
      <h2 style="font-size:16px;color:${SLATE};margin:0 0 10px">${titulo}</h2>
      <p style="font-size:13px;color:#98a2b3;margin:0 0 16px">Todos tus aliados tienen contacto reciente.</p>`;
  }
  const rows = items
    .map(
      (it) => `
        <tr>
          <td style="padding:12px 16px;border:1px solid #eee;border-radius:8px;margin-bottom:8px">
            <div style="font-size:14px;color:#111"><strong>${escapeHtml(it.nombre)}</strong></div>
            <div style="font-size:12px;color:#667085;margin-top:4px">
              ${ultimoContactoTexto(it)} · Responsable: ${escapeHtml(it.responsable_nombre)}
            </div>
          </td>
        </tr>`,
    )
    .join("");
  return `
    <h2 style="font-size:16px;color:${SLATE};margin:0 0 10px">${titulo}</h2>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${rows}</table>`;
}

function renderReglas(reglas: DigestReglas | undefined): string {
  if (!reglas) return "";
  const parts: string[] = [];
  if (reglas.recordatorios) {
    parts.push(
      renderSeccion({
        titulo: `Compromisos que vencen en ${diasTexto(reglas.recordatorios.dias)}`,
        color: AMBER,
        items: reglas.recordatorios.items,
        vazio: "Ningún compromiso para recordar.",
      }),
    );
  }
  if (reglas.sinContacto) parts.push(renderSinContacto(reglas.sinContacto.dias, reglas.sinContacto.items));
  return parts.join("");
}

/**
 * HTML del resumen diario con los 3 buckets del PRD §4.4.1 — "construido con
 * estilo de la marca": encabezado magenta (#cd1560), tipografía del sistema y
 * solo CSS inline (compatible con los clientes de correo más estrictos).
 * `reglas` adds the V8 sections after the buckets; without it the HTML is the
 * pre-V8 one, byte for byte.
 */
export function buildDailyHtml(nombre: string, buckets: AlertBuckets, reglas?: DigestReglas): string {
  const body = [
    renderSeccion({
      titulo: "Vencidos sin cerrar",
      color: RED,
      items: buckets.vencidos,
      vazio: "Sin vencidos. 🎉",
    }),
    renderSeccion({
      titulo: "Vencen hoy",
      color: AMBER,
      items: buckets.hoy,
      vazio: "Nada vence hoy.",
    }),
    renderSeccion({
      titulo: "Vencen en los próximos 3 días",
      color: SLATE,
      items: buckets.proximos3,
      vazio: "Nada vence pronto.",
    }),
    renderReglas(reglas),
  ].join("");

  return layout(`Resumen diario · ${escapeHtml(nombre)}`, body);
}

/** Brand frame shared by the digest and the V8 per-event e-mails. */
function layout(subtitulo: string, body: string): string {
  return `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <div style="background:${BRAND_MAIN};border-radius:10px 10px 0 0;padding:20px 24px">
        <h1 style="color:#fff;font-size:18px;margin:0">Muttu Hub</h1>
        <p style="color:#fde8ef;font-size:13px;margin:4px 0 0">${subtitulo}</p>
      </div>
      <div style="border:1px solid #eaeaea;border-top:none;border-radius:0 0 10px 10px;padding:20px 24px">
        ${body}
        <p style="font-size:12px;color:#98a2b3;margin:16px 0 0">
          Este correo es automático. Revisa tu panel en Muttu Hub para detalle.
        </p>
      </div>
    </div>`;
}

export type CorreoRegla = { subject: string; html: string };

/** V8 rule 1: the per-task reminder e-mail queued in the outbox. */
export function buildRecordatorioEmail(item: AlertItem, dias: number): CorreoRegla {
  const body = renderSeccion({
    titulo: `Este compromiso vence en ${diasTexto(dias)}`,
    color: AMBER,
    items: [item],
    vazio: "",
  });
  return {
    subject: `Muttu Hub · Compromiso en ${diasTexto(dias)}: ${item.titulo}`.slice(0, 200),
    html: layout(`Recordatorio · ${escapeHtml(item.responsable_nombre)}`, body),
  };
}

/** V8 rule 2: the per-client «sin contacto» e-mail queued in the outbox. */
export function buildSinContactoEmail(item: SinContactoItem, dias: number): CorreoRegla {
  return {
    subject: `Muttu Hub · ${item.nombre} lleva ${diasTexto(dias)} o más sin contacto`.slice(0, 200),
    html: layout(`Seguimiento de aliados · ${escapeHtml(item.responsable_nombre)}`, renderSinContacto(dias, [item])),
  };
}

/**
 * Envía el resumen diario a un usuario con el transporte configurado (Resend por defecto).
 * Devuelve { ok: false } con el detalle cuando falla la API (el cron lo registra en cron_logs y
 * reintenta a las 8:30 vía pg_cron, PRD §4.4.1). Nunca lanza.
 */
export async function sendDailySummary(
  usuario: Pick<Usuario, "nombre" | "email">,
  buckets: AlertBuckets,
  reglas?: DigestReglas,
): Promise<SendResult> {
  const transport = resolveEmailTransport();
  if (!transport.ok) return { ok: false, error: transport.reason };

  return transport.sender.send({
    to: usuario.email,
    subject: DAILY_SUBJECT,
    html: buildDailyHtml(usuario.nombre, buckets, reglas),
  });
}
