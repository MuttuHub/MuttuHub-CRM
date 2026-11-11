import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/server";
import { banderaProyectosV3, puedeVerProyectosV3 } from "@/lib/flags";

export const metadata: Metadata = {
  title: "Proyectos · nueva sección",
};

export const dynamic = "force-dynamic";

/**
 * B0.1 de Proyectos v3: la ruta existe y está apagada.
 *
 * La bandera se evalúa en el servidor y, cuando no deja pasar, la ruta responde 404 —no un
 * «sin permisos»—: la sección no se anuncia hasta que Adrián la encienda. Sin entrada en el menú
 * (eso llega en B8), así que por ahora se entra por URL.
 */
export default async function ProyectosV3Page() {
  const session = await requireUser();
  if (!puedeVerProyectosV3(banderaProyectosV3(), session?.usuario?.rol)) notFound();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <p className="text-[12px] font-semibold tracking-[0.12em] text-ink-500 uppercase">Proyectos</p>
        <h1 className="font-display text-[26px] leading-tight font-bold tracking-[-0.02em] text-ink-950">
          Sección nueva
        </h1>
        <p className="max-w-[70ch] text-[13.5px] text-ink-700">
          Acá se está construyendo la sección renovada de Proyectos. La que se usa hoy sigue funcionando igual; esta
          vista vive aparte y se apaga con una bandera hasta que esté aprobada.
        </p>
      </header>

      <section className="surface-inner flex flex-col gap-2 p-6">
        <h2 className="font-display text-[18px] font-bold text-ink-950">En construcción</h2>
        <p className="max-w-[70ch] text-[13px] text-ink-700">
          El portafolio llega en la primera unidad (B1). Mientras tanto, esta ruta solo confirma que la bandera y el
          acceso por rol funcionan: si ves esta página, estás dentro del grupo que puede entrar.
        </p>
        <p className="text-[12.5px] text-ink-600">
          Bandera <code className="rounded bg-chip-100 px-1.5 py-0.5 text-[12px]">FEATURE_PROYECTOS_V3</code> — solo
          Administración y Gerencia con el valor <code className="rounded bg-chip-100 px-1.5 py-0.5 text-[12px]">admin</code>,
          o todos con <code className="rounded bg-chip-100 px-1.5 py-0.5 text-[12px]">on</code>.
        </p>
      </section>
    </div>
  );
}
