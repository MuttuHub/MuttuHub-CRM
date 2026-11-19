import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";
import { addLocalDays, startOfLocalDay } from "@/lib/alerts";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    tarea: {
      findMany: vi.fn(),
    },
    notificacion: {
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    // V8: the automation setting and the «sin contacto» day count.
    setting: { findUnique: vi.fn() },
    bitacoraEntrada: { groupBy: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const colaborador = {
  id: "colab-1",
  rol: "COLABORADOR",
} as Usuario;

const coordinador = {
  id: "coord-1",
  rol: "COORDINADOR",
} as Usuario;

const inicioHoy = startOfLocalDay();
const ayer = new Date(inicioHoy.getTime() - 24 * 60 * 60 * 1000);
const enTresDias = addLocalDays(inicioHoy, 2);

function mockAuth(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

function get(qs = ""): Request {
  return new Request(`http://localhost/api/v1/notifications${qs}`);
}

const tareaVencidaKanban = {
  id: "t1",
  titulo: "Vencida Kanban",
  estado: "POR_HACER",
  fecha_entrega: ayer,
  origen: "KANBAN",
  responsable_id: "colab-1",
  responsable: { nombre: "Ana" },
  cliente_id: null,
  cliente: null,
};

const tareaVencidaCrm = {
  id: "t2",
  titulo: "Vencida CRM",
  estado: "POR_HACER",
  fecha_entrega: ayer,
  origen: "CRM",
  responsable_id: "colab-1",
  responsable: { nombre: "Ana" },
  cliente_id: "c1",
  cliente: { nombre: "Cliente A" },
};

const tareaProximos = {
  id: "t3",
  titulo: "Próxima",
  estado: "POR_HACER",
  fecha_entrega: enTresDias,
  origen: "KANBAN",
  responsable_id: "colab-1",
  responsable: { nombre: "Ana" },
  cliente_id: null,
  cliente: null,
};

afterEach(() => {
  vi.clearAllMocks();
});

/** Task reconciliation and project-notification reads share `notificacion.findMany`; tell them apart by `where.tipo.in`. */
function mockNotificaciones(taskRows: unknown[], projectRows: unknown[] = []) {
  vi.mocked(db.notificacion.findMany).mockImplementation((async (args: { where?: { tipo?: { in?: unknown } } }) =>
    args?.where?.tipo?.in ? projectRows : taskRows) as never);
}

describe("GET /api/v1/notifications", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), {
        status: 401,
      }),
    });

    const res = await GET(get());

    expect(res.status).toBe(401);
  });

  it("scopes to responsable_id for COLABORADOR", async () => {
    mockAuth(colaborador);
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);
    mockNotificaciones([]);

    await GET(get());

    const where = vi.mocked(db.tarea.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.responsable_id).toBe("colab-1");
  });

  it("does not scope by responsable_id for full-access roles", async () => {
    mockAuth(coordinador);
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);
    mockNotificaciones([]);

    await GET(get());

    const where = vi.mocked(db.tarea.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.responsable_id).toBeUndefined();
  });

  it("creates a new notificacion row for a newly-seen alert and derives its tipo from bucket + origen", async () => {
    mockAuth(colaborador);
    vi.mocked(db.tarea.findMany).mockResolvedValue([tareaVencidaKanban, tareaVencidaCrm] as never);
    mockNotificaciones([]);
    vi.mocked(db.notificacion.create)
      .mockResolvedValueOnce({ id: "n1" } as never)
      .mockResolvedValueOnce({ id: "n2" } as never);

    const res = await GET(get());
    const json = await res.json();

    expect(db.notificacion.create).toHaveBeenCalledWith({
      data: { usuario_id: "colab-1", tarea_id: "t1", tipo: "TAREA_VENCIDA" },
      select: { id: true },
    });
    expect(db.notificacion.create).toHaveBeenCalledWith({
      data: { usuario_id: "colab-1", tarea_id: "t2", tipo: "COMPROMISO_VENCIDO" },
      select: { id: true },
    });
    expect(json.total).toBe(2);
    expect(json.vencidos).toHaveLength(2);
    expect(json.vencidos.every((i: { notificacion_id: string | null }) => i.notificacion_id)).toBe(true);
    expect(json.leidas_ids).toEqual([]);
  });

  it("preserves the leida flag from an existing notificacion row", async () => {
    mockAuth(colaborador);
    vi.mocked(db.tarea.findMany).mockResolvedValue([tareaVencidaKanban] as never);
    mockNotificaciones([
      { id: "n1", tarea_id: "t1", tipo: "TAREA_VENCIDA", leida: true },
    ] as never[]);

    const res = await GET(get());
    const json = await res.json();

    expect(db.notificacion.create).not.toHaveBeenCalled();
    expect(db.notificacion.update).not.toHaveBeenCalled();
    expect(json.leidas_ids).toEqual(["n1"]);
    expect(json.vencidos[0].notificacion_id).toBe("n1");
  });

  it("with ?leida=false, filters out already-read alerts", async () => {
    mockAuth(colaborador);
    vi.mocked(db.tarea.findMany).mockResolvedValue([tareaVencidaKanban, tareaProximos] as never);
    mockNotificaciones([
      { id: "n1", tarea_id: "t1", tipo: "TAREA_VENCIDA", leida: true },
      { id: "n3", tarea_id: "t3", tipo: "POR_VENCER", leida: false },
    ] as never[]);

    const res = await GET(get("?leida=false"));
    const json = await res.json();

    expect(json.vencidos).toHaveLength(0);
    expect(json.proximos3).toHaveLength(1);
    expect(json.proximos3[0].notificacion_id).toBe("n3");
  });
});

