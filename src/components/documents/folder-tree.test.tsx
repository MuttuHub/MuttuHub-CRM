import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FOLDER_DRAG_TYPE, FolderTree } from "./folder-tree";
import type { FolderNode } from "@/hooks/documents";

const folders: FolderNode[] = [
  {
    id: "root-1",
    nombre: "Comercial",
    parent_id: null,
    created_at: "2026-01-01",
    documentos_count: 3,
    hijos: [
      {
        id: "child-1",
        nombre: "Propuestas",
        parent_id: "root-1",
        created_at: "2026-01-02",
        documentos_count: 1,
        hijos: [],
      },
    ],
  },
  {
    id: "root-2",
    nombre: "Legal",
    parent_id: null,
    created_at: "2026-01-03",
    documentos_count: 0,
    hijos: [],
  },
];

function nodeButton(name: string) {
  return screen.getByRole("button", {
    name: (n) => typeof n === "string" && n.startsWith(name) && !n.startsWith("Acciones"),
  });
}

describe("FolderTree", () => {
  it("renders root folders with their counts and the implicit root", () => {
    render(<FolderTree folders={folders} activeId={null} onSelect={vi.fn()} onAction={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Todas" })).toBeInTheDocument();
    expect(nodeButton("Comercial")).toBeInTheDocument();
    expect(nodeButton("Legal")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("expands a folder to reveal its children (disclosure)", async () => {
    const user = userEvent.setup();
    render(<FolderTree folders={folders} activeId={null} onSelect={vi.fn()} onAction={vi.fn()} />);

    // Hija no visible hasta expandir "Comercial".
    expect(screen.queryByText("Propuestas")).not.toBeInTheDocument();
    const expand = screen.getByRole("button", { name: "Expandir" });
    await user.click(expand);
    expect(nodeButton("Propuestas")).toBeInTheDocument();
  });

  it("calls onSelect with the folder id when a node is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<FolderTree folders={folders} activeId={null} onSelect={onSelect} onAction={vi.fn()} />);

    await user.click(nodeButton("Comercial"));
    expect(onSelect).toHaveBeenCalledWith("root-1");
  });

  it("marks the active folder", () => {
    render(<FolderTree folders={folders} activeId="root-2" onSelect={vi.fn()} onAction={vi.fn()} />);
    const active = nodeButton("Legal");
    expect(active.closest("div")!.className).toContain("bg-ink-100");
  });

  // S5: files dropped on a folder node go into that folder; on «Todas», none.
  it("hands files dropped on a node to onDropFiles with that folder", () => {
    const onDropFiles = vi.fn();
    const file = new File(["a"], "acta.pdf", { type: "application/pdf" });
    render(
      <FolderTree
        folders={folders}
        activeId={null}
        onSelect={vi.fn()}
        onAction={vi.fn()}
        onDropFiles={onDropFiles}
      />,
    );

    const dataTransfer = { files: [file], types: ["Files"] };
    fireEvent.dragOver(nodeButton("Legal"), { dataTransfer });
    fireEvent.drop(nodeButton("Legal"), { dataTransfer });
    fireEvent.drop(screen.getByRole("button", { name: "Todas" }), { dataTransfer });

    expect(onDropFiles).toHaveBeenNthCalledWith(1, "root-2", [file]);
    expect(onDropFiles).toHaveBeenNthCalledWith(2, null, [file]);
  });

  it("marks client folders", () => {
    render(
      <FolderTree
        folders={[{ ...folders[1]!, cliente_id: "cli-1" }]}
        activeId={null}
        onSelect={vi.fn()}
        onAction={vi.fn()}
      />,
    );
    expect(nodeButton("Legal")).toHaveAccessibleName(/carpeta de cliente/);
  });

  // Explorer 2026-11-02: clic derecho con acciones por carpeta.
  it("opens a context menu on right click and deletes from it", async () => {
    const onAction = vi.fn();
    render(<FolderTree folders={folders} activeId={null} onSelect={vi.fn()} onAction={onAction} />);

    fireEvent.contextMenu(nodeButton("Legal"));
    await userEvent.setup().click(await screen.findByRole("menuitem", { name: /eliminar/i }));

    expect(onAction).toHaveBeenCalledWith("root-2", "delete");
  });

  // Explorer 2026-11-02: arrastrar una carpeta dentro del árbol la mueve.
  it("moves a folder dragged onto another folder", () => {
    const onMoveFolder = vi.fn();
    render(
      <FolderTree
        folders={folders}
        activeId={null}
        onSelect={vi.fn()}
        onAction={vi.fn()}
        onMoveFolder={onMoveFolder}
      />,
    );

    const dataTransfer = {
      types: [FOLDER_DRAG_TYPE],
      getData: (type: string) => (type === FOLDER_DRAG_TYPE ? "root-2" : ""),
    };
    fireEvent.dragOver(nodeButton("Comercial"), { dataTransfer });
    fireEvent.drop(nodeButton("Comercial"), { dataTransfer });

    expect(onMoveFolder).toHaveBeenCalledWith("root-2", "root-1");
  });

  it("moves a nested folder back to the root dropping it on Todas", () => {
    const onMoveFolder = vi.fn();
    render(
      <FolderTree
        folders={folders}
        activeId={null}
        onSelect={vi.fn()}
        onAction={vi.fn()}
        onMoveFolder={onMoveFolder}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expandir" }));

    const dataTransfer = {
      types: [FOLDER_DRAG_TYPE],
      getData: (type: string) => (type === FOLDER_DRAG_TYPE ? "child-1" : ""),
    };
    fireEvent.drop(screen.getByRole("button", { name: "Todas" }), { dataTransfer });

    expect(onMoveFolder).toHaveBeenCalledWith("child-1", null);
  });

  it("refuses to move a folder into its own subtree", () => {
    const onMoveFolder = vi.fn();
    render(
      <FolderTree
        folders={folders}
        activeId={null}
        onSelect={vi.fn()}
        onAction={vi.fn()}
        onMoveFolder={onMoveFolder}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expandir" }));

    const dataTransfer = {
      types: [FOLDER_DRAG_TYPE],
      getData: (type: string) => (type === FOLDER_DRAG_TYPE ? "root-1" : ""),
    };
    fireEvent.dragOver(nodeButton("Propuestas"), { dataTransfer });
    fireEvent.drop(nodeButton("Propuestas"), { dataTransfer });

    expect(onMoveFolder).not.toHaveBeenCalled();
  });
});
