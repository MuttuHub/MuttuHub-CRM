// M4 (Y3): la sección Oportunidades aún no está construida; su ruta redirige al listado de aliados.
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function ClientesOportunidadesPage() {
  return redirect("/clientes");
}
