"use client";

// v7 alignment, unit C4b: the read-only Relaciones section. It is the UI half of
// C4a's `GET /api/v1/contacts` (items carry cliente_nombre, owner_nombre, poder,
// interes and fuerza_relacion). Two panels, mirroring the v7 prototype: a 2×2
// power × interest map (the four v7 zones, with the contacts listed inside each
// quadrant — deterministic, no DOM measurement, no chart library) and the
// contacts list (initials avatar, cargo, "Relación: owner", rol chip, 3-bar
// strength). Filter chips narrow both panels by aliado, like the Interacciones
// sibling. Reads are global, matching the client list (PR 3); nothing writes.

import { useMemo, useState } from "react";
import { ROL_CONTACTO_LABELS } from "@/lib/catalogs";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { iniciales, useGlobalContacts, type ContactoFeedItem } from "@/hooks/crm";

/** Top-2-box on the 1..5 axes: 4..5 is "alto", 1..3 is "bajo". */
export const UMBRAL_ALTO = 4;

export type QuadranteKey =
  | "mantener-satisfecho"
  | "gestionar-de-cerca"
  | "monitorear"
  | "mantener-informado";

export type Quadrante = {
  key: QuadranteKey;
  titulo: string;
  ejes: string;
};

/** Render order = the Mendelow grid: poder grows upward, interés rightward. */
export const QUADRANTES: readonly Quadrante[] = [
  { key: "mantener-satisfecho", titulo: "Mantener satisfecho", ejes: "Poder alto · interés bajo" },
  { key: "gestionar-de-cerca", titulo: "Gestionar de cerca", ejes: "Poder alto · interés alto" },
  { key: "monitorear", titulo: "Monitorear", ejes: "Poder bajo · interés bajo" },
  { key: "mantener-informado", titulo: "Mantener informado", ejes: "Poder bajo · interés alto" },
];

/**
 * The v7 zone a contact belongs to, or null when either axis is unset (the
 * contact then shows in the list only). Pure and exported so the grouping rule
 * is pinned by its own test.
 */
export function quadranteDe(poder: number | null, interes: number | null): QuadranteKey | null {
  if (poder === null || interes === null) return null;
  const poderAlto = poder >= UMBRAL_ALTO;
  const interesAlto = interes >= UMBRAL_ALTO;
  if (poderAlto) return interesAlto ? "gestionar-de-cerca" : "mantener-satisfecho";
  return interesAlto ? "mantener-informado" : "monitorear";
}

/** 3-bar relationship strength; null reads as "sin definir" to assistive tech. */
export function FuerzaRelacion({ valor }: { valor: number | null }) {
  const nivel = valor ?? 0;
  return (
    <span
      role="img"
      aria-label={
        valor === null
          ? "Fuerza de la relación: sin definir"
          : `Fuerza de la relación: ${valor} de 3`
      }
      className="inline-flex items-end gap-0.5"
    >
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          data-slot="fuerza-bar"
          data-filled={i <= nivel ? "true" : "false"}
          className={cn("h-3.5 w-1 rounded-full", i <= nivel ? "bg-rose-500" : "bg-ink-200")}
        />
      ))}
    </span>
  );
}

