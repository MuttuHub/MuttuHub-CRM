import type { Metadata } from "next";
import { RelacionesVista } from "@/components/crm/relaciones-vista";

export const metadata: Metadata = {
  title: "Relaciones · Clientes",
};

export const dynamic = "force-dynamic";

export default function ClientesRelacionesPage() {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="max-w-[62ch] text-[13px] text-ink-600">
        El poder y el interés de los contactos de cada aliado, en el mapa de
        cuadrantes, con su rol y la fuerza de la relación. La lectura es global;
        la edición vive en la ficha de cada aliado.
      </p>
      <RelacionesVista />
    </div>
  );
}
