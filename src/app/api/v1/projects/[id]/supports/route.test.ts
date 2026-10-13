// GET /api/v1/projects/:id/supports (v7 Soportes tab).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    soporteProyecto: { findMany: vi.fn() },
    usuario: { findMany: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "col-1", rol: "COLABORADOR" } as Usuario;
const ctx = { params: Promise.resolve({ id: "pry-1" }) };
const get = () => new Request("http://localhost/api/v1/projects/pry-1/supports");

const proyecto = (miembro = false) =>
  ({ id: "pry-1", estado: "EN_EJECUCION", fecha_inicio: null, fecha_fin: null, miembros: miembro ? [{ id: "m-1" }] : [] }) as never;

const base = {
  proyecto_id: "pry-1",
  avance_id: null,
  medicion_id: null,
  gasto_id: null,
  storage_path: null,
  url_externa: null,
  tipo_mime: null,
  tamano_bytes: null,
  subido_por_id: "ger-1",
  created_at: new Date("2026-10-08T12:00:00.000Z"),
  avance: null,
  medicion: null,
  gasto: null,
};

beforeEach(() => {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario: gerencia, supabaseUser: {} as never });
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
  vi.mocked(db.usuario.findMany).mockResolvedValue([{ id: "ger-1", nombre: "Ana Gerente" }] as never);
});

describe("GET /projects/:id/supports", () => {
  it("404 when the project does not exist", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);
    expect((await GET(get(), ctx)).status).toBe(404);
  });

  it("403 for a collaborator who is not a member", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario: colaborador, supabaseUser: {} as never });
    expect((await GET(get(), ctx)).status).toBe(403);
    expect(db.soporteProyecto.findMany).not.toHaveBeenCalled();
  });

  it("lists supports by origin without exposing the storage key", async () => {
    vi.mocked(db.soporteProyecto.findMany).mockResolvedValue([
      {
        ...base,
        id: "s-1",
        nombre: "Listas taller 3.pdf",
        avance_id: "av-1",
        storage_path: "proyectos/pry-1/soportes/x.pdf",
        tipo_mime: "application/pdf",
        tamano_bytes: 2048,
        avance: { entregable: { codigo: "E1", descripcion: "Taller" } },
      },
      { ...base, id: "s-2", nombre: "Drive", medicion_id: "med-1", url_externa: "https://drive.google.com/x", medicion: { indicador: { codigo: "I1", nombre: "Satisfacción" } } },
    ] as never);

    const res = await GET(get(), ctx);
    expect(res.status).toBe(200);
    const { soportes } = await res.json();
    expect(soportes).toHaveLength(2);
    expect(soportes[0]).toMatchObject({ origen: "avance", origen_id: "av-1", tipo: "archivo", vinculo: "E1 · Taller", subido_por: "Ana Gerente" });
    expect(soportes[1]).toMatchObject({ origen: "indicador", tipo: "enlace", url_externa: "https://drive.google.com/x" });
    expect(JSON.stringify(soportes)).not.toContain("storage_path");
    expect(JSON.stringify(soportes)).not.toContain("proyectos/pry-1/soportes");
  });

  it("hides expense supports from a viewer who only has the gerencial flag", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario: { id: "v-1", rol: "COLABORADOR", puede_ver_tablero_gerencial: true } as Usuario,
      supabaseUser: {} as never,
    });
    vi.mocked(db.soporteProyecto.findMany).mockResolvedValue([] as never);

    expect((await GET(get(), ctx)).status).toBe(200);
    expect(vi.mocked(db.soporteProyecto.findMany).mock.lastCall?.[0]?.where).toMatchObject({ gasto_id: null });
  });

  it("does not filter expense supports for a coordinator member", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario: { id: "c-1", rol: "COORDINADOR" } as Usuario, supabaseUser: {} as never });
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto(true));
    vi.mocked(db.soporteProyecto.findMany).mockResolvedValue([] as never);

    await GET(get(), ctx);
    expect(vi.mocked(db.soporteProyecto.findMany).mock.lastCall?.[0]?.where).not.toHaveProperty("gasto_id");
  });

  it("never exposes the link of an expense support", async () => {
    vi.mocked(db.soporteProyecto.findMany).mockResolvedValue([
      { ...base, id: "s-3", nombre: "Factura", gasto_id: "g-1", url_externa: "https://x.test/f", gasto: { numero_documento: "F-9", descripcion: "Software" } },
    ] as never);
    const { soportes } = await (await GET(get(), ctx)).json();
    expect(soportes[0]).toMatchObject({ origen: "gasto", origen_id: "g-1", vinculo: "Gasto F-9 · Software", url_externa: null });
  });
});
