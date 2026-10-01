// Key-ownership guard for the ADR-13 signed direct-to-storage uploads
// (S0.9b). The confirm-mode routes trust the `storage_path` only after this
// exact-segment check: a client must never be able to point the server at
// another target's object, at a sibling key whose id merely starts with the
// expected one, or at a traversal/absolute/empty-segment path.

import { describe, expect, it } from "vitest";
import {
  assertKeyBelongsToTarget,
  taskAttachmentStoragePath,
  targetStoragePrefix,
  type SignedUploadTarget,
} from "./signed-upload";

const tareaTarget: SignedUploadTarget = { kind: "tarea", tareaId: "task-1" };
const documentoTarget: SignedUploadTarget = {
  kind: "documento",
  clienteId: "cli-1",
  documentoId: "doc-1",
};
const documentoGeneralTarget: SignedUploadTarget = {
  kind: "documento",
  clienteId: null,
  documentoId: "doc-1",
};

describe("targetStoragePrefix", () => {
  it("uses the exact tareas/{id} and documentos/{cliente}/{id} prefixes", () => {
    expect(targetStoragePrefix(tareaTarget)).toBe("tareas/task-1");
    expect(targetStoragePrefix(documentoTarget)).toBe("documentos/cli-1/doc-1");
    // A document without a single linked client lands in the "general" folder,
    // mirroring documentStoragePath (PRD §6.2).
    expect(targetStoragePrefix(documentoGeneralTarget)).toBe("documentos/general/doc-1");
  });
});

describe("taskAttachmentStoragePath", () => {
  it("keeps today's tareas/{id}/{uuid}_{sanitized-name} convention", () => {
    expect(
      taskAttachmentStoragePath("task-1", "Informe Final Óptimo.pdf", "uuid-1"),
    ).toBe("tareas/task-1/uuid-1_Informe_Final_Optimo.pdf");
  });
});

describe("assertKeyBelongsToTarget — security-critical key ownership", () => {
  it("accepts a path under the exact segment prefix", () => {
    expect(
      assertKeyBelongsToTarget("tareas/task-1/uuid-1_informe.pdf", tareaTarget),
    ).toBe(true);
    expect(
      assertKeyBelongsToTarget("documentos/cli-1/doc-1/v1_informe.pdf", documentoTarget),
    ).toBe(true);
    expect(
      assertKeyBelongsToTarget("documentos/general/doc-1/v1_informe.pdf", documentoGeneralTarget),
    ).toBe(true);
  });

  it("rejects a path for a different id", () => {
    expect(
      assertKeyBelongsToTarget("tareas/task-2/uuid-1_informe.pdf", tareaTarget),
    ).toBe(false);
    expect(
      assertKeyBelongsToTarget("documentos/cli-1/doc-2/v1_informe.pdf", documentoTarget),
    ).toBe(false);
    expect(
      assertKeyBelongsToTarget("documentos/cli-2/doc-1/v1_informe.pdf", documentoTarget),
    ).toBe(false);
  });

  it("rejects a path that merely starts with the id (tareas/{id}evil/…)", () => {
    expect(
      assertKeyBelongsToTarget("tareas/task-1evil/uuid-1_informe.pdf", tareaTarget),
    ).toBe(false);
    expect(
      assertKeyBelongsToTarget("documentos/cli-1/doc-1evil/v1_informe.pdf", documentoTarget),
    ).toBe(false);
  });

  it("rejects any path containing a .. segment", () => {
    expect(
      assertKeyBelongsToTarget("tareas/task-1/../task-2/uuid-1_informe.pdf", tareaTarget),
    ).toBe(false);
    expect(
      assertKeyBelongsToTarget("documentos/cli-1/doc-1/../../doc-2/v1_informe.pdf", documentoTarget),
    ).toBe(false);
  });

  it("rejects a leading slash", () => {
    expect(
      assertKeyBelongsToTarget("/tareas/task-1/uuid-1_informe.pdf", tareaTarget),
    ).toBe(false);
  });

  it("rejects a path with an empty segment", () => {
    expect(assertKeyBelongsToTarget("tareas//uuid-1_informe.pdf", tareaTarget)).toBe(false);
    expect(assertKeyBelongsToTarget("tareas/task-1//uuid-1_informe.pdf", tareaTarget)).toBe(false);
    expect(
      assertKeyBelongsToTarget("documentos//doc-1/v1_informe.pdf", documentoGeneralTarget),
    ).toBe(false);
  });

  it("rejects the prefix alone (an object key always names a file)", () => {
    expect(assertKeyBelongsToTarget("tareas/task-1", tareaTarget)).toBe(false);
    expect(assertKeyBelongsToTarget("documentos/general/doc-1", documentoGeneralTarget)).toBe(false);
  });

  it("rejects an empty path and the wrong target kind", () => {
    expect(assertKeyBelongsToTarget("", tareaTarget)).toBe(false);
    // A path valid for a task must not validate a document target.
    expect(
      assertKeyBelongsToTarget("tareas/task-1/uuid-1_informe.pdf", documentoGeneralTarget),
    ).toBe(false);
    expect(
      assertKeyBelongsToTarget("documentos/general/doc-1/v1_informe.pdf", tareaTarget),
    ).toBe(false);
  });
});
