import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Neon (and other serverless Postgres) auto-pauses the compute when idle, so
// the first query after a pause returns P1001/P1002 while the host resumes.
// Retry those transient connection errors instead of failing the whole request.
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

    // Short connect timeout so a retry cycle can quickly wake a paused
    // compute rather than hanging the whole request on a single attempt.
    if (!url.searchParams.has("connect_timeout")) {
      url.searchParams.set("connect_timeout", "20");
    }

    if (!url.searchParams.has("socket_timeout")) {
      url.searchParams.set("socket_timeout", "30");
    }

    return url.toString();
  } catch {
    return base;
  }
}

function isTransientPrismaError(err: unknown, message: string): boolean {
  // instanceof can fail when Next.js bundles a second copy of @prisma/client,
  // so fall back to constructor name and known P-codes.
  const name = (err as { constructor?: { name?: string } })?.constructor?.name || "";
  if (name === "PrismaClientInitializationError") return true;
  if (name === "PrismaClientKnownRequestError" && TRANSIENT_CODES.has(message)) return true;
  if (err instanceof Prisma.PrismaClientInitializationError) return true;
  if (err instanceof Prisma.PrismaClientKnownRequestError && TRANSIENT_CODES.has(codeOf(err))) return true;
  return false;
}

// PrismaClientKnownRequestError exposes `code`; keep instanceof path extracted
// here so the chain above stays readable.
function codeOf(err: Prisma.PrismaClientKnownRequestError): string {
  return err.code || "";
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
          const MAX_ATTEMPTS = 4;
          let lastErr: unknown = null;
          for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
              return await query(args);
            } catch (error) {
              lastErr = error;
              const msg = String((error as { message?: unknown })?.message || "");
              if (!isTransientPrismaError(error, msg)) throw error;
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

export const db = globalForPrisma.prisma || createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;