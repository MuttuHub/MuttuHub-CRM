import type { Metadata } from "next";
import { MapaVista } from "@/components/crm/mapa/mapa-vista";

export const metadata: Metadata = {
  title: "Mapa · Clientes",
};

export const dynamic = "force-dynamic";

// V5 (S3, decision L8): the coverage map by departamento. Only clients with a departamento count;
// the rest are listed apart, never placed from their free-text ubicación.
export default function ClientesMapaPage() {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="max-w-[62ch] text-[13px] text-ink-600">
        La cobertura de aliados por departamento. Cada aliado cuenta en el departamento que tiene
        asignado en su ficha; quienes no lo tienen aparecen aparte. La lectura es global.
      </p>
      <MapaVista />
    </div>
  );
}
