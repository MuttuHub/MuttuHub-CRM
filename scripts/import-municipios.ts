/**
 * Carga el catálogo DIVIPOLA del DANE (1122 municipios de Colombia) en `municipios`.
 *
 * WHY: la migración crea la tabla pero no la puebla. Sin catálogo, el asistente de creación no deja
 * elegir municipio y ningún rol puede crear un proyecto (pasó el 2026-10-19 en producción).
 *
 * Uso:
 *   node node_modules/tsx/dist/cli.mjs scripts/import-municipios.ts            # dry-run
 *   node node_modules/tsx/dist/cli.mjs scripts/import-municipios.ts --apply    # escribe
 *
 * Contra una base remota (producción) hay que exportar `DATABASE_URL` y confirmar con
 * `MUNICIPIOS_ALLOW_REMOTE=1`. Es idempotente: hace upsert por `codigo_dane` y reactiva filas suspendidas.
 */
import { db } from "../src/lib/db";
import { connectionTarget } from "../prisma/local-env";

const DIVIPOLA =
  "https://www.datos.gov.co/resource/gdxc-w37w.json?$limit=2000";

const CONECTORES = new Set(["de", "del", "la", "las", "los", "el", "y", "e"]);

/** «MEDELLÍN» → «Medellín»; «VALLE DEL CAUCA» → «Valle del Cauca». */
export function titulo(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => (index > 0 && CONECTORES.has(word) ? word : word[0].toUpperCase() + word.slice(1)))
    .join(" ");
}

type DivipolaRow = { cod_mpio: string; nom_mpio: string; dpto: string };

async function main() {
  const apply = process.argv.includes("--apply");
  const target = connectionTarget(process.env.DATABASE_URL ?? "") ?? "desconocido";
  const remoto = !/127\.0\.0\.1|localhost/.test(target);
  console.log(`Catálogo DIVIPOLA  (db: ${target})  modo: ${apply ? "apply" : "dry-run"}`);
  if (apply && remoto && process.env.MUNICIPIOS_ALLOW_REMOTE !== "1") {
    console.error("STOP: base remota. Exporta MUNICIPIOS_ALLOW_REMOTE=1 para confirmar.");
    process.exit(1);
  }

  const res = await fetch(DIVIPOLA, { headers: { accept: "application/json" } });
  if (!res.ok) {
    console.error(`STOP: el DANE respondió ${res.status}.`);
    process.exit(1);
  }
  const rows = (await res.json()) as DivipolaRow[];
  const unique = new Map(rows.map((row) => [row.cod_mpio, row]));
  console.log(`Municipios en el archivo: ${unique.size}`);

  const orden = [...unique.values()].sort((a, b) =>
    a.dpto.localeCompare(b.dpto, "es") || a.nom_mpio.localeCompare(b.nom_mpio, "es"),
  );

  let creados = 0;
  let actualizados = 0;
  let i = 0;
  for (const row of orden) {
    i += 1;
    const data = {
      nombre: titulo(row.nom_mpio),
      departamento: titulo(row.dpto),
      activo: true,
      orden: i,
    };
    if (!apply) continue;
    const existente = await db.municipio.findUnique({ where: { codigo_dane: row.cod_mpio } });
    await db.municipio.upsert({
      where: { codigo_dane: row.cod_mpio },
      create: { id: crypto.randomUUID(), codigo_dane: row.cod_mpio, ...data },
      update: data,
    });
    if (existente) actualizados += 1;
    else creados += 1;
  }

  if (apply) {
    console.log(`Listo: ${creados} creados, ${actualizados} actualizados.`);
  } else {
    console.log("Dry-run: no se escribió nada. Repite con --apply.");
    console.log("Ejemplo:", orden[0]?.cod_mpio, titulo(orden[0]?.nom_mpio ?? ""), titulo(orden[0]?.dpto ?? ""));
  }
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
