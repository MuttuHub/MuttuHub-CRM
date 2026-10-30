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
    useClientOptions: () => ({ data: [{ id: "cli-1", nombre: "Acme" }] }),
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


/* ── Lane 1, task 1.3 (S3, S5): upload into the open folder, several files ── */

async function pickCategoria(user: ReturnType<typeof userEvent.setup>) {
  await user.click(categoriaTrigger())
  await user.click(await screen.findByRole("option", { name: "Comercial" }))
}

describe("UploadDocumentDialog — destination folder (S3)", () => {
  beforeEach(() => {
    uploadMutation.mutateAsync.mockReset()
    uploadMutation.mutateAsync.mockResolvedValue({ id: "doc-new", version: 1 })
  })

  it("uploads into the open folder and says where the document goes", async () => {
    const user = userEvent.setup()
    render(
      <UploadDocumentDialog
        open
        onOpenChange={vi.fn()}
        folder={{ id: "carpeta-1", nombre: "Contratos", cliente_id: null }}
      />,
    )

    expect(screen.getByText(/Se guardará en la carpeta «Contratos»/)).toBeInTheDocument()
    await fillAndSubmit(user)

    expect(uploadMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ carpeta_id: "carpeta-1", titulo: "informe" }),
    )
  })

  it("a client folder links its client: the client field is fixed and no other client is sent", async () => {
    const user = userEvent.setup()
    render(
      <UploadDocumentDialog
        open
        onOpenChange={vi.fn()}
        prefilledClienteId="otro-cliente"
        folder={{ id: "carpeta-9", nombre: "Acme", cliente_id: "cli-1" }}
      />,
    )

    expect(screen.getByText(/Se vincula a Acme, el cliente de esta carpeta/)).toBeInTheDocument()
    await fillAndSubmit(user)

    const input = uploadMutation.mutateAsync.mock.calls[0]![0]
    expect(input.carpeta_id).toBe("carpeta-9")
    expect(input).not.toHaveProperty("cliente_id")
  })

  // Existing behavior: with no folder open the document still lands in «Todas».
  it("without a folder sends no carpeta_id (lands in «Todas») and keeps the client prefill", async () => {
    const user = userEvent.setup()
    render(<UploadDocumentDialog open onOpenChange={vi.fn()} prefilledClienteId="cli-1" />)

    expect(screen.queryByText(/Se guardará en la carpeta/)).not.toBeInTheDocument()
    await fillAndSubmit(user)

    const input = uploadMutation.mutateAsync.mock.calls[0]![0]
    expect(input).not.toHaveProperty("carpeta_id")
    expect(input.cliente_id).toBe("cli-1")
  })
})

describe("UploadDocumentDialog — several dropped files (S5)", () => {
  const A = new File(["a"], "acta.pdf", { type: "application/pdf" })
  const B = new File(["b"], "balance.pdf", { type: "application/pdf" })

  beforeEach(() => {
    uploadMutation.mutateAsync.mockReset()
  })

  it("uploads every dropped file into the folder, each titled after its file", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onSaved = vi.fn()
    uploadMutation.mutateAsync.mockResolvedValue({ id: "doc-new", version: 1 })
    render(
      <UploadDocumentDialog
        open
        onOpenChange={onOpenChange}
        onSaved={onSaved}
        initialFiles={[A, B]}
        folder={{ id: "carpeta-9", nombre: "Acme", cliente_id: "cli-1" }}
      />,
    )

    expect(screen.getByText("acta.pdf")).toBeInTheDocument()
    expect(screen.getByText("balance.pdf")).toBeInTheDocument()
    expect(screen.queryByLabelText(/Título/)).not.toBeInTheDocument()
    await pickCategoria(user)
    await user.click(screen.getByRole("button", { name: "Subir 2 documentos" }))

    expect(uploadMutation.mutateAsync).toHaveBeenCalledTimes(2)
    expect(uploadMutation.mutateAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ file: A, titulo: "acta", categoria: "Comercial", carpeta_id: "carpeta-9" }),
    )
    expect(uploadMutation.mutateAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ file: B, titulo: "balance", carpeta_id: "carpeta-9" }),
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onSaved).toHaveBeenCalled()
  })

  it("leaves out files the app does not accept and says why", () => {
    const exe = new File(["x"], "virus.exe", { type: "application/x-msdownload" })
    render(<UploadDocumentDialog open onOpenChange={vi.fn()} initialFiles={[A, exe, B]} />)

    expect(screen.getByRole("alert")).toHaveTextContent(/No se pueden subir: virus\.exe/)
    expect(screen.queryByText("virus.exe", { exact: true })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Subir 2 documentos" })).toBeInTheDocument()
  })

  it("a duplicate title in the batch keeps the dialog open and can be created apart", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    uploadMutation.mutateAsync
      .mockResolvedValueOnce({ id: "doc-a", version: 1 })
      .mockRejectedValueOnce(new DocumentDuplicateTitleError({ id: "doc-old", titulo: "balance" }))
      .mockResolvedValueOnce({ id: "doc-b", version: 1 })
    render(<UploadDocumentDialog open onOpenChange={onOpenChange} initialFiles={[A, B]} />)

    await pickCategoria(user)
    await user.click(screen.getByRole("button", { name: "Subir 2 documentos" }))

    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByText(/Ya existen documentos con estos títulos: balance/)).toBeInTheDocument()
    expect(screen.queryByText("acta.pdf")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Crear aparte" }))

    expect(uploadMutation.mutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ file: B, titulo: "balance", force: true }),
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
