// Ficha de proyecto en modal centrado (tablero-seguimiento-social, Fase 3b,
// design.md: "Ficha, cronograma, ... soportes" en src/components/proyectos/**).
// Mismo patrón que la ficha de cliente (src/components/crm/client-sheet.tsx):
// un Dialog con pestañas — General, Cronograma, Soportes — en vez de una
// página de detalle dedicada (este módulo todavía no tiene una ruta
// `/proyectos/[id]`; design.md's File Changes table tampoco la lista).
//
// Soportes (RF-04/RF-06, D8): archivo O enlace externo, nunca ambos — el
// formulario los presenta como mutuamente excluyentes (toggle "Archivo" /
// "Enlace"), espejo de la validación XOR del backend
// (`projects/[id]/attachments/route.ts`).

"use client";

import { useState, type FormEvent } from "react";
import {
  Download,
  Link as LinkIcon,
  LoaderCircle,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ENUM_VALUES, LINEA_ESTRATEGICA_LABELS, TIPO_SOPORTE_LABELS } from "@/lib/catalogs";
import { FieldValue } from "@/components/crm/shared";
import { formatFecha } from "@/hooks/crm";
import {
  useActivities,
  useAttachments,
  useDeleteAttachment,
  useGoals,
  useProjectDetail,
  useUploadAttachment,
  type Actividad,
  type Meta,
  type ProjectDetail,
  type Soporte,
} from "@/hooks/projects";
import type { TipoSoporte } from "@prisma/client";

