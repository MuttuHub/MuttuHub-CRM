import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import ConfirmPage from "./page"

const mocks = vi.hoisted(() => {
  let params = new URLSearchParams()
  return {
    router: { replace: vi.fn() },
    setSearchParams: (p: URLSearchParams) => {
      params = p
    },
    getSearchParams: () => params,
    verifyOtp: vi.fn(),
    exchangeCodeForSession: vi.fn(),
  }
})

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  useSearchParams: () => mocks.getSearchParams(),
}))

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      verifyOtp: mocks.verifyOtp,
      exchangeCodeForSession: mocks.exchangeCodeForSession,
    },
  }),
}))

const flushMicrotasks = async () => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe("ConfirmPage", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key"
    mocks.router.replace.mockClear()
    mocks.verifyOtp.mockClear()
    mocks.exchangeCodeForSession.mockClear()
    mocks.setSearchParams(new URLSearchParams())
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  })

  it("verifies via verifyOtp with token+type+email and shows success", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null })
    mocks.setSearchParams(
      new URLSearchParams("token=t1&type=signup&email=a@b.co"),
    )
    render(<ConfirmPage />)
    await flushMicrotasks()
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      type: "signup",
      token: "t1",
      email: "a@b.co",
    })
    expect(screen.getByText("¡Correo verificado!")).toBeInTheDocument()
  })

  it("verifies via exchangeCodeForSession when only code is present", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null })
    mocks.setSearchParams(new URLSearchParams("code=c1"))
    render(<ConfirmPage />)
    await flushMicrotasks()
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("c1")
    expect(screen.getByText("¡Correo verificado!")).toBeInTheDocument()
  })

  it("redirects to /login after 3 seconds", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null })
    mocks.setSearchParams(
      new URLSearchParams("token=t1&type=signup&email=a@b.co"),
    )
    render(<ConfirmPage />)
    await flushMicrotasks()
    expect(mocks.router.replace).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(mocks.router.replace).toHaveBeenCalledWith("/login")
  })

  it("shows invalid link card when no token and no code", () => {
    render(<ConfirmPage />)
    expect(screen.getByText("Enlace no válido")).toBeInTheDocument()
    expect(mocks.verifyOtp).not.toHaveBeenCalled()
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it("shows error card when verifyOtp fails", async () => {
    mocks.verifyOtp.mockRejectedValue(new Error("invalid token"))
    mocks.setSearchParams(
      new URLSearchParams("token=t1&type=signup&email=a@b.co"),
    )
    render(<ConfirmPage />)
    await flushMicrotasks()
    expect(screen.getByText("Volver a iniciar sesión")).toBeInTheDocument()
    expect(
      screen.queryByText("¡Correo verificado!"),
    ).not.toBeInTheDocument()
  })
})
