import test from "node:test";
import assert from "node:assert/strict";
import { D1PostgresAdapter, translateKnownZeusSql } from "../src/compat/d1.js";
import { runMigrations } from "../src/db/migrations.js";
import { extractUUIDFromvIees, parseProxyConfig } from "../Source.js";
import { normalizeBackup } from "../scripts/import-d1.js";
import { createMemoryPool } from "./support.js";

test("known ZEUS SQL is translated without touching quoted question marks", () => {
  const translated = translateKnownZeusSql("SELECT '?' AS marker FROM users WHERE username = ? COLLATE NOCASE OR uuid = ?");
  assert.equal(translated.text, "SELECT '?' AS marker FROM users WHERE LOWER(username) = LOWER($1) OR uuid = $2");
  const upsert = translateKnownZeusSql("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  assert.match(upsert.text, /^INSERT INTO settings/);
  assert.match(upsert.text, /ON CONFLICT \(key\) DO UPDATE/);
});

test("migrations and D1 adapter preserve settings and case-insensitive users", async () => {
  const { pool } = createMemoryPool();
  try {
    assert.deepEqual(await runMigrations(pool), ["001_initial.sql"]);
    assert.deepEqual(await runMigrations(pool), []);
    const db = new D1PostgresAdapter(pool);
    await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('sample', ?)").bind("one").run();
    await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('sample', ?)").bind("two").run();
    assert.equal((await db.prepare("SELECT value FROM settings WHERE key = 'sample'").first()).value, "two");
    await db.prepare("INSERT INTO users (username, uuid, connection_type) VALUES (?, ?, ?)").bind("CaseUser", "11111111-1111-1111-1111-111111111111", "vless").run();
    const user = await db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").bind("caseuser").first();
    assert.equal(user.username, "CaseUser");
  } finally {
    await pool.end();
  }
});

test("proxy parser handles credentials, IPv6, and default ports", () => {
  assert.deepEqual(parseProxyConfig("name:secret@proxy.example:1081", 1080), {
    user: "name", pass: "secret", host: "proxy.example", port: 1081, auth: true,
  });
  assert.equal(parseProxyConfig("[2001:db8::1]:8080", 1080).host, "2001:db8::1");
  assert.equal(parseProxyConfig("proxy.example", 1080).port, 1080);
});

test("VLESS UUID parsing and backup normalization retain the original fields", () => {
  const uuidBytes = Buffer.from("11111111111111111111111111111111", "hex");
  assert.equal(extractUUIDFromvIees(Uint8Array.from([0, ...uuidBytes])), "11111111-1111-1111-1111-111111111111");
  const normalized = normalizeBackup({ users: [{ username: "alpha", frag_len: "10-20" }], settings: { proxy_ip: "1.1.1.1" } });
  assert.equal(normalized.users[0].frag_len, "10-20");
  assert.deepEqual(normalized.settings, [{ key: "proxy_ip", value: "1.1.1.1" }]);
});
