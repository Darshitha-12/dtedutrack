import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Neon (and other serverless Postgres) auto-pause compute when idle, so the
// first query after a pause returns P1001 while the host resumes. Retry those
// transient connection errors instead of failing the whole request.
const TRANSIENT_CODES = new Set(["P1001", "P1002", "P1008", "P2024"]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildDatasourceUrl(): string | undefined {
  const base = process.env.DATABASE_URL;
  if (!base) return undefined;
  try {
    const url = new URL(base);
    // Keep connect short so a paused host fails fast and the retry loop kicks
    // in instead of hanging the request for 30s+.
    if (!url.searchParams.has("connect_timeout")) url.searchParams.set("connect_timeout", "10");
    if (!url.searchParams.has("socket_timeout")) url.searchParams.set("socket_timeout", "30");
    return url.toString();
  } catch {
    return base;
  }
}

function isTransientPrismaError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientInitializationError) return true;
  if (err instanceof Prisma.PrismaClientKnownRequestError && TRANSIENT_CODES.has(err.code)) return true;
  return false;
}

function createClient() {
  const datasourceUrl = buildDatasourceUrl();
  const prisma = datasourceUrl
    ? new PrismaClient({ datasources: { db: { url: datasourceUrl } } })
    : new PrismaClient();

  // Serverless datastores (Neon) pause compute when idle and resume on demand.
  // Wrap every model query with a small retry loop for transient connect errors.
  const extended = prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ query }) {
          const MAX_ATTEMPTS = 3;
          let lastErr: unknown = null;
          for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
              return await query({});
            } catch (error) {
              lastErr = error;
              if (!isTransientPrismaError(error)) throw error;
              if (attempt < MAX_ATTEMPTS) {
                // Exponential backoff (1s, 3s) gives Neon time to resume.
                await sleep(1000 * attempt);
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

export const db = globalForPrisma.prisma || createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;