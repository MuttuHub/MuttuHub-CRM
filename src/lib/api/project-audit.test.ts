// Reader + mapper of the project change ledger (REQ-AUD-04). The two things
// this test pins are the ones a careless implementation gets wrong:
//
//   1. The deterministic order. The two rows of one lote share the transaction
//      `created_at`, so `id` is the documented tiebreaker.
//   2. The bounded page. The ledger is append-only; a read must cap at
//      PROJECT_AUDIT_LIMIT.
//
// The actor-name fallback is pinned here too: an `usuario_id` with no surviving
// `usuario` row maps to `usuario_nombre: null` (the column has no FK on
// purpose).

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    auditoriaCambio: { findMany: vi.fn() },
    usuario: { findMany: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import {
  PROJECT_AUDIT_LIMIT,
  PROJECT_AUDIT_ORDER_BY,
  PROJECT_AUDIT_SELECT,
  listProjectAudit,
  toProjectAuditEntry,
  type ProjectAuditRow,
} from "./project-audit";

function row(overrides: Partial<ProjectAuditRow> = {}): ProjectAuditRow {
  return {
    id: "aud-1",
    created_at: new Date("2026-10-06T20:39:51.751Z"),
    usuario_id: "user-1",
    accion: "CONVERTIR",
    entidad: "oportunidad",
    entidad_id: "op-1",
    campo: null,
    valor_anterior: { fase: "PROSPECCION", fecha_adjudicacion: null },
    valor_nuevo: { fase: "EJECUCION" },
    lote_id: "lote-1",
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("toProjectAuditEntry", () => {
  it("returns the ISO instant, the resolved name and the JSON columns untouched", () => {
    const entrada = toProjectAuditEntry(row(), "Ana Pérez");

    expect(entrada).toEqual({
      id: "aud-1",
      created_at: "2026-10-06T20:39:51.751Z",
      usuario_id: "user-1",
      usuario_nombre: "Ana Pérez",
      accion: "CONVERTIR",
      entidad: "oportunidad",
      entidad_id: "op-1",
      campo: null,
      valor_anterior: { fase: "PROSPECCION", fecha_adjudicacion: null },
      valor_nuevo: { fase: "EJECUCION" },
      lote_id: "lote-1",
    });
  });

  it("keeps usuario_nombre null when the actor no longer exists", () => {
    expect(toProjectAuditEntry(row(), null).usuario_nombre).toBeNull();
  });
});

describe("listProjectAudit", () => {
  it("filters by proyecto_id and pages newest-first with the id tiebreaker", async () => {
    vi.mocked(db.auditoriaCambio.findMany).mockResolvedValue([]);
    vi.mocked(db.usuario.findMany).mockResolvedValue([]);

    await listProjectAudit("pry-1");

    expect(db.auditoriaCambio.findMany).toHaveBeenCalledWith({
      where: { proyecto_id: "pry-1" },
      orderBy: [
        { created_at: "desc" },
        { id: "desc" },
      ],
      take: PROJECT_AUDIT_LIMIT,
      select: PROJECT_AUDIT_SELECT,
    });
    // The cap is the OpenAPI-documented bound, not a magic number in the route.
    expect(PROJECT_AUDIT_LIMIT).toBe(100);
    expect(PROJECT_AUDIT_ORDER_BY).toEqual([
      { created_at: "desc" },
      { id: "desc" },
    ]);
  });

  it("resolves the distinct actor ids in a second query and maps every row", async () => {
    vi.mocked(db.auditoriaCambio.findMany).mockResolvedValue([
      row({ id: "aud-1", usuario_id: "user-1" }),
      row({ id: "aud-2", usuario_id: "user-2", entidad: "proyecto", accion: "CREAR" }),
      row({ id: "aud-3", usuario_id: "user-1" }),
    ] as never);
    vi.mocked(db.usuario.findMany).mockResolvedValue([
      { id: "user-1", nombre: "Ana Pérez" },
      { id: "user-2", nombre: "Laura Gómez" },
    ] as never);

    const historial = await listProjectAudit("pry-1");

    expect(db.usuario.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["user-1", "user-2"] } },
      select: { id: true, nombre: true },
    });
    expect(historial.map((entry) => entry.usuario_nombre)).toEqual([
      "Ana Pérez",
      "Laura Gómez",
      "Ana Pérez",
    ]);
  });

  it("degrades honestly when an actor was deleted instead of crashing", async () => {
    vi.mocked(db.auditoriaCambio.findMany).mockResolvedValue([
      row({ id: "aud-1", usuario_id: "user-borrado" }),
    ] as never);
    vi.mocked(db.usuario.findMany).mockResolvedValue([] as never);

    const historial = await listProjectAudit("pry-1");

    expect(historial).toHaveLength(1);
    expect(historial[0]!.usuario_nombre).toBeNull();
    expect(historial[0]!.usuario_id).toBe("user-borrado");
  });

  it("does not run the actor query when the project has no rows", async () => {
    vi.mocked(db.auditoriaCambio.findMany).mockResolvedValue([] as never);

    await expect(listProjectAudit("pry-1")).resolves.toEqual([]);
    expect(db.usuario.findMany).not.toHaveBeenCalled();
  });
});
