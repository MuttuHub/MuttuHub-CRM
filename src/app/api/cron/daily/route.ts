// POST /api/cron/daily — job diario de notificaciones (PRD §4.4.1).
// Invocado por pg_cron (scripts/cron_setup.sql) a las 8:00 y 8:30 hora
// Colombia (= '13 0 * * *' y '30 13 * * *' en UTC). NO pasa por el proxy
// (su matcher excluye todo /api) y se autentica con el header
// `x-cron-secret` == env CRON_SECRET.
//
// Flujo por usuario activo (ADMINISTRADOR excluido, PRD §4.4.1):
//   buckets via el motor compartido (scope own para COLABORADOR, all para
//   el resto) → sin alertas en ninguna categoría → NO se manda correo
//   (no-mail-if-empty); con alertas → resumen Resend.
// Cada corrida queda registrada en cron_logs (OK / ERROR / SKIPPED_NO_CONFIG)
// y el guard de idempotencia evita re-enviar si la corrida del día ya terminó
// OK (así el reintento de las 8:30 solo actúa si el de las 8:00 falló).

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import type { Usuario } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { getAlertBuckets, startOfLocalDay } from "@/lib/alerts";
import { sendDailySummary } from "@/lib/email";

export const dynamic = "force-dynamic";

export const JOB_NAME = "daily-notifications";

type CronUsuario = Pick<Usuario, "id" | "nombre" | "email" | "rol">;

async function recordJobLog(
  estado: "OK" | "ERROR" | "SKIPPED_NO_CONFIG",
  detalle: string,
): Promise<void> {
  try {
    await db.cronLog.create({
      data: { job_name: JOB_NAME, estado, detalle: detalle.slice(0, 400) },
    });
  } catch (err) {
    // Sin tabla cron_logs no se aborta la corrida: solo log local.
    console.error("[cron] cron_logs write failed:", err);
  }
}

export async function POST() {
  // 1) Puerta: header x-cron-secret contra CRON_SECRET (401 envelope).
  const expected = process.env.CRON_SECRET;
  const header = (await headers()).get("x-cron-secret");
  if (!expected || header !== expected) {
    return apiError("No autorizado.", 401, "UNAUTHORIZED");
  }

  // 2) Resend sin configurar → correo no posible: se registra y se responde
  // 200 con nota (sin crash, PRD §8.4 graceful). El REintento 8:30 repetirá.
  if (!process.env.RESEND_API_KEY) {
    await recordJobLog(
      "SKIPPED_NO_CONFIG",
      `missing RESEND_API_KEY${process.env.EMAIL_FROM ? "" : " y EMAIL_FROM"}`,
    );
    return NextResponse.json({
      ok: true,
      processed: 0,
      sent: 0,
      failed: 0,
      skipped_empty: 0,
      already_sent_today: false,
      note: "RESEND_API_KEY no configurada — corrida SKIPPED_NO_CONFIG.",
    });
  }

  const summary = {
    ok: true as boolean,
    processed: 0, // usuarios con alertas a los que se les intentó el correo
    sent: 0, // correos entregados a Resend sin error
    failed: 0, // usuarios con alertas cuyo envío falló
    skipped_empty: 0, // usuarios sin alertas → "no-mail-if-empty" (PRD)
    already_sent_today: false,
  };

  try {
    // 3) Idempotencia: la corrida de hoy ya cerró OK (reintento 8:30) → no
    // re-enviar. Basado en cron_logs de hoy, mismo día local del servidor.
    const today = startOfLocalDay();
    const lastOk = await db.cronLog.findFirst({
      where: { job_name: JOB_NAME, estado: "OK", created_at: { gte: today } },
      select: { id: true },
    });
    if (lastOk) {
      summary.already_sent_today = true;
      await recordJobLog("OK", "already_sent_today=true; idempotencia 8:30");
      return NextResponse.json({
        ...summary,
        note: "El correo ya se envió hoy — reintento omitido (idempotencia).",
      });
    }

    // 4) Destinatarios: usuarios activos, todos menos ADMINISTRADOR.
    const usuarios = await db.usuario.findMany({
      where: { activo: true, rol: { not: "ADMINISTRADOR" } },
      select: { id: true, nombre: true, email: true, rol: true },
    });

    for (const usuario of usuarios as CronUsuario[]) {
      const scope: "own" | "all" = usuario.rol === "COLABORADOR" ? "own" : "all";
      const buckets = await getAlertBuckets(scope, usuario);
      const total = buckets.vencidos.length + buckets.hoy.length + buckets.proximos3.length;

      if (total === 0) {
        summary.skipped_empty += 1;
        continue;
      }

      summary.processed += 1;
      const result = await sendDailySummary(usuario, buckets);
      if (result.ok) {
        summary.sent += 1;
      } else {
        summary.failed += 1;
        summary.ok = false;
        console.error(`[cron] email failed for ${usuario.email}:`, result.error);
      }
    }

    const detalle = [
      `processed=${summary.processed}`,
      `sent=${summary.sent}`,
      `skipped_empty=${summary.skipped_empty}`,
      `failed=${summary.failed}`,
    ].join(" ");
    await recordJobLog(summary.ok ? "OK" : "ERROR", detalle);

    return NextResponse.json(summary);
  } catch (err) {
    console.error("[cron] daily run failed:", err);
    await recordJobLog("ERROR", `unhandled: ${(err as Error).message}`);
    // El fallo queda en cron_logs (no se lanza al caller): pg_cron reintenta
    // a las 8:30; si la BD está caída, el guard de idempotencia no aplica y
    // la corrida se repite en el siguiente ciclo.
    return NextResponse.json({
      ...summary,
      ok: false,
      note: "Corrida fallida — revisa cron_logs (reintento 8:30 programado).",
    });
  }
}