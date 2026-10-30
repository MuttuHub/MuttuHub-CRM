// GET/POST /api/v1/projects/:id/activities/:activityId/progress (AJ-01, S2/S3/S9/S11).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  requiereMedio: { valor: true, confirmado: false },
  tope: { valor: 90, confirmado: false },
}));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: vi.fn(), logChanges: vi.fn() };
});
vi.mock("@/lib/settings", () => ({
  getSemaforoParametrosV2: vi.fn(async () => ({ avance_requiere_medio: mocks.requiereMedio, tope_en_curso: mocks.tope })),
}));
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    actividad: { findFirst: vi.fn() },
    entregable: { findMany: vi.fn(async () => []) },
    soporteProyecto: { groupBy: vi.fn(async () => []) },
    reporteActividad: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ reporteActividad: { create: mocks.create } }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { GET, POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const admin = { id: "adm-1", rol: "ADMINISTRADOR" } as Usuario;
const responsable = { id: "resp-1", rol: "COORDINADOR" } as Usuario;
const otroCoordinador = { id: "coord-2", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "col-1", rol: "COLABORADOR" } as Usuario;

const proyecto = (estado = "EN_EJECUCION", miembro = false) =>
  ({ id: "pry-1", estado, fecha_inicio: null, fecha_fin: null, miembros: miembro ? [{ id: "m-1" }] : [] }) as never;
const actividad = (responsable_id: string | null = "resp-1") => ({ id: "act-1", responsable_id });

const fila = (over: object = {}) => ({
  id: "rep-1",
  proyecto_id: "pry-1",
  actividad_id: "act-1",
  fecha: new Date("2026-10-06T00:00:00.000Z"),
  porcentaje: new Prisma.Decimal(30),
  observacion: "Se ejecutó la primera fase",
  registrado_por_id: "resp-1",
  created_at: new Date("2026-10-08T12:00:00.000Z"),
  anulado_at: null,
  anulado_por_id: null,
  motivo_anulacion: null,
  ...over,
});

const ctx = { params: Promise.resolve({ id: "pry-1", activityId: "act-1" }) };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
function post(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/activities/act-1/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const get = () => new Request("http://localhost/api/v1/projects/pry-1/activities/act-1/progress");
const valido = { fecha: "2026-10-06", porcentaje: 30, observacion: "Se ejecutó la primera fase" };

beforeEach(() => {
  mocks.requiereMedio = { valor: false, confirmado: true };
  mocks.tope = { valor: 90, confirmado: false };
  authAs(responsable);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("EN_EJECUCION", true));
  vi.mocked(db.actividad.findFirst).mockResolvedValue(actividad() as never);
  vi.mocked(db.entregable.findMany).mockResolvedValue([] as never);
  vi.mocked(db.reporteActividad.findMany).mockResolvedValue([] as never);
  mocks.create.mockImplementation(async ({ data }: { data: object }) => fila(data));
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("POST progress: access matrix (S9.5)", () => {
  it("creates for the activity's own responsable (201)", async () => {
    expect((await POST(post(valido), ctx)).status).toBe(201);
  });

  it("creates for ADMINISTRADOR/GERENCIA even when not the responsable", async () => {
    for (const usuario of [admin, gerencia]) {
      authAs(usuario);
      expect((await POST(post(valido), ctx)).status, usuario.rol).toBe(201);
    }
  });

  it("answers 403 for a COORDINADOR who is not the responsable, and for a COLABORADOR", async () => {
    for (const usuario of [otroCoordinador, colaborador]) {
      authAs(usuario);
      vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("EN_EJECUCION", true));
      expect((await POST(post(valido), ctx)).status, usuario.rol).toBe(403);
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("answers 404 for a missing project, 409 in BORRADOR, 404 for an unknown activity", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await POST(post(valido), ctx)).status).toBe(404);
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(proyecto("BORRADOR", true));
    expect((await POST(post(valido), ctx)).status).toBe(409);
    vi.mocked(db.actividad.findFirst).mockResolvedValueOnce(null);
    expect((await POST(post(valido), ctx)).status).toBe(404);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("POST progress: S3 accept-if sequence", () => {
  it("accepts 30 on Sin iniciar, then 70, then 90 in sequence", async () => {
    vi.mocked(db.reporteActividad.findMany).mockResolvedValueOnce([]);
    let res = await POST(post({ ...valido, porcentaje: 30 }), ctx);
    expect(res.status).toBe(201);

    vi.mocked(db.reporteActividad.findMany).mockResolvedValueOnce([fila({ porcentaje: new Prisma.Decimal(30) })] as never);
    res = await POST(post({ ...valido, porcentaje: 70 }), ctx);
    expect(res.status).toBe(201);

    vi.mocked(db.reporteActividad.findMany).mockResolvedValueOnce([
      fila({ porcentaje: new Prisma.Decimal(30) }),
      fila({ porcentaje: new Prisma.Decimal(70) }),
    ] as never);
    res = await POST(post({ ...valido, porcentaje: 90 }), ctx);
    expect(res.status).toBe(201);
  });

  it('rejects 70 or 50 after a 70 with "El avance debe ser mayor que el último reportado (70%)."', async () => {
    vi.mocked(db.reporteActividad.findMany).mockResolvedValue([fila({ porcentaje: new Prisma.Decimal(70) })] as never);
    for (const porcentaje of [70, 50]) {
      const res = await POST(post({ ...valido, porcentaje }), ctx);
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe("El avance debe ser mayor que el último reportado (70%).");
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('accepts 90 and rejects 95 with "El avance máximo sin entregables completos es 90%." while incomplete', async () => {
    vi.mocked(db.entregable.findMany).mockResolvedValue([
      { id: "ent-1", cantidad_meta: new Prisma.Decimal(10), avances: [] },
    ] as never);
    expect((await POST(post({ ...valido, porcentaje: 90 }), ctx)).status).toBe(201);

    const res = await POST(post({ ...valido, porcentaje: 95 }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("El avance máximo sin entregables completos es 90%.");
  });

  it("allows 100 once every entregable is complete (meta reached + live medio)", async () => {
    mocks.requiereMedio = { valor: true, confirmado: true };
    vi.mocked(db.entregable.findMany).mockResolvedValue([
      { id: "ent-1", cantidad_meta: new Prisma.Decimal(10), avances: [{ id: "av-1", fecha: new Date("2026-10-01"), cantidad: new Prisma.Decimal(10), anulado_at: null }] },
    ] as never);
    vi.mocked(db.soporteProyecto.groupBy).mockResolvedValue([{ avance_id: "av-1", _count: { _all: 1 } }] as never);
    expect((await POST(post({ ...valido, porcentaje: 100 }), ctx)).status).toBe(201);
  });

  it("rejects a missing porcentaje or observación", async () => {
    for (const body of [{ fecha: "2026-10-06", observacion: "x" }, { fecha: "2026-10-06", porcentaje: 30 }]) {
      const res = await POST(post(body), ctx);
      expect(res.status, JSON.stringify(body)).toBe(409);
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("POST progress: result", () => {
  it("answers 201 { reporte } and audits CREAR reporte_actividad", async () => {
    const res = await POST(post(valido), ctx);
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.reporte).toMatchObject({ id: "rep-1", fecha: "2026-10-06", porcentaje: "30", medios: 0 });
    expect(logChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        usuario_id: "resp-1",
        accion: "CREAR",
        entidad: "reporte_actividad",
        entidad_id: "rep-1",
        proyecto_id: "pry-1",
      }),
    );
  });
});

describe("GET progress", () => {
  const rows = [fila(), fila({ id: "rep-2", porcentaje: new Prisma.Decimal(70), anulado_at: new Date("2026-10-09T00:00:00.000Z"), motivo_anulacion: "Error" })];

  beforeEach(() => {
    vi.mocked(db.reporteActividad.findMany).mockResolvedValue(rows as never);
  });

  it("lists every report (voided ones too), oldest first", async () => {
    const res = await GET(get(), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.reportes.map((r: { id: string }) => r.id)).toEqual(["rep-1", "rep-2"]);
    expect(json.estado).toBe("EN_EJECUCION");
  });

  it("is readable by any project reader (not only the responsable), 403 for a stranger, 404 for unknown project/activity", async () => {
    expect((await GET(get(), ctx)).status).toBe(200);
    authAs(colaborador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(proyecto("EN_EJECUCION", false));
    expect((await GET(get(), ctx)).status).toBe(403);
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await GET(get(), ctx)).status).toBe(404);
    vi.mocked(db.actividad.findFirst).mockResolvedValueOnce(null);
    expect((await GET(get(), ctx)).status).toBe(404);
  });
});
