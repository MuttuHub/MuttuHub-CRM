import type { Metadata } from "next";
import { InteraccionesFeed } from "@/components/crm/interacciones-feed";
import { RegistrarInteraccionButton } from "@/components/crm/interaccion-form-dialog";

export const metadata: Metadata = {
  title: "Interacciones · Clientes",
};

export const dynamic = "force-dynamic";

export default function ClientesInteraccionesPage() {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-[62ch] text-[13px] text-ink-600">
          Reuniones, llamadas, correos y visitas de todos los aliados, con su
          próximo paso. El registro es inmutable: se agrega, no se edita.
        </p>
        <RegistrarInteraccionButton />
      </div>
      <InteraccionesFeed />
    </div>
  );
}
