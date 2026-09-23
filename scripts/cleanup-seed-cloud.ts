// scripts/cleanup-seed-cloud.ts
//
// Limpieza QUIRÚRGICA del seed demo (ids fijos 00000000-0000-4000-*)
// que se insertó por error en el Supabase Cloud de producción el 2026-09-17.
//
// SOLO borra filas seed + los 4 usuarios demo + las notificaciones que
// referencian tareas demo + los objetos de storage con ruta seed.
// NO toca datos reales (clientes/tareas/documentos/usuarios reales).
//
// SEGURIDAD:
//   - Por defecto corre en DRY-RUN (solo muestra conteos, no borra nada).
//   - Para ejecutar de verdad:  npx tsx scripts/cleanup-seed-cloud.ts --apply
//   - Carga .env (apunta al cloud) a propósito — es el objetivo de la limpieza.
//   - El script aborta si el host de DATABASE_URL NO es Supabase Cloud
//     (hosts *.supabase.com), para que jamás se ejecute contra local por error.

import "dotenv/config";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

const SEED = "00000000-0000-4000-%";
const DEMO_EMAILS = [
  "admin@demo.muttuhub.local",
  "gerencia@demo.muttuhub.local",
  "coordinador@demo.muttuhub.local",
  "colaborador@demo.muttuhub.local",
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL (.env)");
  const host = new URL(url).hostname;
  if (!host.endsWith("supabase.com")) {
    throw new Error(`Abortando: el host "${host}" no parece Supabase Cloud. Esta limpieza SOLO aplica al cloud de producción.`);
  }
  console.log(`Target (solo lectura hasta --apply): ${host}${APPLY ? "  [APPLY]" : "  [DRY-RUN]"}`);

  const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await db.connect();

  // Orden de borrado respetando FKs (hijos antes que padres).
  // Cada entrada: [tabla, columnas a comparar contra el prefijo seed].
  const tables: Array<[string, string[]]> = [
    ["notificaciones", ["tarea_id"]],        // cron generó 52 notifs sobre tareas seed
    ["subtareas", ["id"]],
    ["comentarios_tareas", ["id"]],
    ["adjuntos_tareas", ["id"]],
    ["documento_versiones", ["id"]],
    ["documentos_clientes", ["documento_id", "cliente_id"]], // hijo: ANTES de documentos/clientes
    ["documentos", ["id"]],
    ["bitacora_entradas", ["id"]],
    ["accesos", ["id"]],
    ["solicitudes_acceso", ["id"]],
    ["tareas", ["id"]],
    ["oportunidades", ["id"]],
    ["contactos", ["id"]],
    ["clientes", ["id"]],
  ];

  let total = 0;
  const plan: Array<{ table: string; n: number }> = [];
  for (const [table, cols] of tables) {
    const where = cols.map((c) => `"${c}"::text LIKE $1`).join(" OR ");
    const r = await db.query(`SELECT count(*)::int AS n FROM "${table}" WHERE ${where}`, [SEED]);
    plan.push({ table, n: r.rows[0].n });
    total += r.rows[0].n;
  }

  // usuarios app-level de los 4 demo
  const demoUsuarios = await db.query(`SELECT id, email FROM usuarios WHERE email = ANY($1)`, [DEMO_EMAILS]);
  const demoIds = demoUsuarios.rows.map((u) => u.id);

  // storage con ruta seed
  const storageSeed = await db.query(`SELECT id, bucket_id, name FROM storage.objects WHERE name LIKE '%00000000-0000-4000-%'`);

  console.log("\n── PLAN DE BORRADO ─────────────────────────");
  for (const p of plan) console.log(`  ${p.table.padEnd(24)} ${p.n}`);
  console.log(`  usuarios demo (app-level)        ${demoIds.length}`);
  console.log(`  auth.users demo                  ${demoIds.length}`);
  console.log(`  storage.objects ruta seed        ${storageSeed.rows.length}`);
  console.log(`  ────────────────────────────────────────`);
  console.log(`  TOTAL filas (sin storage/auth)   ${total}`);

  if (!APPLY) {
    console.log("\nDRY-RUN: no se borró nada. Ejecuta con --apply para aplicar.");
    await db.end();
    return;
  }

  console.log("\n── APLICANDO ──────────────────────────────");
  for (const [table, cols] of tables) {
    const where = cols.map((c) => `"${c}"::text LIKE $1`).join(" OR ");
    const r = await db.query(`DELETE FROM "${table}" WHERE ${where}`, [SEED]);
    console.log(`  DELETE ${table.padEnd(24)} ${r.rowCount}`);
  }

  if (demoIds.length) {
    const r = await db.query(`DELETE FROM usuarios WHERE id = ANY($1)`, [demoIds]);
    console.log(`  DELETE usuarios (app-level)      ${r.rowCount}`);
  }

  // storage: borrar vía API para mantener consistencia (mejor que SQL directo)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceKey && storageSeed.rows.length) {
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const byBucket: Record<string, string[]> = {};
    for (const o of storageSeed.rows) (byBucket[o.bucket_id] ??= []).push(o.name);
    for (const [bucket, paths] of Object.entries(byBucket)) {
      const { error } = await admin.storage.from(bucket).remove(paths);
      console.log(`  STORAGE remove ${bucket} (${paths.length}): ${error ? error.message : "ok"}`);
    }
  }

  // auth users demo (después de borrar filas app-level)
  if (supabaseUrl && serviceKey && demoIds.length) {
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    for (const id of demoIds) {
      const { error } = await admin.auth.admin.deleteUser(id);
      console.log(`  AUTH deleteUser ${id.slice(0, 8)}…: ${error ? error.message : "ok"}`);
    }
  }

  // verificación post-limpieza
  console.log("\n── VERIFICACIÓN ───────────────────────────");
  for (const [table, cols] of tables) {
    const where = cols.map((c) => `"${c}"::text LIKE $1`).join(" OR ");
    const r = await db.query(`SELECT count(*)::int AS n FROM "${table}" WHERE ${where}`, [SEED]);
    if (r.rows[0].n > 0) console.log(`  ⚠️  ${table} todavía tiene ${r.rows[0].n} filas seed`);
  }
  console.log("  Limpieza finalizada.");

  await db.end();
}

main().catch((e) => {
  console.error("❌", e.message ?? e);
  process.exit(1);
});