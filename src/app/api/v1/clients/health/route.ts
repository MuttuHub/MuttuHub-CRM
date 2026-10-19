// GET /api/v1/clients/health — v7 alignment C5a "Salud" (client health).
//
// READ-ONLY: every signed-in role sees every non-deleted client's score, but the
// Proyectos component is only computed for users who can read the project
// portfolio (`canReadProjectList`); for everyone else `subscores.proyectos` is
// null and the score is renormalised over Contacto and Compromisos.
// The score itself is pure math (src/lib/clientes/salud.ts); this route only
// assembles the inputs server-side:
//   - Contacto   → days since the client's most recent BitacoraEntrada.
//   - Compromisos→ the shared alert buckets (src/lib/alerts.ts), filtered by
//                  cliente_id; only open, non-deleted, dated tasks count.
//   - Proyectos  → the live projects' semáforo colors, derived with the same
//                  batched KPI loader the portfolio dashboard uses (no schema
//                  change, no per-project loop).
//
// No writes: this endpoint never touches a tx that mutates rows.

import { NextResponse } from "next/server";
import type { EstadoProyecto } from "@prisma/client";
import { db } from "@/lib/db";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { getAlertBuckets } from "@/lib/alerts";
import { getSemaforoParametrosV2 } from "@/lib/settings";
import { canReadProjectList } from "@/lib/api/projects";
import { loadKpisPortafolio } from "@/lib/api/kpis-portafolio";
import { todayInBogota, toDayNumber } from "@/lib/proyectos/weeks";
import type { ColorSemaforo } from "@/lib/proyectos/semaforo-v2";
import {
  calcularSalud,
  clasificarBucket,
  type CompromisosConteo,
  type SaludBucket,
  type SaludSubscores,
} from "@/lib/clientes/salud";

export const dynamic = "force-dynamic";

/** Project states that are no longer "live": a closed/cancelled project has no health signal. */
const ESTADOS_NO_VIVOS: EstadoProyecto[] = ["CERRADO", "CANCELADO"];

export type SaludClienteRow = {
  cliente_id: string;
  cliente_nombre: string;
  score: number | null;
  bucket: SaludBucket;
  subscores: SaludSubscores;
  motivo: string;
};

export type SaludCartera = {
  sana: number;
  atencion: number;
  riesgo: number;
  sin_datos: number;
  total: number;
  promedio: number | null;
};

export type SaludCarteraResponse = {
  clientes: SaludClienteRow[];
  cartera: SaludCartera;
};

const round1 = (value: number): number => Math.round(value * 10) / 10;

const BUCKET_KEY: Record<SaludBucket, keyof Omit<SaludCartera, "total" | "promedio">> = {
  SANA: "sana",
  ATENCION: "atencion",
  RIESGO: "riesgo",
  SIN_DATOS: "sin_datos",
};

export const GET = withApiErrorHandling(
  "clients-health",
  "No pudimos cargar la salud de la cartera. Inténtalo de nuevo.",
  async () => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const verProyectos = canReadProjectList(auth.usuario);

    const [clientes, ultimasEntradas, buckets, proyectos, parametros] = await Promise.all([
      db.cliente.findMany({
        where: { deleted_at: null },
        select: { id: true, nombre: true },
        orderBy: { nombre: "asc" },
      }),
      db.bitacoraEntrada.groupBy({
        by: ["cliente_id"],
        _max: { created_at: true },
      }),
      // Global scope ("all"): the health panel is portfolio-wide, like the client list.
      getAlertBuckets("all", auth.usuario),
      // Portfolio data only for users with portfolio read: otherwise the projects
      // subscore (a derived view of other people's projects) stays hidden.
      verProyectos
        ? db.proyecto.findMany({
            where: { deleted_at: null, estado: { notIn: ESTADOS_NO_VIVOS } },
            select: {
              id: true,
              cliente_id: true,
              estado: true,
              fecha_inicio: true,
              fecha_fin: true,
              beneficiarios_meta: true,
            },
          })
        : Promise.resolve([] as never[]),
      getSemaforoParametrosV2(),
    ]);

    // One batched KPI load for every live project (constant number of queries).
    const kpis = verProyectos
      ? await loadKpisPortafolio({ proyectos, corte: todayInBogota(), parametros })
      : null;

    const ultimaPorCliente = new Map<string, Date | null>();
    for (const row of ultimasEntradas) {
      ultimaPorCliente.set(row.cliente_id, row._max.created_at);
    }

    const compromisosPorCliente = new Map<string, CompromisosConteo>();
    const contar = (clienteId: string | null, key: keyof CompromisosConteo) => {
      if (!clienteId) return;
      const conteo = compromisosPorCliente.get(clienteId) ?? { vencidos: 0, hoy: 0, proximos3: 0 };
      conteo[key] += 1;
      compromisosPorCliente.set(clienteId, conteo);
    };
    for (const item of buckets.vencidos) contar(item.cliente_id, "vencidos");
    for (const item of buckets.hoy) contar(item.cliente_id, "hoy");
    for (const item of buckets.proximos3) contar(item.cliente_id, "proximos3");

    const coloresPorCliente = new Map<string, ColorSemaforo[]>();
    for (const proyecto of proyectos) {
      const color = kpis?.get(proyecto.id)?.tecnico?.color;
      if (!color) continue;
      coloresPorCliente.set(proyecto.cliente_id, [
        ...(coloresPorCliente.get(proyecto.cliente_id) ?? []),
        color,
      ]);
    }

    const hoy = todayInBogota();

    const filas: SaludClienteRow[] = clientes.map((cliente) => {
      const ultima = ultimaPorCliente.get(cliente.id) ?? null;
      const diasUltimaInteraccion =
        ultima === null ? null : Math.max(0, toDayNumber(hoy) - toDayNumber(todayInBogota(ultima)));

      const salud = calcularSalud({
        diasUltimaInteraccion,
        compromisos: compromisosPorCliente.get(cliente.id) ?? null,
        proyectosColores: coloresPorCliente.get(cliente.id) ?? [],
      });

      return {
        cliente_id: cliente.id,
        cliente_nombre: cliente.nombre,
        score: salud.score,
        bucket: salud.bucket,
        subscores: salud.subscores,
        motivo: salud.motivo,
      };
    });

    // Worst-first: lowest score first, `null` (SIN_DATOS) last; ties by name.
    filas.sort((a, b) => {
      if (a.score === null || b.score === null) {
        if (a.score === b.score) return a.cliente_nombre.localeCompare(b.cliente_nombre);
        return a.score === null ? 1 : -1;
      }
      if (a.score !== b.score) return a.score - b.score;
      return a.cliente_nombre.localeCompare(b.cliente_nombre);
    });

    const cartera: SaludCartera = {
      sana: 0,
      atencion: 0,
      riesgo: 0,
      sin_datos: 0,
      total: filas.length,
      promedio: null,
    };
    const puntajes: number[] = [];
    for (const fila of filas) {
      cartera[BUCKET_KEY[clasificarBucket(fila.score)]] += 1;
      if (fila.score !== null) puntajes.push(fila.score);
    }
    if (puntajes.length > 0) {
      cartera.promedio = round1(
        puntajes.reduce((sum, valor) => sum + valor, 0) / puntajes.length,
      );
    }

    return NextResponse.json({ data: { clientes: filas, cartera } });
  },
);
