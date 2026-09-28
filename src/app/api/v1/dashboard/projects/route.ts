// GET /api/v1/dashboard/projects — quinta cara "Tablero de Control
// Gerencial" (D9, design.md "Endpoint agregado del tablero"). Gateado por
// `canViewManagementDashboard` (RNF-01): un management role (ADMINISTRADOR/
// GERENCIA/COORDINADOR) o un COLABORADOR con el flag `puede_ver_tablero_
// gerencial` (visualizador) ven este endpoint completo. El flag NUNCA
// compone en escritura en ningún otro endpoint del módulo — ver el chequeo
// transversal en route.test.ts.
//
// D9: los seis KPIs (avance técnico, avance financiero/curva S,
// cumplimiento de indicadores, cumplimiento de cronograma, productos
// entregados/programados, beneficiarios atendidos/meta) resuelven en UN
// SOLO round-trip HTTP. Internamente son exactamente 4 `db.$queryRaw`
// (eran 2 antes de F1.6 slice B; ver tablero-gerencial-unificado design.md
// "Query cost" — el desglose por-proyecto/por-territorio que la Fase 4c
// dejaba pendiente ya no es una fase futura, es este mismo cambio):
//   1. `KPI_QUERY` — agregado ORG-WIDE (sobre TODOS los proyectos filtrados
//      a la vez, no una fila por proyecto) de las 4 CTEs de design.md
//      (`tecnico`/`financiero`/`indicadores`/`entregables`).
//   2. `CURVA_S_QUERY` — segunda consulta agregada DENTRO del mismo request
//      (nunca un segundo round-trip HTTP, design.md lo autoriza
//      explícitamente) para la serie mensual de la curva S.
//   3. `POR_PROYECTO_QUERY` (F1.6): mismas CTEs `tecnico`/`entregables`,
//      GROUP BY `p.id` en vez de colapsadas — alimenta las barras
//      cronograma/entregables POR PROYECTO del Tablero Gerencial.
//   4. `POR_TERRITORIO_QUERY` (F1.6): mismas razones técnica/financiera,
//      GROUP BY `p.territorio` — alimenta la sección "Semaforización
//      territorial".
//
// **Desviación declarada frente a la forma literal de la consulta de
// design.md**: ese documento describe UNA FILA POR PROYECTO (columnas de
// las 4 CTEs unidas a `proyectos`) para los 6 KPIs mismos. Los 6 KPIs de
// este endpoint son gauges ORG-WIDE (un tacómetro, una curva S, un radar —
// no una fila por proyecto), así que la query 1 agrega directamente a
// nivel organización en SQL, reutilizando exactamente las mismas 4 CTEs
// (mismos JOINs, mismos FILTER, mismo LEFT JOIN LATERAL anti-doble-conteo)
// pero sin el `GROUP BY proyecto_id` final. Esto sigue siendo UNA sola
// consulta agregada (D9) y preserva cada fórmula/guard de design.md byte a
// byte; solo cambia el nivel de agregación de la fila de salida. El
// desglose por-proyecto/por-territorio SÍ agrega con `GROUP BY` (queries 3
// y 4) — son las dos consultas adicionales que design.md siempre anticipó
// para esta fase.
//
// **`cumplimiento_cronograma` — desviación declarada.** El spec dice
// "Actividad sin fecha_real aún no cuenta como cumplida ni como incumplida
// hasta que se resuelva". Eso significa EXCLUIRLA de la razón, no solo del
// numerador: `cumplimiento_cronograma = a_tiempo / resueltas` (ambos ya
// acotados por `fecha_planificada <= corte`), NO `a_tiempo / programadas`.
// Con el segundo denominador, una actividad todavía sin resolver
// PENALIZARÍA la razón (cuenta en el denominador, no en el numerador),
// exactamente lo que el spec prohíbe. `programadas` se mantiene disponible
// como dato de contexto (no expuesto como KPI propio en este batch).
//
// **Colores de semáforo a nivel organización — desviación declarada, con
// excepción cubierta desde gestion-proyectos-workspace PR1.** A nivel
// agregado (sin `proyecto_id`) no existe UN proyecto cuyo override aplicar,
// así que `color_tecnico`/`color_financiero` siguen usando SIEMPRE el umbral
// de organización (`Setting["semaforo_umbrales"]`) en ese camino — sin
// cambios. Cuando `proyecto_id` SÍ está presente (alcance de un solo
// proyecto), el override de ESE proyecto ahora se resuelve con
// `resolverUmbrales` — el mismo merge que ya hace `budget/route.ts` —, igual
// que design.md siempre especificó para el caso por-proyecto.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { endOfDay } from "@/lib/api/crm";
import { parseDashboardFilters } from "@/lib/dashboard";
import { canViewManagementDashboard } from "@/lib/permissions";
import { loadProjectScoped } from "@/lib/api/projects";
import { getSetting, SETTING_SEMAFORO_UMBRALES } from "@/lib/settings";
import { ENUM_VALUES, UMBRALES_SEMAFORO_DEFAULT } from "@/lib/catalogs";
import { colorFinanciero, colorTecnico, resolverUmbrales } from "@/lib/semaforo";
import type { LineaEstrategica } from "@prisma/client";

