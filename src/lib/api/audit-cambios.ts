/**
 * Append-only audit for the v2 projects module (S0.4) — REQ-AUD-01..04.
 *
 * Two differences from the v1 `logAudit` in `./audit.ts`, both deliberate:
 *
 * 1. It writes through the caller's transaction client. The audit row and the
 *    business write must commit or roll back together, so a failed audit insert
 *    fails the whole operation (REQ-AUD-03). `logAudit` stays best-effort and
 *    untouched for the v1 modules.
 * 2. It records a per-field before/after diff, not a snapshot of the payload.
 *
 * The table itself is append-only: the `v2_auditoria_cambios` migration installs
 * triggers that reject UPDATE, DELETE and TRUNCATE, so nothing in the
 * application can rewrite history (REQ-AUD-02).
 */
import { randomUUID } from "node:crypto"

import type { AccionAuditoria, Prisma } from "@prisma/client"

/** Entity names the v2 module audits. Grouped here so the reader can filter on them. */
export const AUDIT_ENTIDADES_V2 = [
  "proyecto",
  "objetivo",
  "actividad",
  "entregable",
  "avance",
  "indicador",
  "medicion",
  "presupuesto",
  "programacion",
  "gasto",
  "version",
  "solicitud",
  "equipo",
  "linea",
  "municipio",
  "rubro",
  "setting",
] as const

export type AuditEntidadV2 = (typeof AUDIT_ENTIDADES_V2)[number]

export type CambioInput = {
  usuario_id: string
  accion: AccionAuditoria
  entidad: string
  entidad_id: string
  proyecto_id?: string | null
  campo?: string | null
  valor_anterior?: unknown
  valor_nuevo?: unknown
  lote_id?: string
}

export type CambioCampo = {
  campo: string
  valor_anterior: unknown
  valor_nuevo: unknown
}

/**
 * Turns a value into something a JSON column can hold.
 *
 * `Decimal` and `Date` are the two types that reach this layer from Prisma and
 * neither survives a JSON round-trip as-is, so they become strings. Decimal is
 * recognised by its prototype (a value object, not a plain object) rather than
 * by duck-typing `toString`, which every object has.
 */
function normalise(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()

  if (value !== null && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value)
    const isPlain = prototype === Object.prototype || prototype === null || Array.isArray(value)

    if (!isPlain) {
      const toString = (value as { toString?: unknown }).toString
      if (typeof toString === "function" && toString !== Object.prototype.toString) {
        return (toString as () => string).call(value)
      }
    }
  }

  return value
}

function sameValue(a: unknown, b: unknown): boolean {
  const left = normalise(a)
  const right = normalise(b)

  if (left === right) return true
  if (left === null || right === null) return false

  if (typeof left === "object" && typeof right === "object") {
    try {
      return JSON.stringify(left) === JSON.stringify(right)
    } catch {
      return false
    }
  }

  return false
}

/**
 * One entry per changed field, in the order the fields were declared.
 *
 * A field that is absent from `after` is *unchanged*, not a deletion: callers
 * pass only the fields they intend to touch, and an explicit `null` is how a
 * field is cleared.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields: readonly (keyof T)[],
): CambioCampo[] {
  const cambios: CambioCampo[] = []

  for (const field of fields) {
    if (!(field in after)) continue

    const anterior = before[field]
    const nuevo = after[field]
    if (sameValue(anterior, nuevo)) continue

    cambios.push({
      campo: String(field),
      valor_anterior: normalise(anterior),
      valor_nuevo: normalise(nuevo),
    })
  }

  return cambios
}

function toRow(input: CambioInput, loteId: string | null) {
  return {
    usuario_id: input.usuario_id,
    accion: input.accion,
    entidad: input.entidad,
    entidad_id: input.entidad_id,
    proyecto_id: input.proyecto_id ?? null,
    campo: input.campo ?? null,
    valor_anterior: (normalise(input.valor_anterior) ?? null) as Prisma.InputJsonValue,
    valor_nuevo: (normalise(input.valor_nuevo) ?? null) as Prisma.InputJsonValue,
    lote_id: loteId,
  }
}

/**
 * Inserts one audit row **inside the caller's transaction**. Errors are
 * propagated on purpose: the business write must fail with the audit
 * (REQ-AUD-03), which is the opposite of `logAudit`'s best-effort behaviour.
 */
export async function logChange(tx: Prisma.TransactionClient, input: CambioInput): Promise<void> {
  await tx.auditoriaCambio.create({ data: toRow(input, input.lote_id ?? null) })
}

/**
 * Inserts a whole operation's rows with a single `createMany`. Rows that do not
 * carry their own `lote_id` share one generated here, so a multi-field edit or
 * an import can be read back as one unit.
 */
export async function logChanges(tx: Prisma.TransactionClient, inputs: readonly CambioInput[]): Promise<void> {
  if (inputs.length === 0) return

  const loteId = inputs[0]?.lote_id ?? randomUUID()

  await tx.auditoriaCambio.createMany({
    data: inputs.map((input) => toRow(input, input.lote_id ?? loteId)),
  })
}
