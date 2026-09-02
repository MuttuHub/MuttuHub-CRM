// PR 6 (close-phase-1) — banner de truncado. El servidor ya devuelve el
// total honesto (sin prioridad / etiqueta / fecha_entrega_*, ver D7 en
// design.md); el kanban pinta "Mostrando N de M tareas" cuando la página
// devuelve menos filas que el total, para que el usuario sepa que está
// viendo un corte y no el conjunto entero. Sin provider, sin estado —
// `shown`/`total` llegan del query padre.
//
// Copy en español, convención del proyecto: las cadenas de UI van inline
// en el componente, sin messages/es.ts.

export function TruncationBanner({ shown, total }: { shown: number; total: number }) {
  if (shown >= total) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className="rounded-12 border border-ink-200 bg-ink-100/70 px-3 py-2 text-[12.5px] text-ink-700"
    >
      Mostrando {shown} de {total} tareas
    </p>
  );
}