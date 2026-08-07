// Prisma client wired with the pg driver adapter (required by Prisma 7 at
// runtime). DATABASE_URL is used for runtime queries; DIRECT_URL stays in the
// environment for future pooler-based migrations (PRD §8.4).
//
// Best-effort rule: construction never throws (the pool is lazy), and every
// call site wraps queries in try/catch — when the DB is unreachable the
// request logs and returns a typed error instead of crashing.

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
