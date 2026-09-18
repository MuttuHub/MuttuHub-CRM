// GET/POST /api/v1/projects/:id/budget — RF-05/RF-07/T3/T4 (design.md
// "Presupuesto proyectado vs. ejecutado"). GET aggregates `proyectado` and
// `ejecutado` grouped by `rubro_id`, never mixing rubros; `ejecutado` is
// ALWAYS derived from `SUM(gastos.monto_cop)`, never a stored counter (T3).
//
// **The double-counting trap (design.md Risks, "la trampa más fácil"):**
// this route sums gastos in JS keyed by `linea_id` (repo's established SMALL-
// volume pattern, see dashboard/pipeline/route.ts) instead of a SQL join
// between gastos and lineas_presupuestales — a direct join would fan out one
// línea row per gasto and multiply `monto_proyectado_cop` by the gasto count.
// The dedicated test below creates 2 gastos on 1 línea and asserts the
// returned `monto_proyectado_cop` is untouched while `monto_ejecutado_cop`
// reflects the sum of both.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    proyecto: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    lineaPresupuestal: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    gasto: {
      findMany: vi.fn(),
    },
    rubro: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/settings", () => ({
  SETTING_SEMAFORO_UMBRALES: "semaforo_umbrales",
  getSetting: vi.fn(),
}));

vi.mock("@/lib/api/audit", () => ({
  logAudit: vi.fn(),
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { getSetting } from "@/lib/settings";
import { GET, POST } from "./route";

const gerencia = { id: "gerencia-1", rol: "GERENCIA", puede_ver_tablero_gerencial: false } as Usuario;
const colaboradorAjeno = { id: "colab-3", rol: "COLABORADOR", puede_ver_tablero_gerencial: false } as Usuario;

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

const routeContext = { params: Promise.resolve({ id: "proy-1" }) };

const UMBRALES = {
  confirmado: true,
  tecnico: { verde: 0.85, rojo: 0.6 },
  financiero: { verde_min: 0.85, verde_max: 1.15, amarillo_min: 0.6, amarillo_max: 1.4 },
};

function lineaRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? "linea-1",
    rubro_id: overrides.rubro_id ?? "rubro-1",
    monto_proyectado_cop: overrides.monto_proyectado_cop ?? 1000,
    rubro: overrides.rubro ?? { id: "rubro-1", nombre: "Personal", activo: true },
  };
}

function gastoRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    linea_id: overrides.linea_id ?? "linea-1",
    monto_cop: overrides.monto_cop ?? 100,
  };
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/proy-1/budget", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/projects/:id/budget", () => {
  it("returns 404 when the project does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/budget"), routeContext);

    expect(res.status).toBe(404);
  });

  it("returns 403 for a COLABORADOR who is neither the responsable nor a management viewer", async () => {
    authAs(colaboradorAjeno);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/budget"), routeContext);

    expect(res.status).toBe(403);
  });

  it("groups proyectado/ejecutado by rubro_id without mixing rubros", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "gerencia-1" } as never);
    vi.mocked(db.proyecto.findUnique).mockResolvedValue({ umbrales_override: null } as never);
    vi.mocked(getSetting).mockResolvedValue(UMBRALES);
    vi.mocked(db.lineaPresupuestal.findMany).mockResolvedValue([
      lineaRow({ id: "linea-1", rubro_id: "rubro-1", monto_proyectado_cop: 1000, rubro: { id: "rubro-1", nombre: "Personal", activo: true } }),
      lineaRow({ id: "linea-2", rubro_id: "rubro-2", monto_proyectado_cop: 500, rubro: { id: "rubro-2", nombre: "Transporte", activo: true } }),
    ] as never);
    vi.mocked(db.gasto.findMany).mockResolvedValue([
      gastoRow({ linea_id: "linea-1", monto_cop: 200 }),
      gastoRow({ linea_id: "linea-2", monto_cop: 50 }),
    ] as never);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/budget"), routeContext);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rubros).toHaveLength(2);
    const personal = json.rubros.find((r: { rubro_id: string }) => r.rubro_id === "rubro-1");
    const transporte = json.rubros.find((r: { rubro_id: string }) => r.rubro_id === "rubro-2");
    expect(personal).toMatchObject({ monto_proyectado_cop: 1000, monto_ejecutado_cop: 200 });
    expect(transporte).toMatchObject({ monto_proyectado_cop: 500, monto_ejecutado_cop: 50 });
  });

  it("DOES NOT double the proyectado when 2 gastos hit the same línea (the double-counting trap)", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "gerencia-1" } as never);
    vi.mocked(db.proyecto.findUnique).mockResolvedValue({ umbrales_override: null } as never);
    vi.mocked(getSetting).mockResolvedValue(UMBRALES);
    vi.mocked(db.lineaPresupuestal.findMany).mockResolvedValue([
      lineaRow({ id: "linea-1", rubro_id: "rubro-1", monto_proyectado_cop: 1000 }),
    ] as never);
    // Two separate gastos against the SAME línea.
    vi.mocked(db.gasto.findMany).mockResolvedValue([
      gastoRow({ linea_id: "linea-1", monto_cop: 100 }),
      gastoRow({ linea_id: "linea-1", monto_cop: 150 }),
    ] as never);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/budget"), routeContext);
    const json = await res.json();

    expect(json.rubros).toHaveLength(1);
    // proyectado must stay exactly 1000 — NOT doubled by the 2 gastos.
    expect(json.rubros[0].monto_proyectado_cop).toBe(1000);
    // ejecutado must be the sum of both gastos: 100 + 150 = 250.
    expect(json.rubros[0].monto_ejecutado_cop).toBe(250);
  });
});

