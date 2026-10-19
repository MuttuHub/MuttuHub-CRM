// v7 alignment, unit C5b: the read-only "Salud de la cartera" section. These
// tests pin the behaviours the section owes: the portfolio summary (total +
// per-bucket counts, "Sin datos" only when > 0, average), the ranked list in the
// exact order the endpoint returns (worst first), the "Sin datos" row, the
// click-through that opens the aliado, and the loading / error / empty states
// shared with the sibling sections. The score contract itself is C5a's; the feed
// is mocked here.

import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SaludCartera, SaludCarteraData, SaludClienteRow } from "@/hooks/crm";
import { BUCKETS, SaludVista, formatearPuntaje, resumenCartera } from "./salud-vista";

const { useSaludCarteraMock } = vi.hoisted(() => ({
  useSaludCarteraMock: vi.fn(
    (): { data: SaludCarteraData | undefined; isLoading: boolean; isError: boolean } => ({
      data: undefined,
      isLoading: false,
      isError: false,
    }),
  ),
}));

// Keep the real formatters and only stub the network hook.
vi.mock("@/hooks/crm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/crm")>();
  return { ...actual, useSaludCartera: useSaludCarteraMock };
});

// jsdom cannot run Next's router; a plain anchor keeps the link semantics.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function fila(overrides: Partial<SaludClienteRow> = {}): SaludClienteRow {
  return {
    cliente_id: "c1",
    cliente_nombre: "Alcaldía A",
    score: 21.3,
    bucket: "RIESGO",
    subscores: { contacto: 21.3, compromisos: null, proyectos: 20 },
    motivo: "Proyectos en rojo",
    ...overrides,
  };
}

function cartera(overrides: Partial<SaludCartera> = {}): SaludCartera {
  return { sana: 0, atencion: 0, riesgo: 0, sin_datos: 0, total: 0, promedio: null, ...overrides };
}

function conDatos(data: SaludCarteraData) {
  useSaludCarteraMock.mockReturnValue({ data, isLoading: false, isError: false });
}

beforeEach(() => {
  useSaludCarteraMock.mockReset();
  useSaludCarteraMock.mockReturnValue({ data: undefined, isLoading: false, isError: false });
});

describe("resumenCartera", () => {
  it("lists the four buckets in order and hides Sin datos at zero", () => {
    const items = resumenCartera(cartera({ sana: 2, atencion: 1, riesgo: 3, sin_datos: 0 }));
    expect(items.map((i) => [i.label, i.valor])).toEqual([
      ["Sana", 2],
      ["Atención", 1],
      ["En riesgo", 3],
    ]);
  });

  it("keeps Sin datos when at least one aliado has no data", () => {
    const items = resumenCartera(cartera({ sana: 0, atencion: 0, riesgo: 0, sin_datos: 1 }));
    expect(items.map((i) => i.label)).toEqual(["Sana", "Atención", "En riesgo", "Sin datos"]);
  });
});

describe("BUCKETS / formatearPuntaje", () => {
  it("labels every bucket with a tone (never colour alone) and a progress band", () => {
    expect(BUCKETS.SANA).toMatchObject({ label: "Sana", band: "verde" });
    expect(BUCKETS.ATENCION).toMatchObject({ label: "Atención", band: "amarillo" });
    expect(BUCKETS.RIESGO).toMatchObject({ label: "En riesgo", band: "rojo" });
    expect(BUCKETS.SIN_DATOS).toMatchObject({ label: "Sin datos", band: null });
  });

  it("formats a score or falls back to 'Sin datos'", () => {
    expect(formatearPuntaje(null)).toBe("Sin datos");
    expect(formatearPuntaje(90.7)).toBe(new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(90.7));
  });
});

describe("SaludVista — resumen de la cartera", () => {
  it("shows the total, the per-bucket counts and the average", () => {
    conDatos({
      clientes: [
        fila({ cliente_id: "c1", cliente_nombre: "Ana", bucket: "RIESGO", score: 21.3 }),
        fila({ cliente_id: "c2", cliente_nombre: "Beto", bucket: "SANA", score: 90.7, motivo: "Sin señales de riesgo" }),
      ],
      cartera: cartera({ sana: 1, atencion: 0, riesgo: 1, sin_datos: 0, total: 2, promedio: 56 }),
    });
    render(<SaludVista />);

    expect(screen.getByRole("heading", { name: "Salud de la cartera" })).toBeInTheDocument();
    const resumen = screen.getByRole("list", { name: "Resumen por estado" });
    expect(within(resumen).getByText("Aliados").closest("li")).toHaveTextContent("2");

    const sana = within(resumen).getByText("Sana").closest("li")!;
    expect(sana).toHaveTextContent("1");
    const riesgo = within(resumen).getByText("En riesgo").closest("li")!;
    expect(riesgo).toHaveTextContent("1");

    // No aliado is dataless, so the tile is not rendered at all.
    expect(within(resumen).queryByText("Sin datos")).not.toBeInTheDocument();
    // The average is shown with the shared formatter.
    expect(screen.getByText(formatearPuntaje(56))).toBeInTheDocument();
  });

  it("shows the Sin datos tile only when some aliado has no data", () => {
    conDatos({
      clientes: [fila({ cliente_id: "c1", cliente_nombre: "Ana", bucket: "RIESGO", score: 21.3 })],
      cartera: cartera({ sana: 0, atencion: 0, riesgo: 1, sin_datos: 1, total: 2, promedio: 21.3 }),
    });
    render(<SaludVista />);

    const resumen = screen.getByRole("list", { name: "Resumen por estado" });
    const sin = within(resumen).getByText("Sin datos").closest("li")!;
    expect(sin).toHaveTextContent("1");
  });
});

