import { act, fireEvent, render, screen } from "@testing-library/react"
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
    setSession: vi.fn(),
    updateUser: vi.fn(),
    getUser: vi.fn(),
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
      setSession: mocks.setSession,
      updateUser: mocks.updateUser,
      getUser: mocks.getUser,
    },
  }),
}))

// jsdom 30 turned `window.location` and `location.hash` into non-configurable
// own accessor properties, so redefining `hash` via `Object.defineProperty`
// throws "Cannot redefine property: hash". Drive the hash through the real
// History API instead (the same mechanism the page itself uses to clean the
// URL) — jsdom updates `location` from it natively, no property
// redefinition needed. Captured before any `history.replaceState` spying so
// it always hits the real implementation.
const realReplaceState = window.history.replaceState.bind(window.history)

function setLocationHash(hash: string) {
  realReplaceState(null, "", `/auth/confirm${hash}`)
}

let replaceStateSpy: ReturnType<typeof vi.spyOn>

const flushMicrotasks = async () => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe("ConfirmPage", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key"
    setLocationHash("")
    replaceStateSpy = vi
      .spyOn(window.history, "replaceState")
      .mockImplementation(() => undefined)
    mocks.router.replace.mockClear()
    mocks.verifyOtp.mockClear()
    mocks.exchangeCodeForSession.mockClear()
    mocks.setSession.mockClear()
    mocks.updateUser.mockClear()
    mocks.getUser.mockClear()
    // Default: verified user without rol metadata (keeps existing tests on
    // the generic "¡Tu cuenta fue validada!" done state).
    mocks.getUser.mockResolvedValue({
      data: { user: { user_metadata: {} } },
      error: null,
    })
    mocks.setSearchParams(new URLSearchParams())
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    replaceStateSpy?.mockRestore()
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
    expect(mocks.getUser).toHaveBeenCalled()
    expect(screen.getByText("¡Tu cuenta fue validada!")).toBeInTheDocument()
  })

  it("verifies via verifyOtp with token_hash (modern Supabase invite link)", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null })
    mocks.setSearchParams(
      new URLSearchParams("token_hash=th1&type=invite&email=a@b.co"),
    )
    render(<ConfirmPage />)
    await flushMicrotasks()
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      type: "invite",
      token_hash: "th1",
      email: "a@b.co",
    })
    expect(screen.getByText("Crea tu contraseña")).toBeInTheDocument()
  })

  it("verifies via exchangeCodeForSession when only code is present", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null })
    mocks.setSearchParams(new URLSearchParams("code=c1"))
    render(<ConfirmPage />)
    await flushMicrotasks()
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("c1")
    expect(screen.getByText("¡Tu cuenta fue validada!")).toBeInTheDocument()
  })

  it("redirects to / (the dashboard) after 3 seconds — the session is already active", async () => {
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
    expect(mocks.router.replace).toHaveBeenCalledWith("/")
  })

  it("shows invalid link card when no token, no code and no access token", () => {
    render(<ConfirmPage />)
    expect(screen.getByText("Enlace no válido")).toBeInTheDocument()
    expect(mocks.verifyOtp).not.toHaveBeenCalled()
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled()
    expect(mocks.setSession).not.toHaveBeenCalled()
  })

  it("shows error card when verifyOtp fails", async () => {
    mocks.verifyOtp.mockRejectedValue(new Error("invalid token"))
    // No prior successful redemption in this scenario — no session exists
    // for the fallback check to find.
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    mocks.setSearchParams(
      new URLSearchParams("token=t1&type=signup&email=a@b.co"),
    )
    render(<ConfirmPage />)
    await flushMicrotasks()
    expect(screen.getByText("Volver a iniciar sesión")).toBeInTheDocument()
    expect(
      screen.queryByText("¡Tu cuenta fue validada!"),
    ).not.toBeInTheDocument()
  })

  it("token+type=invite shows the create-password step instead of success", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null })
    mocks.setSearchParams(
      new URLSearchParams("token=t1&type=invite&email=a@b.co"),
    )
    render(<ConfirmPage />)
    await flushMicrotasks()
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      type: "invite",
      token: "t1",
      email: "a@b.co",
    })
    expect(screen.getByText("Crea tu contraseña")).toBeInTheDocument()
    expect(
      screen.queryByText("¡Tu cuenta fue validada!"),
    ).not.toBeInTheDocument()
  })

  it("code with user_metadata.rol shows the create-password step", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null })
    mocks.getUser.mockResolvedValue({
      data: {
        user: { user_metadata: { nombre: "Ana", rol: "VENDEDOR" } },
      },
      error: null,
    })
    mocks.setSearchParams(new URLSearchParams("code=c1"))
    render(<ConfirmPage />)
    await flushMicrotasks()
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("c1")
    expect(screen.getByText("Crea tu contraseña")).toBeInTheDocument()
  })

  it("recovered hash token calls setSession, cleans the URL and reaches set-password", async () => {
    mocks.setSession.mockResolvedValue({ error: null })
    mocks.getUser.mockResolvedValue({
      data: {
        user: { user_metadata: { nombre: "Ana", rol: "VENDEDOR" } },
      },
      error: null,
    })
    setLocationHash("#access_token=at&refresh_token=rt")
    render(<ConfirmPage />)
    await flushMicrotasks()
    expect(mocks.setSession).toHaveBeenCalledWith({
      access_token: "at",
      refresh_token: "rt",
    })
    expect(replaceStateSpy).toHaveBeenCalled()
    expect(mocks.verifyOtp).not.toHaveBeenCalled()
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled()
    expect(screen.getByText("Crea tu contraseña")).toBeInTheDocument()
  })

  it("create-password submit with updateUser ok shows the validated/redirecting state", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null })
    mocks.updateUser.mockResolvedValue({ error: null })
    mocks.setSearchParams(
      new URLSearchParams("token=t1&type=invite&email=a@b.co"),
    )
    render(<ConfirmPage />)
    await flushMicrotasks()
    expect(screen.getByText("Crea tu contraseña")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "Clave1234" },
    })
    fireEvent.change(screen.getByLabelText("Confirmar contraseña"), {
      target: { value: "Clave1234" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }))
    await flushMicrotasks()

    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "Clave1234" })
    expect(screen.getByText("¡Tu cuenta fue validada!")).toBeInTheDocument()
  })

  it("create-password submit with updateUser error keeps the form and shows the error", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null })
    mocks.updateUser.mockRejectedValue(new Error("update failed"))
    mocks.setSearchParams(
      new URLSearchParams("token=t1&type=invite&email=a@b.co"),
    )
    render(<ConfirmPage />)
    await flushMicrotasks()
    expect(screen.getByText("Crea tu contraseña")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "Clave1234" },
    })
    fireEvent.change(screen.getByLabelText("Confirmar contraseña"), {
      target: { value: "Clave1234" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }))
    await flushMicrotasks()

    expect(
      screen.getByText("No pudimos crear tu contraseña. Inténtalo de nuevo."),
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument()
    expect(
      screen.queryByText("¡Tu cuenta fue validada!"),
    ).not.toBeInTheDocument()
  })

  it("shows a resend button on invalid link when email is present", async () => {
    mocks.setSearchParams(new URLSearchParams("email=a@b.co"))
    render(<ConfirmPage />)
    await flushMicrotasks()
    expect(screen.getByText("Enlace no válido")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Solicitar de nuevo el enlace" }),
    ).toBeInTheDocument()
  })

  it("calls /api/v1/auth/reinvite when the resend button is clicked", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })
    vi.stubGlobal("fetch", fetchMock)

    mocks.setSearchParams(new URLSearchParams("email=a@b.co"))
    render(<ConfirmPage />)
    await flushMicrotasks()

    fireEvent.click(
      screen.getByRole("button", { name: "Solicitar de nuevo el enlace" }),
    )
    await flushMicrotasks()

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/reinvite",
      expect.objectContaining({ method: "POST" }),
    )
    expect(fetchMock.mock.calls[0][1].body).toContain("a@b.co")

    vi.unstubAllGlobals()
  })

  it("expired/redeemed invite link (type=invite, verifyOtp fails) shows the resend action instead of a dead end", async () => {
    mocks.verifyOtp.mockRejectedValue(new Error("invalid or expired"))
    // Genuinely dead link — no fallback session exists either.
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    mocks.setSearchParams(
      new URLSearchParams("token=t1&type=invite&email=a@b.co"),
    )
    render(<ConfirmPage />)
    await flushMicrotasks()

    expect(screen.getByText("Enlace no válido")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Solicitar de nuevo el enlace" }),
    ).toBeInTheDocument()

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })
    vi.stubGlobal("fetch", fetchMock)

    fireEvent.click(
      screen.getByRole("button", { name: "Solicitar de nuevo el enlace" }),
    )
    await flushMicrotasks()

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/reinvite",
      expect.objectContaining({ method: "POST" }),
    )
    expect(fetchMock.mock.calls[0][1].body).toContain("a@b.co")

    vi.unstubAllGlobals()
  })

  it("failed non-invite link (type=recovery) keeps the generic dead-end message, no resend CTA", async () => {
    mocks.verifyOtp.mockRejectedValue(new Error("invalid or expired"))
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    mocks.setSearchParams(
      new URLSearchParams("token=t1&type=recovery&email=a@b.co"),
    )
    render(<ConfirmPage />)
    await flushMicrotasks()

    expect(
      screen.getByText("No pudimos verificar el correo"),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Solicitar de nuevo el enlace" }),
    ).not.toBeInTheDocument()
    expect(screen.getByText("Volver a iniciar sesión")).toBeInTheDocument()
  })

  it("failed hash-token verification (no type param, rawType null) keeps the generic dead-end message, no resend CTA", async () => {
    mocks.setSession.mockRejectedValue(new Error("invalid session"))
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    mocks.setSearchParams(new URLSearchParams("email=a@b.co"))
    setLocationHash("#access_token=at&refresh_token=rt")
    render(<ConfirmPage />)
    await flushMicrotasks()

    expect(
      screen.getByText("No pudimos verificar el correo"),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Solicitar de nuevo el enlace" }),
    ).not.toBeInTheDocument()
    expect(screen.getByText("Volver a iniciar sesión")).toBeInTheDocument()
  })

  // Real bug found via Supabase Auth logs: the SAME invite token was
  // verified twice ~53s apart (button + the plain-text fallback link right
  // below it in the email both point at the identical one-time URL — an
  // impatient or unsure tap on mobile hits both). The FIRST /verify call
  // succeeded (user_signedup + login logged); the second correctly failed
  // ("One-time token not found") since the token was already spent — but
  // the app showed a scary "Enlace no válido" instead of noticing the
  // browser already holds a valid session from the first, successful call.
  it("falls back to the existing session instead of erroring when verification fails but the user is already authenticated (double-redeemed link)", async () => {
    mocks.verifyOtp.mockRejectedValue(
      Object.assign(new Error("Email link is invalid or has expired"), {
        code: "otp_expired",
      }),
    )
    mocks.getUser.mockResolvedValue({
      data: { user: { user_metadata: { rol: "VENDEDOR" } } },
      error: null,
    })
    mocks.setSearchParams(
      new URLSearchParams("token=t1&type=invite&email=a@b.co"),
    )
    render(<ConfirmPage />)
    await flushMicrotasks()

    expect(screen.queryByText("Enlace no válido")).not.toBeInTheDocument()
    expect(
      screen.queryByText("No pudimos verificar el correo"),
    ).not.toBeInTheDocument()
    expect(screen.getByText("Crea tu contraseña")).toBeInTheDocument()
  })

  it("still shows the invalid-link dead end when verification fails and there is no existing session either", async () => {
    mocks.verifyOtp.mockRejectedValue(new Error("Email link is invalid or has expired"))
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    mocks.setSearchParams(
      new URLSearchParams("token=t1&type=invite&email=a@b.co"),
    )
    render(<ConfirmPage />)
    await flushMicrotasks()

    expect(screen.getByText("Enlace no válido")).toBeInTheDocument()
  })

  // Real-world invite redirect shape: GoTrue echoes `type=invite` back as a
  // query param on redirect_to while delivering the session via the URL
  // hash. If setSession() rejects (the session tokens themselves are
  // invalid/expired/already redeemed — a Supabase-side condition, not a bug
  // here) AND there is no existing session to fall back on either, the
  // URL-cleanup step never runs (it's the line right after the await,
  // inside the same try), so the hash — and therefore `hasLink` — survives
  // into the error render. Locks in that this correctly reaches the resend
  // flow instead of a silent "success" or the wrong dead end.
  it("shows the resend flow (not a silent false success) when setSession rejects on an invite hash-token link", async () => {
    mocks.setSession.mockRejectedValue(
      new Error("Auth session missing or expired"),
    )
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    mocks.setSearchParams(new URLSearchParams("type=invite&email=a@b.co"))
    setLocationHash("#access_token=at&refresh_token=rt")
    render(<ConfirmPage />)
    await flushMicrotasks()

    // The fallback check runs (that's the point of it) but finds no session.
    expect(mocks.getUser).toHaveBeenCalled()
    expect(screen.getByText("Enlace no válido")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Solicitar de nuevo el enlace" }),
    ).toBeInTheDocument()
  })
})