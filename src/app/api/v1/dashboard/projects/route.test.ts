// GET /api/v1/dashboard/projects — quinta cara "Tablero de Control
// Gerencial" (D9, design.md "Endpoint agregado del tablero"). Gateado por
// `canViewManagementDashboard`. Los seis KPIs (avance técnico, avance
// financiero/curva S, cumplimiento de indicadores, cumplimiento de
// cronograma, productos entregados/programados, beneficiarios
// atendidos/meta) resuelven en UN solo round-trip HTTP: exactamente 2
// `db.$queryRaw` (agregado de KPIs + serie mensual de curva S), nunca 6
// llamadas por KPI (D9's "no N+1").
//
// Las dos reglas de "no cuenta como cumplido/entregado" viven en el TEXTO
// del SQL (los `FILTER`/`EXISTS` de las CTEs `indicadores`/`entregables`),
// no en JS — este archivo mockea `db.$queryRaw` por completo, así que las
// verifica inspeccionando el texto de la consulta enviada (mismo patrón que
// cualquier prueba de "el WHERE correcto se construyó" sobre una ruta con
// SQL crudo), y por separado cubre la aritmética de los KPI en JS a partir
// de filas ya agregadas.
//
// La regla "el flag `puede_ver_tablero_gerencial` nunca compone en
// escritura" se re-verifica aquí de forma transversal (no solo en este
// endpoint): se importan y llaman directamente los handlers POST/PATCH/
// DELETE del resto del módulo con el mismo actor visualizador-only,
// confirmando 403 en cada uno. `getProjectForWrite`/`requireApiRole` se
// mockean para que cada ruta llegue al gate sin depender de más fixtures de
// `db` — esos handlers nunca tocan `db` una vez que el gate deniega.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
  requireApiRole: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: vi.fn(),
    setting: {
      findUnique: vi.fn(),
    },
  },
}));

// `getProjectForWrite` es el gate compartido de escritura de todo el
// agregado Proyecto (goals/activities/budget/expenses). Se mockea para que
// SIEMPRE deniegue, así el chequeo transversal no necesita reconstruir
// fixtures de `db.proyecto`/`db.meta`/etc. para cada ruta — esas rutas
// jamás llegan a tocar `db` una vez que este gate responde FORBIDDEN.
vi.mock("@/lib/api/projects", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/projects")>("@/lib/api/projects");
  return {
    ...actual,
    getProjectForWrite: vi.fn().mockResolvedValue({ ok: false, code: "FORBIDDEN" }),
  };
});

// `getClientForOpportunityWrite` es el primer gate de la acción de
// conversión (T2): se mockea para pasar (ok:true), de forma que la ruta
// llegue al SEGUNDO gate real (`canCreateProject`, sin mockear) y ese sea el
// que efectivamente deniegue al actor visualizador-only.
vi.mock("@/lib/api/crm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/crm")>("@/lib/api/crm");
  return {
    ...actual,
    getClientForOpportunityWrite: vi.fn().mockResolvedValue({
      ok: true,
      cliente: { id: "cli-1", responsable_id: "otro-usuario" },
    }),
  };
});

