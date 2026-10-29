// Access-request queue: the Approve dialog must describe what really happens. A "form" request gets
// an invitation email; a "google" request already has its account, so nothing is sent.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SolicitudesSection, type SolicitudRow } from "./solicitudes-section";

const h = vi.hoisted(() => ({
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: h.refresh }) }));
vi.mock("sonner", () => ({ toast: { success: h.toastSuccess, error: vi.fn() } }));

function solicitud(origen: "form" | "google"): SolicitudRow {
  return {
    id: `s-${origen}`,
    nombre: origen === "google" ? "Ana Google" : "Beto Formulario",
    email: `${origen}@example.com`,
    cargo: null,
    origen,
    estado: "PENDIENTE",
    revisado_por: null,
    revisado_at: null,
    created_at: "2026-10-20T12:00:00.000Z",
  };
}

function renderQueue(origen: "form" | "google") {
  return render(<SolicitudesSection solicitudes={[solicitud(origen)]} unconfigured={false} loadError={false} />);
}

describe("SolicitudesSection approve dialog", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    h.refresh.mockReset();
    h.toastSuccess.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("promises an invitation email for a form request", async () => {
    const user = userEvent.setup();
    renderQueue("form");

    await user.click(screen.getByRole("button", { name: "Aprobar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Aprobar acceso de Beto Formulario" });
    await user.click(within(dialogo).getByRole("button", { name: "Aprobar y enviar invitación" }));

    await waitFor(() => expect(h.toastSuccess).toHaveBeenCalledWith("Solicitud aprobada. La invitación va en camino."));
  });

  it("does not promise an invitation for a Google request, which can sign in right away", async () => {
    const user = userEvent.setup();
    renderQueue("google");

    await user.click(screen.getByRole("button", { name: "Aprobar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Aprobar acceso de Ana Google" });
    expect(within(dialogo).queryByRole("button", { name: /invitación/ })).not.toBeInTheDocument();
    await user.click(within(dialogo).getByRole("button", { name: "Aprobar acceso" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/solicitudes-acceso/s-google/aprobar", expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(h.toastSuccess).toHaveBeenCalledWith("Solicitud aprobada. Ya puede entrar con su cuenta de Google."));
  });
});
