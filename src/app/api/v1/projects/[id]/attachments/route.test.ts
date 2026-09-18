// jsdom (default vitest environment) doesn't implement Request.formData()
// correctly (see the same note in tasks/[id]/attachments/route.test.ts) —
// Node's native Request/FormData/File (undici) handle it correctly.
// @vitest-environment node
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
    gasto: {
      findFirst: vi.fn(),
    },
    soporteProyecto: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { GET, POST } from "./route";

const gerencia = { id: "gerencia-1", rol: "GERENCIA", puede_ver_tablero_gerencial: false } as Usuario;
const visualizador = { id: "colab-1", rol: "COLABORADOR", puede_ver_tablero_gerencial: true } as Usuario;
const responsable = { id: "colab-2", rol: "COLABORADOR", puede_ver_tablero_gerencial: false } as Usuario;
const ajeno = { id: "colab-3", rol: "COLABORADOR", puede_ver_tablero_gerencial: false } as Usuario;

const routeContext = { params: Promise.resolve({ id: "proy-1" }) };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

function proyectoRow() {
  return { id: "proy-1", responsable_id: "colab-2" };
}

function soporteRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? "sop-1",
    proyecto_id: "proy-1",
    actividad_id: overrides.actividad_id ?? null,
    gasto_id: overrides.gasto_id ?? null,
    tipo: overrides.tipo ?? "VERIFICACION",
    nombre: overrides.nombre ?? "Informe.pdf",
    storage_path: overrides.storage_path ?? null,
    url_externa: overrides.url_externa ?? null,
    tamano_bytes: overrides.tamano_bytes ?? null,
    documento_id: null,
    subido_por_id: "colab-2",
    created_at: new Date("2026-01-01"),
  };
}

function multipartRequest(fields: Record<string, string | File>): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new Request("http://localhost/api/v1/projects/proy-1/attachments", {
    method: "POST",
    body: form,
  });
}

function mockUploadOk() {
  vi.mocked(createSupabaseAdmin).mockReturnValue({
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.example/file" }, error: null }),
      }),
    },
  } as never);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/projects/:id/attachments", () => {
  it("returns 404 when the project does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/attachments"), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 403 for a COLABORADOR without project visibility (read scoped to canViewProject)", async () => {
    authAs(ajeno);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyectoRow() as never);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/attachments"), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns 200 with the project's soportes for a management-only viewer", async () => {
    authAs(visualizador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyectoRow() as never);
    vi.mocked(db.soporteProyecto.findMany).mockResolvedValue([soporteRow()] as never);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/attachments"), routeContext);

    expect(res.status).toBe(200);
    expect(db.soporteProyecto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { proyecto_id: "proy-1", deleted_at: null } }),
    );
    const json = await res.json();
    expect(json.soportes).toHaveLength(1);
  });

  it("resolves a signed download_url for a storage_path soporte and passes url_externa through unchanged", async () => {
    authAs(responsable);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyectoRow() as never);
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(db.soporteProyecto.findMany).mockResolvedValue([
      soporteRow({ id: "sop-file", storage_path: "proyectos/proy-1/soportes/sop-file_a.pdf" }),
      soporteRow({ id: "sop-url", storage_path: null, url_externa: "https://drive.example/x" }),
    ] as never);
    mockUploadOk();

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/attachments"), routeContext);

    expect(res.status).toBe(200);
    const json = await res.json();
    const byId = Object.fromEntries(json.soportes.map((s: { id: string; download_url: string | null }) => [s.id, s.download_url]));
    expect(byId["sop-file"]).toBe("https://signed.example/file");
    expect(byId["sop-url"]).toBe("https://drive.example/x");
  });
});

