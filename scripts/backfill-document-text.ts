// Backfill del texto extraído de las versiones existentes (plan Fase 2, 4B).
// Toma las versiones que NUNCA se procesaron (texto_estado IS NULL) o que
// FALLARON (texto_estado = 'error' — reintentable). No toca las ya indexadas
// (ok) ni las sin texto (sin_texto): correrlo dos veces no reprocesa nada.
// Solo la versión ACTIVA de cada documento es buscable, así que acá se
// procesan únicamente esas (un doc con 5 versiones no re-parsea 4 obsoletas).
//
// Uso: npm exec tsx scripts/backfill-document-text.ts [--limit N]
// --limit: máximo de versiones a procesar en esta corrida (default: sin tope).
// Idempotente: un crash a la mitad deja las ya hechas en 'ok', y las falladas
// en 'error' para la próxima corrida.

import "dotenv/config";
import { Prisma } from "@prisma/client";
import { db } from "../src/lib/db";
import { createSupabaseAdmin } from "../src/lib/supabase/admin";
import { extractDocumentText, MAX_EXTRACTED_CHARS } from "../src/lib/api/extract-text";
import { STORAGE_BUCKET } from "../src/lib/api/files";

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const hasLimit = Boolean(limitArg);
const limit = hasLimit ? Number.parseInt(limitArg!.split("=")[1]!, 10) : 0;

async function main() {
  const supabase = createSupabaseAdmin();

  // Versiones activas nunca procesadas o falladas. La activa = mayor
  // numero_version por documento (mismo criterio que la búsqueda FTS).
  const rows = await db.$queryRaw<{ version_id: string; documento_id: string; storage_path: string; tipo_archivo: string | null; titulo: string }[]>(
    Prisma.sql`
    SELECT dv.id AS version_id, dv.documento_id, dv.storage_path, dv.tipo_archivo, d.titulo
    FROM documento_versiones dv
    JOIN documentos d ON d.id = dv.documento_id
    WHERE (dv.texto_estado IS NULL OR dv.texto_estado = 'error')
      AND dv.numero_version = (
        SELECT MAX(numero_version) FROM documento_versiones WHERE documento_id = dv.documento_id
      )
    ORDER BY dv.created_at ASC
    ${hasLimit ? Prisma.sql`LIMIT ${limit}` : Prisma.empty}
  `,
  );

  console.log(`[backfill] ${rows.length} versiones activas para procesar.`);

  let ok = 0;
  let sinTexto = 0;
  let error = 0;

  for (const row of rows) {
    const { data, error: dlError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(row.storage_path);

    if (dlError || !data) {
      console.error(`[backfill] no pude descargar ${row.storage_path}: ${dlError?.message ?? "sin datos"}`);
      error += 1;
      continue;
    }

    const bytes = new Uint8Array(await data.arrayBuffer());
    const res = await extractDocumentText(bytes, row.titulo, row.tipo_archivo ?? undefined);

    if (res.ok) {
      await db.documentoVersion.update({
        where: { id: row.version_id },
        data: { contenido_texto: res.texto.slice(0, MAX_EXTRACTED_CHARS), texto_estado: "ok" },
      });
      ok += 1;
    } else if (res.code === "SIN_TEXTO") {
      await db.documentoVersion.update({
        where: { id: row.version_id },
        data: { contenido_texto: null, texto_estado: "sin_texto" },
      });
      sinTexto += 1;
    } else {
      await db.documentoVersion.update({
        where: { id: row.version_id },
        data: { contenido_texto: null, texto_estado: "error" },
      });
      error += 1;
    }
  }

  console.log(`[backfill] ok: ${ok} · sin_texto: ${sinTexto} · error: ${error}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill] failed:", err);
    process.exit(1);
  });