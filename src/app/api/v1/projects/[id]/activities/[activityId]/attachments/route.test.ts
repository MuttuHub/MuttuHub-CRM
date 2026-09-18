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
    actividad: {
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

const routeContext = { params: Promise.resolve({ id: "proy-1", activityId: "act-1" }) };

function soporteRow() {
  return {
    id: "sop-1",
    proyecto_id: "proy-1",
    actividad_id: "act-1",
    gasto_id: null,
    tipo: "VERIFICACION" as const,
    nombre: "Evidencia.pdf",
    storage_path: null,
    url_externa: "https://drive.example/evidencia",
    tamano_bytes: null,
    documento_id: null,
    subido_por_id: "colab-2",
    created_at: new Date("2026-01-01"),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/projects/:id/activities/:activityId/attachments", () => {
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

  it("returns 404 when the activity does not belong to this project", async () => {
    authAs(visualizador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.actividad.findFirst).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost"), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  // RF-04: "Soporte listado en la ficha de la actividad correspondiente".
  it("lists only the soportes scoped to this actividad_id", async () => {
    authAs(visualizador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.actividad.findFirst).mockResolvedValue({ id: "act-1", proyecto_id: "proy-1" } as never);
    vi.mocked(db.soporteProyecto.findMany).mockResolvedValue([soporteRow()] as never);

    const res = await GET(new Request("http://localhost"), routeContext);

    expect(res.status).toBe(200);
    expect(db.soporteProyecto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { actividad_id: "act-1", proyecto_id: "proy-1", deleted_at: null } }),
    );
    const json = await res.json();
    expect(json.soportes).toHaveLength(1);
    expect(json.soportes[0]).toMatchObject({ id: "sop-1", download_url: "https://drive.example/evidencia" });
  });
});