export function ProjectSheet({
  projectId,
  onClose,
}: {
  projectId: string | null;
  onClose: () => void;
}) {
  const open = projectId !== null;
  const query = useProjectDetail(projectId);
  const proyecto = query.data;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="flex h-[85dvh] max-h-[85dvh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(720px,calc(100%-2rem))]">
        <DialogTitle className="sr-only">
          {proyecto ? `Ficha de ${proyecto.nombre}` : "Ficha de proyecto"}
        </DialogTitle>

        {!proyecto ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <p className="text-[13px] text-ink-600">
              {query.isError ? "No pudimos cargar el proyecto." : "Cargando…"}
            </p>
          </div>
        ) : (
          <Tabs defaultValue="general" className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-ink-200 px-6 pt-5">
              <h2 className="mb-3 text-[16px] font-bold text-ink-950">{proyecto.nombre}</h2>
              <TabsList variant="line" className="w-full justify-start gap-1">
                <TabsTrigger value="general" className="flex-none px-3">General</TabsTrigger>
                <TabsTrigger value="cronograma" className="flex-none px-3">Cronograma</TabsTrigger>
                <TabsTrigger value="soportes" className="flex-none px-3">Soportes</TabsTrigger>
              </TabsList>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <TabsContent value="general" className="mt-0">
                <GeneralTab proyecto={proyecto} />
              </TabsContent>
              <TabsContent value="cronograma" className="mt-0">
                <CronogramaTab projectId={proyecto.id} />
              </TabsContent>
              <TabsContent value="soportes" className="mt-0">
                <SoportesTab projectId={proyecto.id} puedeGestionar={proyecto.puede_editar_proyecto} />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── General (ficha) ───────────────────────────────────────────────────── */

function GeneralTab({ proyecto }: { proyecto: ProjectDetail }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <FieldValue label="Código" value={proyecto.codigo} mono />
      <FieldValue label="Cliente" value={proyecto.cliente_nombre} />
      <FieldValue label="Territorio" value={proyecto.territorio} />
      <FieldValue
        label="Línea estratégica"
        value={LINEA_ESTRATEGICA_LABELS[proyecto.linea_estrategica].label}
      />
      <FieldValue label="Fecha de inicio" value={formatFecha(proyecto.fecha_inicio)} />
      <FieldValue label="Fecha de fin" value={formatFecha(proyecto.fecha_fin)} />
      <FieldValue label="Estado" value={proyecto.estado} />
      <FieldValue label="Responsable" value={proyecto.responsable_nombre} />
      <FieldValue label="Beneficiarios (meta)" value={String(proyecto.beneficiarios_meta)} />
    </div>
  );
}

/* ── Cronograma: línea base (fecha_planificada) vs. real (fecha_real) ──── */

function CronogramaTab({ projectId }: { projectId: string }) {
  const goalsQuery = useGoals(projectId);
  const activitiesQuery = useActivities(projectId);
  const metas = goalsQuery.data ?? [];
  const actividades = activitiesQuery.data ?? [];
  const metaNombre = new Map(metas.map((m: Meta) => [m.id, m.nombre]));

  if (activitiesQuery.isLoading) {
    return <p className="text-[12.5px] text-ink-600">Cargando…</p>;
  }
  if (actividades.length === 0) {
    return <p className="text-[12.5px] text-ink-600">Este proyecto no tiene actividades todavía.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {actividades.map((actividad: Actividad) => {
        const aTiempo = actividad.fecha_real
          ? new Date(actividad.fecha_real) <= new Date(actividad.fecha_planificada)
          : null;
        return (
          <div
            key={actividad.id}
            className="flex flex-col gap-1.5 rounded-14 border border-ink-200 bg-panel px-4 py-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13.5px] font-semibold text-ink-950">{actividad.nombre}</p>
              <span className="text-[12px] font-bold text-ink-700">{actividad.porcentaje_avance}%</span>
            </div>
            <p className="text-[11.5px] text-ink-600">
              Meta: {metaNombre.get(actividad.meta_id) ?? "—"}
            </p>
            <div className="flex items-center gap-4 text-[12px] text-ink-600">
              <span>Línea base: {formatFecha(actividad.fecha_planificada)}</span>
              <span
                className={cn(
                  "font-medium",
                  aTiempo === true && "text-exito",
                  aTiempo === false && "text-destructivo",
                )}
              >
                Real: {formatFecha(actividad.fecha_real)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Soportes: archivo o enlace, nunca ambos (D8) ──────────────────────── */

function SoportesTab({
  projectId,
  puedeGestionar,
}: {
  projectId: string;
  puedeGestionar: boolean;
}) {
  const query = useAttachments(projectId);
  const soportes = query.data ?? [];
  const deleteMutation = useDeleteAttachment(projectId);

  return (
    <div className="flex flex-col gap-3">
      {query.isLoading ? (
        <p className="text-[12.5px] text-ink-600">Cargando…</p>
      ) : soportes.length === 0 ? (
        <p className="text-[12.5px] text-ink-600">Este proyecto no tiene soportes todavía.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {soportes.map((soporte: Soporte) => (
            <li
              key={soporte.id}
              className="flex items-center gap-2.5 rounded-10 bg-panel px-3 py-2 text-[13px]"
            >
              <Paperclip className="size-4 shrink-0 text-ink-500" strokeWidth={1.9} />
              <span className="min-w-0 flex-1 truncate font-medium text-ink-800">{soporte.nombre}</span>
              <span className="text-[10.5px] text-ink-500">{TIPO_SOPORTE_LABELS[soporte.tipo].label}</span>
              {soporte.download_url && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Descargar ${soporte.nombre}`}
                  onClick={() => window.open(soporte.download_url ?? undefined, "_blank", "noopener")}
                  className="text-ink-500 hover:text-rose-700"
                >
                  <Download className="size-3.5" strokeWidth={1.9} />
                </Button>
              )}
              {puedeGestionar && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Eliminar ${soporte.nombre}`}
                  disabled={deleteMutation.isPending}
                  onClick={() => void deleteMutation.mutateAsync(soporte.id)}
                  className="text-ink-500 hover:text-destructivo"
                >
                  <Trash2 className="size-3.5" strokeWidth={1.9} />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {puedeGestionar && <UploadSoporteForm projectId={projectId} />}
    </div>
  );
}

function UploadSoporteForm({ projectId }: { projectId: string }) {
  const upload = useUploadAttachment(projectId);
  const [modo, setModo] = useState<"archivo" | "enlace">("archivo");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoSoporte>("VERIFICACION");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);

  function reset() {
    setNombre("");
    setUrl("");
    setFile(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (modo === "archivo") {
      if (!file) return;
      await upload.mutateAsync({ nombre, tipo, file });
    } else {
      if (!url) return;
      await upload.mutateAsync({ nombre, tipo, url });
    }
    reset();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2.5 rounded-14 border border-ink-200 p-3">
      <div className="flex gap-1.5">
        <Button
          type="button"
          size="sm"
          variant={modo === "archivo" ? "default" : "outline"}
          onClick={() => setModo("archivo")}
          className="h-8 flex-1 rounded-10"
        >
          <Upload className="size-3.5" strokeWidth={1.9} />
          Archivo
        </Button>
        <Button
          type="button"
          size="sm"
          variant={modo === "enlace" ? "default" : "outline"}
          onClick={() => setModo("enlace")}
          className="h-8 flex-1 rounded-10"
        >
          <LinkIcon className="size-3.5" strokeWidth={1.9} />
          Enlace
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="soporte-nombre">Nombre</Label>
        <Input
          id="soporte-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="soporte-tipo">Tipo</Label>
        <Select value={tipo} onValueChange={(v) => setTipo(v as TipoSoporte)}>
          <SelectTrigger id="soporte-tipo" className="h-10 w-full rounded-12 bg-panel px-3">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENUM_VALUES.TipoSoporte.map((t) => (
              <SelectItem key={t} value={t}>
                {TIPO_SOPORTE_LABELS[t as TipoSoporte].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {modo === "archivo" ? (
        <Input
          type="file"
          aria-label="Archivo del soporte"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          required
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="soporte-url">Enlace (https://)</Label>
          <Input
            id="soporte-url"
            type="url"
            placeholder="https://drive.google.com/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
        </div>
      )}

      <Button type="submit" size="sm" disabled={upload.isPending} className="h-9 rounded-10">
        {upload.isPending ? <LoaderCircle className="size-4 animate-spin" /> : null}
        Guardar soporte
      </Button>
    </form>
  );
}
