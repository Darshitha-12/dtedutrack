import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Neon (and other serverless Postgres) auto-pauses the compute when idle, so
// the first query after a pause returns P1001/P1002 while the host resumes.
// Retry those transient connection errors instead of failing the whole request.
const TRANSIENT_CODES = new Set(["P1001", "P1002", "P1008", "P2024"]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type PgHttp = typeof import("pg");

function parseUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: (u.pathname || "/").split("/").filter(Boolean)[0] || "neondb",
    params: new URLSearchParams(u.search),
  };
}

function createClient() {
  const base = process.env.DATABASE_URL;
  const pg: PgHttp = require("pg") as PgHttp;

  const pool = new pg.Pool({
    connectionString: base,
    max: 3,
    connectionTimeoutMillis: 20_000,
    idleTimeoutMillis: 30_000,
    ssl:
      base && /sslmode|neon\.tech|pooler/.test(base)
        ? { rejectUnauthorized: false }
        : undefined,
  });

  // Keep the Prisma-level transient retry guard. PrismaClientInitializationError
  // no longer applies when using a driver adapter, so rely on the P-codes and
  // connection errors raised through the adapter.
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const extended = prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const MAX_ATTEMPTS = 4;
          let lastErr: unknown = null;
          for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
              return await query(args);
            } catch (error) {
              lastErr = error;
              if (!isTransientPrismaError(error)) throw error;
              if (attempt < MAX_ATTEMPTS) {
                // Backoff while Neon wakes up: 2s, 4s, 8s.
                await sleep(2000 * attempt);
              }
            }
          }
          throw lastErr;
        },
      },
    },
  });

  return extended as unknown as PrismaClient;
}

function isTransientPrismaError(err: unknown): boolean {
  // instanceof can fail when Next.js bundles a second copy of @prisma/client,
  // so fall back to constructor name and known P-codes.
  const name = (err as { constructor?: { name?: string } })?.constructor?.name || "";
  const code = String((err as { code?: string })?.code || "");
  if (name === "PrismaClientInitializationError") return true;
  if (TRANSIENT_CODES.has(code)) return true;
  if (name === "PrismaClientKnownRequestError" && TRANSIENT_CODES.has(code)) return true;
  if (err instanceof Prisma.PrismaClientKnownRequestError && TRANSIENT_CODES.has(codeOf(err))) return true;
  // Postgres connection-level errors surfaced by the driver adapter.
  if (code === "ETIMEDOUT" || code === "ECONNREFUSED" || code === "ECONNRESET" || code.startsWith("08")) return true;
  return false;
}

function codeOf(err: Prisma.PrismaClientKnownRequestError): string {
  return err.code || "";
}

export const db = globalForPrisma.prisma || createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;