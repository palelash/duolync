import { PrismaClient } from "@/lib/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

function createPrismaClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false },
    // Keep connections alive and recover quickly from transient DB blips
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });

  // Log and swallow idle-client errors so they don't crash the process
  pool.on("error", () => {
    console.error("[pg pool] unexpected idle connection error");
  });

  const adapter = new PrismaPg(pool);
  return { client: new PrismaClient({ adapter }), pool };
}

// Prevent multiple PrismaClient instances across Next.js hot reloads in development.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaPool: Pool | undefined;
};

if (!globalForPrisma.prisma) {
  const created = createPrismaClient();
  globalForPrisma.prisma = created.client;
  globalForPrisma.prismaPool = created.pool;
}

export const db = globalForPrisma.prisma;

/** Prisma uses an externally owned pool: standalone runners must close both. */
export async function closeDatabase(): Promise<void> {
  try { await db.$disconnect(); }
  finally { if (globalForPrisma.prismaPool) await globalForPrisma.prismaPool.end(); }
}
