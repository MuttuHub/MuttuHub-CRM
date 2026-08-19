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
})