describe("SaludVista — lista ordenada", () => {
  it("keeps the endpoint order (worst first) instead of re-sorting", () => {
    conDatos({
      clientes: [
        fila({ cliente_id: "c-riesgo", cliente_nombre: "Zeta", bucket: "RIESGO", score: 10, motivo: "Proyectos en rojo" }),
        fila({ cliente_id: "c-atencion", cliente_nombre: "Alfa", bucket: "ATENCION", score: 60, motivo: "Sin interacciones hace 40 días" }),
        fila({ cliente_id: "c-sana", cliente_nombre: "Beta", bucket: "SANA", score: 95, motivo: "Sin señales de riesgo" }),
      ],
      cartera: cartera({ sana: 1, atencion: 1, riesgo: 1, total: 3, promedio: 55 }),
    });
    render(<SaludVista />);

    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"))
      .filter((href) => href?.startsWith("/clientes?cliente="));

    expect(hrefs).toEqual([
      "/clientes?cliente=c-riesgo",
      "/clientes?cliente=c-atencion",
      "/clientes?cliente=c-sana",
    ]);
  });

  it("labels each row with its bucket name and score, never colour alone", () => {
    conDatos({
      clientes: [
        fila({ cliente_id: "c1", cliente_nombre: "Ana", bucket: "RIESGO", score: 21.3, motivo: "Proyectos en rojo" }),
      ],
      cartera: cartera({ riesgo: 1, total: 1, promedio: 21.3 }),
    });
    render(<SaludVista />);

    const link = screen.getByRole("link", { name: /Ana/ });
    expect(within(link).getByText("En riesgo")).toBeInTheDocument();
    expect(within(link).getByText("Proyectos en rojo")).toBeInTheDocument();
    expect(
      within(link).getByRole("progressbar", { name: /Ana.*En riesgo/ }),
    ).toHaveAttribute("aria-valuenow", "21.3");
  });

  it("renders a Sin datos row with its motivo and a link to the aliado", () => {
    conDatos({
      clientes: [
        fila({
          cliente_id: "c-sin",
          cliente_nombre: "Sin Datos S.A.",
          score: null,
          bucket: "SIN_DATOS",
          subscores: { contacto: null, compromisos: null, proyectos: null },
          motivo: "Sin datos suficientes",
        }),
      ],
      cartera: cartera({ sin_datos: 1, total: 1, promedio: null }),
    });
    render(<SaludVista />);

    const link = screen.getByRole("link", { name: /Sin Datos S.A./ });
    expect(link).toHaveAttribute("href", "/clientes?cliente=c-sin");
    // The bucket chip and the score both read "Sin datos".
    expect(within(link).getAllByText("Sin datos")).toHaveLength(2);
    expect(within(link).getByText("Sin datos suficientes")).toBeInTheDocument();
  });

  it("shows 'Sin datos' as the average when there are no scored aliados", () => {
    conDatos({
      clientes: [fila({ cliente_id: "c-sin", cliente_nombre: "Ana", score: null, bucket: "SIN_DATOS" })],
      cartera: cartera({ sin_datos: 1, total: 1, promedio: null }),
    });
    render(<SaludVista />);

    const promedio = screen.getByText(/Promedio/).closest("p")!;
    expect(promedio).toHaveTextContent("Sin datos");
  });
});

describe("SaludVista — estados", () => {
  it("announces loading with a status region", () => {
    useSaludCarteraMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<SaludVista />);

    expect(screen.getByRole("status", { name: "Cargando salud de la cartera" })).toBeInTheDocument();
  });

  it("shows an alert when the read fails", () => {
    useSaludCarteraMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<SaludVista />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "No pudimos cargar la salud de la cartera. Inténtalo de nuevo.",
    );
  });

  it("shows an empty state when there are no aliados", () => {
    conDatos({ clientes: [], cartera: cartera({ total: 0, promedio: null }) });
    render(<SaludVista />);

    expect(screen.getByText("Aún no hay aliados para medir")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Salud de la cartera" })).not.toBeInTheDocument();
  });
});
