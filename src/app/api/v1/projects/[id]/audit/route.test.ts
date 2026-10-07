// GET /api/v1/projects/:id/audit — history of one project (P02, REQ-AUD-04).
//
// The gate mirrors the detail route exactly: 404 for a missing/soft-deleted
// project, then 403 for a project the actor may not read (existence first,
// visibility second). The reader is NOT mocked: the test drives the real query
// through the mocked `@/lib/db`, so the actor fallback is exercised end to end.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    auditoriaCambio: { findMany: vi.fn() },
    usuario: { findMany: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

const routeContext = { params: Promise.resolve({ id: "pry-1" }) };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

function getRequest(): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/audit");
}

// The E-05 conversion: CONVERTIR (oportunidad) and CREAR (proyecto) written by
// one logChanges call, hence the shared lote_id and the identical created_at.
const filas = [
  {
    id: "aud-crear",
    created_at: new Date("2026-10-06T20:39:51.751Z"),
    usuario_id: "ger-1",
    accion: "CREAR",
    entidad: "proyecto",
    entidad_id: "pry-1",
    campo: null,
    valor_anterior: null,
    valor_nuevo: { codigo: "PRY-2026-001", origen: "OPORTUNIDAD" },
    lote_id: "lote-1",
  },
  {
    id: "aud-convertir",
    created_at: new Date("2026-10-06T20:39:51.751Z"),
    usuario_id: "ger-1",
    accion: "CONVERTIR",
    entidad: "oportunidad",
    entidad_id: "op-1",
    campo: null,
    valor_anterior: { fase: "PROSPECCION", fecha_adjudicacion: null },
    valor_nuevo: { fase: "EJECUCION" },
    lote_id: "lote-1",
  },
];

beforeEach(() => {
  authAs(gerencia);
  // `loadProjectScoped` projects the actor's active membership alongside the
  // id; the default fixture is a non-member (managers pass on their role).
  vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "pry-1", miembros: [] } as never);
  vi.mocked(db.auditoriaCambio.findMany).mockResolvedValue(filas as never);
  vi.mocked(db.usuario.findMany).mockResolvedValue([
    { id: "ger-1", nombre: "Gerencia Demo" },
  ] as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/projects/:id/audit", () => {
  it("returns 401 when unauthenticated and never reads the project", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), {
        status: 401,
      }),
    });

    const res = await GET(getRequest(), routeContext);

    expect(res.status).toBe(401);
    expect(db.proyecto.findFirst).not.toHaveBeenCalled();
    expect(db.auditoriaCambio.findMany).not.toHaveBeenCalled();
  });

  it("returns the project history in the Spanish envelope", async () => {
    const res = await GET(getRequest(), routeContext);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(db.proyecto.findFirst).toHaveBeenCalledWith({
      where: { id: "pry-1", deleted_at: null },
      select: {
        id: true,
        miembros: {
          where: { usuario_id: "ger-1", removed_at: null },
          select: { id: true },
          take: 1,
        },
      },
    });
    expect(json.historial).toHaveLength(2);
    expect(json.historial[0]).toMatchObject({
      id: "aud-crear",
      created_at: "2026-10-06T20:39:51.751Z",
      accion: "CREAR",
      entidad: "proyecto",
      usuario_id: "ger-1",
      usuario_nombre: "Gerencia Demo",
      lote_id: "lote-1",
    });
    // Both rows of the conversion share one audited step.
    expect(json.historial.map((entry: { lote_id: string }) => entry.lote_id)).toEqual([
      "lote-1",
      "lote-1",
    ]);
  });

  it("returns 404 for an unknown or deleted project without reading the ledger", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await GET(getRequest(), routeContext);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.code).toBe("NOT_FOUND");
    expect(json.error).toBe("El proyecto no existe.");
    expect(db.auditoriaCambio.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 for a COLABORADOR without project read scope", async () => {
    authAs(colaborador);

    const res = await GET(getRequest(), routeContext);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.code).toBe("FORBIDDEN");
    expect(json.error).toBe("No tienes permisos sobre este proyecto.");
    expect(db.auditoriaCambio.findMany).not.toHaveBeenCalled();
  });

  it("returns 200 for a COORDINADOR who is an active member", async () => {
    authAs(coordinador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({
      id: "pry-1",
      miembros: [{ id: "miembro-1" }],
    } as never);

    const res = await GET(getRequest(), routeContext);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.historial).toHaveLength(2);
  });

  it("returns 403 for a COORDINADOR who is not an active member", async () => {
    authAs(coordinador);

    const res = await GET(getRequest(), routeContext);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.code).toBe("FORBIDDEN");
    expect(db.auditoriaCambio.findMany).not.toHaveBeenCalled();
  });

  it("settles existence before visibility: 404 wins for a project the actor could not read", async () => {
    authAs(colaborador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await GET(getRequest(), routeContext);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.code).toBe("NOT_FOUND");
    expect(db.auditoriaCambio.findMany).not.toHaveBeenCalled();
  });

  it("degrades to usuario_nombre null when the actor no longer exists", async () => {
    vi.mocked(db.usuario.findMany).mockResolvedValue([] as never);

    const res = await GET(getRequest(), routeContext);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.historial[0].usuario_nombre).toBeNull();
    expect(json.historial[0].usuario_id).toBe("ger-1");
  });
});
