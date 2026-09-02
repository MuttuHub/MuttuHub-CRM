import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    setting: {
      findUnique: vi.fn(),
    },
    tarea: {
      findFirst: vi.fn(),
    },
    documento: {
      findFirst: vi.fn(),
    },
    documentoVersion: {
      findFirst: vi.fn(),
    },
    adjuntoTarea: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api/audit", () => ({ logAudit: vi.fn() }));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { POST } from "./route";

const colaborador = { id: "colab-1", nombre: "Colab", rol: "COLABORADOR" } as Usuario;

const routeContext = { params: Promise.resolve({ id: "task-1" }) };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

function bodyRequest(documento_id: string): Request {
  return new Request("http://localhost/api/v1/tasks/task-1/attachments/from-document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documento_id }),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /tasks/:id/attachments/from-document", () => {
  beforeEach(() => {
    authAs(colaborador);
    vi.mocked(db.setting.findUnique).mockResolvedValue(null);
    vi.mocked(db.tarea.findFirst).mockResolvedValue({
      id: "task-1",
      responsable_id: "colab-1",
      cliente_id: null,
      estado: "POR_HACER",
      motivo_bloqueo: null,
      cliente: null,
    } as never);
  });

  it("attaches the active version of the document without re-uploading (201)", async () => {
    vi.mocked(db.documento.findFirst)
      .mockResolvedValueOnce({ id: "doc-1", categoria: "Comercial" } as never)
      .mockResolvedValueOnce({ id: "doc-1", titulo: "Contrato marco" } as never);
    vi.mocked(db.documentoVersion.findFirst).mockResolvedValue({
      storage_path: "documentos/general/doc-1/v1_contrato.pdf",
      tipo_archivo: "application/pdf",
      tamano_bytes: 100,
    } as never);
    vi.mocked(db.adjuntoTarea.create).mockResolvedValue({
      id: "adj-1",
      nombre: "Contrato marco",
      tamano_bytes: 100,
      created_at: new Date("2026-01-01"),
    } as never);

    const res = await POST(bodyRequest("doc-1"), routeContext);

    expect(res.status).toBe(201);
    expect(db.adjuntoTarea.create).toHaveBeenCalledWith({
      data: {
        tarea_id: "task-1",
        storage_path: "documentos/general/doc-1/v1_contrato.pdf",
        nombre: "Contrato marco",
        tamano_bytes: 100,
        documento_id: "doc-1",
      },
      select: { id: true, nombre: true, tamano_bytes: true, created_at: true },
    });
  });

  // El test de la escalada (plan §Verificación): las descargas de adjuntos de
  // tarea NO revalidan Documento.categoria, así que sin el segundo gate un
  // COLABORADOR adjuntaría un documento Legal a su propia tarea y lo bajaría.
  it("blocks a COLABORADOR attaching a restricted-category document (403)", async () => {
    // loadDocumentForRead: findFirst devuelve categoria Legal -> 403.
    vi.mocked(db.documento.findFirst).mockResolvedValue({
      id: "doc-1",
      categoria: "Legal",
    } as never);

    const res = await POST(bodyRequest("doc-1"), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.adjuntoTarea.create).not.toHaveBeenCalled();
  });

  it("returns 403 when the task is not writable by the caller", async () => {
    vi.mocked(db.tarea.findFirst).mockResolvedValue({
      id: "task-1",
      responsable_id: "otro-usuario",
      cliente_id: null,
      estado: "POR_HACER",
      motivo_bloqueo: null,
      cliente: null,
    } as never);

    const res = await POST(bodyRequest("doc-1"), routeContext);

    expect(res.status).toBe(403);
    expect(db.adjuntoTarea.create).not.toHaveBeenCalled();
  });

  it("returns 400 without documento_id", async () => {
    const res = await POST(
      new Request("http://localhost/api/v1/tasks/task-1/attachments/from-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      routeContext,
    );

    expect(res.status).toBe(400);
  });

  it("returns 404 for a nonexistent document", async () => {
    vi.mocked(db.documento.findFirst).mockResolvedValue(null);

    const res = await POST(bodyRequest("doc-ghost"), routeContext);

    expect(res.status).toBe(404);
    expect(db.adjuntoTarea.create).not.toHaveBeenCalled();
  });
});