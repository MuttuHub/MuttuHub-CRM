import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { FolderNode } from "@/hooks/documents"
import { CreateFolderDialog, MoveFolderDialog, RenameFolderDialog } from "./folder-dialogs"

// Lane 1, task 1.5 (S7): modal UX review of the folder dialogs.

const { createMutation, updateMutation } = vi.hoisted(() => ({
  createMutation: { isPending: false, mutateAsync: vi.fn() },
  updateMutation: { isPending: false, mutateAsync: vi.fn() },
}))

vi.mock("@/hooks/documents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/documents")>()
  return {
    ...actual,
    useCreateFolder: () => createMutation,
    useUpdateFolder: () => updateMutation,
  }
})

const FOLDER: FolderNode = {
  id: "f-1",
  nombre: "Contratos",
  parent_id: null,
  cliente_id: null,
  created_at: "2026-01-01",
  documentos_count: 0,
  hijos: [],
}

describe("folder dialogs — modal review (1.5)", () => {
  beforeEach(() => {
    createMutation.isPending = false
    createMutation.mutateAsync.mockReset()
    updateMutation.isPending = false
    updateMutation.mutateAsync.mockReset()
  })

  it("Enter does not create the folder a second time while the first request is in flight", async () => {
    const user = userEvent.setup()
    createMutation.isPending = true
    render(<CreateFolderDialog open onOpenChange={vi.fn()} defaultParentId={null} folders={[]} clientes={[]} />)

    await user.type(screen.getByLabelText("Nombre"), "Actas{Enter}")

    expect(createMutation.mutateAsync).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled()
  })

  it("Enter still creates the folder when nothing is in flight", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    createMutation.mutateAsync.mockResolvedValueOnce({ carpeta: FOLDER })
    render(<CreateFolderDialog open onOpenChange={onOpenChange} defaultParentId={null} folders={[]} clientes={[]} />)

    await user.type(screen.getByLabelText("Nombre"), "Actas{Enter}")

    expect(createMutation.mutateAsync).toHaveBeenCalledWith({
      nombre: "Actas",
      parent_id: null,
      cliente_id: null,
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("creating a folder with a client links it via cliente_id", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    createMutation.mutateAsync.mockResolvedValueOnce({ carpeta: FOLDER })
    render(
      <CreateFolderDialog
        open
        onOpenChange={onOpenChange}
        defaultParentId={null}
        folders={[]}
        clientes={[{ id: "cli-1", nombre: "Acme" }]}
      />,
    )

    await user.type(screen.getByLabelText("Nombre"), "Acme")
    await user.click(screen.getByRole("combobox", { name: "Cliente" }))
    await user.click(await screen.findByRole("option", { name: "Acme" }))
    await user.click(screen.getByRole("button", { name: "Crear carpeta" }))

    expect(createMutation.mutateAsync).toHaveBeenCalledWith({
      nombre: "Acme",
      parent_id: null,
      cliente_id: "cli-1",
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("a failed create keeps the dialog open (the hook already toasts the error)", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    createMutation.mutateAsync.mockRejectedValueOnce(new Error("Ya existe una carpeta con ese nombre."))
    render(<CreateFolderDialog open onOpenChange={onOpenChange} defaultParentId={null} folders={[]} clientes={[]} />)

    await user.type(screen.getByLabelText("Nombre"), "Actas")
    await user.click(screen.getByRole("button", { name: "Crear carpeta" }))

    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText("Nombre")).toHaveValue("Actas")
  })

  it("creating a subfolder can be redirected to the repository root", async () => {
    const user = userEvent.setup()
    createMutation.mutateAsync.mockResolvedValueOnce({ carpeta: FOLDER })
    render(
      <CreateFolderDialog
        open
        onOpenChange={vi.fn()}
        defaultParentId="f-1"
        folders={[FOLDER]}
        clientes={[]}
      />,
    )

    await user.type(screen.getByLabelText("Nombre"), "Suelta")
    await user.click(screen.getByRole("combobox", { name: "Dentro de" }))
    await user.click(await screen.findByRole("option", { name: "Raíz del repositorio" }))
    expect(screen.getByRole("combobox", { name: "Dentro de" })).toHaveTextContent(
      "Raíz del repositorio",
    )
    await user.click(screen.getByRole("button", { name: "Crear carpeta" }))

    expect(createMutation.mutateAsync).toHaveBeenCalledWith({
      nombre: "Suelta",
      parent_id: null,
      cliente_id: null,
    })
  })

  it("refuses to create a folder with a sibling's name at the same level", async () => {
    const user = userEvent.setup()
    render(
      <CreateFolderDialog
        open
        onOpenChange={vi.fn()}
        defaultParentId={null}
        folders={[FOLDER]}
        clientes={[]}
      />,
    )

    await user.type(screen.getByLabelText("Nombre"), "  contratos ")
    await user.click(screen.getByRole("button", { name: "Crear carpeta" }))

    expect(createMutation.mutateAsync).not.toHaveBeenCalled()
    expect(screen.getByLabelText("Nombre")).toHaveValue("  contratos ")
  })

  it("moving a folder to the repository root selects the root and sends parent_id null", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    updateMutation.mutateAsync.mockResolvedValueOnce({ carpeta: FOLDER })
    const child: FolderNode = {
      ...FOLDER,
      id: "f-2",
      nombre: "Propuestas",
      parent_id: "f-1",
    }
    render(
      <MoveFolderDialog
        open
        onOpenChange={onOpenChange}
        folder={child}
        folders={[{ ...FOLDER, hijos: [child] }]}
      />,
    )

    await user.click(screen.getByRole("combobox", { name: "Destino" }))
    await user.click(await screen.findByRole("option", { name: "Raíz del repositorio" }))
    expect(screen.getByRole("combobox", { name: "Destino" })).toHaveTextContent(
      "Raíz del repositorio",
    )
    await user.click(screen.getByRole("button", { name: "Mover" }))

    expect(updateMutation.mutateAsync).toHaveBeenCalledWith({ id: "f-2", parent_id: null })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("Enter does not rename twice while the first request is in flight", async () => {
    const user = userEvent.setup()
    updateMutation.isPending = true
    render(<RenameFolderDialog open onOpenChange={vi.fn()} folder={FOLDER} />)

    await user.type(screen.getByLabelText("Nombre"), " 2026{Enter}")

    expect(updateMutation.mutateAsync).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled()
  })
})
