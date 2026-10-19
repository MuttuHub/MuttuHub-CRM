// GET/POST /api/v1/projects/:id/indicators/:indicatorId/measurements (S4 U4).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: vi.fn(), logChanges: vi.fn() };
});
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    indicador: { findFirst: vi.fn() },
    medicionIndicador: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ medicionIndicador: { create: mocks.create } }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { GET, POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "col-1", rol: "COLABORADOR" } as Usuario;

const proyecto = (estado = "EN_EJECUCION", miembro = false) =>
  ({ id: "pry-1", estado, fecha_inicio: null, fecha_fin: null, miembros: miembro ? [{ id: "m-1" }] : [] }) as never;
const indicador = { id: "ind-1", meta: new Prisma.Decimal(50), unidad: "personas", codigo: "IND-01", nombre: "Empleo" };
const fila = (over: object = {}) => ({
  id: "med-1",
  proyecto_id: "pry-1",
  indicador_id: "ind-1",
  fecha: new Date("2026-10-06T00:00:00.000Z"),
  valor: new Prisma.Decimal(10),
  observacion: null,
  registrado_por_id: "ger-1",
  created_at: new Date("2026-10-08T12:00:00.000Z"),
  anulado_at: null,
  anulado_por_id: null,
  motivo_anulacion: null,
  ...over,
});

const ctx = { params: Promise.resolve({ id: "pry-1", indicatorId: "ind-1" }) };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
function post(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/indicators/ind-1/measurements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const get = () => new Request("http://localhost/api/v1/projects/pry-1/indicators/ind-1/measurements");
const valido = { fecha: "2026-10-06", valor: 12 };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T15:00:00.000Z"));
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
  vi.mocked(db.indicador.findFirst).mockResolvedValue(indicador as never);
  vi.mocked(db.medicionIndicador.findMany).mockResolvedValue([] as never);
  mocks.create.mockImplementation(async ({ data }: { data: object }) => fila(data));
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("POST measurements", () => {
  it("creates for GERENCIA and a member COORDINADOR with an audit row (201)", async () => {
    expect((await POST(post(valido), ctx)).status).toBe(201);
    authAs(coordinador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("EN_EJECUCION", true));
    expect((await POST(post(valido), ctx)).status).toBe(201);
    expect(logChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ accion: "CREAR", entidad: "medicion", proyecto_id: "pry-1" }),
    );
  });

  it("answers 403 for a non-member COORDINADOR and a COLABORADOR, 404 and 409 INVALID_STATE", async () => {
    for (const usuario of [coordinador, colaborador]) {
      authAs(usuario);
      expect((await POST(post(valido), ctx)).status, usuario.rol).toBe(403);
    }
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await POST(post(valido), ctx)).status).toBe(404);
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(proyecto("BORRADOR"));
    const res = await POST(post(valido), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("INVALID_STATE");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("answers 404 for an indicator outside the project", async () => {
    vi.mocked(db.indicador.findFirst).mockResolvedValueOnce(null);
    expect((await POST(post(valido), ctx)).status).toBe(404);
  });

  it("validates the body: negative valor, future fecha, unknown keys (400); zero is fine", async () => {
    for (const body of [
      { ...valido, valor: -1 },
      { ...valido, fecha: "2026-10-09" },
      { ...valido, fecha: "10/06/2026" },
      { ...valido, extra: 1 },
      { fecha: "2026-10-06" },
    ]) {
      expect((await POST(post(body), ctx)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await POST(post({ ...valido, valor: 0 }), ctx)).status).toBe(201);
  });

  it("returns ultima and tendencia against the previous live measurement", async () => {
    vi.mocked(db.medicionIndicador.findMany).mockResolvedValue([fila({ id: "m0", valor: new Prisma.Decimal(5) })] as never);
    mocks.create.mockResolvedValue(fila({ id: "m1", fecha: new Date("2026-10-07T00:00:00.000Z"), valor: new Prisma.Decimal(12) }));
    const body = await (await POST(post(valido), ctx)).json();
    expect(body.medicion.valor).toBe("12");
    expect(body.ultima.valor).toBe("12");
    expect(body.tendencia).toBe("sube");
  });
});

describe("GET measurements", () => {
  it("lists in chronological order, flags the trend and ignores voided rows for ultima", async () => {
    vi.mocked(db.medicionIndicador.findMany).mockResolvedValue([
      fila({ id: "a", fecha: new Date("2026-10-01T00:00:00.000Z"), valor: new Prisma.Decimal(20) }),
      fila({ id: "b", fecha: new Date("2026-10-02T00:00:00.000Z"), valor: new Prisma.Decimal(15) }),
      fila({
        id: "c",
        fecha: new Date("2026-10-03T00:00:00.000Z"),
        valor: new Prisma.Decimal(99),
        anulado_at: new Date("2026-10-04T00:00:00.000Z"),
        motivo_anulacion: "Error",
      }),
    ] as never);
    const body = await (await GET(get(), ctx)).json();
    expect(body.estado).toBe("EN_EJECUCION");
    expect(body.mediciones.map((m: { id: string }) => m.id)).toEqual(["a", "b", "c"]);
    expect(body.ultima.id).toBe("b");
    expect(body.tendencia).toBe("baja");
  });

  it("has no tendencia with a single live measurement and none without any", async () => {
    vi.mocked(db.medicionIndicador.findMany).mockResolvedValue([fila()] as never);
    expect((await (await GET(get(), ctx)).json()).tendencia).toBeNull();
    vi.mocked(db.medicionIndicador.findMany).mockResolvedValue([] as never);
    const empty = await (await GET(get(), ctx)).json();
    expect(empty.ultima).toBeNull();
    expect(empty.tendencia).toBeNull();
  });

  it("reports igual for equal values and answers 403/404", async () => {
    vi.mocked(db.medicionIndicador.findMany).mockResolvedValue([
      fila({ id: "a", fecha: new Date("2026-10-01T00:00:00.000Z") }),
      fila({ id: "b", fecha: new Date("2026-10-02T00:00:00.000Z") }),
    ] as never);
    expect((await (await GET(get(), ctx)).json()).tendencia).toBe("igual");
    authAs(colaborador);
    expect((await GET(get(), ctx)).status).toBe(403);
    authAs(gerencia);
    vi.mocked(db.indicador.findFirst).mockResolvedValueOnce(null);
    expect((await GET(get(), ctx)).status).toBe(404);
  });
});
