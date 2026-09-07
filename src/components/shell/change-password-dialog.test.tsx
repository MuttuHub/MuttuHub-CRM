import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChangePasswordDialog } from "./change-password-dialog";

const { toast } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  { current = "old12345", next = "new12345", confirm = "new12345" } = {},
) {
  await user.type(screen.getByLabelText("Contraseña actual"), current);
  await user.type(screen.getByLabelText("Contraseña nueva"), next);
  await user.type(screen.getByLabelText("Confirmar contraseña nueva"), confirm);
  await user.click(screen.getByRole("button", { name: /actualizar contraseña/i }));
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ChangePasswordDialog", () => {
  it("renders nothing when closed", () => {
    render(<ChangePasswordDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByText("Cambiar contraseña")).not.toBeInTheDocument();
  });

  it("rejects a new password that does not meet the policy without calling the API", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordDialog open onOpenChange={vi.fn()} />);

    await fillAndSubmit(user, { next: "short", confirm: "short" });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Mínimo 8 caracteres, con letras y números.",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects mismatched new-password confirmation without calling the API", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordDialog open onOpenChange={vi.fn()} />);

    await fillAndSubmit(user, { next: "new12345", confirm: "different1" });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Las contraseñas nuevas no coinciden.",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("submits currentPassword/newPassword, toasts success and closes on success", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, message: "Contraseña actualizada correctamente." }), {
        status: 200,
      }),
    );
    render(<ChangePasswordDialog open onOpenChange={onOpenChange} />);

    await fillAndSubmit(user);

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/auth/change-password",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ currentPassword: "old12345", newPassword: "new12345" }),
      }),
    );
    await screen.findByRole("button", { name: /actualizar contraseña/i });
    expect(toast.success).toHaveBeenCalledWith("Contraseña actualizada correctamente.");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // Regression: Cancelar used to call the raw onOpenChange(false) prop
  // directly, bypassing reset() — since the dialog stays mounted inside
  // UserMenu, typed passwords survived a Cancel and were still there next
  // time the (still-mounted) dialog reopened.
  it("clears typed passwords on Cancelar, even after the dialog reopens later", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { rerender } = render(<ChangePasswordDialog open onOpenChange={onOpenChange} />);

    await user.type(screen.getByLabelText("Contraseña actual"), "old12345");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);

    // The parent keeps ChangePasswordDialog mounted and just flips `open`
    // back to true later (same as UserMenu does) — simulate that here.
    rerender(<ChangePasswordDialog open onOpenChange={onOpenChange} />);

    expect(screen.getByLabelText("Contraseña actual")).toHaveValue("");
  });

  it("shows the backend error (e.g. wrong current password) and keeps the dialog open", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "La contraseña actual no es correcta." }), {
        status: 400,
      }),
    );
    render(<ChangePasswordDialog open onOpenChange={onOpenChange} />);

    await fillAndSubmit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La contraseña actual no es correcta.",
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
