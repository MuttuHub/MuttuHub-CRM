import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  NotificationPanel,
  type AlertItemNotificacion,
  type NotificationsSnapshot,
} from "./notification-panel"

const { toast, apiDelete, apiPatch, apiGet } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
  apiDelete: vi.fn<(path: string) => Promise<unknown>>(async () => ({})),
  apiPatch: vi.fn<(path: string) => Promise<unknown>>(async () => ({})),
  apiGet: vi.fn<(path: string) => Promise<unknown>>(),
}))

vi.mock("sonner", () => ({ toast }))

vi.mock("@/lib/api/http", () => ({
  apiGet: (path: string) => apiGet(path),
  apiPatch: (path: string) => apiPatch(path),
  apiDelete: (path: string) => apiDelete(path),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const UNREAD_ITEM: AlertItemNotificacion = {
  id: "t-1",
  titulo: "Entrega vencida",
  estado: "EN_CURSO",
  fecha_entrega: "2026-08-01T00:00:00.000Z",
  origen: "KANBAN",
  responsable_id: "u-1",
  responsable_nombre: "Ana",
  cliente_id: null,
  cliente_nombre: null,
  notificacion_id: "n-1",
}

function snapshotWith(leidas_ids: string[]): NotificationsSnapshot {
  return {
    total: 1,
    vencidos: [UNREAD_ITEM],
    hoy: [],
    proximos3: [],
    leidas_ids,
  }
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <NotificationPanel />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // El refetch post-invalidate devuelve el estado "leído" como lo haría el server.
  apiGet.mockImplementation(async () => snapshotWith([]))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("NotificationPanel — undo de marcar todas como leídas", () => {
  it("captures unread ids and offers Deshacer; the action reverts via DELETE per id", async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(await screen.findByRole("button", { name: "Notificaciones, 1 sin leer" }))
    await user.click(screen.getByRole("button", { name: "Marcar todas como leídas" }))

    await waitFor(() => {
      expect(apiPatch).toHaveBeenCalledWith("/api/v1/notifications/read-all")
      expect(toast.success).toHaveBeenCalledWith(
        "Todas las alertas marcadas como leídas.",
        expect.objectContaining({ duration: 5000 }),
      )
    })

    const options = toast.success.mock.calls[0][1] as {
      action: { label: string; onClick: () => void }
    }
    expect(options.action.label).toBe("Deshacer")

    options.action.onClick()

    await waitFor(() => {
      expect(apiDelete).toHaveBeenCalledWith("/api/v1/notifications/n-1/read")
    })
  })

  it("ignores a second click on Deshacer while the revert is pending", async () => {
    const user = userEvent.setup()
    let resolveRevert: (v: unknown) => void = () => {}
    apiDelete.mockImplementation(() => new Promise((resolve) => { resolveRevert = resolve }))

    renderPanel()

    await user.click(await screen.findByRole("button", { name: "Notificaciones, 1 sin leer" }))
    await user.click(screen.getByRole("button", { name: "Marcar todas como leídas" }))

    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    const options = toast.success.mock.calls[0][1] as {
      action: { onClick: () => void }
    }

    options.action.onClick()
    await waitFor(() => expect(apiDelete).toHaveBeenCalledTimes(1))

    options.action.onClick()
    expect(apiDelete).toHaveBeenCalledTimes(1)

    resolveRevert({})
    await waitFor(() => expect(apiDelete).toHaveBeenCalledTimes(1))
  })

  it("shows an error toast when the revert fails", async () => {
    const user = userEvent.setup()
    apiDelete.mockRejectedValue(new Error("network"))

    renderPanel()

    await user.click(await screen.findByRole("button", { name: "Notificaciones, 1 sin leer" }))
    await user.click(screen.getByRole("button", { name: "Marcar todas como leídas" }))

    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    const options = toast.success.mock.calls[0][1] as {
      action: { onClick: () => void }
    }

    options.action.onClick()

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "No pudimos deshacer el cambio. Inténtalo de nuevo.",
      )
    })
  })
})