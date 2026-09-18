// GET/PATCH/DELETE /api/v1/projects/:id/expenses/:expenseId — Gasto detail,
// edit and soft delete. Same access axis and cross-project scoping pattern
// as goals/[goalId]/route.ts. `linea_id` is NOT patchable here (keeps the FK
// re-validation surface small — moving a gasto to another línea is out of
// this batch's scope).

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    proyecto: {
      findFirst: vi.fn(),
    },
    gasto: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api/audit", () => ({
  logAudit: vi.fn(),
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET, PATCH, DELETE } from "./route";

const gerencia = { id: "gerencia-1", rol: "GERENCIA", puede_ver_tablero_gerencial: false } as Usuario;
const colaboradorAjeno = { id: "colab-3", rol: "COLABORADOR", puede_ver_tablero_gerencial: false } as Usuario;

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

const routeContext = { params: Promise.resolve({ id: "proy-1", expenseId: "gasto-1" }) };

function gastoRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? "gasto-1",
    proyecto_id: overrides.proyecto_id ?? "proy-1",
    linea_id: overrides.linea_id ?? "linea-1",
    concepto: overrides.concepto ?? "Compra de materiales",
    monto_cop: overrides.monto_cop ?? 100,
    fecha_gasto: overrides.fecha_gasto ?? new Date("2026-02-01"),
    registrado_por_id: overrides.registrado_por_id ?? "gerencia-1",
    created_at: new Date("2026-02-01"),
  };
}

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/proy-1/expenses/gasto-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/projects/:id/expenses/:expenseId", () => {
  it("returns 404 when the gasto does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "gerencia-1" } as never);
    vi.mocked(db.gasto.findFirst).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/expenses/gasto-1"), routeContext);

    expect(res.status).toBe(404);
  });

  it("returns 200 with the gasto", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "gerencia-1" } as never);
    vi.mocked(db.gasto.findFirst).mockResolvedValue(gastoRow() as never);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/expenses/gasto-1"), routeContext);

    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/v1/projects/:id/expenses/:expenseId", () => {
  it("returns 403 for a COLABORADOR who is not the project's responsable", async () => {
    authAs(colaboradorAjeno);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);

    const res = await PATCH(patchRequest({ monto_cop: 200 }), routeContext);

    expect(res.status).toBe(403);
    expect(db.gasto.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the gasto does not exist in this project", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "gerencia-1" } as never);
    vi.mocked(db.gasto.findFirst).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ monto_cop: 200 }), routeContext);

    expect(res.status).toBe(404);
  });

  it("updates the gasto's monto_cop", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "gerencia-1" } as never);
    vi.mocked(db.gasto.findFirst).mockResolvedValue(gastoRow() as never);
    vi.mocked(db.gasto.update).mockResolvedValue(gastoRow({ monto_cop: 200 }) as never);

    const res = await PATCH(patchRequest({ monto_cop: 200 }), routeContext);

    expect(res.status).toBe(200);
    expect(db.gasto.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "gasto-1" }, data: { monto_cop: 200 } }),
    );
  });
});

describe("DELETE /api/v1/projects/:id/expenses/:expenseId", () => {
  it("soft-deletes the gasto", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "gerencia-1" } as never);
    vi.mocked(db.gasto.findFirst).mockResolvedValue(gastoRow() as never);
    vi.mocked(db.gasto.update).mockResolvedValue(gastoRow() as never);

    const res = await DELETE(new Request("http://localhost/api/v1/projects/proy-1/expenses/gasto-1"), routeContext);

    expect(res.status).toBe(204);
    expect(db.gasto.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "gasto-1" }, data: { deleted_at: expect.any(Date) } }),
    );
  });
});
