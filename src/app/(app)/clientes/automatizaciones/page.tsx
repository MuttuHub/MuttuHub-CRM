import type { Metadata } from "next";
import { ClientesSectionPlaceholder } from "@/components/crm/clientes-section-placeholder";

export const metadata: Metadata = {
  title: "Automatizaciones · Clientes",
};

export const dynamic = "force-dynamic";

export default function ClientesAutomatizacionesPage() {
  return (
    <ClientesSectionPlaceholder
      title="Automatizaciones"
      description="Las reglas de seguimiento automático y las plantillas de correo del CRM. Llega en una entrega posterior."
    />
  );
}
