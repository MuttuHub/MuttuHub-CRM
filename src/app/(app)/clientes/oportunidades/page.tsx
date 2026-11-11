// V1 (S1/S2/S5): la sección Oportunidades dejó de ser un marcador. Renderiza
// el tablero global de siete etapas; el kanban y su hook resuelven la lectura
// cross-client (`GET /api/v1/opportunities`, gateada por hasCommercialAccess)
// y el movimiento de etapa por el PATCH que ya existía.

import type { Metadata } from "next";
import { OportunidadesKanban } from "@/components/crm/oportunidades-kanban";

export const metadata: Metadata = {
  title: "Oportunidades · Clientes",
};

export const dynamic = "force-dynamic";

export default function ClientesOportunidadesPage() {
  return <OportunidadesKanban />;
}
