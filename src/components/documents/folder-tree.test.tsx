import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FolderTree } from "./folder-tree";
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

describe("FolderTree", () => {
  it("renders root folders with their counts and the implicit root", () => {
    render(<FolderTree folders={folders} activeId={null} onSelect={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Todas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Comercial/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Legal/ })).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("expands a folder to reveal its children (disclosure)", async () => {
    const user = userEvent.setup();
    render(<FolderTree folders={folders} activeId={null} onSelect={vi.fn()} />);

    // Hija no visible hasta expandir "Comercial".
    expect(screen.queryByText("Propuestas")).not.toBeInTheDocument();
    const expand = screen.getByRole("button", { name: "Expandir" });
    await user.click(expand);
    expect(screen.getByRole("button", { name: /Propuestas/ })).toBeInTheDocument();
  });

  it("calls onSelect with the folder id when a node is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<FolderTree folders={folders} activeId={null} onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: /Comercial/ }));
    expect(onSelect).toHaveBeenCalledWith("root-1");
  });

  it("marks the active folder", () => {
    render(<FolderTree folders={folders} activeId="root-2" onSelect={vi.fn()} />);
    const active = screen.getByRole("button", { name: /Legal/ });
    expect(active.closest("div")!.className).toContain("bg-ink-100");
  });
});