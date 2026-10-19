// v7 alignment, unit C4b: the read-only Relaciones section. These tests pin the
// behaviours the section owes: (1) the four power × interest quadrants group
// contacts deterministically (the pure `quadranteDe` helper owns the threshold),
// (2) the strength indicator reflects `fuerza_relacion` and exposes it to
// assistive tech, (3) the contact list carries the owner ("Relación: …"), the
// rol chip and the strength, and (4) loading / error / empty stay consistent
// with the sibling sections. The feed itself is mocked; C4a owns its contract.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContactoFeedItem } from "@/hooks/crm";
import { FuerzaRelacion, RelacionesVista, quadranteDe } from "./relaciones-vista";

const { useGlobalContactsMock } = vi.hoisted(() => ({
  useGlobalContactsMock: vi.fn(
    (): { data: ContactoFeedItem[]; isLoading: boolean; isError: boolean } => ({
      data: [],
      isLoading: false,
      isError: false,
    }),
  ),
}));

// Keep the real formatters (`iniciales`) and only stub the network hook.
vi.mock("@/hooks/crm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/crm")>();
  return { ...actual, useGlobalContacts: useGlobalContactsMock };
});

function contacto(overrides: Partial<ContactoFeedItem> = {}): ContactoFeedItem {
  return {
    id: "ct-1",
    cliente_id: "c1",
    cliente_nombre: "Alcaldía de Barranquilla",
    nombre: "Laura Gómez",
    cargo: "Secretaria de Gobierno",
    correo: null,
    telefono: null,
    rol_decision: "DECISOR",
    notas: null,
    poder: 5,
    interes: 5,
    fuerza_relacion: 2,
    owner_id: "u1",
    owner_nombre: "Ana Pérez",
    created_at: "2026-01-05T00:00:00.000Z",
    ...overrides,
  };
}

function renderVista() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RelacionesVista />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useGlobalContactsMock.mockReset();
  useGlobalContactsMock.mockReturnValue({ data: [], isLoading: false, isError: false });
});

describe("quadranteDe", () => {
  it("maps the four power × interest corners to their v7 zone", () => {
    expect(quadranteDe(5, 5)).toBe("gestionar-de-cerca");
    expect(quadranteDe(5, 2)).toBe("mantener-satisfecho");
    expect(quadranteDe(2, 5)).toBe("mantener-informado");
    expect(quadranteDe(2, 2)).toBe("monitorear");
  });

  it("uses a top-2-box threshold (4..5 is high, 1..3 is low)", () => {
    expect(quadranteDe(4, 4)).toBe("gestionar-de-cerca");
    expect(quadranteDe(3, 5)).toBe("mantener-informado");
    expect(quadranteDe(5, 3)).toBe("mantener-satisfecho");
    expect(quadranteDe(3, 3)).toBe("monitorear");
  });

  it("returns null when either axis is unset (no quadrant assigned)", () => {
    expect(quadranteDe(null, 5)).toBeNull();
    expect(quadranteDe(5, null)).toBeNull();
    expect(quadranteDe(null, null)).toBeNull();
  });
});

describe("RelacionesVista — mapa de poder e interés", () => {
  it("renders the four v7 zones with their axis descriptors", () => {
    useGlobalContactsMock.mockReturnValue({
      data: [contacto({ poder: 5, interes: 5 })],
      isLoading: false,
      isError: false,
    });
    renderVista();

    expect(screen.getByRole("heading", { name: "Mapa de poder e interés" })).toBeInTheDocument();
    for (const [zone, descriptor] of [
      ["Mantener satisfecho", "Poder alto · interés bajo"],
      ["Gestionar de cerca", "Poder alto · interés alto"],
      ["Monitorear", "Poder bajo · interés bajo"],
      ["Mantener informado", "Poder bajo · interés alto"],
    ] as const) {
      const region = screen.getByRole("region", { name: zone });
      expect(within(region).getByText(descriptor)).toBeInTheDocument();
    }
  });

  it("groups each contact into the quadrant its poder/interes belongs to", () => {
    useGlobalContactsMock.mockReturnValue({
      data: [
        contacto({ id: "a", nombre: "Ana Alta", poder: 5, interes: 5 }),
        contacto({ id: "b", nombre: "Beto Poderoso", poder: 5, interes: 1 }),
        contacto({ id: "c", nombre: "Carla Curiosa", poder: 1, interes: 5 }),
        contacto({ id: "d", nombre: "Dora Tranquila", poder: 1, interes: 1 }),
      ],
      isLoading: false,
      isError: false,
    });

    renderVista();

    expect(
      within(screen.getByRole("region", { name: "Gestionar de cerca" })).getByText("Ana Alta"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Mantener satisfecho" })).getByText(
        "Beto Poderoso",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Mantener informado" })).getByText(
        "Carla Curiosa",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Monitorear" })).getByText("Dora Tranquila"),
    ).toBeInTheDocument();
  });

  it("keeps a contact without quadrant out of the map but in the list", () => {
    useGlobalContactsMock.mockReturnValue({
      data: [contacto({ nombre: "Sin Cuadrante", poder: null, interes: null })],
      isLoading: false,
      isError: false,
    });

    renderVista();

    for (const zone of ["Mantener satisfecho", "Gestionar de cerca", "Monitorear", "Mantener informado"]) {
      expect(
        within(screen.getByRole("region", { name: zone })).queryByText("Sin Cuadrante"),
      ).not.toBeInTheDocument();
    }
    expect(
      within(screen.getByRole("list", { name: "Contactos" })).getByText("Sin Cuadrante"),
    ).toBeInTheDocument();
  });

  it("says a zone is empty instead of rendering nothing", () => {
    useGlobalContactsMock.mockReturnValue({
      data: [contacto({ poder: 5, interes: 5 })],
      isLoading: false,
      isError: false,
    });
    renderVista();

    expect(
      within(screen.getByRole("region", { name: "Gestionar de cerca" })).queryByText(
        "Sin contactos en este cuadrante",
      ),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Monitorear" })).getByText(
        "Sin contactos en este cuadrante",
      ),
    ).toBeInTheDocument();
  });
});

