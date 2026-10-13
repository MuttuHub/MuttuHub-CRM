import type { Metadata } from "next";
import { ClientesSectionPlaceholder } from "@/components/crm/clientes-section-placeholder";

export const metadata: Metadata = {
  title: "Oportunidades · Clientes",
};

export const dynamic = "force-dynamic";

export default function ClientesOportunidadesPage() {
  return (
    <ClientesSectionPlaceholder
      title="Oportunidades"
      description="El tablero comercial con las siete etapas y las oportunidades de todos los aliados, con su monto y responsable. Llega en la siguiente entrega."
    />
  );
}
