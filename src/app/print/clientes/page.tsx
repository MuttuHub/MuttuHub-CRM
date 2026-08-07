// Reporte imprimible del listado de clientes (PRD §4.6): página fuera del
// shell (sin sidebar), lee los mismos filtros que el listado y los re-descarga
// con page=1&limit=500. Se auto-imprime al cargar; en pantalla muestra una
// barra con el botón "Imprimir".

import { Suspense } from "react";
import type { Metadata } from "next";
import { PrintClientes } from "@/components/crm/print-list";

export const metadata: Metadata = {
  title: "Reporte de clientes",
};

export const dynamic = "force-dynamic";

export default function PrintClientesPage() {
  return (
    <Suspense>
      <PrintClientes />
    </Suspense>
  );
}