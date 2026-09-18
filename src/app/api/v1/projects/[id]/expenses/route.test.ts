// GET/POST /api/v1/projects/:id/expenses — Gasto list/create (RF-06, T3).
// `proyecto_id` is always forced from the URL. `linea_id` IS accepted in the
// body but re-validated against THIS project before the write — same
// cross-scope pattern as activities/route.ts's `meta_id` check.

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
    lineaPresupuestal: {
      findFirst: vi.fn(),
    },
    gasto: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api/audit", () => ({
  logAudit: vi.fn(),
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET, POST } from "./route";

const gerencia = { id: "gerencia-1", rol: "GERENCIA", puede_ver_tablero_gerencial: false } as Usuario;
const colaboradorAjeno = { id: "colab-3", rol: "COLABORADOR", puede_ver_tablero_gerencial: false } as Usuario;

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

const routeContext = { params: Promise.resolve({ id: "proy-1" }) };

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
    linea: overrides.linea ?? { rubro_id: "rubro-1", rubro: { nombre: "Personal" } },
  };
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/proy-1/expenses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/projects/:id/expenses", () => {
  it("returns 404 when the project does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/expenses"), routeContext);

    expect(res.status).toBe(404);
  });

  it("returns 403 for a COLABORADOR who is neither the responsable nor a management viewer", async () => {
    authAs(colaboradorAjeno);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/expenses"), routeContext);

    expect(res.status).toBe(403);
  });

  it("returns 200 with the project's gastos", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "gerencia-1" } as never);
    vi.mocked(db.gasto.findMany).mockResolvedValue([gastoRow()] as never);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/expenses"), routeContext);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.gastos).toHaveLength(1);
  });
});

describe("POST /api/v1/projects/:id/expenses", () => {
  it("returns 400 when concepto is missing", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({ linea_id: "linea-1", monto_cop: 100, fecha_gasto: "2026-02-01" }), routeContext);

    expect(res.status).toBe(400);
    expect(db.gasto.create).not.toHaveBeenCalled();
  });

  it("returns 400 when linea_id does not belong to this project", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "gerencia-1" } as never);
    vi.mocked(db.lineaPresupuestal.findFirst).mockResolvedValue(null);

    const res = await POST(
      postRequest({ linea_id: "linea-ajena", concepto: "Compra", monto_cop: 100, fecha_gasto: "2026-02-01" }),
      routeContext,
    );

    expect(res.status).toBe(400);
    expect(db.gasto.create).not.toHaveBeenCalled();
  });

  it("returns 403 for a COLABORADOR who is not the project's responsable", async () => {
    authAs(colaboradorAjeno);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);

    const res = await POST(
      postRequest({ linea_id: "linea-1", concepto: "Compra", monto_cop: 100, fecha_gasto: "2026-02-01" }),
      routeContext,
    );

    expect(res.status).toBe(403);
    expect(db.gasto.create).not.toHaveBeenCalled();
  });

  it("creates the gasto, forcing proyecto_id from the URL and registrado_por_id from the session", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "gerencia-1" } as never);
    vi.mocked(db.lineaPresupuestal.findFirst).mockResolvedValue({ id: "linea-1" } as never);
    vi.mocked(db.gasto.create).mockResolvedValue(gastoRow({ id: "gasto-new" }) as never);

    const res = await POST(
      postRequest({
        linea_id: "linea-1",
        concepto: "Compra de materiales",
        monto_cop: 100,
        fecha_gasto: "2026-02-01",
        proyecto_id: "otro-proyecto",
        registrado_por_id: "otro-usuario",
      }),
      routeContext,
    );

    expect(res.status).toBe(201);
    expect(db.gasto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          proyecto_id: "proy-1",
          registrado_por_id: "gerencia-1",
        }),
      }),
    );
  });
});
