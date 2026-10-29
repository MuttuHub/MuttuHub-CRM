// GET /api/v1/reports/weekly?semana=AAAA-MM-DD — reporte semanal (S5).
//
// Compone fuentes que ya existen (ver `lib/reportes/semanal.ts`): el portafolio del Tablero gerencial al corte
// de la semana (semáforos, % de avance y A/P/E por proyecto y por cliente), las actividades atrasadas y
// «Requiere atención» de cada proyecto medible, las tareas cerradas y vencidas de la semana contra la anterior
// y, solo para ADMINISTRADOR/GERENCIA, los gastos por validar agregados por proyecto. Mismo acceso que el
// tablero del portafolio (403 si no lo ve); la semana va de lunes a domingo en Bogotá (400 si no es válida o
// todavía no empieza). Solo agregados: ningún gasto, tercero ni soporte individual (P04).

import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { cargarReporteSemanal } from "@/lib/reportes/semanal";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(
  "reports-weekly",
  "No pudimos generar el reporte semanal. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const result = await cargarReporteSemanal(auth.usuario, new URL(request.url));
    if (!result.ok) return result.response;
    return NextResponse.json(result.value);
  },
);
