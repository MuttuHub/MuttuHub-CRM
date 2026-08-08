// (auth) route group: /login renders its own full-screen panes (approved
// access design) — no centered shell wrapper.

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}