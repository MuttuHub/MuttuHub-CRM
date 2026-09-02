// Read-scope matrix for the close-phase-1 refactor (PR 3): asserts that
// every read endpoint open after PR 3 no longer scopes COLABORADOR to
// `responsable_id = self`. Mirrors the contract in
// openspec/changes/close-phase-1/specs/global-task-board/spec.md and is the
// test gate that protects against any future "accidental" re-scoping in a
// route helper.
//
// Lives next to src/lib/permissions.test.ts (which covers the WRITE half —
// canManageAny/canEditClient/canEditTask). Together they form the full
// read-vs-write permission matrix and replace the previous
// isFullAccess-only tests.
//
// Sanity invariant from design.md D2: canReadRestrictedDocs and canManageAny
// share the same role list (treating confidentiality and write authority as
// the same predicate on purpose); if a future change decouples them, this
// matrix test fails loudly so the docs/specs can be revisited.

import { describe, expect, it } from "vitest";
import type { Usuario } from "@prisma/client";
import { buildClientWhere } from "@/app/api/v1/clients/route";
import {
  parseClientListFilters,
} from "@/lib/api/crm";
import {
  buildTaskWhere,
  parseTaskFilters,
} from "@/app/api/v1/tasks/route";
import { canManageAny, canReadRestrictedDocs } from "./permissions";

const colaborador = { id: "colab-1", rol: "COLABORADOR", activo: true } as Usuario;
const gerencia = { id: "gerencia-1", rol: "GERENCIA", activo: true } as Usuario;
const administrador = {
  id: "admin-1",
  rol: "ADMINISTRADOR",
  activo: true,
} as Usuario;
const coordinador = {
  id: "coord-1",
  rol: "COORDINADOR",
  activo: true,
} as Usuario;

describe("read-scope matrix (PR 3)", () => {
  describe("canReadRestrictedDocs identity (D2 invariant)", () => {
    it.each([
      ["ADMINISTRADOR"],
      ["GERENCIA"],
      ["COORDINADOR"],
      ["COLABORADOR"],
    ] as const)("%s: canReadRestrictedDocs === canManageAny", (rol) => {
      expect(canReadRestrictedDocs(rol)).toBe(canManageAny(rol));
    });
  });

  describe("buildTaskWhere (PR 3 global reads)", () => {
    it("does not force responsable_id for COLABORADOR on empty filters", () => {
      const where = buildTaskWhere(
        { q: undefined, estado: undefined, origen: undefined, responsable: undefined, cliente: undefined, vencidas: false },
        colaborador,
      );
      expect(where).not.toHaveProperty("responsable_id");
    });

    it("does not force responsable_id for COLABORADOR even with a foreign responsable filter (the filter is honored, never rewritten to self)", () => {
      const where = buildTaskWhere(
        { q: undefined, estado: undefined, origen: undefined, responsable: "other-user", cliente: undefined, vencidas: false },
        colaborador,
      );
      expect(where.responsable_id).toBe("other-user");
    });

    it("does not force responsable_id for any full-access role", () => {
      for (const usuario of [administrador, gerencia, coordinador]) {
        const where = buildTaskWhere(
          { q: undefined, estado: undefined, origen: undefined, responsable: undefined, cliente: undefined, vencidas: false },
          usuario,
        );
        expect(where).not.toHaveProperty("responsable_id");
      }
    });
  });

  describe("parseTaskFilters (PR 3 global reads — filter never stripped)", () => {
    it("preserves the `responsable` query param (COLABORADOR can filter by anyone)", () => {
      const url = new URL("http://localhost/api/v1/tasks?responsable=other-user");
      const parsed = parseTaskFilters(url);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.filters.responsable).toBe("other-user");
      }
    });

    it("preserves the `responsable` query param when other filters are also present", () => {
      const url = new URL(
        "http://localhost/api/v1/tasks?responsable=other-user&estado=EN_CURSO&vencidas=true",
      );
      const parsed = parseTaskFilters(url);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.filters.responsable).toBe("other-user");
        expect(parsed.filters.estado).toBe("EN_CURSO");
        expect(parsed.filters.vencidas).toBe(true);
      }
    });
  });

  describe("buildClientWhere (PR 3 global reads)", () => {
    it("does not force responsable_id for COLABORADOR on empty filters", () => {
      const where = buildClientWhere({}, colaborador);
      expect(where).not.toHaveProperty("responsable_id");
    });

    it("honors an explicit responsable_id filter for COLABORADOR (does not rewrite to self)", () => {
      const where = buildClientWhere({ responsable_id: "other-user" }, colaborador);
      expect(where.responsable_id).toBe("other-user");
    });

    it("does not force responsable_id for any full-access role", () => {
      for (const usuario of [administrador, gerencia, coordinador]) {
        const where = buildClientWhere({}, usuario);
        expect(where).not.toHaveProperty("responsable_id");
      }
    });
  });

  describe("parseClientListFilters (PR 3 global reads — filter never stripped)", () => {
    it("preserves the `responsable` query param (COLABORADOR can filter by anyone)", () => {
      const url = new URL("http://localhost/api/v1/clients?responsable=other-user");
      const parsed = parseClientListFilters(url, [], [], []);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.filters.responsable_id).toBe("other-user");
      }
    });

    it("preserves the `responsable` query param when combined with q / tipo / estado", () => {
      const url = new URL(
        "http://localhost/api/v1/clients?responsable=other-user&q=acme",
      );
      const parsed = parseClientListFilters(url, [], [], []);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.filters.responsable_id).toBe("other-user");
        expect(parsed.filters.q).toBe("acme");
      }
    });
  });
});