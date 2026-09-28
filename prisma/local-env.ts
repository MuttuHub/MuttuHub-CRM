// Guard for anything that touches a database from dev/test tooling: the root
// `.env` points to a shared REMOTE Supabase project, `.env.local` to the local
// Docker database. See CLAUDE.md ("Entorno local") and DIAGNOSTICO-SEED-CLOUD.md.

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Throws unless `url` is a database URL whose host is a loopback address.
 * The error names the host only, never the credentials. */
export function assertLocalDatabaseUrl(name: string, url: string | undefined): void {
  if (!url) {
    throw new Error(`${name} is not set. Load .env.local explicitly (e.g. --env-file=.env.local).`);
  }
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`${name} is not a valid URL. Refusing to continue.`);
  }
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(`${name} points to "${host}", not a local database. Refusing to continue.`);
  }
}
