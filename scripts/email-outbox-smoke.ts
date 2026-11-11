/**
 * PR-M1 local smoke test: enqueue one test email in the outbox and drain it into the local
 * Mailpit, end to end through the real claim query and the Mailpit adapter.
 *
 *   tsx scripts/email-outbox-smoke.ts
 *
 * Then open http://localhost:54324 to see the message.
 *
 * The `require-local-db` guard MUST be the first import: it loads `.env.local` and refuses a
 * non-loopback database before `@/lib/db` builds the Prisma client. The transport is forced to
 * Mailpit (refused unless MAILPIT_URL is loopback), so this script can never send real mail.
 *
 * It leaves one ENVIADO row (tipo SMOKE_TEST, key `smoke/<timestamp>`) in the local
 * `email_outbox`, and drains any other due row of the local outbox into Mailpit too.
 */
import "../prisma/require-local-db"

import { db } from "@/lib/db"
import { enqueueEmail, processOutbox } from "@/lib/email/outbox"
import { resolveEmailTransport } from "@/lib/email/sender"

async function main(): Promise<void> {
  const transport = resolveEmailTransport({ ...process.env, EMAIL_TRANSPORT: "mailpit" })
  if (!transport.ok) throw new Error(`Mailpit transport unavailable: ${transport.reason}`)

  const key = `smoke/${new Date().toISOString()}`
  await db.$transaction(async (tx) => {
    await enqueueEmail(tx, {
      to: "prueba@example.test",
      subject: "Muttu Hub · Prueba de notificaciones",
      html:
        "<p>Hola, este es un correo de prueba del outbox de Muttu Hub.</p>" +
        "<p>Si lo ves en Mailpit, tu entorno local ya envía notificaciones.</p>",
      tipo: "SMOKE_TEST",
      idempotencyKey: key,
    })
  })

  const run = await processOutbox(transport.sender, new Date(), 50)
  const row = await db.emailOutbox.findUniqueOrThrow({
    where: { clave_idempotencia: key },
    select: { estado: true, intentos: true, proveedor_id: true, ultimo_error: true },
  })

  console.log("outbox run:", run)
  console.log("smoke row:", { key, ...row })
  if (row.estado !== "ENVIADO") process.exitCode = 1
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