describe("POST /api/v1/projects/:id/attachments", () => {
  it("returns 400 when nombre is missing", async () => {
    authAs(responsable);

    const res = await POST(multipartRequest({ tipo: "VERIFICACION", url: "https://drive.example/x" }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.proyecto.findFirst).not.toHaveBeenCalled();
  });

  it("returns 400 when tipo is not a valid TipoSoporte", async () => {
    authAs(responsable);

    const res = await POST(
      multipartRequest({ nombre: "Acta", tipo: "INVALIDO", url: "https://drive.example/x" }),
      routeContext,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 when neither file nor url is provided (D8 XOR)", async () => {
    authAs(responsable);

    const res = await POST(multipartRequest({ nombre: "Acta", tipo: "VERIFICACION" }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 when both file and url are provided (D8 XOR)", async () => {
    authAs(responsable);
    const file = new File([new Uint8Array([1])], "a.pdf", { type: "application/pdf" });

    const res = await POST(
      multipartRequest({ nombre: "Acta", tipo: "VERIFICACION", url: "https://drive.example/x", file }),
      routeContext,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects an http:// url_externa at the API layer", async () => {
    authAs(responsable);

    const res = await POST(
      multipartRequest({ nombre: "Acta", tipo: "VERIFICACION", url: "http://drive.example/x" }),
      routeContext,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.soporteProyecto.create).not.toHaveBeenCalled();
  });

  it("returns 400 when both actividad_id and gasto_id are provided (destino_unico)", async () => {
    authAs(responsable);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyectoRow() as never);

    const res = await POST(
      multipartRequest({
        nombre: "Acta",
        tipo: "VERIFICACION",
        url: "https://drive.example/x",
        actividad_id: "act-1",
        gasto_id: "gas-1",
      }),
      routeContext,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.soporteProyecto.create).not.toHaveBeenCalled();
  });

  it("returns 404 when the project does not exist", async () => {
    authAs(responsable);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await POST(
      multipartRequest({ nombre: "Acta", tipo: "VERIFICACION", url: "https://drive.example/x" }),
      routeContext,
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 403 for a COLABORADOR who is not the project's responsable (upload gated by canManageProject)", async () => {
    authAs(ajeno);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyectoRow() as never);

    const res = await POST(
      multipartRequest({ nombre: "Acta", tipo: "VERIFICACION", url: "https://drive.example/x" }),
      routeContext,
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.soporteProyecto.create).not.toHaveBeenCalled();
  });

  it("returns 403 for a management-only viewer trying to upload (the flag never composes in write)", async () => {
    authAs(visualizador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyectoRow() as never);

    const res = await POST(
      multipartRequest({ nombre: "Acta", tipo: "VERIFICACION", url: "https://drive.example/x" }),
      routeContext,
    );

    expect(res.status).toBe(403);
    expect(db.soporteProyecto.create).not.toHaveBeenCalled();
  });

  it("returns 400 when actividad_id does not belong to the project", async () => {
    authAs(responsable);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyectoRow() as never);
    vi.mocked(db.actividad.findFirst).mockResolvedValue(null);

    const res = await POST(
      multipartRequest({
        nombre: "Acta",
        tipo: "VERIFICACION",
        url: "https://drive.example/x",
        actividad_id: "act-otro-proyecto",
      }),
      routeContext,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.soporteProyecto.create).not.toHaveBeenCalled();
  });

  it("creates a soporte with an https url_externa (accepted)", async () => {
    authAs(responsable);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyectoRow() as never);
    vi.mocked(db.soporteProyecto.create).mockResolvedValue(
      soporteRow({ url_externa: "https://drive.example/x" }) as never,
    );

    const res = await POST(
      multipartRequest({ nombre: "Acta", tipo: "VERIFICACION", url: "https://drive.example/x" }),
      routeContext,
    );

    expect(res.status).toBe(201);
    expect(db.soporteProyecto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          proyecto_id: "proy-1",
          url_externa: "https://drive.example/x",
          storage_path: null,
        }),
      }),
    );
  });

  it("uploads a file, builds the storage key with projectSupportStoragePath and creates the soporte", async () => {
    authAs(responsable);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyectoRow() as never);
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(db.soporteProyecto.create).mockResolvedValue(
      soporteRow({ storage_path: "proyectos/proy-1/soportes/x_a.pdf", tamano_bytes: 1 }) as never,
    );
    const uploadMock = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createSupabaseAdmin).mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          upload: uploadMock,
          createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.example/file" }, error: null }),
        }),
      },
    } as never);
    const file = new File([new Uint8Array([1, 2, 3])], "a.pdf", { type: "application/pdf" });

    const res = await POST(multipartRequest({ nombre: "Acta", tipo: "VERIFICACION", file }), routeContext);

    expect(res.status).toBe(201);
    const uploadedPath = uploadMock.mock.calls[0]![0] as string;
    expect(uploadedPath).toMatch(/^proyectos\/proy-1\/soportes\//);
    expect(db.soporteProyecto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ proyecto_id: "proy-1", url_externa: null, tamano_bytes: 3 }),
      }),
    );
  });

  it("accepts an actividad_id that belongs to the project (RF-04)", async () => {
    authAs(responsable);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyectoRow() as never);
    vi.mocked(db.actividad.findFirst).mockResolvedValue({ id: "act-1", proyecto_id: "proy-1" } as never);
    vi.mocked(db.soporteProyecto.create).mockResolvedValue(
      soporteRow({ actividad_id: "act-1", url_externa: "https://drive.example/x" }) as never,
    );

    const res = await POST(
      multipartRequest({
        nombre: "Acta",
        tipo: "VERIFICACION",
        url: "https://drive.example/x",
        actividad_id: "act-1",
      }),
      routeContext,
    );

    expect(res.status).toBe(201);
    expect(db.soporteProyecto.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actividad_id: "act-1" }) }),
    );
  });
});
