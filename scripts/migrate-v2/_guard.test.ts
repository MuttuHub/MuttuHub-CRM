/**
 * WHY: the loopback guard only matters if it runs *before* anything can build a
 * database client. This file therefore does not call the guard in-process: it
 * spawns a real child process that imports the guard first and the Prisma client
 * second, so a regression in the wrapper (import order, a forgotten variable, a
 * new bypass flag) fails here even though `prisma/local-env.test.ts` still passes.
 *
 * The child env is fully controlled, so the real `.env.local` is never needed:
 * `dotenv` keeps variables that are already present, so pre-setting a value is
 * enough to simulate a remote target.
 */
import { spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// Vitest resolves modules through its own loader, so `import.meta.url` is not a
// file URL here. The runner always starts from the repository root.
const FIXTURE = resolve(process.cwd(), "scripts/migrate-v2/__fixtures__/guard-probe.ts")

const LOCAL_DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
const LOCAL_API = "http://127.0.0.1:54321"
// The shared production pooler host. The password is fake; it exists only to
// prove that no guard error ever echoes a credential.
const REMOTE_DB =
  "postgresql://postgres.rxwtgvuijaketidnbtoh:S3cretP4ss@aws-1-us-west-2.pooler.supabase.com:5432/postgres"
const REMOTE_HOST = "aws-1-us-west-2.pooler.supabase.com:5432"
const REMOTE_PASSWORD = "S3cretP4ss"
const REMOTE_API = "http://remote-supabase.example:8000"

type Probe = ReturnType<typeof spawnSync>

function runProbe(overrides: Record<string, string>, args: string[] = []): Probe {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: LOCAL_DB,
    DIRECT_URL: LOCAL_DB,
    NEXT_PUBLIC_SUPABASE_URL: LOCAL_API,
    ...overrides,
  }

  return spawnSync(process.execPath, ["--import", "tsx", FIXTURE, ...args], {
    env,
    encoding: "utf8",
    cwd: process.cwd(),
    timeout: 60_000,
  })
}

describe("migrate-v2 guard", () => {
  it("aborts before importing the db client when DATABASE_URL is not loopback", () => {
    const result = runProbe({ DATABASE_URL: REMOTE_DB })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("Refusing to run against a non-local database")
    expect(result.stdout).not.toContain("ok")
  })

  it("aborts when DIRECT_URL or NEXT_PUBLIC_SUPABASE_URL is remote", () => {
    const remoteDirect = runProbe({ DIRECT_URL: REMOTE_DB })
    expect(remoteDirect.status).not.toBe(0)
    expect(remoteDirect.stderr).toContain("DIRECT_URL")

    const remoteApi = runProbe({ NEXT_PUBLIC_SUPABASE_URL: REMOTE_API })
    expect(remoteApi.status).not.toBe(0)
    expect(remoteApi.stderr).toContain("NEXT_PUBLIC_SUPABASE_URL")
  })

  it("error message names the host and never the password", () => {
    const result = runProbe({ DATABASE_URL: REMOTE_DB })

    expect(result.stderr).toContain(REMOTE_HOST)
    expect(result.stderr).not.toContain(REMOTE_PASSWORD)
  })

  it("has no flag or env var that bypasses the guard", () => {
    const result = runProbe(
      {
        DATABASE_URL: REMOTE_DB,
        FORCE: "1",
        GENTLE_AI_ALLOW_REMOTE: "1",
        ALLOW_REMOTE: "1",
      },
      ["--allow-remote"],
    )

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("Refusing to run against a non-local database")
    expect(result.stdout).not.toContain("ok")
  })

  it("runs when every guarded variable is loopback", () => {
    const result = runProbe({})

    expect(result.status).toBe(0)
    expect(result.stdout).toContain("ok")
  })

  describe("explicit remote opt-in (production run)", () => {
    const REMOTE_HOSTNAME = "aws-1-us-west-2.pooler.supabase.com"
    const remote = { DATABASE_URL: REMOTE_DB, DIRECT_URL: REMOTE_DB }

    it("rejects a remote target when MIGRATE_V2_ALLOW_REMOTE_HOST is missing", () => {
      const result = runProbe(remote)

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain("Refusing to run against a non-local database")
      expect(result.stdout).not.toContain("ok")
    })

    it.each([
      ["a different host", "other-host.example"],
      ["a suffix of the host", "supabase.com"],
      ["the host with its port", REMOTE_HOST],
      ["an empty value", ""],
      ["a wildcard", "*"],
    ])("rejects a remote target when the opt-in names %s", (_label, allowed) => {
      const result = runProbe({ ...remote, MIGRATE_V2_ALLOW_REMOTE_HOST: allowed })

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain("Refusing to run against a non-local database")
      expect(result.stderr).not.toContain(REMOTE_PASSWORD)
      expect(result.stdout).not.toContain("ok")
    })

    it("accepts a remote target when the opt-in equals its exact host", () => {
      const result = runProbe({ ...remote, MIGRATE_V2_ALLOW_REMOTE_HOST: REMOTE_HOSTNAME }, ["--dry-run"])

      expect(result.status).toBe(0)
      expect(result.stdout).toContain("ok")
    })

    it("still rejects a remote NEXT_PUBLIC_SUPABASE_URL, even when the database host is allowed", () => {
      const result = runProbe({
        ...remote,
        NEXT_PUBLIC_SUPABASE_URL: REMOTE_API,
        MIGRATE_V2_ALLOW_REMOTE_HOST: REMOTE_HOSTNAME,
      })

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain("NEXT_PUBLIC_SUPABASE_URL")
    })

    it("rejects a second remote variable that is not the allowed host", () => {
      const result = runProbe({
        ...remote,
        DIRECT_URL: "postgresql://postgres:x@other-host.example:5432/postgres",
        MIGRATE_V2_ALLOW_REMOTE_HOST: REMOTE_HOSTNAME,
      })

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain("DIRECT_URL")
    })

    it("rejects --apply without --expect-hash on an allowed remote target", () => {
      const result = runProbe({ ...remote, MIGRATE_V2_ALLOW_REMOTE_HOST: REMOTE_HOSTNAME }, ["--apply"])

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain("--expect-hash")
      expect(result.stdout).not.toContain("ok")
    })

    it("accepts --apply --expect-hash on an allowed remote target", () => {
      const result = runProbe({ ...remote, MIGRATE_V2_ALLOW_REMOTE_HOST: REMOTE_HOSTNAME }, [
        "--apply",
        "--expect-hash",
        "abc123",
      ])

      expect(result.status).toBe(0)
      expect(result.stdout).toContain("ok")
    })

    it("keeps loopback behavior unchanged: --apply without a hash is not blocked by the guard", () => {
      const result = runProbe({}, ["--apply"])

      expect(result.status).toBe(0)
      expect(result.stdout).toContain("ok")
    })
  })
})
