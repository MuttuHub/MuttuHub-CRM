// Single source of truth for the password policy (PRD §3.1: min 8 chars, at
// least one letter and one digit) — shared by every "set/confirm a password"
// screen (reset-password/confirm, the invite confirm page, the admin
// new-user dialog, the logged-in change-password dialog) AND the server-side
// validator (src/lib/api/errors.ts re-exports isValidPassword from here).
// Before this module existed, each screen hand-rolled its own copy of the
// regex/hint, which is exactly the kind of client/server drift that caused
// the "exportar" audit-log crash (two independently-maintained copies of the
// same rule, no compiler link) — this file is the fix for that failure mode
// applied to the password policy specifically. No `next/server` or other
// server-only import here on purpose: this must be safe to import from
// client components.

export const PASSWORD_POLICY_HINT = "Mínimo 8 caracteres, con letras y números.";

export const PASSWORD_POLICY_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export function isValidPassword(password: string): boolean {
  return PASSWORD_POLICY_REGEX.test(password);
}
