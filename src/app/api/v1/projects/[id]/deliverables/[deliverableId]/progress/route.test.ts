// GET/POST /api/v1/projects/:id/deliverables/:deliverableId/progress (S4 U2).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  aggregate: vi.fn(),
  create: vi.fn(),
  requiereMedio: { valor: true, confirmado: false },
}));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: vi.fn(), logChanges: vi.fn() };
});
vi.mock("@/lib/settings", () => ({
  getSemaforoParametrosV2: vi.fn(async () => ({ avance_requiere_medio: mocks.requiereMedio })),
}));
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    entregable: { findFirst: vi.fn() },
    avanceEntregable: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ $queryRaw: mocks.queryRaw, avanceEntregable: { aggregate: mocks.aggregate, create: mocks.create } }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { GET, POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const admin = { id: "adm-1", rol: "ADMINISTRADOR" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "col-1", rol: "COLABORADOR" } as Usuario;

const proyecto = (estado = "EN_EJECUCION", miembro = false) =>
  ({ id: "pry-1", estado, fecha_inicio: null, fecha_fin: null, miembros: miembro ? [{ id: "m-1" }] : [] }) as never;
const entregable = { id: "ent-1", cantidad_meta: new Prisma.Decimal(10) };
const fila = (over: object = {}) => ({
  id: "av-1",
  proyecto_id: "pry-1",
  entregable_id: "ent-1",
  fecha: new Date("2026-10-06T00:00:00.000Z"),
  cantidad: new Prisma.Decimal(2),
  observacion: null,
  justificacion_exceso: null,
  registrado_por_id: "ger-1",
  created_at: new Date("2026-10-08T12:00:00.000Z"),
  anulado_at: null,
  anulado_por_id: null,
  motivo_anulacion: null,
  ...over,
});

const ctx = { params: Promise.resolve({ id: "pry-1", deliverableId: "ent-1" }) };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
function post(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/deliverables/ent-1/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const get = () => new Request("http://localhost/api/v1/projects/pry-1/deliverables/ent-1/progress");
const valido = { fecha: "2026-10-06", cantidad: 2 };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T15:00:00.000Z"));
  mocks.requiereMedio = { valor: true, confirmado: false };
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
  vi.mocked(db.entregable.findFirst).mockResolvedValue(entregable as never);
  mocks.queryRaw.mockResolvedValue([{ id: "ent-1" }]);
  mocks.aggregate.mockResolvedValue({ _sum: { cantidad: new Prisma.Decimal(0) } });
  mocks.create.mockImplementation(async ({ data }: { data: object }) => fila(data));
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("POST progress: access matrix", () => {
  it("creates for ADMINISTRADOR, GERENCIA and a member COORDINADOR (201)", async () => {
    for (const [usuario, miembro] of [[admin, false], [gerencia, false], [coordinador, true]] as const) {
      authAs(usuario);
      vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("EN_EJECUCION", miembro));
      expect((await POST(post(valido), ctx)).status, usuario.rol).toBe(201);
    }
  });

  it("answers 403 for a non-member COORDINADOR and a COLABORADOR", async () => {
    for (const usuario of [coordinador, colaborador]) {
      authAs(usuario);
      expect((await POST(post(valido), ctx)).status, usuario.rol).toBe(403);
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("answers 404 for a missing project and 409 INVALID_STATE in BORRADOR", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await POST(post(valido), ctx)).status).toBe(404);
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(proyecto("BORRADOR"));
    const res = await POST(post(valido), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("INVALID_STATE");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("answers 404 for a deliverable of another project or a deleted one", async () => {
    vi.mocked(db.entregable.findFirst).mockResolvedValue(null);
    expect((await POST(post(valido), ctx)).status).toBe(404);
    expect(db.entregable.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ent-1", proyecto_id: "pry-1", deleted_at: null } }),
    );
  });
});

describe("POST progress: validation", () => {
  it("rejects a future date (Bogota today) but accepts today", async () => {
    const res = await POST(post({ ...valido, fecha: "2026-10-09" }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("La fecha del avance no puede ser posterior a hoy.");
    expect((await POST(post({ ...valido, fecha: "2026-10-08" }), ctx)).status).toBe(201);
  });

  it("rejects bad bodies: unknown keys, bad dates, non-positive quantity, scalar body", async () => {
    for (const body of [
      { ...valido, proyecto_id: "x" },
      { ...valido, fecha: "2026-02-30" },
      { ...valido, fecha: "06/10/2026" },
      { fecha: "2026-10-06" },
      { ...valido, cantidad: 0 },
      { ...valido, cantidad: -3 },
      { ...valido, cantidad: 0.001 },
      "texto",
    ]) {
      expect((await POST(post(body), ctx)).status, JSON.stringify(body)).toBe(400);
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("POST progress: cumulative cap", () => {
  it("rejects a total above the goal without justification and creates nothing", async () => {
    mocks.aggregate.mockResolvedValue({ _sum: { cantidad: new Prisma.Decimal(9) } });
    const res = await POST(post(valido), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/justificaci/i);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("accepts the exact goal without justification (boundary)", async () => {
    mocks.aggregate.mockResolvedValue({ _sum: { cantidad: new Prisma.Decimal(8) } });
    expect((await POST(post(valido), ctx)).status).toBe(201);
    expect(mocks.create.mock.calls[0][0].data.justificacion_exceso).toBeNull();
  });

  it("accepts an excess with a justification and stores it", async () => {
    mocks.aggregate.mockResolvedValue({ _sum: { cantidad: new Prisma.Decimal(9) } });
    const res = await POST(post({ ...valido, justificacion_exceso: "Se entregó material adicional" }), ctx);
    expect(res.status).toBe(201);
    expect(mocks.create.mock.calls[0][0].data.justificacion_exceso).toBe("Se entregó material adicional");
  });

  it("locks the deliverable row and sums only non-voided avances inside the same transaction", async () => {
    await POST(post(valido), ctx);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(String(mocks.queryRaw.mock.calls[0][0].join?.(" ") ?? mocks.queryRaw.mock.calls[0][0])).toMatch(/FOR UPDATE/i);
    expect(mocks.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { entregable_id: "ent-1", anulado_at: null } }),
    );
    const order = [mocks.queryRaw, mocks.aggregate, mocks.create].map((m) => m.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe("POST progress: result", () => {
  it("answers 201 { avance, cuenta } with cuenta false while a medio is required", async () => {
    const res = await POST(post({ ...valido, observacion: "Primer corte" }), ctx);
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.cuenta).toBe(false);
    expect(json.avance).toMatchObject({ id: "av-1", fecha: "2026-10-06", cantidad: "2", cuenta: false, medios: 0 });
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({
      proyecto_id: "pry-1",
      entregable_id: "ent-1",
      registrado_por_id: "ger-1",
      observacion: "Primer corte",
    });
  });

  it("answers cuenta true when the parameter does not require a medio", async () => {
    mocks.requiereMedio = { valor: false, confirmado: true };
    const json = await (await POST(post(valido), ctx)).json();
    expect(json.cuenta).toBe(true);
  });

  it("audits CREAR avance in the same transaction", async () => {
    await POST(post(valido), ctx);
    expect(logChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        usuario_id: "ger-1",
        accion: "CREAR",
        entidad: "avance",
        entidad_id: "av-1",
        proyecto_id: "pry-1",
        valor_nuevo: expect.objectContaining({ entregable_id: "ent-1", cantidad: expect.anything() }),
      }),
    );
  });
});

describe("GET progress", () => {
  const rows = [fila(), fila({ id: "av-2", anulado_at: new Date("2026-10-08T13:00:00.000Z"), motivo_anulacion: "Error" })];

  beforeEach(() => {
    vi.mocked(db.avanceEntregable.findMany).mockResolvedValue(rows as never);
  });

  it("lists every avance (voided ones too), oldest first, with the counted total", async () => {
    const res = await GET(get(), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.avances.map((a: { id: string }) => a.id)).toEqual(["av-1", "av-2"]);
    expect(json.avances[1].cuenta).toBe(false);
    expect(json.meta).toBe("10");
    expect(json.estado).toBe("EN_EJECUCION");
    expect(db.avanceEntregable.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entregable_id: "ent-1", proyecto_id: "pry-1" },
        orderBy: [{ fecha: "asc" }, { created_at: "asc" }],
      }),
    );
  });

  it("is readable in BORRADOR, 403 for a stranger, 404 for unknown project or deliverable", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(proyecto("BORRADOR"));
    expect((await GET(get(), ctx)).status).toBe(200);
    authAs(coordinador);
    expect((await GET(get(), ctx)).status).toBe(403);
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await GET(get(), ctx)).status).toBe(404);
    vi.mocked(db.entregable.findFirst).mockResolvedValueOnce(null);
    expect((await GET(get(), ctx)).status).toBe(404);
  });
});
