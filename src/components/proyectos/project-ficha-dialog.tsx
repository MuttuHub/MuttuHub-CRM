// Thin dialog wrapper around the ficha content. Kept only until the list and the tablero open the
// ficha page in a new tab (S12 P2), which removes it.

"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ProjectFicha } from "@/components/proyectos/project-ficha";

export function ProjectFichaDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="flex max-h-[88dvh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(760px,calc(100%-2rem))]">
        <DialogTitle className="sr-only">Ficha de proyecto</DialogTitle>
        <ProjectFicha projectId={projectId} variant="dialog" />
      </DialogContent>
    </Dialog>
  );
}
