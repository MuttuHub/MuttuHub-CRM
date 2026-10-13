import type { Metadata } from "next";
import { ClientesSectionPlaceholder } from "@/components/crm/clientes-section-placeholder";

export const metadata: Metadata = {
  title: "Salud · Clientes",
};

export const dynamic = "force-dynamic";

export default function ClientesSaludPage() {
  return (
    <ClientesSectionPlaceholder
      title="Salud"
      description="El puntaje de salud de la cartera y el detalle por aliado, con la razón de cada alerta. Llega en una entrega posterior."
    />
  );
}
