import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
  isSupabaseConfigured: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    proyecto: {
      findFirst: vi.fn(),
    },
    gasto: {
      findFirst: vi.fn(),
    },
    soporteProyecto: {
      findMany: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const visualizador = { id: "colab-1", rol: "COLABORADOR", puede_ver_tablero_gerencial: true } as Usuario;
const ajeno = { id: "colab-3", rol: "COLABORADOR", puede_ver_tablero_gerencial: false } as Usuario;

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

const routeContext = { params: Promise.resolve({ id: "proy-1", expenseId: "gas-1" }) };

function soporteRow() {
  return {
    id: "sop-1",
    proyecto_id: "proy-1",
    actividad_id: null,
    gasto_id: "gas-1",
    tipo: "LEGALIZACION" as const,
    nombre: "Factura-001.pdf",
    storage_path: null,
    url_externa: "https://drive.example/factura",
    tamano_bytes: null,
    documento_id: null,
    subido_por_id: "colab-2",
    created_at: new Date("2026-01-01"),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/projects/:id/expenses/:expenseId/attachments", () => {
  it("returns 404 when the project does not exist", async () => {
    authAs(visualizador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost"), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 403 for a COLABORADOR without project visibility", async () => {
    authAs(ajeno);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);

    const res = await GET(new Request("http://localhost"), routeContext);

    expect(res.status).toBe(403);
  });

  it("returns 404 when the gasto does not belong to this project", async () => {
    authAs(visualizador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.gasto.findFirst).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost"), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  // RF-06: "Soporte financiero requiere rubro_id trazable" — la trazabilidad
  // al rubro es vía FK (gasto -> linea -> rubro, T3/design.md), así que este
  // scope solo necesita confirmar que el gasto exista y pertenezca al proyecto.
  it("lists only the soportes scoped to this gasto_id", async () => {
    authAs(visualizador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.gasto.findFirst).mockResolvedValue({ id: "gas-1", proyecto_id: "proy-1" } as never);
    vi.mocked(db.soporteProyecto.findMany).mockResolvedValue([soporteRow()] as never);

    const res = await GET(new Request("http://localhost"), routeContext);

    expect(res.status).toBe(200);
    expect(db.soporteProyecto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { gasto_id: "gas-1", proyecto_id: "proy-1", deleted_at: null } }),
    );
    const json = await res.json();
    expect(json.soportes).toHaveLength(1);
    expect(json.soportes[0]).toMatchObject({ id: "sop-1", tipo: "LEGALIZACION" });
  });
});
