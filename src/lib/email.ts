// Resend email helper para el cron diario de notificaciones (Hito 5,
// PRD §4.4.1). Envío server-to-server sin SDK: fetch POST a
// https://api.resend.com/emails con RESEND_API_KEY + EMAIL_FROM. HTML mínimo
// con estilo de la marca (primario #cd1560) y 3 buckets de colores:
// vencidos rojo, hoy ámbar, próximos 3 días neutro/informativo.

import type { Usuario } from "@prisma/client";
import type { AlertBuckets, AlertItem } from "@/lib/alerts";

export const RESEND_ENDPOINT = "https://api.resend.com/emails";
export const EMAIL_FROM_DEFAULT = "noreply@muttu.co";
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
function fechaCorta(fecha: Date): string {
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
 * HTML del resumen diario con los 3 buckets del PRD §4.4.1 — "construido con
 * estilo de la marca": encabezado magenta (#cd1560), tipografía del sistema y
 * solo CSS inline (compatible con los clientes de correo más estrictos).
 */
export function buildDailyHtml(nombre: string, buckets: AlertBuckets): string {
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
  ].join("");

  return `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <div style="background:${BRAND_MAIN};border-radius:10px 10px 0 0;padding:20px 24px">
        <h1 style="color:#fff;font-size:18px;margin:0">Muttu Hub</h1>
        <p style="color:#fde8ef;font-size:13px;margin:4px 0 0">Resumen diario · ${escapeHtml(nombre)}</p>
      </div>
      <div style="border:1px solid #eaeaea;border-top:none;border-radius:0 0 10px 10px;padding:20px 24px">
        ${body}
        <p style="font-size:12px;color:#98a2b3;margin:16px 0 0">
          Este correo es automático. Revisa tu panel en Muttu Hub para detalle.
        </p>
      </div>
    </div>`;
}

export type SendResult = { ok: true; id?: string } | { ok: false; error: string };

/**
 * Envía el resumen diario a un usuario vía Resend. Devuelve { ok: false }
 * con el detalle cuando falla la API (el cron lo registra en cron_logs y
 * reintenta a las 8:30 vía pg_cron, PRD §4.4.1). Nunca lanza.
 */
export async function sendDailySummary(
  usuario: Pick<Usuario, "nombre" | "email">,
  buckets: AlertBuckets,
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "missing RESEND_API_KEY" };

  const from = process.env.EMAIL_FROM || EMAIL_FROM_DEFAULT;

  let res: Response;
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [usuario.email],
        subject: DAILY_SUBJECT,
        html: buildDailyHtml(usuario.nombre, buckets),
      }),
    });
  } catch (err) {
    return { ok: false, error: `fetch failed: ${(err as Error).message}` };
  }

  if (!res.ok) {
    let detail = `Resend HTTP ${res.status}`;
    try {
      const text = (await res.text()).slice(0, 300);
      if (text) detail += ` · ${text}`;
    } catch {
      // byte body — ignora
    }
    return { ok: false, error: detail };
  }
  return { ok: true };
}