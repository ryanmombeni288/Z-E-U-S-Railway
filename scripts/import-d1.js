import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createPool } from "../src/db/pool.js";
import { runMigrations } from "../src/db/migrations.js";

const USER_COLUMNS = [
  "username", "uuid", "limit_gb", "expiry_days", "ips", "connection_type", "tls", "port",
  "used_gb", "is_active", "last_active", "created_at", "fingerprint", "max_connections",
  "limit_req", "used_req", "ip_limit", "active_ips", "block_porn", "block_ads", "frag_len",
  "frag_int", "lifetime_used_gb", "user_proxy_ip", "user_proxy_iata", "user_socks5",
  "auto_reset_vol_days", "auto_reset_req_days", "last_reset_vol_time", "last_reset_req_time",
  "auto_rotate_ip", "rotate_time", "ip_operator", "ip_count", "last_rotate_time",
  "auto_rotate_user_proxy",
];

function normalizeBackup(value) {
  if (Array.isArray(value)) return { users: value, settings: [] };
  if (!value || typeof value !== "object") throw new Error("Backup must be a JSON object or user array");
  const users = Array.isArray(value.users)
    ? value.users
    : Array.isArray(value.results) && value.results.some((row) => row?.username)
      ? value.results
      : [];
  const settings = Array.isArray(value.settings)
    ? value.settings
    : value.settings && typeof value.settings === "object"
      ? Object.entries(value.settings).map(([key, settingValue]) => ({ key, value: settingValue }))
      : [];
  return { users, settings };
}

async function importBackup(file, { replace = false } = {}) {
  const fileStats = await stat(file);
  if (fileStats.size > 32 * 1024 * 1024) throw new Error("Backup exceeds the 32 MiB import limit");
  const parsed = JSON.parse(await readFile(file, "utf8"));
  const { users, settings } = normalizeBackup(parsed);
  const pool = createPool();
  try {
    await runMigrations(pool);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (replace) {
        await client.query("DELETE FROM users");
        await client.query("DELETE FROM settings");
      }
      for (const user of users) {
        if (!user?.username || !/^[a-zA-Z0-9_-]{1,32}$/.test(user.username)) {
          throw new Error(`Invalid user in backup: ${user?.username || "<missing>"}`);
        }
        await client.query("DELETE FROM users WHERE LOWER(username) = LOWER($1)", [user.username]);
        const columns = USER_COLUMNS.filter((column) => user[column] !== undefined);
        const values = columns.map((column) => user[column]);
        const placeholders = columns.map((_, index) => `$${index + 1}`);
        await client.query(
          `INSERT INTO users (${columns.map((column) => `"${column}"`).join(", ")}) VALUES (${placeholders.join(", ")})`,
          values,
        );
      }
      for (const setting of settings) {
        if (!setting || typeof setting.key !== "string" || setting.key.length > 128) {
          throw new Error("Invalid settings entry in backup");
        }
        await client.query(
          "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
          [setting.key, String(setting.value ?? "")],
        );
      }
      await client.query("COMMIT");
      return { users: users.length, settings: settings.length };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const fileArg = args.find((arg) => !arg.startsWith("--"));
  if (!fileArg) {
    console.error("Usage: npm run import:d1 -- <backup.json> [--replace]");
    process.exit(2);
  }

  const result = await importBackup(path.resolve(fileArg), { replace: args.includes("--replace") });
  console.log(`Imported ${result.users} users and ${result.settings} settings transactionally`);
}

export { importBackup, normalizeBackup, USER_COLUMNS };