describe("POST /api/v1/projects/:id/budget", () => {
  it("returns 400 when rubro_id does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "gerencia-1" } as never);
    vi.mocked(db.rubro.findFirst).mockResolvedValue(null);

    const res = await POST(
      postRequest({ rubro_id: "rubro-inexistente", monto_proyectado_cop: 1000 }),
      routeContext,
    );

    expect(res.status).toBe(400);
    expect(db.lineaPresupuestal.create).not.toHaveBeenCalled();
  });

  it("returns 400 when the rubro is inactive (excluded from new-line options)", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "gerencia-1" } as never);
    vi.mocked(db.rubro.findFirst).mockResolvedValue({ id: "rubro-1", activo: false } as never);

    const res = await POST(postRequest({ rubro_id: "rubro-1", monto_proyectado_cop: 1000 }), routeContext);

    expect(res.status).toBe(400);
    expect(db.lineaPresupuestal.create).not.toHaveBeenCalled();
  });

  it("returns 409 when a línea for that rubro already exists in this project", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "gerencia-1" } as never);
    vi.mocked(db.rubro.findFirst).mockResolvedValue({ id: "rubro-1", activo: true } as never);
    vi.mocked(db.lineaPresupuestal.findFirst).mockResolvedValue(lineaRow() as never);

    const res = await POST(postRequest({ rubro_id: "rubro-1", monto_proyectado_cop: 1000 }), routeContext);

    expect(res.status).toBe(409);
    expect(db.lineaPresupuestal.create).not.toHaveBeenCalled();
  });

  it("creates the línea presupuestal, forcing proyecto_id from the URL", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "gerencia-1" } as never);
    vi.mocked(db.rubro.findFirst).mockResolvedValue({ id: "rubro-1", activo: true } as never);
    vi.mocked(db.lineaPresupuestal.findFirst).mockResolvedValue(null);
    vi.mocked(db.lineaPresupuestal.create).mockResolvedValue(lineaRow({ id: "linea-new" }) as never);

    const res = await POST(
      postRequest({ rubro_id: "rubro-1", monto_proyectado_cop: 1000, proyecto_id: "otro-proyecto" }),
      routeContext,
    );

    expect(res.status).toBe(201);
    expect(db.lineaPresupuestal.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ proyecto_id: "proy-1", rubro_id: "rubro-1" }) }),
    );
  });
});
