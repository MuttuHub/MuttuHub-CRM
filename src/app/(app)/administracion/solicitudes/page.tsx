import type { Metadata } from "next";
import { UserRoundCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/supabase/server";
import { SolicitudesSection } from "@/components/admin/solicitudes-section";

export const metadata: Metadata = {
  title: "Solicitudes de acceso",
};

export const dynamic = "force-dynamic";

export default async function SolicitudesPage() {
  // Unconfigured dev mode → the section renders the "Plataforma no conectada"
  // card; configured → redirects when not admin.
  const auth = await requireRole(["ADMINISTRADOR"], "/?notice=admin_only");

  let solicitudes: Awaited<ReturnType<typeof db.solicitudAcceso.findMany>> = [];
  let loadError = false;

  if (auth) {
    try {
      solicitudes = await db.solicitudAcceso.findMany({
        orderBy: { created_at: "desc" },
      });
    } catch (err) {
      console.error("[solicitudes] fetch failed:", err);
      loadError = true;
    }
  }

  const pendientes = solicitudes.filter((s) => s.estado === "PENDIENTE").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-[19px] font-bold tracking-[-0.02em] text-ink-950">
            Solicitudes de acceso
          </h2>
          <p className="mt-0.5 text-[13px] text-ink-600">
            Quién pidió entrar al Hub (por formulario o con Google) y cómo se
            resolvió. La aprobación envía la invitación por correo.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-700">
          <UserRoundCheck className="size-3.5" strokeWidth={1.8} />
          {auth && !loadError ? `${pendientes} pendientes` : "—"}
        </span>
      </div>

      <SolicitudesSection
        solicitudes={solicitudes}
        unconfigured={!auth}
        loadError={loadError}
      />
    </div>
  );
}