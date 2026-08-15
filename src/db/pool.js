import pg from "pg";
import { createRequire } from "node:module";

const { Pool } = pg;
const require = createRequire(import.meta.url);

export function createPool(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (databaseUrl === "pgmem://local") {
    if (process.env.NODE_ENV === "production") throw new Error("pgmem://local is only available for local validation");
    const { newDb, DataType } = require("pg-mem");
    const database = newDb({ noAstCoverageCheck: true });
    database.public.registerFunction({ name: "pg_try_advisory_lock", args: [DataType.integer], returns: DataType.bool, implementation: () => true });
    database.public.registerFunction({ name: "pg_advisory_unlock", args: [DataType.integer], returns: DataType.bool, implementation: () => true });
    const memoryPg = database.adapters.createPg();
    return new memoryPg.Pool();
  }
  const ssl = process.env.DATABASE_SSL === "true"
    ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }
    : undefined;
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl,
    max: Number(process.env.PG_POOL_MAX || 10),
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 10_000),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30_000),
    application_name: "zeus-panel-railway",
  });
  pool.on("error", (error) => console.error("[postgres pool]", error));
  return pool;
}

export async function checkDatabase(pool) {
  const result = await pool.query("SELECT 1 AS ok");
  return result.rows[0]?.ok === 1;
}
