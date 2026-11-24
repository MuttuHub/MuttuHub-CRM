// Papelera (S8 UI): documentos enviados a la papelera (soft delete) con
// "Restaurar". Sin borrado permanente (PRD: solo soft delete). Restaurar
// sigue la regla de escritura del documento (S10). Si ya hay un documento vivo
// con el mismo título, pregunta antes de restaurar igual (force).

"use client";

import { useState } from "react";
import { LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/crm/entity-dialogs";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CurrentUser } from "@/hooks/kanban";
import {
  formatVersionFecha,
  isDuplicateTitleConflict,
  useRestoreDocument,
  useTrashedDocuments,
} from "@/hooks/documents";
import {
  canWriteDocument,
  WRITE_DENIED_REASON,
} from "@/components/documents/document-permissions";
import { FileTypeBadge, PaginationFooter } from "@/components/documents/document-shared";

export function TrashTab({ user }: { user: CurrentUser | null | undefined }) {
  const [page, setPage] = useState(1);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; message: string } | null>(null);
  const query = useTrashedDocuments({ page, enabled: true });
  const restore = useRestoreDocument();

  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const limit = query.data?.limit || 25;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const desde = total === 0 ? 0 : (page - 1) * limit + 1;
  const hasta = Math.min(page * limit, total);

  async function restaurar(id: string, force = false) {
    setRestoringId(id);
    try {
      await restore.mutateAsync(force ? { id, force: true } : id);
      setDuplicate(null);
    } catch (err) {
      // El hook muestra los demás errores; el título duplicado se pregunta.
      if (isDuplicateTitleConflict(err)) setDuplicate({ id, message: (err as Error).message });
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <section aria-label="Papelera" className="surface min-w-0 overflow-hidden">
      <div className="border-b border-ink-200 px-4 py-3">
        <p className="text-[13px] text-ink-600">
          Los documentos eliminados se conservan aquí con todas sus versiones.
          Restaurar los devuelve a su carpeta (o a Todas si la carpeta ya no existe).
        </p>
      </div>
      {query.isLoading ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-12" />
          ))}
        </div>
      ) : query.isError ? (
        <EmptyState
          title="No se pudo cargar la papelera"
          description="Revisa tu conexión e inténtalo de nuevo."
          action={
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              Reintentar
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={
            <span className="grid size-11 place-items-center rounded-14 bg-ink-100 text-ink-500">
              <Trash2 className="size-5" strokeWidth={1.7} />
            </span>
          }
          title="La papelera está vacía"
          description="Cuando alguien elimine un documento aparecerá aquí."
          className="min-h-[240px]"
        />
      ) : (
        <>
          <Table aria-label="Documentos en la papelera" className="min-w-[760px]">
            <TableHeader>
              <TableRow className="bg-ink-100/40 hover:bg-ink-100/40">
                <TableHead className="pl-4">Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Eliminado</TableHead>
                <TableHead>Eliminado por</TableHead>
                <TableHead className="w-36 pr-4">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((doc) => {
                const permitido = canWriteDocument(user, doc);
                const pending = restoringId === doc.id;
                return (
                  <TableRow key={doc.id}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-2.5">
                        <FileTypeBadge doc={doc} />
                        <div className="min-w-0 max-w-[320px]">
                          <div
                            className="truncate text-[13.5px] font-semibold text-ink-950"
                            title={doc.titulo}
                          >
                            {doc.titulo}
                          </div>
                          {doc.clientes.length > 0 && (
                            <div className="truncate text-[12px] text-ink-600">
                              {doc.clientes.map((c) => c.nombre).join(", ")}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex h-6 items-center rounded-full bg-ink-100 px-2.5 text-[11.5px] font-semibold whitespace-nowrap text-ink-700">
                        {doc.categoria}
                      </span>
                    </TableCell>
                    <TableCell className="text-[12.5px] whitespace-nowrap text-ink-800">
                      {formatVersionFecha(doc.deleted_at)}
                    </TableCell>
                    <TableCell className="text-[12.5px] text-ink-700">
                      {doc.eliminado_por_nombre ?? "—"}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!permitido || pending}
                        title={permitido ? undefined : WRITE_DENIED_REASON}
                        aria-label={`Restaurar ${doc.titulo}`}
                        onClick={() => void restaurar(doc.id)}
                        className="px-2.5 text-[12.5px] font-semibold text-ink-800"
                      >
                        {pending ? (
                          <LoaderCircle className="size-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="size-3.5" strokeWidth={1.9} />
                        )}
                        Restaurar
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <PaginationFooter
            page={page}
            totalPages={totalPages}
            desde={desde}
            hasta={hasta}
            total={total}
            onPage={setPage}
            noun="en la papelera"
          />
        </>
      )}
      <ConfirmDialog
        open={duplicate !== null}
        onOpenChange={(open) => {
          if (!open) setDuplicate(null);
        }}
        title="¿Restaurar de todos modos?"
        description={`${duplicate?.message ?? ""} Si lo restauras, habrá dos documentos con ese nombre.`}
        confirmLabel="Restaurar igual"
        confirmVariant="default"
        pending={restore.isPending}
        onConfirm={() => {
          if (duplicate) void restaurar(duplicate.id, true);
        }}
      />
    </section>
  );
}
