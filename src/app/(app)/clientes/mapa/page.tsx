import type { Metadata } from "next";
import { ClientesSectionPlaceholder } from "@/components/crm/clientes-section-placeholder";

export const metadata: Metadata = {
  title: "Mapa · Clientes",
};

export const dynamic = "force-dynamic";

export default function ClientesMapaPage() {
  return (
    <ClientesSectionPlaceholder
      title="Mapa"
      description="La cobertura de aliados por departamento, con el detalle de cada territorio. Llega en una entrega posterior."
    />
  );
}
