import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/db", () => ({ db: { proyecto: { findFirst: vi.fn() } } }));

import { db } from "@/lib/db";
import { gateEjecucionRead, gateEjecucionVoid, gateEjecucionWrite } from "./ejecucion";

const user = (rol: string) => ({ id: "u-1", rol }) as Usuario;
const row = (estado: string, miembro: boolean) =>
  ({ id: "pry-1", estado, fecha_inicio: null, fecha_fin: null, miembros: miembro ? [{ id: "m-1" }] : [] }) as never;

afterEach(() => vi.clearAllMocks());

async function write(rol: string, estado: string, miembro: boolean) {
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(row(estado, miembro));
  return gateEjecucionWrite(user(rol), "pry-1");
}

describe("gateEjecucionWrite", () => {
  it("answers 404 for a missing project", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);
    const gate = await gateEjecucionWrite(user("ADMINISTRADOR"), "pry-1");
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(404);
  });

  it("lets ADM, GER and a member COORDINADOR through while EN_EJECUCION", async () => {
    for (const [rol, miembro] of [["ADMINISTRADOR", false], ["GERENCIA", false], ["COORDINADOR", true]] as const) {
      const gate = await write(rol, "EN_EJECUCION", miembro);
      expect(gate.ok, rol).toBe(true);
      if (gate.ok) expect(gate.value.estado).toBe("EN_EJECUCION");
    }
  });

  it("answers 403 for a non-member COORDINADOR and a COLABORADOR (member or not)", async () => {
    for (const [rol, miembro] of [["COORDINADOR", false], ["COLABORADOR", true], ["COLABORADOR", false]] as const) {
      const gate = await write(rol, "EN_EJECUCION", miembro);
      expect(gate.ok, rol).toBe(false);
      if (!gate.ok) expect(gate.response.status).toBe(403);
    }
  });

  it("answers 409 INVALID_STATE outside EN_EJECUCION, after the 403", async () => {
    const gate = await write("GERENCIA", "BORRADOR", false);
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.response.status).toBe(409);
      expect((await gate.response.json()).code).toBe("INVALID_STATE");
    }
    const forbidden = await write("COORDINADOR", "BORRADOR", false);
    if (!forbidden.ok) expect(forbidden.response.status).toBe(403);
  });
});

describe("gateEjecucionRead", () => {
  it("returns the estado and dates for a reader and 403 for a stranger", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(row("BORRADOR", false));
    const ok = await gateEjecucionRead(user("GERENCIA"), "pry-1");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value).toMatchObject({ id: "pry-1", estado: "BORRADOR" });
    const denied = await gateEjecucionRead(user("COORDINADOR"), "pry-1");
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.response.status).toBe(403);
  });
});

describe("gateEjecucionVoid", () => {
  it("is manager-only and works in any estado", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "pry-1", estado: "CERRADO" } as never);
    expect((await gateEjecucionVoid(user("ADMINISTRADOR"), "pry-1")).ok).toBe(true);
    const denied = await gateEjecucionVoid(user("COORDINADOR"), "pry-1");
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.response.status).toBe(403);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);
    const missing = await gateEjecucionVoid(user("ADMINISTRADOR"), "pry-1");
    if (!missing.ok) expect(missing.response.status).toBe(404);
  });
});
