import type { Metadata } from "next";
import { AutomatizacionesVista } from "@/components/crm/automatizaciones-vista";

export const metadata: Metadata = {
  title: "Automatizaciones · Clientes",
};

export const dynamic = "force-dynamic";

export default function ClientesAutomatizacionesPage() {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="max-w-[62ch] text-[13px] text-ink-600">
        El seguimiento automático del CRM: el resumen diario de vencimientos y
        qué categorías entran en él. Lo edita un administrador; el resto de roles
        lo ven en solo lectura.
      </p>
      <AutomatizacionesVista />
    </div>
  );
}
