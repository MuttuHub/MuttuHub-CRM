// Reporte imprimible del listado de clientes (PRD §4.6): página fuera del
// shell (sin sidebar), lee los mismos filtros del listado y re-descarga con
// page=1&limit=200 (max del API, ver parsePagination). Se auto-imprime apenas cargan los datos; en pantalla
// muestra una barra con el botón "Imprimir" y la vista de pre-impresión.

"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ESTADO_CLIENTE_LABELS,
  PRIORIDAD_CLIENTE_LABELS,
  TIPO_CLIENTE_LABELS,
} from "@/lib/catalogs";
import {
  esVencida,
  formatCOP,
  formatFecha,
  type ClientListResponse,
} from "@/hooks/crm";
import { apiGet, ApiError } from "@/lib/api/http";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string; clave: "sin-conexion" | "otro" }
  | { kind: "ready"; data: ClientListResponse };

export function PrintClientes() {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const filtros = describeFiltros(query);

  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    setState({ kind: "loading" });
  }

  useEffect(() => {
    let alive = true;

    const qs = new URLSearchParams(query);
    qs.set("page", "1");
    qs.set("limit", "200");

    apiGet<ClientListResponse>(`/api/v1/clients?${qs.toString()}`)
      .then((data) => {
        if (alive) setState({ kind: "ready", data });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        if (err instanceof ApiError && (err.status === 500 || err.status === 401)) {
          setState({ kind: "error", message: err.message, clave: "sin-conexion" });
        } else {
          const msg =
            err instanceof ApiError ? err.message : "No pudimos generar el reporte.";
          setState({ kind: "error", message: msg, clave: "otro" });
        }
      });

    return () => {
      alive = false;
    };
  }, [query]);

  useEffect(() => {
    if (state.kind !== "ready") return;
    const t = setTimeout(() => window.print(), 250);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <main className="min-h-screen bg-white px-6 py-6 text-ink-900 sm:px-10 print:bg-white print:p-0">
      <div className="print-hide mb-6 flex items-center justify-between rounded-[16px] border border-ink-200 bg-panel px-5 py-4">
        <p className="text-[13px] text-ink-600">
          Vista de impresión: los filtros que aplicaste se respetan.
        </p>
        <Button onClick={() => window.print()} className="rounded-12 px-4 font-bold">
          <Printer className="size-4" />
          Imprimir
        </Button>
      </div>

      {state.kind === "loading" && (
        <p className="py-20 text-center text-[13px] text-ink-500">
          Preparando el reporte…
        </p>
      )}

      {state.kind === "error" && (
        <PrintError
          sinConexion={state.clave === "sin-conexion"}
          message={state.message}
          onRetry={() => {
            // El efecto depende de `query`; fuerza el re-fetch con una clave nueva.
            setState({ kind: "loading" });
            window.location.reload();
          }}
        />
      )}

      {state.kind === "ready" && (
        <>
          <PrintHeader
            title="Reporte de aliados y clientes"
            subtitle={`${state.data.total} clientes · generado el ${fechaDelDia()}`}
          />
          <FiltrosSummary filtros={filtros} />
          {state.data.items.length === 0 ? (
            <SinResultados />
          ) : (
            <TablaClientes items={state.data.items} />
          )}
          <PrintFooter total={state.data.total} />
        </>
      )}
    </main>
  );
}

/* ── Cabecera y pie ────────────────────────────────────────────────────── */

function PrintHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="flex items-start justify-between gap-6 border-b-2 border-ink-950 pb-4">
      <div>
        <p className="font-display text-[13px] font-extrabold tracking-[0.14em] text-rose-500 uppercase">
          Muttu Innovación Social
        </p>
        <h1 className="mt-1.5 font-display text-[24px] font-extrabold tracking-[-0.02em] text-ink-950">
          {title}
        </h1>
      </div>
      <p className="text-right font-mono text-[11.5px] text-ink-500">{subtitle}</p>
    </header>
  );
}

function PrintFooter({ total }: { total: number }) {
  return (
    <footer className="mt-8 flex items-center justify-between border-t border-ink-200 pt-3 text-[11px] text-ink-500">
      <span className="font-bold tracking-[0.12em] text-rose-700 uppercase">
        Muttu Hub
      </span>
      <span>
        {total} clientes en el reporte · exportado desde Muttu Hub
      </span>
    </footer>
  );
}

