import { describe, expect, it, vi } from "vitest"
import { withApiErrorHandling } from "./handler"

describe("withApiErrorHandling", () => {
  it("returns the handler's response untouched when it succeeds", async () => {
    const ok = new Response(JSON.stringify({ hola: "mundo" }), { status: 200 })
    const handler = withApiErrorHandling("test", "fallback", async () => ok)
    const res = await handler()
    expect(res).toBe(ok)
    expect(res.status).toBe(200)
  })

  it("forwards every argument to the wrapped handler", async () => {
    const inner = vi.fn(async (a: string, b: number) => {
      void a
      void b
      return new Response(null, { status: 204 })
    })
    const handler = withApiErrorHandling("test", "fallback", inner)
    await handler("hola", 42)
    expect(inner).toHaveBeenCalledWith("hola", 42)
  })

  it("catches a thrown error and returns the standard 500 envelope with the route's own message", async () => {
    const handler = withApiErrorHandling(
      "tasks",
      "No pudimos cargar las tareas. Inténtalo de nuevo.",
      async () => {
        throw new Error("boom")
      },
    )
    const res = await handler()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({
      error: "No pudimos cargar las tareas. Inténtalo de nuevo.",
      code: "INTERNAL_ERROR",
    })
  })

  it("logs the failure prefixed with the route's own label, not a generic one", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const err = new Error("boom")
    const handler = withApiErrorHandling("clients", "msg", async () => {
      throw err
    })
    await handler()
    expect(spy).toHaveBeenCalledWith("[clients] failed:", err)
    spy.mockRestore()
  })

  it("does not swallow a non-Error throw (still returns the 500 envelope)", async () => {
    const handler = withApiErrorHandling("test", "fallback", async () => {
      throw "not an Error instance"
    })
    const res = await handler()
    expect(res.status).toBe(500)
  })
})
