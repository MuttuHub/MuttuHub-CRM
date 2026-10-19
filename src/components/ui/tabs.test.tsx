import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs"

describe("Tabs", () => {
  it("renders the list, triggers and the active panel", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Uno</TabsTrigger>
          <TabsTrigger value="b">Dos</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Contenido A</TabsContent>
        <TabsContent value="b">Contenido B</TabsContent>
      </Tabs>,
    )
    expect(screen.getByRole("tab", { name: "Uno" })).toBeInTheDocument()
    expect(screen.getByText("Contenido A")).toBeInTheDocument()
    expect(screen.queryByText("Contenido B")).not.toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Uno" })).toHaveAttribute("aria-selected", "true")
  })

  it("switches the active panel on trigger click", async () => {
    const user = userEvent.setup()
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Uno</TabsTrigger>
          <TabsTrigger value="b">Dos</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Contenido A</TabsContent>
        <TabsContent value="b">Contenido B</TabsContent>
      </Tabs>,
    )
    await user.click(screen.getByRole("tab", { name: "Dos" }))
    expect(screen.getByText("Contenido B")).toBeInTheDocument()
    expect(screen.queryByText("Contenido A")).not.toBeInTheDocument()
  })

  it("reports value changes via onValueChange", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(
      <Tabs defaultValue="a" onValueChange={onValueChange}>
        <TabsList>
          <TabsTrigger value="a">Uno</TabsTrigger>
          <TabsTrigger value="b">Dos</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Contenido A</TabsContent>
        <TabsContent value="b">Contenido B</TabsContent>
      </Tabs>,
    )
    await user.click(screen.getByRole("tab", { name: "Dos" }))
    expect(onValueChange.mock.calls[0][0]).toBe("b")
  })

  it("exposes the list variant prop", () => {
    const { container } = render(
      <Tabs defaultValue="a">
        <TabsList variant="line">
          <TabsTrigger value="a">Uno</TabsTrigger>
        </TabsList>
        <TabsContent value="a">A</TabsContent>
      </Tabs>,
    )
    expect(container.querySelector("[data-slot=tabs-list]")).toHaveAttribute("data-variant", "line")
    expect(container.firstElementChild).toHaveAttribute("data-orientation", "horizontal")
  })
})