export const dynamic = "force-dynamic";

type KpiRow = {
  avance_real: number;
  avance_planificado: number;
  a_tiempo: number;
  resueltas: number;
  programadas: number;
  entregables_programados: number;
  entregables_entregados: number;
  proyectado: number;
  ejecutado: number;
  indicadores_total: number;
  indicadores_cumplidos: number;
  beneficiarios_atendidos: number;
  indicadores_beneficiarios_count: number;
  beneficiarios_meta: number;
};

type CurvaRow = { mes: Date; tipo: "peso" | "gasto"; valor: number };

/** Fila cruda de la 3ª consulta (F1.6 slice B, design.md "por_proyecto"):
 * cronograma + entregables agregados POR PROYECTO (GROUP BY p.id), en vez
 * de colapsados a una sola fila org-wide como en `KpiRow`. */
type PorProyectoRow = {
  proyecto_id: string;
  nombre: string;
  a_tiempo: number;
  resueltas: number;
  entregables_programados: number;
  entregables_entregados: number;
};

/** Fila cruda de la 4ª consulta (F1.6 slice B, design.md "por_territorio"):
 * las mismas razones técnica/financiera de `KpiRow`, agregadas GROUP BY
 * `p.territorio` en vez de org-wide. */
type PorTerritorioRow = {
  territorio: string;
  proyectos_count: number;
  avance_real: number;
  avance_planificado: number;
  proyectado: number;
  ejecutado: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Subconsulta compartida (design.md's filtros comunes + `proyecto_id?`/
 * `cliente_id?`): el mismo conjunto de proyectos filtrados alimenta las
 * cuatro CTEs de KPI y la serie de curva S — un solo criterio de alcance,
 * nunca dos definiciones que puedan divergir.
 */
function proyectosFiltradosSubquery(params: {
  proyectoId?: string;
  clienteId?: string;
  responsableId?: string;
  tipoCliente?: string;
  /** F1.6 slice B (design.md D2): filtros propios de este endpoint, NUNCA
   * parte del `DashboardFilters` compartido por las otras 4 caras. */
  lineaEstrategica?: string;
  territorio?: string;
}): Prisma.Sql {
  const condiciones: Prisma.Sql[] = [];
  if (params.proyectoId) condiciones.push(Prisma.sql`AND p.id = ${params.proyectoId}`);
  if (params.clienteId) condiciones.push(Prisma.sql`AND p.cliente_id = ${params.clienteId}`);
  if (params.responsableId) condiciones.push(Prisma.sql`AND p.responsable_id = ${params.responsableId}`);
  if (params.tipoCliente) {
    condiciones.push(Prisma.sql`AND c.tipo_cliente = ${params.tipoCliente}::"TipoCliente"`);
  }
  if (params.lineaEstrategica) {
    condiciones.push(Prisma.sql`AND p.linea_estrategica = ${params.lineaEstrategica}::"LineaEstrategica"`);
  }
  if (params.territorio) condiciones.push(Prisma.sql`AND p.territorio = ${params.territorio}`);
  return Prisma.sql`
    SELECT p.id
    FROM proyectos p
    JOIN clientes c ON c.id = p.cliente_id
    WHERE p.deleted_at IS NULL
      ${condiciones.length > 0 ? Prisma.join(condiciones, " ") : Prisma.empty}
  `;
}

export const GET = withApiErrorHandling(
  "dashboard/projects",
  "No pudimos cargar el tablero gerencial. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    // "" -> undefined: un `?proyecto_id=` vacío se trata como ausente, nunca
    // como un id vacío contra el que consultar.
    const proyectoId = url.searchParams.get("proyecto_id")?.trim() || undefined;

    // Alcance por proyecto (gestion-proyectos-workspace PR1, design.md T2):
    // con `proyecto_id`, el gate es `canViewProject` (vía `loadProjectScoped`)
    // en vez de `canViewManagementDashboard` — así el responsable del propio
    // proyecto ve sus KPIs sin el flag gerencial. SIN `proyecto_id`, el gate
    // agregado queda BYTE-IDÉNTICO al de antes de este cambio.
    let umbralesOverride: Prisma.JsonValue = null;
    if (proyectoId) {
      const access = await loadProjectScoped(proyectoId, auth.usuario);
      if (!access.ok) {
        return apiError(
          access.code === "NOT_FOUND" ? "El proyecto no existe." : "No tienes permisos sobre este proyecto.",
          access.code === "NOT_FOUND" ? 404 : 403,
          access.code,
        );
      }
      const proyecto = await db.proyecto.findUnique({
        where: { id: proyectoId },
        select: { umbrales_override: true },
      });
      umbralesOverride = proyecto?.umbrales_override ?? null;
    } else if (
      !canViewManagementDashboard({
        id: auth.usuario.id,
        rol: auth.usuario.rol,
        puede_ver_tablero_gerencial: auth.usuario.puede_ver_tablero_gerencial,
      })
    ) {
      return apiError("No tienes permisos para ver el tablero gerencial.", 403, "FORBIDDEN");
    }

    const parsed = parseDashboardFilters(url);
    if (!parsed.ok) return parsed.response;
    const filters = parsed.filters;

    const clienteId = url.searchParams.get("cliente_id") ?? undefined;

    // F1.6 slice B (design.md D2): `linea_estrategica`/`territorio` son
    // filtros propios de ESTE endpoint (la 5.ª cara), nunca parte del
    // `DashboardFilters` compartido de `parseDashboardFilters` — las otras 4
    // caras no tienen requisito v6 de estos dos filtros.
    const lineaEstrategica = url.searchParams.get("linea_estrategica")?.trim() || undefined;
    if (lineaEstrategica && !ENUM_VALUES.LineaEstrategica.includes(lineaEstrategica as LineaEstrategica)) {
      return apiError("Línea estratégica no válida.", 400, "VALIDATION_ERROR");
    }
    const territorio = url.searchParams.get("territorio")?.trim() || undefined;

    // "corte" = min(hoy, hasta) del filtro del tablero (design.md, Semáforos
    // parametrizados). Sin `hasta`, el corte es hoy.
    const ahora = new Date();
    const corte = filters.hasta ? new Date(Math.min(ahora.getTime(), endOfDay(new Date(filters.hasta)).getTime())) : ahora;

    const proyectosFiltrados = proyectosFiltradosSubquery({
      proyectoId,
      clienteId,
      responsableId: filters.responsable_id,
      tipoCliente: filters.tipo_cliente,
      lineaEstrategica,
      territorio,
    });

    // Query 1/4: las 4 CTEs de design.md (tecnico/entregables/financiero/
    // indicadores), agregadas ORG-WIDE (ver Deviations arriba) en una sola
    // consulta — nunca 6 llamadas, una por KPI.
    const kpiRows = await db.$queryRaw<KpiRow[]>(Prisma.sql`
      WITH proyectos_filtrados AS (${proyectosFiltrados}),
      tecnico AS (
        SELECT
          COALESCE(SUM(a.porcentaje_avance::numeric * a.peso) / NULLIF(SUM(a.peso), 0), 0)::float AS avance_real,
          COALESCE(
            100.0 * SUM(a.peso) FILTER (WHERE a.fecha_planificada <= ${corte}) / NULLIF(SUM(a.peso), 0),
            0
          )::float AS avance_planificado,
          COUNT(*) FILTER (
            WHERE a.fecha_real IS NOT NULL AND a.fecha_real <= a.fecha_planificada
          )::float AS a_tiempo,
          COUNT(*) FILTER (WHERE a.fecha_real IS NOT NULL)::float AS resueltas,
          COUNT(*)::float AS programadas
        FROM actividades a
        WHERE a.deleted_at IS NULL
          AND a.proyecto_id IN (SELECT id FROM proyectos_filtrados)
          AND a.fecha_planificada <= ${corte}
      ),
      entregables AS (
        -- Sin acotar por corte: "Productos Entregados/Programados" es un
        -- conteo absoluto sobre TODO el cronograma del proyecto (spec.md),
        -- no solo lo ya debido, a diferencia de "tecnico" arriba.
        SELECT
          COUNT(*)::float AS entregables_programados,
          COUNT(*) FILTER (
            WHERE a.porcentaje_avance = 100
              AND EXISTS (
                SELECT 1 FROM soportes_proyecto s
                WHERE s.actividad_id = a.id AND s.deleted_at IS NULL
              )
          )::float AS entregables_entregados
        FROM actividades a
        WHERE a.deleted_at IS NULL
          AND a.proyecto_id IN (SELECT id FROM proyectos_filtrados)
      ),
      financiero AS (
        -- LEFT JOIN LATERAL, no un JOIN directo (design.md Risks): unir
        -- gastos directamente a lineas_presupuestales multiplicaría
        -- monto_proyectado_cop por el número de gastos de cada línea.
        SELECT
          COALESCE(SUM(l.monto_proyectado_cop), 0)::float AS proyectado,
          COALESCE(SUM(COALESCE(gx.ejecutado, 0)), 0)::float AS ejecutado
        FROM lineas_presupuestales l
        LEFT JOIN LATERAL (
          SELECT SUM(g.monto_cop) AS ejecutado FROM gastos g
          WHERE g.linea_id = l.id AND g.deleted_at IS NULL AND g.fecha_gasto <= ${corte}
        ) gx ON TRUE
        WHERE l.deleted_at IS NULL
          AND l.proyecto_id IN (SELECT id FROM proyectos_filtrados)
      ),
      indicadores AS (
        SELECT
          COUNT(*)::float AS indicadores_total,
          -- Un Indicador sin valor_actual NUNCA cuenta como cumplido.
          COUNT(*) FILTER (
            WHERE i.valor_actual IS NOT NULL AND i.valor_actual >= i.meta_valor
          )::float AS indicadores_cumplidos,
          COALESCE(SUM(i.valor_actual) FILTER (WHERE i.cuenta_beneficiarios), 0)::float AS beneficiarios_atendidos,
          COUNT(*) FILTER (WHERE i.cuenta_beneficiarios)::float AS indicadores_beneficiarios_count
        FROM indicadores i
        WHERE i.deleted_at IS NULL
          AND i.proyecto_id IN (SELECT id FROM proyectos_filtrados)
      ),
      metas_totales AS (
        SELECT COALESCE(SUM(p.beneficiarios_meta), 0)::float AS beneficiarios_meta
        FROM proyectos p
        WHERE p.id IN (SELECT id FROM proyectos_filtrados)
      )
      SELECT
        t.avance_real, t.avance_planificado, t.a_tiempo, t.resueltas, t.programadas,
        e.entregables_programados, e.entregables_entregados,
        f.proyectado, f.ejecutado,
        i.indicadores_total, i.indicadores_cumplidos, i.beneficiarios_atendidos, i.indicadores_beneficiarios_count,
        m.beneficiarios_meta
      FROM tecnico t, entregables e, financiero f, indicadores i, metas_totales m
    `);
    const kpi = kpiRows[0];

    // Query 2/4: serie mensual de curva S — segunda consulta agregada
    // DENTRO del mismo request (design.md lo autoriza explícitamente; no es
    // un segundo round-trip HTTP). `peso` alimenta el planificado (T7:
    // reparto ponderado acumulado sobre el cronograma); `gasto` alimenta el
    // ejecutado (acumulado por `gastos.fecha_gasto`).
    const curvaRows = await db.$queryRaw<CurvaRow[]>(Prisma.sql`
      WITH proyectos_filtrados AS (${proyectosFiltrados})
      SELECT date_trunc('month', a.fecha_planificada) AS mes, 'peso'::text AS tipo, SUM(a.peso)::float AS valor
      FROM actividades a
      WHERE a.deleted_at IS NULL AND a.proyecto_id IN (SELECT id FROM proyectos_filtrados)
      GROUP BY 1
      UNION ALL
      SELECT date_trunc('month', g.fecha_gasto) AS mes, 'gasto'::text AS tipo, SUM(g.monto_cop)::float AS valor
      FROM gastos g
      WHERE g.deleted_at IS NULL AND g.proyecto_id IN (SELECT id FROM proyectos_filtrados)
      GROUP BY 1
      ORDER BY mes ASC
    `);

    // Query 3/4 (F1.6 slice B, design.md "por_proyecto"): cronograma +
    // entregables, mismas CTEs de la query 1 pero GROUP BY p.id en vez de
    // colapsadas org-wide — alimenta las barras por-proyecto del Tablero
    // Gerencial (una fila por proyecto en alcance, sin importar si ya tiene
    // actividades: LEFT JOIN + COALESCE a 0).
    const porProyectoRows = await db.$queryRaw<PorProyectoRow[]>(Prisma.sql`
      WITH proyectos_filtrados AS (${proyectosFiltrados}),
      tecnico_por_proyecto AS (
        SELECT
          a.proyecto_id,
          COUNT(*) FILTER (
            WHERE a.fecha_real IS NOT NULL AND a.fecha_real <= a.fecha_planificada
          )::float AS a_tiempo,
          COUNT(*) FILTER (WHERE a.fecha_real IS NOT NULL)::float AS resueltas
        FROM actividades a
        WHERE a.deleted_at IS NULL
          AND a.proyecto_id IN (SELECT id FROM proyectos_filtrados)
          AND a.fecha_planificada <= ${corte}
        GROUP BY a.proyecto_id
      ),
      entregables_por_proyecto AS (
        SELECT
          a.proyecto_id,
          COUNT(*)::float AS entregables_programados,
          COUNT(*) FILTER (
            WHERE a.porcentaje_avance = 100
              AND EXISTS (
                SELECT 1 FROM soportes_proyecto s
                WHERE s.actividad_id = a.id AND s.deleted_at IS NULL
              )
          )::float AS entregables_entregados
        FROM actividades a
        WHERE a.deleted_at IS NULL
          AND a.proyecto_id IN (SELECT id FROM proyectos_filtrados)
        GROUP BY a.proyecto_id
      )
      SELECT
        p.id AS proyecto_id,
        p.nombre,
        COALESCE(t.a_tiempo, 0)::float AS a_tiempo,
        COALESCE(t.resueltas, 0)::float AS resueltas,
        COALESCE(e.entregables_programados, 0)::float AS entregables_programados,
        COALESCE(e.entregables_entregados, 0)::float AS entregables_entregados
      FROM proyectos p
      LEFT JOIN tecnico_por_proyecto t ON t.proyecto_id = p.id
      LEFT JOIN entregables_por_proyecto e ON e.proyecto_id = p.id
      WHERE p.id IN (SELECT id FROM proyectos_filtrados)
      ORDER BY p.nombre ASC
    `);

    // Query 4/4 (F1.6 slice B, design.md "por_territorio" — Semaforización
    // territorial): las mismas razones técnica/financiera de la query 1,
    // GROUP BY p.territorio en vez de org-wide. Los colores SIEMPRE se
    // resuelven contra el umbral de organización (design.md D6: no existe
    // concepto de override por territorio, a diferencia del override
    // por-proyecto que sí aplica en el camino `?proyecto_id=`).
    const porTerritorioRows = await db.$queryRaw<PorTerritorioRow[]>(Prisma.sql`
      WITH proyectos_filtrados AS (${proyectosFiltrados}),
      proyectos_por_territorio AS (
        SELECT p.territorio, COUNT(*)::float AS proyectos_count
        FROM proyectos p
        WHERE p.id IN (SELECT id FROM proyectos_filtrados)
        GROUP BY p.territorio
      ),
      tecnico_por_territorio AS (
        SELECT
          p.territorio,
          COALESCE(SUM(a.porcentaje_avance::numeric * a.peso) / NULLIF(SUM(a.peso), 0), 0)::float AS avance_real,
          COALESCE(
            100.0 * SUM(a.peso) FILTER (WHERE a.fecha_planificada <= ${corte}) / NULLIF(SUM(a.peso), 0),
            0
          )::float AS avance_planificado
        FROM actividades a
        JOIN proyectos p ON p.id = a.proyecto_id
        WHERE a.deleted_at IS NULL
          AND a.proyecto_id IN (SELECT id FROM proyectos_filtrados)
          AND a.fecha_planificada <= ${corte}
        GROUP BY p.territorio
      ),
      financiero_por_territorio AS (
        SELECT
          p.territorio,
          COALESCE(SUM(l.monto_proyectado_cop), 0)::float AS proyectado,
          COALESCE(SUM(COALESCE(gx.ejecutado, 0)), 0)::float AS ejecutado
        FROM lineas_presupuestales l
        JOIN proyectos p ON p.id = l.proyecto_id
        LEFT JOIN LATERAL (
          SELECT SUM(g.monto_cop) AS ejecutado FROM gastos g
          WHERE g.linea_id = l.id AND g.deleted_at IS NULL AND g.fecha_gasto <= ${corte}
        ) gx ON TRUE
        WHERE l.deleted_at IS NULL
          AND l.proyecto_id IN (SELECT id FROM proyectos_filtrados)
        GROUP BY p.territorio
      )
      SELECT
        pt.territorio,
        pt.proyectos_count,
        COALESCE(t.avance_real, 0)::float AS avance_real,
        COALESCE(t.avance_planificado, 0)::float AS avance_planificado,
        COALESCE(f.proyectado, 0)::float AS proyectado,
        COALESCE(f.ejecutado, 0)::float AS ejecutado
      FROM proyectos_por_territorio pt
      LEFT JOIN tecnico_por_territorio t ON t.territorio = pt.territorio
      LEFT JOIN financiero_por_territorio f ON f.territorio = pt.territorio
      ORDER BY pt.territorio ASC
    `);

    const umbralesOrganizacion = await getSetting(SETTING_SEMAFORO_UMBRALES, UMBRALES_SEMAFORO_DEFAULT);
    // Con `proyecto_id`: merge del override del proyecto sobre el default de
    // organización (mismo patrón que `budget/route.ts`). Sin `proyecto_id`
    // (agregado org-wide): SIEMPRE el default — ver Deviations arriba.
    const umbrales = proyectoId ? resolverUmbrales(umbralesOrganizacion, umbralesOverride) : umbralesOrganizacion;

    // avance_tecnico/avance_financiero: KPIs expuestos como PORCENTAJE
    // (spec.md's escenario: 60.000.000/100.000.000 = 60%). razon_tecnica/
    // razon_financiera: la misma comparación pero como RAZÓN (0..~2), la
    // forma que consumen colorTecnico/colorFinanciero (design.md).
    const avanceTecnico = round2(kpi.avance_real);
    const razonTecnica = kpi.avance_planificado > 0 ? kpi.avance_real / kpi.avance_planificado : 1;
    const avanceFinanciero = kpi.proyectado > 0 ? round2((kpi.ejecutado / kpi.proyectado) * 100) : 0;
    const razonFinanciera = kpi.proyectado > 0 ? kpi.ejecutado / kpi.proyectado : 0;
    const cumplimientoIndicadores =
      kpi.indicadores_total > 0 ? round2((kpi.indicadores_cumplidos / kpi.indicadores_total) * 100) : 0;
    // Deviation (ver comentario de archivo): denominador = resueltas, NUNCA
    // programadas — una actividad sin fecha_real está fuera de la razón.
    const cumplimientoCronograma = kpi.resueltas > 0 ? round2((kpi.a_tiempo / kpi.resueltas) * 100) : 0;

    // Curva S: eje de meses unión de ambas series (peso y gasto), cada valor
    // ACUMULADO. `planificado` escala el peso acumulado por el proyectado
    // total (T7); `ejecutado` es la suma acumulada de gasto (ya en COP).
    const pesoPorMes = new Map<string, number>();
    const gastoPorMes = new Map<string, number>();
    for (const row of curvaRows) {
      const key = row.mes.toISOString().slice(0, 7); // "YYYY-MM"
      if (row.tipo === "peso") pesoPorMes.set(key, (pesoPorMes.get(key) ?? 0) + Number(row.valor));
      else gastoPorMes.set(key, (gastoPorMes.get(key) ?? 0) + Number(row.valor));
    }
    const meses = [...new Set([...pesoPorMes.keys(), ...gastoPorMes.keys()])].sort();
    const pesoTotal = [...pesoPorMes.values()].reduce((acc, v) => acc + v, 0);

    let pesoAcumulado = 0;
    let ejecutadoAcumulado = 0;
    const planificado: number[] = [];
    const ejecutado: number[] = [];
    for (const mes of meses) {
      pesoAcumulado += pesoPorMes.get(mes) ?? 0;
      ejecutadoAcumulado += gastoPorMes.get(mes) ?? 0;
      planificado.push(pesoTotal > 0 ? round2((pesoAcumulado / pesoTotal) * kpi.proyectado) : 0);
      ejecutado.push(round2(ejecutadoAcumulado));
    }

    // F1.6 slice B: desglose por proyecto (barras de cronograma/entregables
    // por proyecto) — misma regla de "no cuenta" que el agregado org-wide
    // (denominador = resueltas, nunca programadas).
    const porProyecto = porProyectoRows.map((row) => ({
      proyecto_id: row.proyecto_id,
      nombre: row.nombre,
      cumplimiento_cronograma: row.resueltas > 0 ? round2((row.a_tiempo / row.resueltas) * 100) : 0,
      productos_entregados: row.entregables_entregados,
      productos_programados: row.entregables_programados,
    }));

    // F1.6 slice B: semaforización territorial — colores SIEMPRE contra el
    // umbral de organización (design.md D6), nunca `umbrales` (que en el
    // camino `?proyecto_id=` puede llevar el override de ESE proyecto).
    const porTerritorio = porTerritorioRows.map((row) => {
      const razonTecnicaTerritorio =
        row.avance_planificado > 0 ? row.avance_real / row.avance_planificado : 1;
      const razonFinancieraTerritorio = row.proyectado > 0 ? row.ejecutado / row.proyectado : 0;
      return {
        territorio: row.territorio,
        proyectos_count: row.proyectos_count,
        color_tecnico: colorTecnico(razonTecnicaTerritorio, umbralesOrganizacion),
        color_financiero: colorFinanciero(razonFinancieraTerritorio, umbralesOrganizacion),
      };
    });

    return NextResponse.json({
      avance_tecnico: avanceTecnico,
      avance_financiero: avanceFinanciero,
      cumplimiento_indicadores: cumplimientoIndicadores,
      cumplimiento_cronograma: cumplimientoCronograma,
      productos_entregados: kpi.entregables_entregados,
      productos_programados: kpi.entregables_programados,
      beneficiarios_atendidos: round2(kpi.beneficiarios_atendidos),
      beneficiarios_meta: kpi.beneficiarios_meta,
      indicadores_beneficiarios_count: kpi.indicadores_beneficiarios_count,
      color_tecnico: colorTecnico(razonTecnica, umbrales),
      color_financiero: colorFinanciero(razonFinanciera, umbrales),
      curva_s: { meses, planificado, ejecutado },
      por_proyecto: porProyecto,
      por_territorio: porTerritorio,
    });
  },
);
