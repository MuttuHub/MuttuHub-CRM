// Live-DB coverage for AJ-02 (PO document v1.1): an activity's weight is its duration in
// weeks, so the database must not keep a second, writable copy of it. A stored `peso` could
// only drift from `semana_fin - semana_inicio + 1`, and `peso_manual` would be the flag that
// made editability possible. Both are asserted absent here because Prisma alone cannot prove
// it: the migration is what removes them.
//
// `./require-local-db` must stay the FIRST import.
import "./require-local-db"

import { describe, expect, it } from "vitest"

import { db } from "@/lib/db"

type Columna = { column_name: string }

async function columnasDeActividades(): Promise<string[]> {
  const rows = await db.$queryRaw<Columna[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'actividades'
    ORDER BY column_name
  `
  return rows.map((r) => r.column_name)
}

describe("AJ-02 — the activity weight is derived from its weeks, never stored", () => {
  it("keeps no `peso` and no `peso_manual` column on actividades (S4)", async () => {
    const columnas = await columnasDeActividades()
    expect(columnas).not.toContain("peso")
    expect(columnas).not.toContain("peso_manual")
  })

  it("keeps the two columns the weight is derived from (S4: semana fin − semana inicio + 1)", async () => {
    const columnas = await columnasDeActividades()
    expect(columnas).toContain("semana_inicio")
    expect(columnas).toContain("semana_fin")
  })
})
