import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UsersTable, type UsuarioRow } from "./users-table";

const router = { refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const h = vi.hoisted(() => ({
  resendInvite: vi.fn(),
  resetPassword: vi.fn(),
}));

vi.mock("@/hooks/users", () => ({
  useResendInvite: () => ({ mutateAsync: h.resendInvite }),
  useResetUserPassword: () => ({ mutateAsync: h.resetPassword }),
}));

function usuario(overrides: Partial<UsuarioRow> = {}): UsuarioRow {
  return {
    id: "u1",
    nombre: "Pat García",
    email: "pat@muttu.co",
    rol: "COLABORADOR",
    activo: true,
    gestiona_oportunidades: false,
    puede_ver_tablero_gerencial: false,
    created_at: new Date("2026-01-01"),
    ...overrides,
  };
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, nombre: string) {
  await user.click(screen.getByRole("button", { name: `Acciones de ${nombre}` }));
  // The dropdown content mounts asynchronously (base-ui portal/animation).
  await screen.findByRole("menuitem", { name: /editar nombre/i });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  router.refresh.mockReset();
  h.resendInvite.mockReset();
  h.resetPassword.mockReset();
  fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ usuario: {} }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("UsersTable — edit name", () => {
  it("sends PATCH nombre and refreshes after saving", async () => {
    const user = userEvent.setup();
    render(<UsersTable usuarios={[usuario()]} unconfigured={false} loadError={false} />);

    await openMenu(user, "Pat García");
    await user.click(screen.getByRole("menuitem", { name: /editar nombre/i }));

    const input = screen.getByLabelText(/nombre completo/i);
    await user.clear(input);
    await user.type(input, "Patricia García");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/users/u1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ nombre: "Patricia García" }),
      }),
    );
    expect(router.refresh).toHaveBeenCalled();
  });
});

describe("UsersTable — reactivate", () => {
  it("offers Reactivar instead of Desactivar for an inactive user, and PATCHes activo:true", async () => {
    const user = userEvent.setup();
    render(
      <UsersTable usuarios={[usuario({ activo: false })]} unconfigured={false} loadError={false} />,
    );

    await openMenu(user, "Pat García");
    expect(screen.queryByRole("menuitem", { name: /desactivar/i })).toBeNull();
    await user.click(screen.getByRole("menuitem", { name: /reactivar/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/users/u1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ activo: true }) }),
    );
    expect(router.refresh).toHaveBeenCalled();
  });

  it("keeps offering Desactivar, not Reactivar, for an active user", async () => {
    const user = userEvent.setup();
    render(<UsersTable usuarios={[usuario({ activo: true })]} unconfigured={false} loadError={false} />);

    await openMenu(user, "Pat García");
    expect(screen.getByRole("menuitem", { name: /desactivar/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /reactivar/i })).toBeNull();
  });
});

describe("UsersTable — resend invite / reset password", () => {
  it("shows the generated invite link after Reenviar invitación", async () => {
    h.resendInvite.mockResolvedValue({ inviteUrl: "https://x/auth/confirm?token=abc" });
    const user = userEvent.setup();
    render(<UsersTable usuarios={[usuario()]} unconfigured={false} loadError={false} />);

    await openMenu(user, "Pat García");
    await user.click(screen.getByRole("menuitem", { name: /reenviar invitación/i }));

    expect(h.resendInvite).toHaveBeenCalledWith("u1");
    expect(await screen.findByDisplayValue("https://x/auth/confirm?token=abc")).toBeInTheDocument();
  });

  it("shows the generated recovery link after Restablecer contraseña", async () => {
    h.resetPassword.mockResolvedValue({ resetUrl: "https://x/auth/reset-password/confirm?token=abc" });
    const user = userEvent.setup();
    render(<UsersTable usuarios={[usuario()]} unconfigured={false} loadError={false} />);

    await openMenu(user, "Pat García");
    await user.click(screen.getByRole("menuitem", { name: /restablecer contraseña/i }));

    expect(h.resetPassword).toHaveBeenCalledWith("u1");
    expect(
      await screen.findByDisplayValue("https://x/auth/reset-password/confirm?token=abc"),
    ).toBeInTheDocument();
  });
});
