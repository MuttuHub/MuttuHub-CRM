"use client";

// Shared disconnected-state card for client-side lists (clientes, documentos,
// tablero) and admin sections (usuarios, solicitudes). Two variants:
// - unconfigured (dev without env vars): technical copy, only in this case;
// - real fetch/load failure: user-facing copy + retry button when available.

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SinConexionCard({
  unconfigured,
  onRetry,
}: {
  unconfigured: boolean;
  onRetry?: () => void;
}) {
  return (
    <section className="grid min-h-[320px] place-items-center rounded-[24px] border border-ink-200 bg-white p-8">
      <div className="max-w-[46ch] text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-[16px_16px_16px_6px] bg-alerta-bg text-alerta">
          <TriangleAlert className="size-6" strokeWidth={1.7} />
        </span>
        {unconfigured ? (
          <>
            <h3 className="mt-4 font-display text-[19px] font-bold tracking-[-0.02em] text-ink-950">
              Plataforma no conectada
            </h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
              Revisa la sección &quot;Puesta en marcha&quot; del README y
              completa el archivo{" "}
              <code className="rounded-md bg-ink-100 px-1.5 py-0.5 font-mono text-[12px] text-ink-800">
                .env
              </code>{" "}
              con las variables de Supabase.
            </p>
          </>
        ) : (
          <>
            <h3 className="mt-4 font-display text-[19px] font-bold tracking-[-0.02em] text-ink-950">
              No pudimos cargar los datos
            </h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
              Inténtalo de nuevo en un momento.
            </p>
          </>
        )}
        {onRetry && (
          <Button
            onClick={onRetry}
            variant="outline"
            className="mt-5 rounded-[13px] px-4 font-semibold"
          >
            Reintentar
          </Button>
        )}
      </div>
    </section>
  );
}
