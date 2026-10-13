import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    cliente: { findMany: vi.fn() },
    bitacoraEntrada: { groupBy: vi.fn() },
    proyecto: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/alerts", () => ({ getAlertBuckets: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getSemaforoParametrosV2: vi.fn() }));
vi.mock("@/lib/api/kpis-portafolio", () => ({ loadKpisPortafolio: vi.fn() }));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { getAlertBuckets } from "@/lib/alerts";
import { getSemaforoParametrosV2 } from "@/lib/settings";
import { loadKpisPortafolio } from "@/lib/api/kpis-portafolio";
import { PARAMETROS_V2_DEFAULT } from "@/lib/proyectos/semaforo-v2";
import { GET } from "./route";

const gerencia = { id: "gerencia-1", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

/** A Date exactly `dias` days before now (no Bogota DST, so the calendar gap is exact). */
const hace = (dias: number): Date => new Date(Date.now() - dias * 86_400_000);

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

function alertItem(cliente_id: string | null) {
  return {
    id: `t-${cliente_id}`,
    titulo: "Compromiso",
    estado: "POR_HACER",
    fecha_entrega: hace(2),
    origen: "CRM",
    responsable_id: "colab-1",
    responsable_nombre: "Colab Uno",
    cliente_id,
    cliente_nombre: cliente_id ? "Aliado" : null,
  };
}

beforeEach(() => {
  vi.mocked(getSemaforoParametrosV2).mockResolvedValue(PARAMETROS_V2_DEFAULT);
  vi.mocked(getAlertBuckets).mockResolvedValue({ vencidos: [], hoy: [], proximos3: [] });
  vi.mocked(loadKpisPortafolio).mockResolvedValue(new Map());
  vi.mocked(db.proyecto.findMany).mockResolvedValue([]);
  vi.mocked(db.bitacoraEntrada.groupBy).mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/clients/health", () => {
  it("returns 401 when unauthenticated and does not touch the DB", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), {
        status: 401,
      }),
    });

    const res = await GET();

    expect(res.status).toBe(401);
    expect(db.cliente.findMany).not.toHaveBeenCalled();
  });

  it("returns an empty cartera (promedio null) with no clients", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findMany).mockResolvedValue([]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: {
        clientes: [],
        cartera: { sana: 0, atencion: 0, riesgo: 0, sin_datos: 0, total: 0, promedio: null },
      },
    });
  });

  it("composes the per-client score and the cartera, sorted worst-first", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findMany).mockResolvedValue([
      { id: "cli-1", nombre: "Aliado A" },
      { id: "cli-2", nombre: "Aliado B" },
    ] as never);
    vi.mocked(db.bitacoraEntrada.groupBy).mockResolvedValue([
      { cliente_id: "cli-1", _max: { created_at: hace(74) } },
      { cliente_id: "cli-2", _max: { created_at: hace(5) } },
    ] as never);
    vi.mocked(getAlertBuckets).mockResolvedValue({
      vencidos: [alertItem("cli-2")],
      hoy: [],
      proximos3: [],
    } as never);
    vi.mocked(db.proyecto.findMany).mockResolvedValue([
      {
        id: "proj-1",
        cliente_id: "cli-1",
        estado: "EN_EJECUCION",
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2026-06-01"),
        beneficiarios_meta: null,
      },
    ] as never);
    vi.mocked(loadKpisPortafolio).mockResolvedValue(
      new Map([["proj-1", { tecnico: { color: "rojo" } }]]) as never,
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.data.clientes).toEqual([
      {
        cliente_id: "cli-1",
        cliente_nombre: "Aliado A",
        score: 20.8,
        bucket: "RIESGO",
        subscores: { contacto: 21.3, compromisos: null, proyectos: 20 },
        motivo: "Proyectos en rojo",
      },
      {
        cliente_id: "cli-2",
        cliente_nombre: "Aliado B",
        score: 90.7,
        bucket: "SANA",
        subscores: { contacto: 100, compromisos: 80, proyectos: null },
        motivo: "1 compromiso vencido",
      },
    ]);

    // promedio = (20.8 + 90.7) / 2 = 55.75 -> 55.8
    expect(json.data.cartera).toEqual({
      sana: 1,
      atencion: 0,
      riesgo: 1,
      sin_datos: 0,
      total: 2,
      promedio: 55.8,
    });
  });

  it("reads globally: the alert engine is called with scope 'all' for every role", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findMany).mockResolvedValue([]);

    await GET();

    expect(getAlertBuckets).toHaveBeenCalledWith("all", colaborador);
    const clienteWhere = vi.mocked(db.cliente.findMany).mock.calls[0][0]?.where;
    expect(clienteWhere).toEqual({ deleted_at: null });
  });

  it("only counts live projects whose semáforo is derivable", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findMany).mockResolvedValue([{ id: "cli-1", nombre: "Aliado A" }] as never);
    vi.mocked(db.bitacoraEntrada.groupBy).mockResolvedValue([
      { cliente_id: "cli-1", _max: { created_at: hace(5) } },
    ] as never);
    vi.mocked(db.proyecto.findMany).mockResolvedValue([
      {
        id: "proj-1",
        cliente_id: "cli-1",
        estado: "BORRADOR",
        fecha_inicio: null,
        fecha_fin: null,
        beneficiarios_meta: null,
      },
      {
        id: "proj-2",
        cliente_id: "cli-1",
        estado: "EN_EJECUCION",
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2026-06-01"),
        beneficiarios_meta: null,
      },
    ] as never);
    // proj-1 (BORRADOR) has no KPIs; proj-2 is verde.
    vi.mocked(loadKpisPortafolio).mockResolvedValue(
      new Map([
        ["proj-1", { tecnico: null }],
        ["proj-2", { tecnico: { color: "verde" } }],
      ]) as never,
    );

    const res = await GET();
    const json = await res.json();

    expect(json.data.clientes[0].subscores.proyectos).toBe(100);

    const proyectoWhere = vi.mocked(db.proyecto.findMany).mock.calls[0][0]?.where;
    expect(proyectoWhere).toMatchObject({
      deleted_at: null,
      estado: { notIn: ["CERRADO", "CANCELADO"] },
    });
  });
});
