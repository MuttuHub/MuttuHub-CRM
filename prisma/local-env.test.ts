import { describe, expect, it } from "vitest";
import { assertLocalDatabaseUrl } from "./local-env";

describe("assertLocalDatabaseUrl", () => {
  it.each([
    "postgresql://postgres:secret@127.0.0.1:54322/postgres",
    "postgresql://postgres:secret@localhost:5432/postgres",
    "postgresql://postgres:secret@[::1]:5432/postgres",
  ])("accepts a loopback database url (%s)", (url) => {
    expect(() => assertLocalDatabaseUrl("DATABASE_URL", url)).not.toThrow();
  });

  it("rejects a remote host and names it without leaking credentials", () => {
    const url = "postgresql://postgres.abc:secret@aws-1-us-west-2.pooler.supabase.com:5432/postgres";
    expect(() => assertLocalDatabaseUrl("DIRECT_URL", url)).toThrow(/DIRECT_URL.*aws-1-us-west-2\.pooler\.supabase\.com/);
    expect(() => assertLocalDatabaseUrl("DIRECT_URL", url)).not.toThrow(/secret/);
  });

  it("rejects a missing url", () => {
    expect(() => assertLocalDatabaseUrl("DATABASE_URL", undefined)).toThrow(/DATABASE_URL.*\.env\.local/);
  });

  it("rejects a malformed url", () => {
    expect(() => assertLocalDatabaseUrl("DATABASE_URL", "not a url")).toThrow(/DATABASE_URL/);
  });
});
