import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DocumentDetail } from "@/hooks/documents"
import { DocumentDialog } from "./document-dialog"

// Lane 1, task 1.5 (S7): modal UX review of the «Subir nueva versión» dialog.

const { versionUpload } = vi.hoisted(() => ({
  versionUpload: { isPending: false, mutateAsync: vi.fn() },
}))

const DETAIL: DocumentDetail = {
  id: "doc-1",
  titulo: "Informe final",
  categoria: "Comercial",
  etiquetas: [],
  autor_id: "u1",
  autor_nombre: "Ana",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: null,
  cliente_ids: [],
  clientes: [],
  version_activa: null,
  versiones: [],
  versiones_count: 0,
}

vi.mock("@/hooks/documents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/documents")>()
  return {
    ...actual,
    useDocument: () => ({ data: DETAIL }),
    useDocumentVersions: () => ({ data: [] }),
    useDeleteDocument: () => ({ isPending: false, mutateAsync: vi.fn() }),
    useUploadVersion: () => versionUpload,
  }
})

const FILE = new File(["v2"], "informe-v2.pdf", { type: "application/pdf" })

function versionDialog() {
  return screen.getByRole("dialog", { name: "Subir nueva versión" })
}

describe("DocumentDialog — «Subir nueva versión» (1.5)", () => {
  beforeEach(() => {
    versionUpload.isPending = false
    versionUpload.mutateAsync.mockReset()
  })

  it("locks Cancelar while the new version is uploading", async () => {
    const user = userEvent.setup()
    render(<DocumentDialog documentId="doc-1" onClose={vi.fn()} />)
    await user.click(screen.getByRole("button", { name: "Subir nueva versión" }))

    versionUpload.isPending = true
    const input = versionDialog().querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, FILE)

    expect(within(versionDialog()).getByRole("button", { name: "Subiendo…" })).toBeDisabled()
    expect(within(versionDialog()).getByRole("button", { name: "Cancelar" })).toBeDisabled()
  })

  it("closing with the X forgets the chosen file, like Cancelar does", async () => {
    const user = userEvent.setup()
    render(<DocumentDialog documentId="doc-1" onClose={vi.fn()} />)
    await user.click(screen.getByRole("button", { name: "Subir nueva versión" }))
    const input = versionDialog().querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, FILE)
    expect(within(versionDialog()).getByText("informe-v2.pdf")).toBeInTheDocument()

    await user.click(within(versionDialog()).getByRole("button", { name: "Cerrar" }))
    await user.click(screen.getByRole("button", { name: "Subir nueva versión" }))

    expect(within(versionDialog()).queryByText("informe-v2.pdf")).not.toBeInTheDocument()
    expect(within(versionDialog()).getByRole("button", { name: "Subir versión" })).toBeDisabled()
  })

  it("Cancelar still closes the dialog without uploading", async () => {
    const user = userEvent.setup()
    render(<DocumentDialog documentId="doc-1" onClose={vi.fn()} />)
    await user.click(screen.getByRole("button", { name: "Subir nueva versión" }))

    await user.click(within(versionDialog()).getByRole("button", { name: "Cancelar" }))

    expect(screen.queryByRole("dialog", { name: "Subir nueva versión" })).not.toBeInTheDocument()
    expect(versionUpload.mutateAsync).not.toHaveBeenCalled()
  })
})