import { db } from "@/lib/db";
import { requireApiRole, requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

// Handlers del resto del módulo, para el chequeo transversal de 403.
import { POST as goalsPost } from "../../projects/[id]/goals/route";
import { PATCH as goalPatch, DELETE as goalDelete } from "../../projects/[id]/goals/[goalId]/route";
import { POST as activitiesPost } from "../../projects/[id]/activities/route";
import { PATCH as activityPatch, DELETE as activityDelete } from "../../projects/[id]/activities/[activityId]/route";
import { POST as budgetPost } from "../../projects/[id]/budget/route";
import { POST as expensesPost } from "../../projects/[id]/expenses/route";
import { PATCH as expensePatch, DELETE as expenseDelete } from "../../projects/[id]/expenses/[expenseId]/route";
import { POST as rubrosPost } from "../../rubros/route";
import { PATCH as rubroPatch, DELETE as rubroDelete } from "../../rubros/[id]/route";
import { POST as convertToProjectPost } from "../../clients/[id]/opportunities/[opportunityId]/project/route";

const gerencia = { id: "gerencia-1", rol: "GERENCIA", puede_ver_tablero_gerencial: false } as Usuario;
const visualizador = { id: "colab-1", rol: "COLABORADOR", puede_ver_tablero_gerencial: true } as Usuario;
const colaboradorSinFlag = { id: "colab-2", rol: "COLABORADOR", puede_ver_tablero_gerencial: false } as Usuario;

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

function denyRole() {
  vi.mocked(requireApiRole).mockResolvedValue({
    ok: false,
    response: new Response(JSON.stringify({ error: "x", code: "FORBIDDEN" }), { status: 403 }),
  });
}

function get(qs = ""): Request {
  return new Request(`http://localhost/api/v1/dashboard/projects${qs}`);
}

/** Fila cruda que devolvería la primera consulta agregada (KPIs). */
function kpiRow(overrides: Partial<Record<string, number>> = {}) {
  return {
    avance_real: overrides.avance_real ?? 0,
    avance_planificado: overrides.avance_planificado ?? 0,
    a_tiempo: overrides.a_tiempo ?? 0,
    resueltas: overrides.resueltas ?? 0,
    programadas: overrides.programadas ?? 0,
    entregables_programados: overrides.entregables_programados ?? 0,
    entregables_entregados: overrides.entregables_entregados ?? 0,
    proyectado: overrides.proyectado ?? 0,
    ejecutado: overrides.ejecutado ?? 0,
    indicadores_total: overrides.indicadores_total ?? 0,
    indicadores_cumplidos: overrides.indicadores_cumplidos ?? 0,
    beneficiarios_atendidos: overrides.beneficiarios_atendidos ?? 0,
    indicadores_beneficiarios_count: overrides.indicadores_beneficiarios_count ?? 0,
    beneficiarios_meta: overrides.beneficiarios_meta ?? 0,
  };
}

function mockQueries(kpi: ReturnType<typeof kpiRow>, curva: { mes: Date; tipo: string; valor: number }[]) {
  vi.mocked(db.$queryRaw)
    .mockResolvedValueOnce([kpi] as never)
    .mockResolvedValueOnce(curva as never);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/dashboard/projects", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), { status: 401 }),
    });

    const res = await GET(get());

    expect(res.status).toBe(401);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("returns 403 for a COLABORADOR without the management flag", async () => {
    authAs(colaboradorSinFlag);

    const res = await GET(get());

    expect(res.status).toBe(403);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("returns 200 for a visualizador-only actor (flag on, no manage rights)", async () => {
    authAs(visualizador);
    vi.mocked(db.setting.findUnique).mockResolvedValue(null);
    mockQueries(kpiRow(), []);

    const res = await GET(get());

    expect(res.status).toBe(200);
  });

  it("returns 200 for a management role (GERENCIA) without the flag", async () => {
    authAs(gerencia);
    vi.mocked(db.setting.findUnique).mockResolvedValue(null);
    mockQueries(kpiRow(), []);

    const res = await GET(get());

    expect(res.status).toBe(200);
  });

  it("resolves all 6 KPIs in exactly ONE round-trip: exactly 2 db.$queryRaw calls, one response payload", async () => {
    authAs(gerencia);
    vi.mocked(db.setting.findUnique).mockResolvedValue(null);
    mockQueries(
      kpiRow({
        avance_real: 80,
        avance_planificado: 100,
        a_tiempo: 3,
        resueltas: 4,
        programadas: 5,
        entregables_programados: 10,
        entregables_entregados: 6,
        proyectado: 100_000_000,
        ejecutado: 60_000_000,
        indicadores_total: 4,
        indicadores_cumplidos: 2,
        beneficiarios_atendidos: 150,
        indicadores_beneficiarios_count: 1,
        beneficiarios_meta: 200,
      }),
      [],
    );

    const res = await GET(get());
    const json = await res.json();

    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
    // Los 6 KPIs, en el ÚNICO payload de esta respuesta.
    expect(json).toHaveProperty("avance_tecnico");
    expect(json).toHaveProperty("avance_financiero");
    expect(json).toHaveProperty("cumplimiento_indicadores");
    expect(json).toHaveProperty("cumplimiento_cronograma");
    expect(json).toHaveProperty("productos_entregados");
    expect(json).toHaveProperty("productos_programados");
    expect(json).toHaveProperty("beneficiarios_atendidos");
    expect(json).toHaveProperty("beneficiarios_meta");
    expect(json).toHaveProperty("curva_s");
  });

  it("computes avance_financiero exactly as spec.md's scenario: 60.000.000/100.000.000 = 60%", async () => {
    authAs(gerencia);
    vi.mocked(db.setting.findUnique).mockResolvedValue(null);
    mockQueries(kpiRow({ proyectado: 100_000_000, ejecutado: 60_000_000 }), []);

    const res = await GET(get());
    const json = await res.json();

    expect(json.avance_financiero).toBe(60);
  });

  it("computes avance_tecnico directly from the SQL-weighted avance_real", async () => {
    authAs(gerencia);
    vi.mocked(db.setting.findUnique).mockResolvedValue(null);
    mockQueries(kpiRow({ avance_real: 80 }), []);

    const res = await GET(get());
    const json = await res.json();

    expect(json.avance_tecnico).toBe(80);
  });

  it("cumplimiento_cronograma excludes unresolved activities from the ratio (neither cumplida ni incumplida)", async () => {
    authAs(gerencia);
    vi.mocked(db.setting.findUnique).mockResolvedValue(null);
    // 5 programadas (bound by corte), pero solo 4 ya se resolvieron
    // (fecha_real IS NOT NULL); de esas 4, 3 a tiempo. La quinta, sin
    // fecha_real, no debe penalizar ni favorecer la razón.
    mockQueries(kpiRow({ programadas: 5, resueltas: 4, a_tiempo: 3 }), []);

    const res = await GET(get());
    const json = await res.json();

    expect(json.cumplimiento_cronograma).toBe(75); // 3/4, no 3/5
  });

  it("returns zeroed KPIs without division-by-zero when nothing matches the filters", async () => {
    authAs(gerencia);
    vi.mocked(db.setting.findUnique).mockResolvedValue(null);
    mockQueries(kpiRow(), []);

    const res = await GET(get());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.avance_tecnico).toBe(0);
    expect(json.avance_financiero).toBe(0);
    expect(json.cumplimiento_indicadores).toBe(0);
    expect(json.cumplimiento_cronograma).toBe(0);
    expect(json.productos_entregados).toBe(0);
    expect(json.productos_programados).toBe(0);
  });

  it("exposes indicadores_beneficiarios_count so the UI can warn when > 1 (design.md Risks)", async () => {
    authAs(gerencia);
    vi.mocked(db.setting.findUnique).mockResolvedValue(null);
    mockQueries(kpiRow({ indicadores_beneficiarios_count: 2, beneficiarios_atendidos: 300 }), []);

    const res = await GET(get());
    const json = await res.json();

    expect(json.indicadores_beneficiarios_count).toBe(2);
    expect(json.beneficiarios_atendidos).toBe(300);
  });

  it("builds a cumulative curva_s series from the monthly peso/gasto rows (second query, same request)", async () => {
    authAs(gerencia);
    vi.mocked(db.setting.findUnique).mockResolvedValue(null);
    mockQueries(kpiRow({ proyectado: 1000 }), [
      { mes: new Date("2026-01-01T00:00:00Z"), tipo: "peso", valor: 6 },
      { mes: new Date("2026-02-01T00:00:00Z"), tipo: "peso", valor: 4 },
      { mes: new Date("2026-01-01T00:00:00Z"), tipo: "gasto", valor: 200 },
      { mes: new Date("2026-02-01T00:00:00Z"), tipo: "gasto", valor: 300 },
    ]);

    const res = await GET(get());
    const json = await res.json();

    expect(json.curva_s.meses).toEqual(["2026-01", "2026-02"]);
    // peso total = 10; enero acumula 6/10 = 60% de 1000 = 600; febrero 100%.
    expect(json.curva_s.planificado).toEqual([600, 1000]);
    // ejecutado acumulado: enero 200, febrero 500.
    expect(json.curva_s.ejecutado).toEqual([200, 500]);
  });

  describe("las dos reglas de 'no cuenta' viven en el texto de la consulta SQL", () => {
    it("the indicadores CTE excludes an Indicador without valor_actual from 'cumplidos'", async () => {
      authAs(gerencia);
      vi.mocked(db.setting.findUnique).mockResolvedValue(null);
      mockQueries(kpiRow(), []);

      await GET(get());

      const firstCall = vi.mocked(db.$queryRaw).mock.calls[0][0] as { sql: string } | { text: string };
      const sqlText = "sql" in firstCall ? firstCall.sql : (firstCall as { text: string }).text;
      expect(sqlText).toContain("valor_actual IS NOT NULL");
      expect(sqlText).toContain("valor_actual >= i.meta_valor");
    });

    it("the entregables CTE excludes a 100%-avance Actividad with no soporte from 'entregados'", async () => {
      authAs(gerencia);
      vi.mocked(db.setting.findUnique).mockResolvedValue(null);
      mockQueries(kpiRow(), []);

      await GET(get());

      const firstCall = vi.mocked(db.$queryRaw).mock.calls[0][0] as { sql: string } | { text: string };
      const sqlText = "sql" in firstCall ? firstCall.sql : (firstCall as { text: string }).text;
      expect(sqlText).toContain("porcentaje_avance = 100");
      expect(sqlText).toContain("EXISTS");
      expect(sqlText).toContain("soportes_proyecto");
    });
  });
});

