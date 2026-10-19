// GET/POST /api/v1/projects/:id/beneficiaries (S4 U4).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    actividad: { findFirst: vi.fn() },
    registroBeneficiario: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ registroBeneficiario: { create: mocks.create } }),
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
const fila = (over: object = {}) => ({
  id: "ben-1",
  proyecto_id: "pry-1",
  actividad_id: null,
  fecha: new Date("2026-10-06T00:00:00.000Z"),
  cantidad: 20,
  observacion: null,
  registrado_por_id: "ger-1",
  created_at: new Date("2026-10-08T12:00:00.000Z"),
  anulado_at: null,
  anulado_por_id: null,
  motivo_anulacion: null,
  ...over,
});

const ctx = { params: Promise.resolve({ id: "pry-1" }) };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
function post(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/beneficiaries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const get = () => new Request("http://localhost/api/v1/projects/pry-1/beneficiaries");
const valido = { fecha: "2026-10-06", cantidad: 20 };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T15:00:00.000Z"));
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
  vi.mocked(db.actividad.findFirst).mockResolvedValue({ id: "act-1" } as never);
  vi.mocked(db.registroBeneficiario.findMany).mockResolvedValue([] as never);
  mocks.create.mockImplementation(async ({ data }: { data: object }) => fila(data));
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("POST beneficiaries", () => {
  it("creates for GERENCIA and a member COORDINADOR and audits `beneficiarios` (201)", async () => {
    expect((await POST(post(valido), ctx)).status).toBe(201);
    authAs(coordinador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("EN_EJECUCION", true));
    expect((await POST(post(valido), ctx)).status).toBe(201);
    expect(logChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ accion: "CREAR", entidad: "beneficiarios", proyecto_id: "pry-1" }),
    );
  });

  it("answers 403, 404 and 409 INVALID_STATE in the documented order", async () => {
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
  });

  it("validates cantidad as a positive integer, fecha not in the future, unknown keys", async () => {
    for (const body of [
      { ...valido, cantidad: 0 },
      { ...valido, cantidad: 1.5 },
      { ...valido, cantidad: -2 },
      { ...valido, fecha: "2026-10-09" },
      { ...valido, extra: true },
    ]) {
      expect((await POST(post(body), ctx)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it("rejects an activity of another project (400) and stores one of this project", async () => {
    vi.mocked(db.actividad.findFirst).mockResolvedValueOnce(null);
    const res = await POST(post({ ...valido, actividad_id: "act-ajena" }), ctx);
    expect(res.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
    expect((await POST(post({ ...valido, actividad_id: "act-1" }), ctx)).status).toBe(201);
    expect(vi.mocked(db.actividad.findFirst).mock.calls[1][0]).toMatchObject({
      where: { id: "act-1", proyecto_id: "pry-1", deleted_at: null },
    });
  });
});

describe("GET beneficiaries", () => {
  it("returns the registros and a total that excludes voided rows", async () => {
    vi.mocked(db.registroBeneficiario.findMany).mockResolvedValue([
      fila({ id: "a", cantidad: 20 }),
      fila({ id: "b", cantidad: 15 }),
      fila({ id: "c", cantidad: 100, anulado_at: new Date(), motivo_anulacion: "Duplicado" }),
    ] as never);
    const body = await (await GET(get(), ctx)).json();
    expect(body.registros).toHaveLength(3);
    expect(body.total).toBe(35);
    expect(body.estado).toBe("EN_EJECUCION");
  });

  it("answers 403 for a COLABORADOR and 404 for a missing project", async () => {
    authAs(colaborador);
    expect((await GET(get(), ctx)).status).toBe(403);
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await GET(get(), ctx)).status).toBe(404);
  });
});