function FiltrosSummary({ filtros }: { filtros: string[] }) {
  if (filtros.length === 0) return null;
  return (
    <div className="mt-5">
      <p className="text-[11px] font-bold tracking-[0.1em] text-ink-500 uppercase">
        Filtros aplicados
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {filtros.map((f) => (
          <li
            key={f}
            className="rounded-full border border-ink-200 bg-ink-100 px-3 py-1 text-[11.5px] font-medium text-ink-700"
          >
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

function describeFiltros(query: string): string[] {
  const sp = new URLSearchParams(query);
  const out: string[] = [];
  const push = (label: string, value: string) => {
    if (value) out.push(`${label}: ${value}`);
  };
  push("Búsqueda", sp.get("q") ? `"${sp.get("q")}"` : "");
  const tipo = sp.get("tipo");
  push("Tipo", tipo ? (TIPO_CLIENTE_LABELS[tipo as keyof typeof TIPO_CLIENTE_LABELS]?.label ?? tipo) : "");
  const estado = sp.get("estado");
  push("Estado", estado ? (ESTADO_CLIENTE_LABELS[estado as keyof typeof ESTADO_CLIENTE_LABELS]?.label ?? estado) : "");
  const prioridad = sp.get("prioridad");
  push("Prioridad", prioridad ? (PRIORIDAD_CLIENTE_LABELS[prioridad as keyof typeof PRIORIDAD_CLIENTE_LABELS]?.label ?? prioridad) : "");
  push("Responsable", sp.get("responsable") ?? "");
  push("Primer contacto desde", sp.get("desde") ?? "");
  push("Primer contacto hasta", sp.get("hasta") ?? "");
  if (sp.get("valorMin")) push("Valor mín", `$${sp.get("valorMin")}`);
  if (sp.get("valorMax")) push("Valor máx", `$${sp.get("valorMax")}`);
  return out;
}

/* ── Tabla del reporte ─────────────────────────────────────────────────── */

function TablaClientes({ items }: { items: ClientListResponse["items"] }) {
  return (
    <table className="mt-6 w-full border-collapse text-[12px]">
      <thead>
        <tr className="border-b-2 border-ink-950 text-left">
          <th className="py-2 pr-3 text-[10.5px] font-bold tracking-[0.09em] text-ink-500 uppercase">Cliente</th>
          <th className="py-2 pr-3 text-[10.5px] font-bold tracking-[0.09em] text-ink-500 uppercase">Tipo</th>
          <th className="py-2 pr-3 text-[10.5px] font-bold tracking-[0.09em] text-ink-500 uppercase">Estado</th>
          <th className="py-2 pr-3 text-[10.5px] font-bold tracking-[0.09em] text-ink-500 uppercase">Prioridad</th>
          <th className="py-2 pr-3 text-[10.5px] font-bold tracking-[0.09em] text-ink-500 uppercase">Responsable</th>
          <th className="py-2 pr-3 text-right text-[10.5px] font-bold tracking-[0.09em] text-ink-500 uppercase">Valor potencial</th>
          <th className="py-2 text-[10.5px] font-bold tracking-[0.09em] text-ink-500 uppercase">Próximo compromiso</th>
        </tr>
      </thead>
      <tbody>
        {items.map((c, i) => {
          const vencido = c.next_compromiso ? esVencida(c.next_compromiso.fecha_entrega) : false;
          return (
            <tr key={c.id} className={i !== 0 ? "border-t border-ink-200" : ""}>
              <td className="py-2.5 pr-3 align-top">
                <p className="font-bold text-ink-950">{c.nombre}</p>
                <p className="text-ink-600">{[c.empresa, c.ubicacion].filter(Boolean).join(" · ") || "—"}</p>
              </td>
              <td className="py-2.5 pr-3 align-top">
                {TIPO_CLIENTE_LABELS[c.tipo_cliente]?.label ?? c.tipo_cliente}
              </td>
              <td className="py-2.5 pr-3 align-top">
                {ESTADO_CLIENTE_LABELS[c.estado]?.label ?? c.estado}
              </td>
              <td className="py-2.5 pr-3 align-top">
                {c.prioridad ? PRIORIDAD_CLIENTE_LABELS[c.prioridad]?.label ?? c.prioridad : "—"}
              </td>
              <td className="py-2.5 pr-3 align-top">{c.responsable_nombre}</td>
              <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                {formatCOP(c.valor_potencial)}
              </td>
              <td className="py-2.5 align-top">
                {c.next_compromiso ? (
                  <span className={vencido ? "font-bold text-destructivo" : ""}>
                    {formatFecha(c.next_compromiso.fecha_entrega)}
                    {vencido && " · vencido"}
                  </span>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ── Estados ───────────────────────────────────────────────────────────── */

function SinResultados() {
  return (
    <div className="mt-10 grid place-items-center rounded-[18px] border border-dashed border-ink-300 bg-ink-100/40 py-16 text-center">
      <div className="max-w-[40ch]">
        <h2 className="font-display text-[16px] font-bold tracking-[-0.02em] text-ink-950">
          Sin resultados para los filtros
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-600">
          No hay clientes que coincidan con la combinación de filtros del
          reporte.
        </p>
      </div>
    </div>
  );
}

function PrintError({
  sinConexion,
  message,
  onRetry,
}: {
  sinConexion: boolean;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="grid min-h-[380px] place-items-center">
      <div className="max-w-[46ch] text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-[16px_16px_16px_6px] bg-alerta-bg text-alerta">
          <TriangleAlert className="size-5" strokeWidth={1.7} />
        </span>
        <h2 className="mt-4 font-display text-[19px] font-bold tracking-[-0.02em] text-ink-950">
          {sinConexion ? "Plataforma no conectada" : "No pudimos generar el reporte"}
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
          {sinConexion
            ? "Configura el archivo .env con Supabase o inicia sesión para exportar el listado."
            : message}
        </p>
        <Button onClick={onRetry} variant="outline" className="mt-5 rounded-lg px-4 font-semibold">
          Reintentar
        </Button>
      </div>
    </div>
  );
}

function fechaDelDia(): string {
  return new Date().toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}