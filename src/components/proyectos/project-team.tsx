// Equipo del proyecto (E-07) dentro de la ficha. Todos los que pueden ver la
// ficha ven la lista; solo quien gestiona proyectos (`canManageProjects`) ve los
// controles de agregar y quitar. Esa visibilidad es comodidad de interfaz: la
// autoridad es la API, que responde 403 a cualquier otro rol.
//
// El catálogo de usuarios (`/catalogs/users`) solo trae id y nombre de los
// activos, sin rol: el selector ofrece los usuarios activos que aún no son
// integrantes y es el servidor quien rechaza (400) a quien no sea Coordinador.

"use client";

import { useState } from "react";
import { LoaderCircle, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useUsers } from "@/hooks/crm";
import { useCurrentUser } from "@/hooks/kanban";
import {
  useAddProjectMember,
  useProjectMembers,
  useRemoveProjectMember,
  type ProjectMember,
} from "@/hooks/projects";
import { ROLE_LABELS } from "@/lib/auth/types";
import { canManageProjects } from "@/lib/permissions";
import { SectionHeader } from "@/components/proyectos/ui";

const LOAD_ERROR = "No pudimos cargar el equipo del proyecto. Inténtalo de nuevo.";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function ProjectTeam({ proyectoId }: { proyectoId: string }) {
  const members = useProjectMembers(proyectoId);
  const userQuery = useCurrentUser();
  const usuario = userQuery.data;
  const puedeGestionar = usuario ? canManageProjects({ id: usuario.id, rol: usuario.rol }) : false;
  const remove = useRemoveProjectMember(proyectoId);

  return (
    <section data-testid="equipo">
      <SectionHeader icon={<Users className="size-3.5" strokeWidth={2} />}>Equipo</SectionHeader>

      {members.isError ? (
        <p role="alert" className="mt-1.5 text-[13px] text-destructivo">
          {errorMessage(members.error, LOAD_ERROR)}
        </p>
      ) : members.isLoading || !members.data ? (
        <div className="mt-2 space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-[10px]" />
          ))}
        </div>
      ) : (
        <>
          {members.data.length === 0 ? (
            <p className="mt-1.5 text-[13px] text-ink-500">Este proyecto todavía no tiene equipo.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {members.data.map((miembro) => (
                <MemberRow
                  key={miembro.id}
                  miembro={miembro}
                  puedeGestionar={puedeGestionar}
                  quitando={remove.isPending && remove.variables === miembro.usuario.id}
                  onRemove={() => remove.mutate(miembro.usuario.id)}
                />
              ))}
            </ul>
          )}

          {remove.isError && (
            <p role="alert" className="mt-2 text-[13px] text-destructivo">
              {errorMessage(remove.error, "No pudimos quitar al integrante. Inténtalo de nuevo.")}
            </p>
          )}

          {puedeGestionar && (
            <AddMember proyectoId={proyectoId} integrantes={members.data} />
          )}
        </>
      )}
    </section>
  );
}

function MemberRow({
  miembro,
  puedeGestionar,
  quitando,
  onRemove,
}: {
  miembro: ProjectMember;
  puedeGestionar: boolean;
  quitando: boolean;
  onRemove: () => void;
}) {
  return (
    <li
      data-testid="equipo-integrante"
      className="flex items-center justify-between gap-3 rounded-[14px] border border-ink-200 bg-ink-100 px-3 py-2"
    >
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-ink-900">{miembro.usuario.nombre}</p>
        <p className="text-[11.5px] text-ink-500">{ROLE_LABELS[miembro.usuario.rol]}</p>
      </div>
      {puedeGestionar && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Quitar a ${miembro.usuario.nombre}`}
          disabled={quitando}
          onClick={onRemove}
        >
          {quitando ? <LoaderCircle className="size-4 animate-spin" /> : <X className="size-4" />}
        </Button>
      )}
    </li>
  );
}

function AddMember({
  proyectoId,
  integrantes,
}: {
  proyectoId: string;
  integrantes: ProjectMember[];
}) {
  const [usuarioId, setUsuarioId] = useState("");
  const users = useUsers();
  const add = useAddProjectMember(proyectoId);

  const ocupados = new Set(integrantes.map((m) => m.usuario.id));
  const candidatos = (users.data ?? []).filter((u) => !ocupados.has(u.id));

  function submit() {
    if (usuarioId === "") return;
    add.mutate(usuarioId, { onSuccess: () => setUsuarioId("") });
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Select value={usuarioId} onValueChange={(value) => setUsuarioId(value ?? "")}>
          <SelectTrigger
            aria-label="Agregar coordinador"
            className="h-10 min-w-0 flex-1 rounded-12 bg-panel px-3"
          >
            <SelectValue placeholder="Selecciona un coordinador" />
          </SelectTrigger>
          <SelectContent>
            {candidatos.map((usuario) => (
              <SelectItem key={usuario.id} value={usuario.id}>
                {usuario.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" disabled={usuarioId === "" || add.isPending} onClick={submit}>
          {add.isPending && <LoaderCircle className="size-4 animate-spin" />}
          Agregar
        </Button>
      </div>

      {users.isError && (
        <p role="alert" className="text-[13px] text-destructivo">
          {errorMessage(users.error, "No pudimos cargar los usuarios. Inténtalo de nuevo.")}
        </p>
      )}
      {add.isError && (
        <p role="alert" className="text-[13px] text-destructivo">
          {errorMessage(add.error, "No pudimos agregar al integrante. Inténtalo de nuevo.")}
        </p>
      )}
    </div>
  );
}
