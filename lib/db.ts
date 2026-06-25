import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Neon free tier: 37 max connections shared across all processes.
// SSE streams + workers can exhaust the pool fast if left at Prisma default.
// Inject connection_limit + pool_timeout into the URL when not already set.
function buildDatasourceUrl(url: string): string {
  const limit = process.env.DATABASE_CONNECTION_LIMIT || "5";
  const timeout = process.env.DATABASE_POOL_TIMEOUT || "20";
  const sep = url.includes("?") ? "&" : "?";
  let result = url;
  if (!url.includes("connection_limit=")) result += `${sep}connection_limit=${limit}`;
  if (!url.includes("pool_timeout=")) result += `&pool_timeout=${timeout}`;
  return result;
}

function makePrismaClient() {
  const url = process.env.DATABASE_URL;
  return new PrismaClient({
    log: ["error", "warn"],
    ...(url ? { datasourceUrl: buildDatasourceUrl(url) } : {})
  });
}

export const db = globalForPrisma.prisma ?? makePrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
