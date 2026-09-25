import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Neon (and other serverless Postgres) auto-pauses the compute when idle, so
// the first query after a pause returns P1001 while the host resumes. Retry
// those transient connection errors instead of failing the whole request.
const TRANSIENT_CODES = new Set(["P1001", "P1002", "P1008", "P2024"]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildDatasourceUrl(): string | undefined {
  const base = process.env.DATABASE_URL;
  if (!base) return undefined;
  try {
    const url = new URL(base);

    // Neon pooled endpoints need `pgbouncer=true` so Prisma formats queries
    // correctly through the pooler.
    if (base.includes("-pooler.") && !url.searchParams.has("pgbouncer")) {
      url.searchParams.set("pgbouncer", "true");
    }

    // A small connection pool per instance is plenty for a serverless app and
    // avoids exhausting Neon's PgBouncer connections under load.
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", "3");
    }

    // Don't hang a request forever if the host can't be reached; the retry
    // loop below will give a paused compute time to wake up again.
    if (!url.searchParams.has("connect_timeout")) {
      url.searchParams.set("connect_timeout", "15");
    }

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

  // Wrap every model query with a retry loop for the transient connection
  // errors a serverless datastore throws while resuming from idle.
  const extended = prisma.$extends({
    query: {
      $allModels: {
async $allOperations({ args, query }) {
          const MAX_ATTEMPTS = 3;
          let lastErr: unknown = null;
          for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
              return await query(args);
            } catch (error) {
              lastErr = error;
              if (!isTransientPrismaError(error)) throw error;
              if (attempt < MAX_ATTEMPTS) {
                // Backoff while Neon wakes up: 1s then 2s.
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