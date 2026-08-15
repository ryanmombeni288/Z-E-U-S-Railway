import { newDb, DataType } from "pg-mem";
import { createZeusServer } from "../src/server.js";

export function createMemoryPool() {
  const database = newDb({ noAstCoverageCheck: true });
  database.public.registerFunction({ name: "pg_try_advisory_lock", args: [DataType.integer], returns: DataType.bool, implementation: () => true });
  database.public.registerFunction({ name: "pg_advisory_unlock", args: [DataType.integer], returns: DataType.bool, implementation: () => true });
  const { Pool } = database.adapters.createPg();
  return { database, pool: new Pool() };
}

export async function startTestApp(options = {}) {
  const memory = options.pool ? { pool: options.pool } : createMemoryPool();
  const env = {
    TRUST_PROXY: "true",
    ALLOW_PRIVATE_DESTINATIONS: "1",
    MAX_JSON_BODY_BYTES: "1048576",
    MAX_WEBSOCKET_FRAME_BYTES: "1048576",
    ...options.env,
  };
  const app = await createZeusServer({ pool: memory.pool, env, schedulers: false });
  const address = await app.listen(0, "127.0.0.1");
  return {
    ...memory,
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
    wsUrl: `ws://127.0.0.1:${address.port}`,
  };
}

export async function jsonRequest(url, { cookie, body, method = "POST", headers = {} } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, data: await response.json().catch(() => null) };
}

export function sessionCookie(response) {
  return (response.headers.get("set-cookie") || "").split(";", 1)[0];
}

export async function setupAndLogin(baseUrl, password = "test-password") {
  const setup = await jsonRequest(`${baseUrl}/api/setup-password`, { body: { password } });
  if (!setup.response.ok) throw new Error(`Setup failed: ${JSON.stringify(setup.data)}`);
  return sessionCookie(setup.response);
}