export function RelacionesVista() {
  const query = useGlobalContacts();
  const contactos = useMemo(() => query.data ?? [], [query.data]);
  const [clienteId, setClienteId] = useState<string>("todos");

  // Chips come from the fetched feed: id → nombre, ordered by name.
  const clientes = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of contactos) map.set(c.cliente_id, c.cliente_nombre);
    return [...map.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [contactos]);

  const visibles = useMemo(
    () => (clienteId === "todos" ? contactos : contactos.filter((c) => c.cliente_id === clienteId)),
    [contactos, clienteId],
  );

  const porQuadrante = useMemo(() => {
    const out: Record<QuadranteKey, ContactoFeedItem[]> = {
      "mantener-satisfecho": [],
      "gestionar-de-cerca": [],
      monitorear: [],
      "mantener-informado": [],
    };
    for (const c of visibles) {
      const key = quadranteDe(c.poder, c.interes);
      if (key) out[key].push(c);
    }
    return out;
  }, [visibles]);

  const conDatos = !query.isLoading && !query.isError && contactos.length > 0;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {clientes.length > 1 && (
        <div role="group" aria-label="Filtrar por aliado" className="flex flex-wrap gap-2">
          <FiltroChip activo={clienteId === "todos"} onClick={() => setClienteId("todos")}>
            Todos los aliados
          </FiltroChip>
          {clientes.map((c) => (
            <FiltroChip
              key={c.id}
              activo={clienteId === c.id}
              onClick={() => setClienteId(c.id)}
            >
              {c.nombre}
            </FiltroChip>
          ))}
        </div>
      )}

      {query.isLoading && (
        <div role="status" aria-label="Cargando relaciones" className="flex flex-col gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-inner" />
          ))}
        </div>
      )}

      {query.isError && (
        <div
          role="alert"
          className="rounded-inner border border-destructivo/25 bg-destructivo-bg px-4 py-3 text-[13px] font-medium text-destructivo"
        >
          No pudimos cargar los contactos. Inténtalo de nuevo.
        </div>
      )}

      {!query.isLoading && !query.isError && contactos.length === 0 && (
        <div className="surface p-2">
          <EmptyState
            title="No hay contactos registrados"
            description="Los contactos de todos los aliados aparecerán aquí con su poder, su interés y la fuerza de la relación."
          />
        </div>
      )}

      {conDatos && (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <section
            aria-labelledby="relaciones-mapa"
            className="surface flex min-w-0 flex-col gap-3 p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="relaciones-mapa" className="font-display text-[15px] font-bold text-ink-950">
                Mapa de poder e interés
              </h2>
              <span className="text-[11.5px] text-ink-500">Poder ↑ · interés →</span>
            </div>

            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              {QUADRANTES.map((q) => {
                const items = porQuadrante[q.key];
                return (
                  <section
                    key={q.key}
                    aria-labelledby={`relaciones-${q.key}`}
                    className="surface-inner flex min-w-0 flex-col gap-2 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3
                        id={`relaciones-${q.key}`}
                        className="text-[12.5px] font-semibold text-ink-900"
                      >
                        {q.titulo}
                      </h3>
                      <span className="text-[11.5px] font-semibold text-ink-500">
                        {items.length}
                      </span>
                    </div>
                    <p className="text-[11.5px] text-ink-500">{q.ejes}</p>
                    {items.length === 0 ? (
                      <p className="text-[11.5px] text-ink-400 italic">
                        Sin contactos en este cuadrante
                      </p>
                    ) : (
                      <ul className="flex min-w-0 flex-col gap-1.5">
                        {items.map((c) => (
                          <li key={c.id}>
                            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-ink-200 bg-panel px-2.5 py-1 text-[12px] font-medium text-ink-800">
                              <span
                                aria-hidden="true"
                                className="grid size-5 shrink-0 place-items-center rounded-full bg-ink-100 text-[9px] font-bold text-ink-700"
                              >
                                {iniciales(c.nombre) || "?"}
                              </span>
                              <span className="truncate">{c.nombre}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          </section>

          <section
            aria-labelledby="relaciones-contactos"
            className="surface flex min-w-0 flex-col gap-3 p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2
                id="relaciones-contactos"
                className="font-display text-[15px] font-bold text-ink-950"
              >
                Contactos
              </h2>
              <span className="text-[11.5px] text-ink-500">{visibles.length}</span>
            </div>

            {visibles.length === 0 ? (
              <EmptyState
                bordered
                title="Sin contactos para este aliado"
                description="Este aliado todavía no tiene contactos registrados."
              />
            ) : (
              <ul aria-label="Contactos" className="flex min-w-0 flex-col gap-2">
                {visibles.map((c) => (
                  <ContactoRow key={c.id} contacto={c} />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function ContactoRow({ contacto }: { contacto: ContactoFeedItem }) {
  const rol = contacto.rol_decision;
  return (
    <li className="surface-inner flex min-w-0 items-start gap-3 p-3">
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-full bg-ink-100 text-[12px] font-bold text-ink-700"
      >
        {iniciales(contacto.nombre) || "?"}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-[13.5px] font-semibold text-ink-950">{contacto.nombre}</p>
        {contacto.cargo && (
          <p className="truncate text-[12.5px] text-ink-600">{contacto.cargo}</p>
        )}
        {contacto.owner_id && contacto.owner_nombre && (
          <p className="truncate text-[12px] text-ink-500">Relación: {contacto.owner_nombre}</p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {rol && (
          <StatusChip tone={ROL_CONTACTO_LABELS[rol].tone}>
            {ROL_CONTACTO_LABELS[rol].label}
          </StatusChip>
        )}
        <FuerzaRelacion valor={contacto.fuerza_relacion} />
      </div>
    </li>
  );
}

function FiltroChip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={cn(
        "h-10 rounded-full border px-4 text-[14px] font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        activo
          ? "border-rose-500 bg-rose-500 text-white"
          : "border-border-strong bg-transparent text-ink-800 hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
