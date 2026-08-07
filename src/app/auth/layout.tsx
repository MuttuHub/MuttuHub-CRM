// Centered brand shell for /auth/reset-password and its confirm page.

import { AuthShell } from "@/components/auth/auth-shell";

export default function AuthResetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthShell>{children}</AuthShell>;
}