describe("GET /api/v1/notifications: proyectos group (S6)", () => {
  const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
  const filaProyecto = (id: string, leida: boolean) => ({
    id,
    tipo: "SOBREGASTO_RUBRO",
    leida,
    proyecto_id: "pry-1",
    gasto_id: `gas-${id}`,
    created_at: new Date("2026-10-16T12:00:00.000Z"),
    proyecto: { codigo: "PRY-001" },
  });

  function mockRows(rows: unknown[]) {
    vi.mocked(db.notificacion.findMany).mockImplementation((async (args: { where?: { tipo?: unknown } }) =>
      (args?.where?.tipo as { in?: string[] } | undefined)?.in ? rows : []) as never);
  }

  it("returns the actor's overspend notifications in a `proyectos` group and keeps the task keys", async () => {
    mockAuth(gerencia);
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);
    mockRows([filaProyecto("p1", false), filaProyecto("p2", true)]);

    const json = await (await GET(get())).json();

    expect(db.notificacion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { usuario_id: "ger-1", tipo: { in: ["SOBREGASTO_RUBRO", "GASTO_RECHAZADO"] } },
      }),
    );
    expect(json.vencidos).toEqual([]);
    expect(json.leidas_ids).toEqual([]);
    expect(json.proyectos).toEqual([
      {
        notificacion_id: "p1",
        tipo: "SOBREGASTO_RUBRO",
        mensaje: "Gasto supera el asignado del rubro",
        proyecto_id: "pry-1",
        proyecto_codigo: "PRY-001",
        gasto_id: "gas-p1",
        leida: false,
        created_at: "2026-10-16T12:00:00.000Z",
      },
      expect.objectContaining({ notificacion_id: "p2", leida: true }),
    ]);
    expect(json.total).toBe(2);
  });

  it("with ?leida=false keeps only the unread project rows", async () => {
    mockAuth(gerencia);
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);
    mockRows([filaProyecto("p1", false), filaProyecto("p2", true)]);
    const json = await (await GET(get("?leida=false"))).json();
    expect(json.proyectos.map((p: { notificacion_id: string }) => p.notificacion_id)).toEqual(["p1"]);
    expect(json.total).toBe(1);
  });

  it("other roles never query overspend rows: only their own rejected-expense notifications", async () => {
    for (const actor of [colaborador, coordinador, { id: "adm-1", rol: "ADMINISTRADOR" } as Usuario]) {
      mockAuth(actor);
      vi.mocked(db.tarea.findMany).mockResolvedValue([]);
      mockNotificaciones([]);
      vi.mocked(db.notificacion.findMany).mockClear();
      const json = await (await GET(get())).json();
      expect(json.proyectos).toEqual([]);
      expect(db.notificacion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { usuario_id: actor.id, tipo: { in: ["GASTO_RECHAZADO"] } } }),
      );
    }
  });

  it("returns a GASTO_RECHAZADO notification to a non-GERENCIA author, with the reason", async () => {
    mockAuth(colaborador);
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);
    mockRows([
      {
        ...filaProyecto("r1", false),
        tipo: "GASTO_RECHAZADO",
        gasto: { tercero_nombre: "Proveedor SAS", numero_documento: "FE-1", monto_cop: 1000000, motivo_rechazo: "Soporte ilegible" },
      },
    ]);

    const json = await (await GET(get())).json();

    expect(json.proyectos).toHaveLength(1);
    expect(json.proyectos[0]).toMatchObject({ notificacion_id: "r1", tipo: "GASTO_RECHAZADO", proyecto_id: "pry-1" });
    expect(json.proyectos[0].mensaje).toContain("Soporte ilegible");
    expect(json.total).toBe(1);
  });
});

