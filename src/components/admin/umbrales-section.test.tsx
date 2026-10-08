import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/http";
import { PARAMETROS_V2_DEFAULT } from "@/lib/proyectos/semaforo-v2";
import { UmbralesSection } from "./umbrales-section";

const h = vi.hoisted(() => ({
  query: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  save: vi.fn(),
}));

vi.mock("@/hooks/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/admin")>();
  return {
    ...actual,
    useSemaforoParametros: () => h.query,
    useSaveSemaforoParametros: () => ({ mutateAsync: h.save, isPending: false }),
  };
});

describe("UmbralesSection", () => {
  beforeEach(() => {
    h.query.data = structuredClone(PARAMETROS_V2_DEFAULT);
    h.query.isLoading = false;
    h.query.isError = false;
    h.save.mockReset().mockResolvedValue({});
  });

  it("shows the six parameters with a 'No confirmado' badge each", () => {
    render(<UmbralesSection />);

    expect(screen.getAllByText("No confirmado")).toHaveLength(6);
    expect(screen.getByLabelText("Umbral 1 (pp)")).toHaveValue(10);
    expect(screen.getByLabelText("Umbral 2 (pp)")).toHaveValue(20);
    expect(screen.getByLabelText("Tolerancia (%)")).toHaveValue(10);
    expect(screen.getByLabelText("Retraso (%)")).toHaveValue(70);
    expect(screen.getByRole("checkbox", { name: "Avance requiere medio" })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Modificación bloquea periodos pasados" }),
    ).toBeChecked();
  });

  it("disables save until something changes and sends only the changed fields", async () => {
    const user = userEvent.setup();
    render(<UmbralesSection />);
    const save = screen.getByRole("button", { name: /guardar/i });
    expect(save).toBeDisabled();

    const retraso = screen.getByLabelText("Retraso (%)");
    await user.clear(retraso);
    await user.type(retraso, "60");
    await user.click(screen.getByRole("checkbox", { name: "Confirmar Retraso (%)" }));
    await user.click(save);

    expect(h.save).toHaveBeenCalledWith({ retraso: { valor: 60, confirmado: true } });
  });

  it("drops the badge once a parameter is marked as confirmed", async () => {
    const user = userEvent.setup();
    render(<UmbralesSection />);

    await user.click(screen.getByRole("checkbox", { name: "Confirmar Tolerancia (%)" }));

    expect(screen.getAllByText("No confirmado")).toHaveLength(5);
  });

  it("blocks save inline when umbral 1 is not below umbral 2", async () => {
    const user = userEvent.setup();
    render(<UmbralesSection />);

    const u1 = screen.getByLabelText("Umbral 1 (pp)");
    await user.clear(u1);
    await user.type(u1, "25");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(h.save).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("El umbral 1 debe ser menor que el umbral 2.");
  });

  it("blocks save inline for a percentage outside 0-100", async () => {
    const user = userEvent.setup();
    render(<UmbralesSection />);

    const retraso = screen.getByLabelText("Retraso (%)");
    await user.clear(retraso);
    await user.type(retraso, "150");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(h.save).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Retraso (%) debe estar entre 0 y 100.");
  });

  it("shows the server error inline when saving fails", async () => {
    const user = userEvent.setup();
    h.save.mockRejectedValueOnce(new ApiError("No tienes permisos para realizar esta acción.", 403));
    render(<UmbralesSection />);

    await user.click(screen.getByRole("checkbox", { name: "Avance requiere medio" }));
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(h.save).toHaveBeenCalledWith({ avance_requiere_medio: { valor: false } });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No tienes permisos para realizar esta acción.",
    );
  });
});