describe("RelacionesVista — lista de contactos", () => {
  it("shows the initials avatar, cargo, owner, rol chip and strength", () => {
    useGlobalContactsMock.mockReturnValue({
      data: [
        contacto({
          nombre: "Laura Gómez",
          cargo: "Secretaria de Gobierno",
          rol_decision: "DECISOR",
          owner_id: "u1",
          owner_nombre: "Ana Pérez",
          fuerza_relacion: 2,
        }),
      ],
      isLoading: false,
      isError: false,
    });

    renderVista();

    const list = screen.getByRole("list", { name: "Contactos" });
    expect(within(list).getByText("Laura Gómez")).toBeInTheDocument();
    expect(within(list).getByText("LG")).toBeInTheDocument();
    expect(within(list).getByText("Secretaria de Gobierno")).toBeInTheDocument();
    expect(within(list).getByText("Relación: Ana Pérez")).toBeInTheDocument();
    expect(within(list).getByText("Decisor")).toBeInTheDocument();
    expect(
      within(list).getByRole("img", { name: "Fuerza de la relación: 2 de 3" }),
    ).toBeInTheDocument();
  });

  it("omits the owner line when owner_id is not set", () => {
    useGlobalContactsMock.mockReturnValue({
      data: [contacto({ owner_id: null, owner_nombre: null })],
      isLoading: false,
      isError: false,
    });

    renderVista();

    expect(screen.queryByText(/^Relación:/)).not.toBeInTheDocument();
  });
});

describe("FuerzaRelacion", () => {
  it("fills one bar per level and names the value for assistive tech", () => {
    const { container } = render(<FuerzaRelacion valor={2} />);

    expect(screen.getByRole("img", { name: "Fuerza de la relación: 2 de 3" })).toBeInTheDocument();
    const bars = container.querySelectorAll("[data-slot='fuerza-bar']");
    expect(bars).toHaveLength(3);
    expect(Array.from(bars).filter((b) => b.getAttribute("data-filled") === "true")).toHaveLength(2);
  });

  it("renders three empty bars and says 'sin definir' when unset", () => {
    const { container } = render(<FuerzaRelacion valor={null} />);

    expect(
      screen.getByRole("img", { name: "Fuerza de la relación: sin definir" }),
    ).toBeInTheDocument();
    const bars = container.querySelectorAll("[data-slot='fuerza-bar']");
    expect(Array.from(bars).filter((b) => b.getAttribute("data-filled") === "true")).toHaveLength(0);
  });
});

describe("RelacionesVista — estados y filtro", () => {
  it("announces loading with a status region", () => {
    useGlobalContactsMock.mockReturnValue({ data: [], isLoading: true, isError: false });
    renderVista();

    expect(screen.getByRole("status", { name: "Cargando relaciones" })).toBeInTheDocument();
  });

  it("shows an alert when the feed fails", () => {
    useGlobalContactsMock.mockReturnValue({ data: [], isLoading: false, isError: true });
    renderVista();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "No pudimos cargar los contactos. Inténtalo de nuevo.",
    );
  });

  it("shows an empty state when there are no contacts", () => {
    renderVista();

    expect(screen.getByText("No hay contactos registrados")).toBeInTheDocument();
  });

  it("filters the map and list by aliado with the v7 filter chips", async () => {
    const user = userEvent.setup();
    useGlobalContactsMock.mockReturnValue({
      data: [
        contacto({ id: "a", cliente_id: "c1", cliente_nombre: "Alcaldía A", nombre: "Ana A" }),
        contacto({ id: "b", cliente_id: "c2", cliente_nombre: "Alcaldía B", nombre: "Beto B" }),
      ],
      isLoading: false,
      isError: false,
    });

    renderVista();

    const chips = screen.getByRole("group", { name: "Filtrar por aliado" });
    expect(within(chips).getByRole("button", { name: "Todos los aliados" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(chips).getByRole("button", { name: "Alcaldía A" })).toBeInTheDocument();
    expect(within(chips).getByRole("button", { name: "Alcaldía B" })).toBeInTheDocument();

    await user.click(within(chips).getByRole("button", { name: "Alcaldía B" }));

    const list = screen.getByRole("list", { name: "Contactos" });
    expect(within(list).getByText("Beto B")).toBeInTheDocument();
    expect(within(list).queryByText("Ana A")).not.toBeInTheDocument();
    expect(within(chips).getByRole("button", { name: "Alcaldía B" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