describe("GET /api/v1/notifications: V8 rule rows", () => {
  const DAY_MS = 86_400_000;

  /** Routes `notificacion.findMany` by query: SIN_CONTACTO rows, project rows (`tipo.in`) or task rows. */
  function mockFilas(taskRows: unknown[], sinContactoRows: unknown[] = []) {
    vi.mocked(db.notificacion.findMany).mockImplementation((async (args: { where?: { tipo?: unknown } }) => {
      const tipo = args?.where?.tipo;
      if (tipo === "SIN_CONTACTO") return sinContactoRows;
      if ((tipo as { in?: unknown } | undefined)?.in) return [];
      return taskRows;
    }) as never);
  }

  function mockSetting(value: unknown) {
    vi.mocked(db.setting.findUnique).mockResolvedValue({ key: "automatizaciones", value } as never);
  }

  it("keeps the pre-V8 rows unchanged and adds empty V8 groups when there is nothing to show", async () => {
    mockAuth(colaborador);
    vi.mocked(db.tarea.findMany).mockResolvedValue([tareaVencidaCrm, tareaProximos] as never);
    mockFilas([
      { id: "n2", tarea_id: "t2", tipo: "COMPROMISO_VENCIDO", leida: true },
      { id: "n3", tarea_id: "t3", tipo: "POR_VENCER", leida: false },
    ]);

    const json = await (await GET(get())).json();

    expect(json).toEqual({
      total: 2,
      vencidos: [expect.objectContaining({ id: "t2", titulo: "Vencida CRM", notificacion_id: "n2" })],
      hoy: [],
      proximos3: [expect.objectContaining({ id: "t3", titulo: "Próxima", notificacion_id: "n3" })],
      leidas_ids: ["n2"],
      proyectos: [],
      recordatorios: [],
      sin_contacto: [],
    });
    // Default rule 1 (2 days) fits inside the bell's 3-day bucket: no extra task query.
    expect(db.tarea.findMany).toHaveBeenCalledTimes(1);
  });

  it("lists the actor's open SIN_CONTACTO rows with a message, hiding a stretch closed by a later contact", async () => {
    mockAuth(colaborador);
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);
    const alerta = new Date(Date.now() - DAY_MS);
    mockFilas(
      [],
      [
        { id: "s1", leida: false, created_at: alerta, cliente_id: "c1", cliente: { nombre: "Fundación Uno", created_at: new Date("2024-01-01") } },
        { id: "s2", leida: true, created_at: alerta, cliente_id: "c2", cliente: { nombre: "Colegio Dos", created_at: new Date("2024-01-01") } },
        { id: "s3", leida: false, created_at: alerta, cliente_id: "c3", cliente: { nombre: "Nuevo", created_at: new Date(Date.now() - 31 * DAY_MS) } },
      ],
    );
    vi.mocked(db.bitacoraEntrada.groupBy).mockResolvedValue([
      { cliente_id: "c1", _max: { created_at: new Date(Date.now() - 40 * DAY_MS) } },
      { cliente_id: "c2", _max: { created_at: new Date() } },
    ] as never);

    const json = await (await GET(get())).json();

    expect(db.notificacion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          usuario_id: "colab-1",
          tipo: "SIN_CONTACTO",
          cliente: { is: { deleted_at: null, estado: { notIn: ["INACTIVO", "CERRADO"] } } },
        },
      }),
    );
    expect(json.sin_contacto).toEqual([
      {
        notificacion_id: "s1",
        tipo: "SIN_CONTACTO",
        cliente_id: "c1",
        cliente_nombre: "Fundación Uno",
        dias_sin_contacto: 40,
        mensaje: "Fundación Uno lleva 40 días sin contacto",
        leida: false,
        created_at: alerta.toISOString(),
      },
      expect.objectContaining({ notificacion_id: "s3", mensaje: "Nuevo lleva 31 días sin contacto" }),
    ]);
    expect(json.total).toBe(2);

    const unread = await (await GET(get("?leida=false"))).json();
    expect(unread.sin_contacto.map((i: { notificacion_id: string }) => i.notificacion_id)).toEqual(["s1", "s3"]);
  });

  it("shows a rule-1 reminder even when dias_por_vencer is smaller than the reminder's N", async () => {
    mockAuth(coordinador);
    mockSetting({ dias_por_vencer: 1, recordar_compromisos: { activo: true, dias: 5 } });
    const start = startOfLocalDay();
    const tareaEn5 = { ...tareaProximos, id: "t5", titulo: "Informe", fecha_entrega: addLocalDays(start, 5), responsable_id: "coord-1" };
    vi.mocked(db.tarea.findMany).mockResolvedValueOnce([]).mockResolvedValueOnce([tareaEn5] as never);
    mockFilas([]);
    vi.mocked(db.notificacion.create).mockResolvedValue({ id: "n5" } as never);

    const json = await (await GET(get())).json();

    // The reminder window starts where the bell's 3-day bucket ends and runs through day N.
    expect(vi.mocked(db.tarea.findMany).mock.calls[1]![0]!.where).toMatchObject({
      responsable_id: "coord-1",
      fecha_entrega: { gte: addLocalDays(start, 4), lt: addLocalDays(start, 6) },
    });
    expect(db.notificacion.create).toHaveBeenCalledWith({
      data: { usuario_id: "coord-1", tarea_id: "t5", tipo: "POR_VENCER" },
      select: { id: true },
    });
    expect(json.recordatorios).toEqual([expect.objectContaining({ id: "t5", titulo: "Informe", notificacion_id: "n5" })]);
    expect(json.proximos3).toEqual([]);
    expect(json.total).toBe(1);
  });

  it("adds no reminder when rule 1 is off", async () => {
    mockAuth(colaborador);
    mockSetting({ recordar_compromisos: { activo: false, dias: 10 } });
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);
    mockFilas([]);

    const json = await (await GET(get())).json();

    expect(db.tarea.findMany).toHaveBeenCalledTimes(1);
    expect(json.recordatorios).toEqual([]);
  });
});

