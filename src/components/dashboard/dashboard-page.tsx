// Dashboard (Hito 6, PRD §7): contenedor con las 4 "caras" del dashboard,
// barra de filtros comunes sticky (§7.2, presets de rango TODO: rango custom)
// y el botón "Generar reporte" que abre el PDF imprimible por cara con los
// filtros aplicados. El estado de filtros vive aquí (useState) y se pasa a
// cada cara; el remount por tab hace que las queries (key = filtros)
// refetcheen solas.

"use client";

import { useMemo, useState } from "react";
import {
  Flag,
  Gauge,
  ListChecks,
  Printer,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  buildDashboardQuery,
  rangoMesActual,
  type DashboardFilters,
} from "@/hooks/dashboard";
import { useUsers } from "@/hooks/crm";
import { ENUM_VALUES, TIPO_CLIENTE_LABELS } from "@/lib/catalogs";
import { cn } from "@/lib/utils";
import {
  RANGO_OPCIONES,
  useFiltersStore,
  type RangoFiltro,
} from "@/store/filters";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChipSelector } from "@/components/dashboard/shared";
import { CaraPipeline } from "@/components/dashboard/cara-pipeline";
import { CaraTareas } from "@/components/dashboard/cara-tasks";
import { CaraClientesActividad } from "@/components/dashboard/cara-clients-activity";
import { CaraMiResumen } from "@/components/dashboard/cara-my-summary";

const CARAS = [
  { id: "pipeline", label: "Pipeline comercial", icon: Gauge },
  { id: "tasks", label: "Gestión de tareas", icon: ListChecks },
  { id: "clients-activity", label: "Actividad de clientes", icon: UsersRound },
  { id: "my-summary", label: "Mi resumen", icon: UserRound },
] as const;

type CaraId = (typeof CARAS)[number]["id"];

function fechaDesde(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function DashboardTabs({ notice }: { notice?: string }) {
  const [cara, setCara] = useState<CaraId>("pipeline");
  const rango = useFiltersStore((s) => s.rango);
  const setRango = useFiltersStore((s) => s.setRango);
  const [responsable, setResponsable] = useState("");
  const [tipoCliente, setTipoCliente] = useState("");
  const [dias, setDias] = useState(14);

  const usersQuery = useUsers();
  const users = usersQuery.data ?? [];

  const filters: DashboardFilters = useMemo(() => {
    const mes = rango === "mes" ? rangoMesActual() : null;
    const desde =
      rango === "todo" ? undefined : rango === "mes" ? mes!.desde : fechaDesde(Number(rango));
    return {
      desde,
      hasta: mes ? mes.hasta : undefined,
      responsable_id: responsable || undefined,
      tipo_cliente: tipoCliente || undefined,
    };
  }, [rango, responsable, tipoCliente]);

  function generarReporte() {
    const qs = buildDashboardQuery(filters, { dias_sin_gestion: dias });
    window.open(`/print/dashboard/${cara}${qs ? `?${qs}` : ""}`, "_blank", "noopener");
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {notice === "admin_only" && (
        <div className="flex items-center gap-2.5 rounded-14 border border-alerta/30 bg-alerta-bg px-4 py-3 text-[13px] font-medium text-alerta">
          <Flag className="size-4 shrink-0" strokeWidth={1.9} />
          Solo los administradores pueden acceder a Usuarios y permisos.
        </div>
      )}

      {/* Tabs: las 4 caras */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg bg-ink-100 p-1">
        {CARAS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCara(c.id)}
            aria-pressed={cara === c.id}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-[9px] px-3 py-2 text-[12.5px] font-bold whitespace-nowrap transition-colors",
              cara === c.id
                ? "bg-card text-ink-950 shadow-sm"
                : "text-ink-600 hover:text-ink-900",
            )}
          >
            <c.icon className="size-4" strokeWidth={1.9} />
            {c.label}
          </button>
        ))}
      </div>

      {/* Filtros comunes (§7.2) + Generar reporte */}
      <div className="sticky top-2 z-20 rounded-[16px] border border-ink-200 bg-panel/95 p-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] font-bold tracking-[0.08em] text-ink-500 uppercase">
              Rango
            </span>
            <ChipSelector options={[...RANGO_OPCIONES]} value={rango} onChange={(v: RangoFiltro) => setRango(v)} />
          </div>

          <Select value={responsable} onValueChange={(v) => v !== null && setResponsable(v)}>
            <SelectTrigger size="sm" className="h-8 rounded-11 bg-panel">
              <SelectValue placeholder="Todos los responsables" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos los responsables</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={tipoCliente} onValueChange={(v) => v !== null && setTipoCliente(v)}>
            <SelectTrigger size="sm" className="h-8 rounded-11 bg-panel">
              <SelectValue placeholder="Todos los tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos los tipos de cliente</SelectItem>
              {ENUM_VALUES.TipoCliente.map((t) => (
                <SelectItem key={t} value={t}>
                  {TIPO_CLIENTE_LABELS[t as keyof typeof TIPO_CLIENTE_LABELS]?.label ?? t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="ml-auto">
            <Button
              onClick={generarReporte}
              className="h-9 rounded-lg px-4 font-bold"
            >
              <Printer className="size-4" strokeWidth={1.9} />
              Generar reporte
            </Button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-ink-500">
          Este mes usa el mes calendario en curso · el reporte PDF respeta
          los filtros y el alcance de tu rol.
        </p>
      </div>

      {/* Cara activa */}
      {cara === "pipeline" && <CaraPipeline filters={filters} />}
      {cara === "tasks" && <CaraTareas filters={filters} />}
      {cara === "clients-activity" && (
        <CaraClientesActividad filters={filters} dias={dias} onDias={setDias} />
      )}
      {cara === "my-summary" && <CaraMiResumen filters={filters} />}
    </div>
  );
}