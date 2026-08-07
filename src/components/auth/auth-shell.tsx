// Shared centered brand shell for auth pages: /login and /auth/reset-password.
// Matches the dark-shell brand: Bricolage display, rose/ink tokens,
// rounded 26px cards over the page background.

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-page px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(52rem_32rem_at_50%_-10%,rgba(205,21,96,0.09),transparent_70%)]"
      />
      <div className="relative w-full max-w-[400px]">{children}</div>
    </div>
  );
}
