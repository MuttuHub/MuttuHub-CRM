// Ficha completa imprimible de un cliente (PRD §4.6): cabecera, General,
// Contactos, Oportunidades, Bitácora y Compromisos. Se auto-imprime al
// cargar; 404 → "Cliente no encontrado", 500/401 (plataforma no configurada
// o sesión inválida) → tarjeta de "Plataforma no conectada".

"use client";

import { useEffect, useState } from "react";
import { Printer, TriangleAlert, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ESTADO_CLIENTE_LABELS,
  ESTADO_OPORTUNIDAD_LABELS,
  ESTADO_TAREA_LABELS,
  ROL_CONTACTO_LABELS,
  TIPO_CLIENTE_LABELS,
} from "@/lib/catalogs";
import {
  formatCOP,
  formatFecha,
  formatFechaHora,
  type BitacoraEntrada,
  type ClientDetail,
  type Contacto,
  type Oportunidad,
  type TaskItem,
} from "@/hooks/crm";
import { apiGet, ApiError } from "@/lib/api/http";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; clave: "sin-conexion" | "404" | "otro"; message: string }
  | { kind: "ready"; data: FichaData };

type FichaData = {
  cliente: ClientDetail;
  contactos: Contacto[];
  oportunidades: Oportunidad[];
  bitacora: BitacoraEntrada[];
  compromisos: TaskItem[];
};

export function PrintFicha({ clientId }: { clientId: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const [prevId, setPrevId] = useState(clientId);
  if (clientId !== prevId) {
    setPrevId(clientId);
    setState({ kind: "loading" });
  }

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const [cliente, contactos, oportunidades, bitacora, compromisos] =
          await Promise.all([
            apiGet<{ cliente: ClientDetail }>(`/api/v1/clients/${clientId}`),
            apiGet<{ contactos: Contacto[] }>(`/api/v1/clients/${clientId}/contacts`),
            apiGet<{ oportunidades: Oportunidad[] }>(`/api/v1/clients/${clientId}/opportunities`),
            apiGet<{ entradas: BitacoraEntrada[] }>(`/api/v1/clients/${clientId}/log`),
            apiGet<{ items: TaskItem[] }>(`/api/v1/tasks?cliente=${clientId}&limit=100`),
          ]);
        if (!alive) return;
        setState({
          kind: "ready",
          data: {
            cliente: cliente.cliente,
            contactos: contactos.contactos,
            oportunidades: oportunidades.oportunidades,
            bitacora: bitacora.entradas,
            compromisos: compromisos.items,
          },
        });
      } catch (err) {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 404) {
          setState({ kind: "error", clave: "404", message: err.message });
        } else if (err instanceof ApiError && (err.status === 500 || err.status === 401)) {
          setState({ kind: "error", clave: "sin-conexion", message: err.message });
        } else {
          setState({
            kind: "error",
            clave: "otro",
            message:
              err instanceof ApiError ? err.message : "No pudimos cargar la ficha.",
          });
        }
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, [clientId]);

  useEffect(() => {
    if (state.kind !== "ready") return;
    const t = setTimeout(() => window.print(), 250);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <main className="min-h-screen bg-white px-6 py-6 text-ink-900 sm:px-10 print:bg-white print:p-0">
      <div className="print-hide mb-6 flex items-center justify-between rounded-[16px] border border-ink-200 bg-panel px-5 py-4">
        <p className="text-[13px] text-ink-600">
          Vista de impresión de la ficha completa.
        </p>
        <Button onClick={() => window.print()} className="rounded-[12px] px-4 font-bold">
          <Printer className="size-4" />
          Imprimir
        </Button>
      </div>

      {state.kind === "loading" && (
        <p className="py-20 text-center text-[13px] text-ink-500">
          Preparando la ficha…
        </p>
      )}

      {state.kind === "error" && (
        <FichaError clave={state.clave} message={state.message} />
      )}

      {state.kind === "ready" && <FichaReporte data={state.data} />}
    </main>
  );
}

/* ── Reporte ───────────────────────────────────────────────────────────── */

