import { createPool } from "../src/db/pool.js";
import { runMigrations } from "../src/db/migrations.js";

const pool = createPool();
try {
  const applied = await runMigrations(pool);
  console.log(applied.length ? `Applied migrations: ${applied.join(", ")}` : "Database schema is current");
} finally {
  await pool.end();
}
