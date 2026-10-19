// M4 (Y3): la sección Mapa aún no está construida; su ruta redirige al listado de aliados.
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function ClientesMapaPage() {
  return redirect("/clientes");
}
