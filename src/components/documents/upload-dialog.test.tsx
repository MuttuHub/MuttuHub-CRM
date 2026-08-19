import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DocumentDuplicateTitleError } from "@/hooks/documents"
import { UploadDocumentDialog } from "./upload-dialog"

// QA audit finding #4: uploading a document with an existing title used to
// silently create a duplicate. The dialog now surfaces the conflict and lets
// the user choose between versioning the existing document or creating a
// separate one.

const { uploadMutation, versionUploadMutation } = vi.hoisted(() => ({
  uploadMutation: { isPending: false, mutateAsync: vi.fn() },
  versionUploadMutation: { isPending: false, mutateAsync: vi.fn() },
}))

vi.mock("@/hooks/documents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/documents")>()
  return {
    ...actual,
    useDocCategories: () => ({ data: [{ nombre: "Comercial", restringida: false }] }),
    useUploadDocument: () => uploadMutation,
    useUploadVersion: () => versionUploadMutation,
  }
})

vi.mock("@/hooks/kanban", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/kanban")>()
  return {
    ...actual,
    useClientOptions: () => ({ data: [] }),
  }
})

const FILE = new File(["contenido"], "informe.pdf", { type: "application/pdf" })

function categoriaTrigger() {
  return screen
    .getAllByRole("combobox")
    .find((cb) => cb.textContent?.includes("Selecciona una categoría"))!
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  await user.upload(input, FILE)
  await user.click(categoriaTrigger())
  await user.click(await screen.findByRole("option", { name: "Comercial" }))
  await user.click(screen.getByRole("button", { name: "Subir" }))
}

describe("UploadDocumentDialog — duplicate title (QA audit finding #4)", () => {
  beforeEach(() => {
    uploadMutation.mutateAsync.mockReset()
    versionUploadMutation.mutateAsync.mockReset()
  })

  it("shows the conflict banner instead of creating a duplicate", async () => {
    const user = userEvent.setup()
    uploadMutation.mutateAsync.mockRejectedValueOnce(
      new DocumentDuplicateTitleError({ id: "doc-existing", titulo: "Informe final" }),
    )
    render(<UploadDocumentDialog open onOpenChange={vi.fn()} />)

    await fillAndSubmit(user)

    expect(
      screen.getByText(/Ya existe un documento llamado/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Informe final/)).toBeInTheDocument()
  })

  it("uploads as a new version of the existing document when chosen", async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    const onOpenChange = vi.fn()
    uploadMutation.mutateAsync.mockRejectedValueOnce(
      new DocumentDuplicateTitleError({ id: "doc-existing", titulo: "Informe final" }),
    )
    versionUploadMutation.mutateAsync.mockResolvedValueOnce({ version: 2 })
    render(<UploadDocumentDialog open onOpenChange={onOpenChange} onSaved={onSaved} />)

    await fillAndSubmit(user)
    await user.click(screen.getByRole("button", { name: "Subir como nueva versión" }))

    expect(versionUploadMutation.mutateAsync).toHaveBeenCalledWith({ file: FILE })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onSaved).toHaveBeenCalled()
  })

  it("creates a separate document with force=true when chosen", async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    uploadMutation.mutateAsync
      .mockRejectedValueOnce(
        new DocumentDuplicateTitleError({ id: "doc-existing", titulo: "Informe final" }),
      )
      .mockResolvedValueOnce({ id: "doc-new", version: 1 })
    render(<UploadDocumentDialog open onOpenChange={vi.fn()} onSaved={onSaved} />)

    await fillAndSubmit(user)
    await user.click(screen.getByRole("button", { name: "Crear aparte" }))

    expect(uploadMutation.mutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ force: true }),
    )
    expect(onSaved).toHaveBeenCalled()
  })
})
