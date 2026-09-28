// Side-effect module: import it FIRST (before `@/lib/db`) in any test or script
// that opens a real database connection. It loads `.env.local` over whatever the
// process inherited and aborts unless every database URL (and the Supabase URL,
// when set — the seed writes Auth users and Storage objects through it) targets
// localhost.
import { config as loadDotenv } from "dotenv";
import { assertLocalDatabaseUrl } from "./local-env";

loadDotenv({ path: ".env.local", override: true, quiet: true });

assertLocalDatabaseUrl("DATABASE_URL", process.env.DATABASE_URL);
if (process.env.DIRECT_URL) assertLocalDatabaseUrl("DIRECT_URL", process.env.DIRECT_URL);
if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
  assertLocalDatabaseUrl("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}