function FichaReporte({ data }: { data: FichaData }) {
  const { cliente } = data;
  return (
    <>
      <header className="flex items-start justify-between gap-6 border-b-2 border-ink-950 pb-4">
        <div>
          <p className="font-display text-[13px] font-extrabold tracking-[0.14em] text-rose-500 uppercase">
            Muttu Innovación Social
          </p>
          <h1 className="mt-1.5 font-display text-[24px] font-extrabold tracking-[-0.02em] text-ink-950">
            {cliente.nombre}
          </h1>
          <p className="mt-1 text-[12.5px] text-ink-600">
            {[cliente.empresa, cliente.ubicacion].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <div className="text-right font-mono text-[11.5px] text-ink-500">
          <p>Ficha impresa el {fechaDelDia()}</p>
          <p className="mt-1">
            Actualización: {formatFechaHora(cliente.updated_at)}
          </p>
        </div>
      </header>

      {/* Mini header: tipo/estado/prioridad/responsable */}
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[12px] sm:grid-cols-4">
        <Factura label="Tipo de cliente" value={TIPO_CLIENTE_LABELS[cliente.tipo_cliente]?.label ?? cliente.tipo_cliente} />
        <Factura label="Estado" value={ESTADO_CLIENTE_LABELS[cliente.estado]?.label ?? cliente.estado} />
        <Factura
          label="Prioridad"
          value={cliente.prioridad ? (cliente.prioridad === "ALTA" ? "Alta" : cliente.prioridad === "MEDIA" ? "Media" : "Baja") : "—"}
        />
        <Factura label="Responsable" value={cliente.responsable_nombre} />
      </div>

      {/* General */}
      <Section label="Ficha general">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
          <Campo label="Empresa u organización" value={cliente.empresa ?? "—"} />
          <Campo label="Tamaño de la organización" value={cliente.tamano_org ?? "—"} />
          <Campo label="Ubicación" value={cliente.ubicacion ?? "—"} />
          <Campo label="Canal de contacto inicial" value={cliente.canal_contacto_inicial ?? "—"} />
          <Campo label="Fecha de primer contacto" value={formatFecha(cliente.fecha_primer_contacto)} />
          <Campo label="Valor potencial" value={formatCOP(cliente.valor_potencial)} mono />
          <Campo label="Compromisos abiertos" value={String(cliente.compromisos_abiertos)} mono />
          <Campo label="Oportunidades" value={String(cliente.oportunidades_count)} mono />
          <Campo label="Contactos" value={String(cliente.contactos_count)} mono />
          <div className="col-span-2 sm:col-span-3">
            <Campo label="Prioridades identificadas del cliente" value={cliente.prioridades_identificadas ?? "—"} />
          </div>
          <div className="col-span-2 sm:col-span-3">
            <Campo label="Riesgos o barreras" value={cliente.riesgos_barreras ?? "—"} />
          </div>
          <div className="col-span-2 sm:col-span-3">
            <Campo label="Resumen de la relación" value={cliente.resumen_relacion ?? "—"} />
          </div>
        </dl>
      </Section>

      {/* Contactos */}
      <Section label={`Contactos (${data.contactos.length})`}>
        {data.contactos.length === 0 ? (
          <p className="text-[12.5px] text-ink-500">Sin contactos registrados.</p>
        ) : (
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b-2 border-ink-950 text-left">
                <th className="py-2 pr-3 text-[10.5px] font-bold tracking-[0.09em] text-ink-500 uppercase">Nombre</th>
                <th className="py-2 pr-3 text-[10.5px] font-bold tracking-[0.09em] text-ink-500 uppercase">Cargo</th>
                <th className="py-2 pr-3 text-[10.5px] font-bold tracking-[0.09em] text-ink-500 uppercase">Correo / teléfono</th>
                <th className="py-2 pr-3 text-[10.5px] font-bold tracking-[0.09em] text-ink-500 uppercase">Rol</th>
                <th className="py-2 text-[10.5px] font-bold tracking-[0.09em] text-ink-500 uppercase">Notas</th>
              </tr>
            </thead>
            <tbody>
              {data.contactos.map((c, i) => (
                <tr key={c.id} className={i !== 0 ? "border-t border-ink-200" : ""}>
                  <td className="py-2 pr-3 font-semibold align-top">{c.nombre}</td>
                  <td className="py-2 pr-3 align-top">{c.cargo ?? "—"}</td>
                  <td className="py-2 pr-3 align-top font-mono text-[11px]">
                    {[c.correo, c.telefono].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="py-2 pr-3 align-top">
                    {c.rol_decision ? ROL_CONTACTO_LABELS[c.rol_decision]?.label ?? c.rol_decision : "—"}
                  </td>
                  <td className="py-2 align-top">{c.notas ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Oportunidades */}
      <Section label={`Oportunidades (${data.oportunidades.length})`}>
        {data.oportunidades.length === 0 ? (
          <p className="text-[12.5px] text-ink-500">Sin oportunidades registradas.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.oportunidades.map((o) => (
              <li key={o.id} className="rounded-[12px] border border-ink-200 p-3.5">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-[13px] font-bold text-ink-950">{o.nombre}</p>
                  <p className="font-mono text-[12px] tabular-nums">{formatCOP(o.valor_estimado_cop)}</p>
                </div>
                <p className="mt-0.5 text-[11.5px] text-ink-600">
                  {ESTADO_OPORTUNIDAD_LABELS[o.estado]?.label ?? o.estado} · última gestión:{" "}
                  {formatFecha(o.fecha_ultima_gestion)}
                </p>
                <div className="mt-2 space-y-1 text-[12px] text-ink-700">
                  <p><span className="font-bold text-ink-900">Problema:</span> {o.problema_detectado ?? "—"}</p>
                  <p><span className="font-bold text-ink-900">Solución:</span> {o.solucion_propuesta ?? "—"}</p>
                  {o.servicios_interes && (
                    <p><span className="font-bold text-ink-900">Servicios:</span> {o.servicios_interes}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Compromisos */}
      <Section label={`Compromisos (${data.compromisos.length})`}>
        {data.compromisos.length === 0 ? (
          <p className="text-[12.5px] text-ink-500">Sin compromisos vinculados.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {data.compromisos.map((t) => (
              <li key={t.id} className="rounded-[12px] border border-ink-200 p-3.5">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-[13px] font-bold text-ink-950">{t.titulo}</p>
                  <p className="text-[11.5px] text-ink-600">
                    {ESTADO_TAREA_LABELS[t.estado]?.label ?? t.estado}
                  </p>
                </div>
                <p className="mt-0.5 text-[11.5px] text-ink-600">
                  {t.responsable_nombre} · vence {formatFecha(t.fecha_entrega)}
                  {t.origen && ` · ${t.origen}`}
                </p>
                {t.descripcion && (
                  <p className="mt-1.5 text-[12px] leading-snug text-ink-700">{t.descripcion}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Bitácora */}
      <Section label={`Bitácora de gestión (${data.bitacora.length})`}>
        {data.bitacora.length === 0 ? (
          <p className="text-[12.5px] text-ink-500">Sin notas de seguimiento.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {[...data.bitacora].reverse().map((e) => (
              <li key={e.id} className="rounded-[12px] border border-ink-200 p-3.5">
                <p className="font-mono text-[10.5px] text-ink-500">
                  {e.autor_nombre} · {formatFechaHora(e.created_at)}
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed whitespace-pre-wrap text-ink-800">
                  {e.texto}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <footer className="mt-8 flex items-center justify-between border-t border-ink-200 pt-3 text-[11px] text-ink-500">
        <span className="font-bold tracking-[0.12em] text-rose-700 uppercase">Muttu Hub</span>
        <span>Ficha de {cliente.nombre} · exportada desde Muttu Hub</span>
      </footer>
    </>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7">
      <h2 className="border-b border-ink-950 pb-1.5 font-display text-[15px] font-extrabold tracking-[-0.01em] text-ink-950">
        {label}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Campo({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-bold tracking-[0.08em] text-ink-500 uppercase">{label}</dt>
      <dd className={`mt-0.5 text-[12.5px] text-ink-900 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function Factura({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10.5px] font-bold tracking-[0.08em] text-ink-500 uppercase">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-semibold text-ink-950">{value}</dd>
    </div>
  );
}

/* ── Estados de error ──────────────────────────────────────────────────── */

function FichaError({ clave, message }: { clave: string; message: string }) {
  const notFound = clave === "404";
  const sinConexion = clave === "sin-conexion";

  return (
    <div className="grid min-h-[380px] place-items-center">
      <div className="max-w-[46ch] text-center">
        <span
          className={`mx-auto grid size-12 place-items-center rounded-[16px_16px_16px_6px] ${
            notFound ? "bg-ink-100 text-ink-700" : "bg-alerta-bg text-alerta"
          }`}
        >
          {notFound ? <UserX className="size-5" strokeWidth={1.7} /> : (
            <TriangleAlert className="size-5" strokeWidth={1.7} />
          )}
        </span>
        <h2 className="mt-4 font-display text-[19px] font-bold tracking-[-0.02em] text-ink-950">
          {notFound ? "Cliente no encontrado" : sinConexion ? "Plataforma no conectada" : "No pudimos cargar la ficha"}
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
          {notFound
            ? "El cliente no existe o fue eliminado. Vuelve al listado y elige otro."
            : sinConexion
              ? "Configura el archivo .env con Supabase o inicia sesión para imprimir la ficha."
              : message}
        </p>
        <Button
          onClick={() => window.location.reload()}
          variant="outline"
          className="mt-5 rounded-[13px] px-4 font-semibold"
        >
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