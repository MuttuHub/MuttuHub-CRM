"use client";

// Reportes (Hito 6, PRD §5.4 + §7): tabs entre el reporte de tareas (el mismo
// ReportView del tablero, con exportación Excel/PDF y alcance por rol) y las 4
// caras del dashboard, cada una con su barra de filtros comunes (§7.2) y un
// bloque "Generar reporte" que abre la vista de impresión por cara. El estado
// de filtros vive acá (hoisted) para que cambiar de cara no los pierda; el
// rango de fechas es el mismo store global del header ("Este mes" / 30 / 90 /
// todo).

import { useState } from "react";
import { Gauge, ListChecks, Printer, UserRound, UsersRound } from "lucide-react";
import {
  buildDashboardQuery,
  rangoMesActual,
  type DashboardFilters,
} from "@/hooks/dashboard";
import { useUsers } from "@/hooks/crm";
import { ENUM_VALUES, TIPO_CLIENTE_LABELS } from "@/lib/catalogs";
import { RANGO_OPCIONES, useFiltersStore } from "@/store/filters";
import { ReportView } from "@/components/kanban/report-view";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export function ReportesPage() {
  const [responsable, setResponsable] = useState("");
  const [tipoCliente, setTipoCliente] = useState("");
  const [dias, setDias] = useState(14);

  const usersQuery = useUsers();
  const users = usersQuery.data ?? [];

  const filters = useDashboardFilters({ responsable, tipoCliente });

  function linkImpresion(cara: CaraId): string {
    const qs = buildDashboardQuery(filters, { dias_sin_gestion: dias });
    return `/print/dashboard/${cara}${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Tabs defaultValue="tareas" className="flex min-w-0 flex-col gap-4">
        {/* Patrón A (plan Fase 5): tira con scroll abajo (flex-none +
            overflow-x-auto), ancho igual arriba (lg:flex-wrap + lg:flex-1).
            5 tabs → el umbral de "ancho igual" es lg. */}
        <TabsList className="no-scrollbar flex h-auto w-full items-center gap-1 overflow-x-auto rounded-lg bg-ink-100 p-1 lg:flex-wrap">
          <TabTareasTrigger />
          {CARAS.map((cara) => (
            <TabsTrigger
              key={cara.id}
              value={cara.id}
              className="flex h-auto flex-none items-center justify-center gap-2 rounded-[9px] px-3 py-2 text-[12.5px] font-bold whitespace-nowrap text-ink-600 transition-colors hover:text-ink-900 data-active:bg-card data-active:text-ink-950 data-active:shadow-sm lg:flex-1"
            >
              <cara.icon className="size-4" strokeWidth={1.9} />
              {cara.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="tareas" className="mt-0">
          <ReportView responsable={undefined} cliente={undefined} />
        </TabsContent>

        {CARAS.map((cara) => (
          <TabsContent key={cara.id} value={cara.id} className="mt-0">
            <FiltrosCara
              users={users}
              responsable={responsable}
              onResponsable={setResponsable}
              tipoCliente={tipoCliente}
              onTipoCliente={setTipoCliente}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-[17px] font-bold tracking-[-0.02em] text-ink-950">
                Reporte de {cara.label.toLowerCase()}
              </h2>
              <GenerarReporte href={linkImpresion(cara.id)} />
            </div>
            {cara.id === "pipeline" && <CaraPipeline filters={filters} />}
            {cara.id === "tasks" && <CaraTareas filters={filters} />}
            {cara.id === "clients-activity" && (
              <CaraClientesActividad filters={filters} dias={dias} onDias={setDias} />
            )}
            {cara.id === "my-summary" && <CaraMiResumen filters={filters} />}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

/* ── Piezas internas ────────────────────────────────────────────────────── */

function TabTareasTrigger() {
  return (
    <TabsTrigger
      value="tareas"
      className="flex h-auto flex-none items-center justify-center gap-2 rounded-[9px] px-3 py-2 text-[12.5px] font-bold whitespace-nowrap text-ink-600 transition-colors hover:text-ink-900 data-active:bg-card data-active:text-ink-950 data-active:shadow-sm lg:flex-1"
    >
      Tareas
    </TabsTrigger>
  );
}

/** Barra de filtros comunes de las caras (§7.2), espejo de la del dashboard. */
function FiltrosCara({
  users,
  responsable,
  onResponsable,
  tipoCliente,
  onTipoCliente,
}: {
  users: { id: string; nombre: string }[];
  responsable: string;
  onResponsable: (v: string) => void;
  tipoCliente: string;
  onTipoCliente: (v: string) => void;
}) {
  const rango = useFiltersStore((s) => s.rango);
  const setRango = useFiltersStore((s) => s.setRango);

  return (
    <div className="rounded-[16px] border border-ink-200 bg-panel p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11.5px] font-bold tracking-[0.08em] text-ink-500 uppercase">
            Rango
          </span>
          <ChipSelector options={[...RANGO_OPCIONES]} value={rango} onChange={setRango} />
        </div>

        <Select value={responsable} onValueChange={(v) => v !== null && onResponsable(v)}>
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

        <Select value={tipoCliente} onValueChange={(v) => v !== null && onTipoCliente(v)}>
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

        <p className="ml-auto text-[11px] text-ink-500">
          Este mes usa el mes calendario en curso.
        </p>
      </div>
    </div>
  );
}

function GenerarReporte({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-9 items-center gap-2 rounded-lg bg-rose-500 px-4 text-[13px] font-bold text-white transition-colors hover:bg-rose-700"
    >
      <Printer className="size-4" strokeWidth={1.9} />
      Generar reporte
    </a>
  );
}

/** Filtros del dashboard desde el estado de la página + el store global. */
function useDashboardFilters({
  responsable,
  tipoCliente,
}: {
  responsable: string;
  tipoCliente: string;
}): DashboardFilters {
  const rango = useFiltersStore((s) => s.rango);
  const mes = rango === "mes" ? rangoMesActual() : null;
  const desde =
    rango === "todo" ? undefined : rango === "mes" ? mes!.desde : fechaDesde(Number(rango));
  return {
    desde,
    hasta: mes ? mes.hasta : undefined,
    responsable_id: responsable || undefined,
    tipo_cliente: tipoCliente || undefined,
  };
}

function fechaDesde(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}