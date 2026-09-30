import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { assertLocalDatabaseUrl, connectionTarget, isLocalTarget, loadLocalEnv, redact } from "./local-env"

// The real production instance. The password below is fake; it exists only to
// prove that no error message ever echoes a credential.
const REMOTE =
  "postgresql://postgres.rxwtgvuijaketidnbtoh:S3cretP4ss@aws-1-us-west-2.pooler.supabase.com:5432/postgres"
const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

const KEYS = ["DATABASE_URL", "DIRECT_URL"] as const
let saved: Record<string, string | undefined> = {}

beforeEach(() => {
  saved = {}
  for (const key of KEYS) {
    saved[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
})

describe("connectionTarget", () => {
  it("returns host:port for a Postgres URL", () => {
    expect(connectionTarget(LOCAL)).toBe("127.0.0.1:54322")
    expect(connectionTarget(REMOTE)).toBe("aws-1-us-west-2.pooler.supabase.com:5432")
  })

  it("returns null for an empty or malformed value", () => {
    expect(connectionTarget(undefined)).toBeNull()
    expect(connectionTarget("")).toBeNull()
    expect(connectionTarget("not a url")).toBeNull()
  })
})

describe("isLocalTarget", () => {
  it("accepts loopback hosts, with or without a port", () => {
    expect(isLocalTarget("postgresql://u:p@127.0.0.1:54322/db")).toBe(true)
    expect(isLocalTarget("postgresql://u:p@localhost:5432/db")).toBe(true)
    expect(isLocalTarget("postgresql://u:p@[::1]:5432/db")).toBe(true)
  })

  it("rejects the shared remote pooler", () => {
    expect(isLocalTarget(REMOTE)).toBe(false)
  })

  it("rejects a hostname that merely contains a loopback name", () => {
    expect(isLocalTarget("postgresql://u:p@localhost.evil.example:5432/db")).toBe(false)
    expect(isLocalTarget("postgresql://u:p@127.0.0.1.evil.example:5432/db")).toBe(false)
    expect(isLocalTarget("postgresql://u:p@notlocalhost:5432/db")).toBe(false)
  })

  it("fails closed on an unparseable value instead of assuming it is local", () => {
    expect(isLocalTarget("postgresql://u:p@")).toBe(false)
    expect(isLocalTarget("garbage")).toBe(false)
    expect(isLocalTarget(undefined)).toBe(false)
  })
})

describe("redact", () => {
  it("drops the password and keeps the host, so a message can be shown safely", () => {
    const safe = redact(REMOTE)
    expect(safe).not.toContain("S3cretP4ss")
    expect(safe).toContain("aws-1-us-west-2.pooler.supabase.com:5432")
  })

  it("leaves a value without credentials untouched", () => {
    expect(redact("garbage")).toBe("garbage")
  })
})

describe("assertLocalDatabaseUrl", () => {
  it("passes when every named variable is loopback", () => {
    process.env.DATABASE_URL = LOCAL
    process.env.DIRECT_URL = LOCAL
    expect(() => assertLocalDatabaseUrl()).not.toThrow()
  })

  it("throws when a variable points at the shared remote, naming the host and never the password", () => {
    process.env.DATABASE_URL = LOCAL
    process.env.DIRECT_URL = REMOTE

    let error: Error | undefined
    try {
      assertLocalDatabaseUrl()
    } catch (caught) {
      error = caught as Error
    }

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain("DIRECT_URL")
    expect(error?.message).toContain("aws-1-us-west-2.pooler.supabase.com:5432")
    expect(error?.message).not.toContain("S3cretP4ss")
    expect(error?.message).toContain("127.0.0.1")
  })

  it("fails closed when a named variable is missing", () => {
    process.env.DATABASE_URL = LOCAL
    // DIRECT_URL deliberately unset
    expect(() => assertLocalDatabaseUrl()).toThrow(/DIRECT_URL/)
  })

  it("has no bypass: argv flags such as --allow-remote or --force change nothing", () => {
    process.env.DATABASE_URL = REMOTE
    process.env.DIRECT_URL = REMOTE

    const original = process.argv
    process.argv = [...original, "--allow-remote", "--force", "ALLOW_REMOTE=1", "FORCE=1"]
    try {
      expect(() => assertLocalDatabaseUrl()).toThrow(/loopback/)
    } finally {
      process.argv = original
    }
  })
})

describe("loadLocalEnv", () => {
  it("never overrides variables that are already set, so CI and the shell win", () => {
    const dir = mkdtempSync(join(tmpdir(), "local-env-"))
    const file = join(dir, ".env.local")
    writeFileSync(file, `DATABASE_URL=${LOCAL}\nLOCAL_ENV_MARKER=from-file\n`)

    process.env.DATABASE_URL = "postgresql://from:process@127.0.0.1:9999/keep"
    try {
      loadLocalEnv(file)
      expect(process.env.DATABASE_URL).toBe("postgresql://from:process@127.0.0.1:9999/keep")
      expect(process.env.LOCAL_ENV_MARKER).toBe("from-file")
    } finally {
      delete process.env.LOCAL_ENV_MARKER
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("does not throw when the file does not exist", () => {
    expect(() => loadLocalEnv(join(tmpdir(), "definitely-absent-env-file"))).not.toThrow()
  })
})
