import type { Metadata } from "next";
import { Users } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/supabase/server";
import { UsersTable } from "@/components/admin/users-table";
import { CatalogsSection } from "@/components/admin/catalogs-section";
import { AccesosSection } from "@/components/admin/accesos-section";
import { AuditLogSection } from "@/components/admin/audit-log-section";

export const metadata: Metadata = {
  title: "Usuarios y permisos",
};

export const dynamic = "force-dynamic";

export default async function AdministracionPage() {
  // Unconfigured dev mode → the table component renders the
  // "Plataforma no conectada" card; configured → redirects when not admin.
  const auth = await requireRole(["ADMINISTRADOR"], "/?notice=admin_only");

  let usuarios: Awaited<ReturnType<typeof db.usuario.findMany>> = [];
  let loadError = false;

  if (auth) {
    try {
      usuarios = await db.usuario.findMany({
        orderBy: { created_at: "desc" },
      });
    } catch (err) {
      console.error("[administracion] users fetch failed:", err);
      loadError = true;
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-[19px] font-bold tracking-[-0.02em] text-ink-950">
            Usuarios y permisos
          </h2>
          <p className="mt-0.5 text-[13px] text-ink-600">
            Crea usuarios, asigna roles y desactiva accesos. Nadie se elimina:
            el historial se conserva.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-panel px-3.5 py-1.5 text-[12px] font-semibold text-ink-700">
          <Users className="size-3.5" strokeWidth={1.8} />
          {auth && !loadError ? `${usuarios.length} usuarios` : "—"}
        </span>
      </div>

      <UsersTable
        usuarios={usuarios}
        currentUserId={auth?.usuario?.id}
        unconfigured={!auth}
        loadError={loadError}
      />

      {/* Catálogos configurables y bitácora de accesos (PRD §3.3): cargan por
          cliente; en modo dev sin configurar muestran su tarjeta de error con
          reintento sin romper la página. */}
      <CatalogsSection />
      <AccesosSection />
      <AuditLogSection />
    </div>
  );
}
