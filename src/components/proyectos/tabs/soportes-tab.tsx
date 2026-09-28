// proyecto-soportes-tab, Phase 1 (design.md "Component Structure" —
// `tabs/soportes-tab.tsx`, spec.md "Pestaña Soportes en el workspace del
// proyecto" + "Eliminar soporte desde la pestaña" — RF-04/RNF-03). Follows
// `tabs/legalizacion-tab.tsx`'s pattern: "use client", no Dialog/Card
// wrapper (the workspace's `<Tabs>` already supplies the chrome), explicit
// loading/empty/populated states.
//
// D3 (design.md): no KPI cards, no filter chips — the v6 mock's Soportes
// tab has neither.
// D4 (design.md): author/actividad/gasto lookups degrade independently
// (raw id or "—" while their own query is `isLoading`), never gating the
// render of the soportes list itself.

"use client";

import { useState } from "react";
import { Download, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatFecha } from "@/hooks/crm";
import { useUsers, type UsuarioMini } from "@/hooks/crm";
import {
  useActivities,
  useAttachments,
  useDeleteAttachment,
  useExpenses,
  type Actividad,
  type Gasto,
  type Soporte,
} from "@/hooks/projects";
import { SoporteDialog } from "@/components/proyectos/soporte-dialog";

const TIPO_LABEL: Record<Soporte["tipo"], string> = {
  VERIFICACION: "Verificación",
  LEGALIZACION: "Legalización",
};

const TIPO_CHIP_CLASS: Record<Soporte["tipo"], string> = {
  VERIFICACION: "bg-info-bg text-info",
  LEGALIZACION: "bg-accent text-accent-foreground",
};

function TipoChip({ tipo }: { tipo: Soporte["tipo"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold",
        TIPO_CHIP_CLASS[tipo],
      )}
    >
      {TIPO_LABEL[tipo]}
    </span>
  );
}

function autorNombre(usuarios: UsuarioMini[] | undefined, subidoPorId: string): string {
  return usuarios?.find((u) => u.id === subidoPorId)?.nombre ?? "—";
}

function vinculadoA(
  soporte: Soporte,
  actividades: Actividad[] | undefined,
  gastos: Gasto[] | undefined,
): string {
  if (soporte.actividad_id) {
    return actividades?.find((a) => a.id === soporte.actividad_id)?.nombre ?? "Actividad";
  }
  if (soporte.gasto_id) {
    const gasto = gastos?.find((g) => g.id === soporte.gasto_id);
    return gasto ? `${gasto.concepto} · ${gasto.linea.rubro.nombre}` : "Gasto";
  }
  return "Soporte general del proyecto";
}

function formato(soporte: Soporte): string {
  if (soporte.storage_path) {
    const ext = soporte.storage_path.split(".").pop()?.toUpperCase();
    return ext || "Archivo";
  }
  return "Enlace";
}

function AgregarSoporteButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex items-center justify-end">
      <Button type="button" onClick={onClick} className="min-h-11 rounded-lg px-3 font-bold">
        <Plus className="size-4" strokeWidth={2.2} />
        Agregar soporte
      </Button>
    </div>
  );
}

function SoporteCard({
  soporte,
  autor,
  vinculo,
  onDelete,
  deletePending,
}: {
  soporte: Soporte;
  autor: string;
  vinculo: string;
  onDelete: () => void;
  deletePending: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div
      data-testid="soporte-card"
      className="flex flex-col gap-2 rounded-14 border border-ink-200 bg-panel px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TipoChip tipo={soporte.tipo} />
        <div className="flex items-center gap-1">
          {soporte.download_url && (
            <a
              href={soporte.download_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Descargar ${soporte.nombre}`}
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-sm" }),
                "text-ink-500",
              )}
            >
              <Download className="size-3.5" strokeWidth={1.9} />
            </a>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Eliminar ${soporte.nombre}`}
            onClick={() => setConfirmOpen(true)}
            className="text-ink-500 hover:text-destructivo"
          >
            <Trash2 className="size-3.5" strokeWidth={1.9} />
          </Button>
        </div>
      </div>

      <p className="font-semibold text-ink-950">{soporte.nombre}</p>
      <p className="text-[12.5px] text-ink-600">
        {vinculo} · {autor} · {formatFecha(soporte.created_at)}
      </p>
      <span className="w-fit rounded-6 bg-ink-50 px-2 py-0.5 font-mono text-[11px] text-ink-700">
        {formato(soporte)}
      </span>

      <ConfirmDeleteSoporteDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        pending={deletePending}
        onConfirm={() => {
          setConfirmOpen(false);
          onDelete();
        }}
      />
    </div>
  );
}

function ConfirmDeleteSoporteDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[22px] sm:max-w-[min(380px,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle className="font-display text-[17px] font-bold tracking-[-0.02em] text-ink-950">
            Eliminar soporte
          </DialogTitle>
          <DialogDescription>
            El soporte se eliminará de forma permanente y dejará de aparecer en la lista. Esta
            acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={onConfirm}
            className="rounded-12 font-bold"
          >
            {pending && <LoaderCircle className="size-4 animate-spin" />}
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SoportesTab({ projectId }: { projectId: string }) {
  const attachmentsQuery = useAttachments(projectId);
  const usersQuery = useUsers();
  const activitiesQuery = useActivities(projectId);
  const expensesQuery = useExpenses(projectId);
  const deleteMutation = useDeleteAttachment(projectId);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (attachmentsQuery.isLoading) {
    return <p className="text-[12.5px] text-ink-600">Cargando…</p>;
  }

  const soportes = attachmentsQuery.data ?? [];
  const usuarios = usersQuery.data;
  const actividades = activitiesQuery.data;
  const gastos = expensesQuery.data?.gastos;

  if (soportes.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <AgregarSoporteButton onClick={() => setDialogOpen(true)} />
        <p className="text-[12.5px] text-ink-600">
          Este proyecto no tiene soportes registrados todavía.
        </p>
        <SoporteDialog
          projectId={projectId}
          actividades={actividades ?? []}
          gastos={gastos ?? []}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <AgregarSoporteButton onClick={() => setDialogOpen(true)} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {soportes.map((soporte) => (
          <SoporteCard
            key={soporte.id}
            soporte={soporte}
            autor={autorNombre(usuarios, soporte.subido_por_id)}
            vinculo={vinculadoA(soporte, actividades, gastos)}
            deletePending={deleteMutation.isPending}
            onDelete={() => void deleteMutation.mutateAsync(soporte.id)}
          />
        ))}
      </div>

      <SoporteDialog
        projectId={projectId}
        actividades={actividades ?? []}
        gastos={gastos ?? []}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
