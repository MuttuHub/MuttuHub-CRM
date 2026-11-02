import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogsSection } from "./catalogs-section";

const h = vi.hoisted(() => ({
  snapshot: {
    task_tags: ["Comercial", "Administrativo", "Proyecto", "Interno"],
    doc_categories: [
      { nombre: "Comercial", restringida: false },
      { nombre: "Legal", restringida: true },
    ],
  },
  saveMutate: vi.fn(),
}));

vi.mock("@/hooks/admin", () => ({
  useSettings: () => ({
    data: h.snapshot,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSaveSettings: () => ({ isPending: false, mutate: h.saveMutate }),
}));

afterEach(() => {
  h.saveMutate.mockReset();
});

describe("CatalogsSection — unsaved-changes warning", () => {
  it("does not warn when the draft matches the saved snapshot", () => {
    render(<CatalogsSection />);

    expect(screen.queryByText(/cambios sin guardar/i)).toBeNull();
  });

  it("warns about unsaved changes after adding a tag and enables Guardar cambios", async () => {
    const user = userEvent.setup();
    render(<CatalogsSection />);

    await user.type(screen.getByLabelText("Nueva etiqueta de tarea"), "QA-01");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(screen.getByText(/cambios sin guardar/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /guardar cambios/i })).toBeEnabled();
  });

  it("registers a beforeunload warning while there are unsaved changes", async () => {
    const user = userEvent.setup();
    render(<CatalogsSection />);

    await user.type(screen.getByLabelText("Nueva etiqueta de tarea"), "QA-01");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    const warnEvent = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    Object.defineProperty(warnEvent, "returnValue", { writable: true });
    expect(() => window.dispatchEvent(warnEvent)).not.toThrow();
    expect(warnEvent.defaultPrevented).toBe(true);
  });
});
