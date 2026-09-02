import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({
  db: {
    auditoria: {
      create: vi.fn(),
    },
  },
}))

import { db } from "@/lib/db"
import { logAudit } from "./audit"

afterEach(() => {
  vi.clearAllMocks()
})

describe("logAudit", () => {
  it("writes entidad, entidad_id, accion, usuario_id and cambios", async () => {
    vi.mocked(db.auditoria.create).mockResolvedValue({} as never)

    await logAudit({
      entidad: "cliente",
      entidad_id: "cli-1",
      accion: "editar",
      usuario_id: "user-1",
      cambios: { nombre: "Nuevo nombre" },
    })

    expect(db.auditoria.create).toHaveBeenCalledWith({
      data: {
        entidad: "cliente",
        entidad_id: "cli-1",
        accion: "editar",
        usuario_id: "user-1",
        cambios: { nombre: "Nuevo nombre" },
      },
    })
  })

  it("writes undefined cambios for an eliminar with no payload", async () => {
    vi.mocked(db.auditoria.create).mockResolvedValue({} as never)

    await logAudit({ entidad: "tarea", entidad_id: "task-1", accion: "eliminar", usuario_id: "user-1" })

    expect(db.auditoria.create).toHaveBeenCalledWith({
      data: {
        entidad: "tarea",
        entidad_id: "task-1",
        accion: "eliminar",
        usuario_id: "user-1",
        cambios: undefined,
      },
    })
  })

  it("swallows a write failure instead of throwing (best-effort, like the login access log)", async () => {
    vi.mocked(db.auditoria.create).mockRejectedValue(new Error("db down"))

    await expect(
      logAudit({ entidad: "documento", entidad_id: "doc-1", accion: "crear", usuario_id: "user-1" }),
    ).resolves.toBeUndefined()
  })

  // PR 6: exports need to be audited. The union widens to include
  // "exportar" so the export endpoints can carry rows + filters in `cambios`
  // without TypeScript losing its mind. Type-only assertion — but we also
  // exercise the runtime path so a future re-narrowing is caught.
  it("accepts accion: 'exportar' with rows + filters in cambios (PR 6)", async () => {
    vi.mocked(db.auditoria.create).mockResolvedValue({} as never)

    await logAudit({
      entidad: "tarea",
      entidad_id: "task-1",
      accion: "exportar",
      usuario_id: "user-1",
      cambios: { rows: 30, filters: { prioridad: "ALTA" } },
    })

    expect(db.auditoria.create).toHaveBeenCalledWith({
      data: {
        entidad: "tarea",
        entidad_id: "task-1",
        accion: "exportar",
        usuario_id: "user-1",
        cambios: { rows: 30, filters: { prioridad: "ALTA" } },
      },
    })
  })
})
