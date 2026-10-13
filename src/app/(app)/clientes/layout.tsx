// v7 alignment, unit C1a: shared shell for every `/clientes` route. The sub-nav
// is rendered once here so it survives navigation between sections; each route
// page owns its own title metadata and content. Aliados (`/clientes`) is the
// only section with real content today.

import type { ReactNode } from "react";
import { ClientesSubNav } from "@/components/crm/clientes-subnav";

export default function ClientesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ClientesSubNav />
      {children}
    </div>
  );
}
