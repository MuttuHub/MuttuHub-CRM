// proyecto-legalizacion-tab, Phase 4 (design.md "Registrar gasto" modal,
// spec.md "Registrar gasto crea el soporte en el mismo flujo cuando
// corresponde" — RF-06). Mirrors `entity-dialogs.tsx`'s conventions
// (`formKey`-driven reset-on-open, inline `role="alert"` validation).
//
// design D2 (design.md): "Soporte: ahora" is two SEQUENTIAL client-side
// calls (create gasto, then create soporte), never a combined backend
// endpoint — this file asserts call ORDER, and that a second-call failure
// surfaces an error that does NOT claim the gasto failed (it already
// exists, only the soporte attach step didn't happen).

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LineaOption } from "@/hooks/projects";
import { ExpenseDialog } from "./expense-dialog";

const { createMutation, uploadMutation } = vi.hoisted(() => ({
  createMutation: {
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue({ gasto: { id: "gasto-1" } }),
  },
  uploadMutation: {
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue({ soporte: { id: "sop-1" } }),
  },
}));

vi.mock("@/hooks/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/projects")>();
  return {
    ...actual,
    useCreateExpense: () => createMutation,
    useUploadAttachment: () => uploadMutation,
  };
});

const LINEAS: LineaOption[] = [
  { id: "linea-1", rubro_id: "rubro-1", rubro_nombre: "Personal científico" },
  { id: "linea-2", rubro_id: "rubro-2", rubro_nombre: "Transporte" },
];

beforeEach(() => {
  createMutation.mutateAsync.mockClear();
  createMutation.mutateAsync.mockResolvedValue({ gasto: { id: "gasto-1" } });
  uploadMutation.mutateAsync.mockClear();
  uploadMutation.mutateAsync.mockResolvedValue({ soporte: { id: "sop-1" } });
});

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText(/rubro/i), "linea-1");
  await user.type(screen.getByLabelText(/^concepto/i), "Nómina 1.ª quincena");
  await user.type(screen.getByLabelText(/valor \(cop\)/i), "1000000");
  await user.type(screen.getByLabelText(/^fecha/i), "2026-02-13");
}

describe("ExpenseDialog", () => {
  it("requires Rubro before submitting — no mutation is called without it", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ExpenseDialog projectId="proy-1" lineas={LINEAS} open onOpenChange={onOpenChange} />);

    await user.type(screen.getByLabelText(/^concepto/i), "Nómina");
    await user.type(screen.getByLabelText(/valor \(cop\)/i), "1000000");
    await user.type(screen.getByLabelText(/^fecha/i), "2026-02-13");
    await user.click(screen.getByRole("button", { name: /guardar gasto/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/rubro/i);
    expect(createMutation.mutateAsync).not.toHaveBeenCalled();
  });

  it("creates the gasto without an attachment call when 'después' is chosen", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ExpenseDialog projectId="proy-1" lineas={LINEAS} open onOpenChange={onOpenChange} />);

    await fillRequiredFields(user);
    await user.selectOptions(screen.getByLabelText(/soporte de legalización/i), "despues");
    await user.click(screen.getByRole("button", { name: /guardar gasto/i }));

    await waitFor(() => expect(createMutation.mutateAsync).toHaveBeenCalled());
    expect(createMutation.mutateAsync.mock.calls[0][0]).toMatchObject({
      linea_id: "linea-1",
      concepto: "Nómina 1.ª quincena",
      monto_cop: 1000000,
      fecha_gasto: "2026-02-13",
    });
    expect(uploadMutation.mutateAsync).not.toHaveBeenCalled();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("creates the gasto THEN the attachment, in that order, when 'ahora' is chosen with a valid https link", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ExpenseDialog projectId="proy-1" lineas={LINEAS} open onOpenChange={onOpenChange} />);

    await fillRequiredFields(user);
    // "ahora" is the default option, per the v6 design copy ("Lo adjunto
    // ahora" listed first) — select it explicitly to keep the test
    // resilient to option order.
    await user.selectOptions(screen.getByLabelText(/soporte de legalización/i), "ahora");
    await user.type(
      screen.getByLabelText(/factura, cuenta de cobro o planilla/i),
      "https://drive.google.com/file/d/abc",
    );
    await user.click(screen.getByRole("button", { name: /guardar gasto/i }));

    await waitFor(() => expect(uploadMutation.mutateAsync).toHaveBeenCalled());

    const createOrder = createMutation.mutateAsync.mock.invocationCallOrder[0];
    const uploadOrder = uploadMutation.mutateAsync.mock.invocationCallOrder[0];
    expect(createOrder).toBeLessThan(uploadOrder);

    expect(uploadMutation.mutateAsync.mock.calls[0][0]).toMatchObject({
      tipo: "LEGALIZACION",
      gasto_id: "gasto-1",
      url: "https://drive.google.com/file/d/abc",
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("requires a valid https link when 'ahora' is chosen, without calling either mutation", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ExpenseDialog projectId="proy-1" lineas={LINEAS} open onOpenChange={onOpenChange} />);

    await fillRequiredFields(user);
    await user.selectOptions(screen.getByLabelText(/soporte de legalización/i), "ahora");
    await user.click(screen.getByRole("button", { name: /guardar gasto/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/https/i);
    expect(createMutation.mutateAsync).not.toHaveBeenCalled();
    expect(uploadMutation.mutateAsync).not.toHaveBeenCalled();
  });

  it("surfaces an attachment-only error without claiming the gasto failed, and keeps the dialog open", async () => {
    uploadMutation.mutateAsync.mockRejectedValueOnce(new Error("network error"));
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ExpenseDialog projectId="proy-1" lineas={LINEAS} open onOpenChange={onOpenChange} />);

    await fillRequiredFields(user);
    await user.selectOptions(screen.getByLabelText(/soporte de legalización/i), "ahora");
    await user.type(
      screen.getByLabelText(/factura, cuenta de cobro o planilla/i),
      "https://drive.google.com/file/d/abc",
    );
    await user.click(screen.getByRole("button", { name: /guardar gasto/i }));

    await waitFor(() => expect(uploadMutation.mutateAsync).toHaveBeenCalled());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/gasto/i);
    expect(alert).toHaveTextContent(/guard|creó|registr/i);
    expect(alert.textContent).not.toMatch(/no se pudo (crear|registrar) el gasto/i);
    // Dialog stays open so the user sees the error — the gasto already
    // exists, this is not the "cancel" path.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
