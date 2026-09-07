import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuditLogSection } from "./audit-log-section";
import type { AuditoriaRow } from "@/hooks/admin";

const { auditoriaQuery } = vi.hoisted(() => ({
  auditoriaQuery: {
    data: {
      pages: [
        {
          registros: [
            {
              id: "aud-1",
              entidad: "cliente" as const,
              entidad_id: "cli-1",
              accion: "crear" as const,
              cambios: { nombre: "Acme" },
              created_at: "2026-08-01T12:00:00.000Z",
              usuario: { email: "ana@muttu.co", nombre: "Ana Pérez" },
            },
          ] as AuditoriaRow[],
          next_before: null as string | null,
        },
      ],
    },
    isLoading: false,
    isError: false,
    hasNextPage: true,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  },
}));

vi.mock("@/hooks/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/admin")>();
  return { ...actual, useAuditoria: () => auditoriaQuery };
});

function entidadTrigger() {
  return screen.getAllByRole("combobox").find((cb) => cb.textContent?.includes("registros"))!;
}

describe("AuditLogSection", () => {
  beforeEach(() => {
    auditoriaQuery.hasNextPage = true;
    auditoriaQuery.fetchNextPage.mockReset();
  });

  // Code review finding: moreError is local state that survived a filter
  // change, leaving a stale "Cargar más" error banner under a freshly
  // switched (and successful) entidad table.
  it("clears the 'Cargar más' error banner when the entidad filter changes", async () => {
    const user = userEvent.setup();
    auditoriaQuery.fetchNextPage.mockRejectedValueOnce(new Error("boom"));
    render(<AuditLogSection />);

    await user.click(screen.getByRole("button", { name: "Cargar más" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");

    await user.click(entidadTrigger());
    await user.click(await screen.findByRole("option", { name: "Documentos" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // Regression: producción registra accion:"exportar" (export de clientes/
  // tareas, ver src/lib/api/audit.ts) pero ACCION_LABELS no lo contemplaba →
  // `ACCION_LABELS[r.accion].tone` sobre undefined tumbaba toda /administracion
  // ("This page couldn't load", sin error boundary que lo contuviera).
  it("renders an 'exportar' audit row without crashing", async () => {
    const original = auditoriaQuery.data;
    auditoriaQuery.data = {
      pages: [
        {
          registros: [
            {
              id: "aud-2",
              entidad: "tarea",
              entidad_id: "",
              accion: "exportar",
              cambios: { rows: 23, filters: {} },
              created_at: "2026-09-04T15:10:58.824Z",
              usuario: { email: "admin@muttu.co", nombre: "Administrador" },
            },
          ] as AuditoriaRow[],
          next_before: null,
        },
      ],
    };

    try {
      render(<AuditLogSection />);
      expect(await screen.findByText("Exportó")).toBeInTheDocument();
    } finally {
      auditoriaQuery.data = original;
    }
  });
});
