import type { Metadata } from "next";
import { ClientesSectionPlaceholder } from "@/components/crm/clientes-section-placeholder";

export const metadata: Metadata = {
  title: "Interacciones · Clientes",
};

export const dynamic = "force-dynamic";

export default function ClientesInteraccionesPage() {
  return (
    <ClientesSectionPlaceholder
      title="Interacciones"
      description="El registro de reuniones, llamadas y correos de todos los aliados, cada uno con su próximo paso. Llega en una entrega posterior."
    />
  );
}
