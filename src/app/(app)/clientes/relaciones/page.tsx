import type { Metadata } from "next";
import { ClientesSectionPlaceholder } from "@/components/crm/clientes-section-placeholder";

export const metadata: Metadata = {
  title: "Relaciones · Clientes",
};

export const dynamic = "force-dynamic";

export default function ClientesRelacionesPage() {
  return (
    <ClientesSectionPlaceholder
      title="Relaciones"
      description="El mapa de poder e interés de los contactos de cada aliado, con su rol y la fuerza de la relación. Llega en una entrega posterior."
    />
  );
}
