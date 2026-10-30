// Live-DB coverage for AJ-02 (PO document v1.1): an activity's weight is its duration in
// weeks, so nothing may require or constrain a stored copy of it. The change is expand/contract:
// this step keeps the legacy `peso` / `peso_manual` columns (so the code deployed before AJ-02
// keeps working) but makes them optional, and a follow-up migration drops them. Prisma alone
// cannot prove it (`@ignore` hides the columns from the client): the migration is what does it.
//
// `./require-local-db` must stay the FIRST import.
import "./require-local-db"

import { describe, expect, it } from "vitest"

import { db } from "@/lib/db"

type Columna = { column_name: string; is_nullable: string; column_default: string | null }

async function columnasDeActividades(): Promise<Map<string, Columna>> {
  const rows = await db.$queryRaw<Columna[]>`
    SELECT column_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'actividades'
  `
  return new Map(rows.map((r) => [r.column_name, r]))
}

describe("AJ-02 — the activity weight is derived from its weeks, never required", () => {
  it("lets an activity be stored without `peso` or `peso_manual` (S4, expand step)", async () => {
    const columnas = await columnasDeActividades()
    // Legacy columns: absent (after the follow-up drop) or optional (expand step), never required.
    const peso = columnas.get("peso")
    if (peso) expect(peso.is_nullable).toBe("YES")
    const pesoManual = columnas.get("peso_manual")
    if (pesoManual) expect(pesoManual.is_nullable === "YES" || pesoManual.column_default !== null).toBe(true)
  })

  it("drops the `peso > 0` CHECK so a NULL weight is accepted (S4)", async () => {
    const rows = await db.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'public.actividades'::regclass AND conname = 'actividades_peso_check'
    `
    expect(rows).toEqual([])
  })

  it("keeps the two columns the weight is derived from (S4: semana fin − semana inicio + 1)", async () => {
    const columnas = await columnasDeActividades()
    expect(columnas.has("semana_inicio")).toBe(true)
    expect(columnas.has("semana_fin")).toBe(true)
  })
})
