import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { DocumentDialog } from "./document-dialog"

const activa = {
  version_id: "v2",
  numero_version: 2,
  tamano_bytes: 2048,
  tipo_archivo: "application/pdf",
  created_at: "2026-02-01T00:00:00Z",
  subido_por_id: "u1",
  subido_por_nombre: "Ana",
}

vi.mock("@/hooks/documents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/documents")>()
  return {
    ...actual,
    useDocument: () => ({
      data: {
        id: "d1",
        titulo: "Contrato marco",
        categoria: "Contratos",
        etiquetas: [],
        autor_id: "u1",
        autor_nombre: "Ana",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: null,
        cliente_ids: [],
        clientes: [],
        version_activa: activa,
        versiones: [],
      },
    }),
    useDocumentVersions: () => ({
      isLoading: false,
      data: [
        { id: "v2", documento_id: "d1", ...activa },
        { id: "v1", documento_id: "d1", ...activa, numero_version: 1 },
      ],
    }),
    useDeleteDocument: () => ({ isPending: false, mutateAsync: vi.fn() }),
    useUploadVersion: () => ({ isPending: false, mutateAsync: vi.fn() }),
  }
})

describe("DocumentDialog v6 restyle", () => {
  it("uses the 44px default size for the primary actions", () => {
    render(<DocumentDialog documentId="d1" onClose={vi.fn()} />)
    for (const name of [/^Descargar v2$/, "Subir nueva versión"]) {
      const btn = screen.getByRole("button", { name })
      expect(btn).toHaveClass("h-11")
      expect(btn).not.toHaveClass("h-9")
    }
  })

  it("renders the category and the active version through StatusChip", async () => {
    const user = userEvent.setup()
    render(<DocumentDialog documentId="d1" onClose={vi.fn()} />)
    expect(screen.getByText("Contratos").closest('[data-slot="status-chip"]')).toHaveAttribute(
      "data-tone",
      "neutro",
    )
    await user.click(screen.getByRole("button", { name: /Versiones/ }))
    expect(screen.getByText("Activa").closest('[data-slot="status-chip"]')).toHaveAttribute(
      "data-tone",
      "exito",
    )
  })

  it("lists versions in a list with mono metadata", async () => {
    const user = userEvent.setup()
    render(<DocumentDialog documentId="d1" onClose={vi.fn()} />)
    await user.click(screen.getByRole("button", { name: /Versiones/ }))
    expect(screen.getByRole("list")).toBeInTheDocument()
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    for (const size of screen.getAllByText("2 KB")) expect(size).toHaveClass("font-mono")
  })
})