describe("cross-cutting: the visualizador-only flag never composes into write, anywhere in this module", () => {
  const routeContextProject = { params: Promise.resolve({ id: "proy-1" }) };
  const routeContextGoal = { params: Promise.resolve({ id: "proy-1", goalId: "goal-1" }) };
  const routeContextActivity = { params: Promise.resolve({ id: "proy-1", activityId: "act-1" }) };
  const routeContextExpense = { params: Promise.resolve({ id: "proy-1", expenseId: "gas-1" }) };
  const routeContextRubro = { params: Promise.resolve({ id: "rubro-1" }) };
  const routeContextConversion = { params: Promise.resolve({ id: "cli-1", opportunityId: "opp-1" }) };

  function jsonRequest(url: string, method: string, body?: unknown): Request {
    return new Request(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  it.each([
    ["POST goals", () => goalsPost(jsonRequest("http://localhost/x", "POST", { nombre: "Meta X" }), routeContextProject)],
    ["PATCH goal", () => goalPatch(jsonRequest("http://localhost/x", "PATCH", { nombre: "Meta Y" }), routeContextGoal)],
    ["DELETE goal", () => goalDelete(jsonRequest("http://localhost/x", "DELETE"), routeContextGoal)],
    [
      "POST activities",
      () =>
        activitiesPost(
          jsonRequest("http://localhost/x", "POST", {
            meta_id: "meta-1",
            nombre: "Actividad X",
            fecha_planificada: "2026-01-01",
          }),
          routeContextProject,
        ),
    ],
    [
      "PATCH activity",
      () => activityPatch(jsonRequest("http://localhost/x", "PATCH", { nombre: "Actividad Y" }), routeContextActivity),
    ],
    ["DELETE activity", () => activityDelete(jsonRequest("http://localhost/x", "DELETE"), routeContextActivity)],
    [
      "POST budget",
      () =>
        budgetPost(
          jsonRequest("http://localhost/x", "POST", { rubro_id: "rubro-1", monto_proyectado_cop: 100 }),
          routeContextProject,
        ),
    ],
    [
      "POST expenses",
      () =>
        expensesPost(
          jsonRequest("http://localhost/x", "POST", {
            linea_id: "linea-1",
            concepto: "Gasto X",
            monto_cop: 10,
            fecha_gasto: "2026-01-01",
          }),
          routeContextProject,
        ),
    ],
    [
      "PATCH expense",
      () => expensePatch(jsonRequest("http://localhost/x", "PATCH", { concepto: "Gasto Y" }), routeContextExpense),
    ],
    ["DELETE expense", () => expenseDelete(jsonRequest("http://localhost/x", "DELETE"), routeContextExpense)],
  ])("%s returns 403 for a visualizador-only actor (canManageProject false)", async (_label, invoke) => {
    authAs(visualizador);

    const res = await invoke();

    expect(res.status).toBe(403);
  });

  it.each([
    ["POST rubros", () => rubrosPost(jsonRequest("http://localhost/x", "POST", { nombre: "Nuevo Rubro" }))],
    [
      "PATCH rubro",
      () => rubroPatch(jsonRequest("http://localhost/x", "PATCH", { activo: false }), routeContextRubro),
    ],
    ["DELETE rubro", () => rubroDelete(jsonRequest("http://localhost/x", "DELETE"), routeContextRubro)],
  ])("%s returns 403 for a visualizador-only actor (requireApiRole ADMINISTRADOR)", async (_label, invoke) => {
    authAs(visualizador);
    denyRole();

    const res = await invoke();

    expect(res.status).toBe(403);
  });

  it("POST create-project-from-opportunity returns 403 for a visualizador-only actor (canCreateProject false)", async () => {
    authAs(visualizador);

    const res = await convertToProjectPost(jsonRequest("http://localhost/x", "POST"), routeContextConversion);

    expect(res.status).toBe(403);
  });
});
