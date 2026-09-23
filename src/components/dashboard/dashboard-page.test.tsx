// tablero-seguimiento-social, Fase 4c (4c.4): el shell del dashboard expone
// la quinta cara "Tablero gerencial" en el arreglo `CARAS` y la monta al
// seleccionarla, junto a las otras cuatro. Las caras se mockean para aislar
// el cableado del shell (spec.md "Integración en el shell existente").

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/crm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/crm")>();
  return { ...actual, useUsers: () => ({ data: [] }) };
});

vi.mock("@/components/dashboard/cara-pipeline", () => ({
  CaraPipeline: () => <div>cara-pipeline</div>,
}));
vi.mock("@/components/dashboard/cara-tasks", () => ({
  CaraTareas: () => <div>cara-tasks</div>,
}));
vi.mock("@/components/dashboard/cara-clients-activity", () => ({
  CaraClientesActividad: () => <div>cara-clients-activity</div>,
}));
vi.mock("@/components/dashboard/cara-my-summary", () => ({
  CaraMiResumen: () => <div>cara-my-summary</div>,
}));
vi.mock("@/components/dashboard/cara-management", () => ({
  CaraGerencial: () => <div>cara-management</div>,
}));

import { DashboardTabs } from "./dashboard-page";

describe("DashboardTabs (shell)", () => {
  it("lists the fifth 'Tablero gerencial' face next to the other four", () => {
    render(<DashboardTabs />);
    for (const label of [
      "Pipeline comercial",
      "Gestión de tareas",
      "Actividad de clientes",
      "Mi resumen",
      "Tablero gerencial",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("mounts the management face only when its tab is selected", () => {
    render(<DashboardTabs />);
    expect(screen.queryByText("cara-management")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Tablero gerencial" }));

    expect(screen.getByText("cara-management")).toBeInTheDocument();
    expect(screen.queryByText("cara-pipeline")).toBeNull();
  });
});
