import { Suspense } from "react";
import type { Metadata } from "next";
import { KanbanBoard } from "@/components/kanban/kanban-board";

export const metadata: Metadata = {
  title: "Tablero del equipo",
};

export const dynamic = "force-dynamic";

export default function TableroPage() {
  return (
    <Suspense>
      <KanbanBoard />
    </Suspense>
  );
}