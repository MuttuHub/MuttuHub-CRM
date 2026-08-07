// Centered brand shell for the (auth) route group: /login.

import { AuthShell } from "@/components/auth/auth-shell";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthShell>{children}</AuthShell>;
}
