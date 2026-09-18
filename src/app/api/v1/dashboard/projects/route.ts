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
// SOLO round-trip HTTP. Internamente son exactamente 2 `db.$queryRaw`:
//   1. `KPI_QUERY` — agregado ORG-WIDE (sobre TODOS los proyectos filtrados
//      a la vez, no una fila por proyecto) de las 4 CTEs de design.md
//      (`tecnico`/`financiero`/`indicadores`/`entregables`).
//   2. `CURVA_S_QUERY` — segunda consulta agregada DENTRO del mismo request
//      (nunca un segundo round-trip HTTP, design.md lo autoriza
//      explícitamente) para la serie mensual de la curva S.
//
// **Desviación declarada frente a la forma literal de la consulta de
// design.md**: ese documento devuelve UNA FILA POR PROYECTO (columnas de
// las 4 CTEs unidas a `proyectos`), pensada para una futura tabla de
// desglose (Fase 4c, fuera de este batch). Los 6 KPIs de este endpoint son
// gauges ORG-WIDE (un tacómetro, una curva S, un radar — no una fila por
// proyecto), así que esta consulta agrega directamente a nivel
// organización en SQL, reutilizando exactamente las mismas 4 CTEs
// (mismos JOINs, mismos FILTER, mismo LEFT JOIN LATERAL anti-doble-conteo)
// pero sin el `GROUP BY proyecto_id` final. Esto sigue siendo UNA sola
// consulta agregada (D9) y preserva cada fórmula/guard de design.md byte a
// byte; solo cambia el nivel de agregación de la fila de salida. Si Fase
// 4c necesita el desglose por proyecto más adelante, es una consulta
// adicional de esa fase, no una reescritura de esta.
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
// **Colores de semáforo a nivel organización — desviación declarada.**
// design.md resuelve umbrales por proyecto (`Proyecto.umbrales_override`
// merged sobre el default de organización). A nivel agregado no existe UN
// proyecto cuyo override aplicar, así que `color_tecnico`/`color_financiero`
// usan SIEMPRE el umbral de organización (`Setting["semaforo_umbrales"]`),
// nunca un override individual. Si Fase 4c necesita colores por proyecto en
// una tabla de desglose, los resuelve como budget/route.ts ya hace.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { endOfDay } from "@/lib/api/crm";
import { parseDashboardFilters } from "@/lib/dashboard";
import { canViewManagementDashboard } from "@/lib/permissions";
import { getSetting, SETTING_SEMAFORO_UMBRALES } from "@/lib/settings";
import { UMBRALES_SEMAFORO_DEFAULT } from "@/lib/catalogs";
import { colorFinanciero, colorTecnico } from "@/lib/semaforo";

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
}): Prisma.Sql {
  const condiciones: Prisma.Sql[] = [];
  if (params.proyectoId) condiciones.push(Prisma.sql`AND p.id = ${params.proyectoId}`);
  if (params.clienteId) condiciones.push(Prisma.sql`AND p.cliente_id = ${params.clienteId}`);
  if (params.responsableId) condiciones.push(Prisma.sql`AND p.responsable_id = ${params.responsableId}`);
  if (params.tipoCliente) {
    condiciones.push(Prisma.sql`AND c.tipo_cliente = ${params.tipoCliente}::"TipoCliente"`);
  }
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

    if (
      !canViewManagementDashboard({
        id: auth.usuario.id,
        rol: auth.usuario.rol,
        puede_ver_tablero_gerencial: auth.usuario.puede_ver_tablero_gerencial,
      })
    ) {
      return apiError("No tienes permisos para ver el tablero gerencial.", 403, "FORBIDDEN");
    }

    const url = new URL(request.url);
    const parsed = parseDashboardFilters(url);
    if (!parsed.ok) return parsed.response;
    const filters = parsed.filters;

    const proyectoId = url.searchParams.get("proyecto_id") ?? undefined;
    const clienteId = url.searchParams.get("cliente_id") ?? undefined;

    // "corte" = min(hoy, hasta) del filtro del tablero (design.md, Semáforos
    // parametrizados). Sin `hasta`, el corte es hoy.
    const ahora = new Date();
    const corte = filters.hasta ? new Date(Math.min(ahora.getTime(), endOfDay(new Date(filters.hasta)).getTime())) : ahora;

    const proyectosFiltrados = proyectosFiltradosSubquery({
      proyectoId,
      clienteId,
      responsableId: filters.responsable_id,
      tipoCliente: filters.tipo_cliente,
    });

    // Query 1/2: las 4 CTEs de design.md (tecnico/entregables/financiero/
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
        // gastos directamente a lineas_presupuestales multiplicaría
        // monto_proyectado_cop por el número de gastos de cada línea.
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

    // Query 2/2: serie mensual de curva S — segunda consulta agregada
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

    const umbrales = await getSetting(SETTING_SEMAFORO_UMBRALES, UMBRALES_SEMAFORO_DEFAULT);

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
    });
  },
);
