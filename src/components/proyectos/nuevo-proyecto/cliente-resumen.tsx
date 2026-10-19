// Read-only card shown under the client selector of the create form: what we already know about the client,
// so nobody has to leave the page to check who they are creating the project for. Only fields the existing
// client DTOs carry are shown (type, location, main contact, opportunity count); anything missing is omitted.

"use client";

import { useClientDetail, useContacts, type Contacto } from "@/hooks/crm";
import { TIPO_CLIENTE_LABELS } from "@/lib/catalogs";

/** The decision-maker if there is one, otherwise the first contact the API returned. */
function contactoPrincipal(contactos: Contacto[]): Contacto | null {
  return contactos.find((c) => c.rol_decision === "DECISOR") ?? contactos[0] ?? null;
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] font-medium text-ink-600">{etiqueta}</dt>
      <dd className="mt-0.5 text-[13px] break-words text-ink-900">{children}</dd>
    </div>
  );
}

export function ClienteResumen({ clienteId }: { clienteId: string }) {
  const clienteQuery = useClientDetail(clienteId);
  const contactosQuery = useContacts(clienteId);
  const cliente = clienteQuery.data;

  if (clienteQuery.isError) {
    return (
      <p role="alert" className="rounded-12 border border-ink-200 bg-ink-050 px-3 py-2 text-[13px] text-ink-700">
        No pudimos cargar los datos del cliente.
      </p>
    );
  }
  if (!cliente) {
    return (
      <p role="status" className="rounded-12 border border-ink-200 bg-ink-050 px-3 py-2 text-[13px] text-ink-600">
        Cargando datos del cliente…
      </p>
    );
  }

  const contacto = contactoPrincipal(contactosQuery.data ?? []);
  const sinContactos = contactosQuery.data !== undefined && contacto === null;

  return (
    <section
      aria-label="Datos del cliente"
      className="rounded-12 border border-ink-200 bg-ink-050 px-4 py-3"
    >
      <p className="text-[14px] font-semibold text-ink-950">{cliente.nombre}</p>
      {cliente.empresa && <p className="text-[12.5px] text-ink-600">{cliente.empresa}</p>}
      <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Dato etiqueta="Tipo de cliente">{TIPO_CLIENTE_LABELS[cliente.tipo_cliente].label}</Dato>
        {cliente.ubicacion && <Dato etiqueta="Ubicación">{cliente.ubicacion}</Dato>}
        <Dato etiqueta="Oportunidades">{cliente.oportunidades_count}</Dato>
        <Dato etiqueta="Contacto principal">
          {contacto ? (
            <>
              <span className="font-medium">{contacto.nombre}</span>
              {contacto.cargo && <span className="text-ink-600"> · {contacto.cargo}</span>}
              {contacto.correo && <span className="block">{contacto.correo}</span>}
              {contacto.telefono && <span className="block">{contacto.telefono}</span>}
            </>
          ) : sinContactos ? (
            <span className="text-ink-600">Sin contactos registrados</span>
          ) : (
            <span className="text-ink-600">Cargando…</span>
          )}
        </Dato>
      </dl>
    </section>
  );
}
