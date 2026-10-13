import type { Metadata } from "next";
import { SaludVista } from "@/components/crm/salud-vista";

export const metadata: Metadata = {
  title: "Salud · Clientes",
};

export const dynamic = "force-dynamic";

export default function ClientesSaludPage() {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="max-w-[62ch] text-[13px] text-ink-600">
        El puntaje de salud de la cartera y el detalle por aliado, con la razón
        de cada alerta. El servidor combina el contacto reciente, los
        compromisos y los proyectos de cada aliado; la lectura es global.
      </p>
      <SaludVista />
    </div>
  );
}
