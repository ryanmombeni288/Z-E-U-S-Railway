import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import WebSocket, { WebSocketServer } from "ws";
import legacyWorker, * as legacy from "../Source.js";
import { D1PostgresAdapter } from "./compat/d1.js";
import { installCacheCompat } from "./compat/cache.js";
import { BackgroundTasks } from "./compat/wait-until.js";
import { closeAllSockets } from "./compat/sockets.js";
import { createPool, checkDatabase } from "./db/pool.js";
import { projectRoot, runMigrations } from "./db/migrations.js";
import { handlePlatformRoute } from "./app/platform-routes.js";
import { isSameOrigin } from "./app/security.js";
import { startSchedulers } from "./services/scheduler.js";

globalThis.WebSocket = WebSocket;
installCacheCompat();

const allowedStatic = /^(?:ips\.txt|vip-list|zeus-scanner\.txt|proxy\/[A-Z]{2,3}\.txt|proxy_vip\/[A-Z]{2,3}\.txt)$/i;

function installStaticReader(root) {
  globalThis.__ZEUS_STATIC_READ__ = async (requestedPath) => {
    const clean = String(requestedPath || "").split("?", 1)[0].replaceAll("\\", "/").replace(/^\/+/, "");
    if (!allowedStatic.test(clean)) return null;
    const target = path.resolve(root, clean);
    if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) return null;
    const data = await readFile(target);
    return new Response(data, {
      headers: { "Content-Type": clean === "vip-list" ? "application/json; charset=utf-8" : "text/plain; charset=utf-8" },
    });
  };
}

function trustProxy(env) {
  if (env.TRUST_PROXY === "false") return false;
  return env.TRUST_PROXY === "true" || Boolean(env.RAILWAY_ENVIRONMENT_ID);
}

function firstHeader(value) {
  return String(value || "").split(",", 1)[0].trim();
}

export function getClientIp(req, env) {
  if (trustProxy(env)) {
    const forwarded = firstHeader(req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.headers["x-real-ip"]);
    if (forwarded) return forwarded;
  }
  const address = req.socket.remoteAddress || "unknown";
  return address.startsWith("::ffff:") ? address.slice(7) : address;
}

function validHost(value) {
  const host = firstHeader(value);
  if (!host || host.length > 255 || /[\s/\\@]/.test(host)) return null;
  try {
    return new URL(`http://${host}`).host;
  } catch {
    return null;
  }
}

function externalUrl(req, env) {
  if (env.PUBLIC_BASE_URL) return new URL(req.url || "/", new URL(env.PUBLIC_BASE_URL));
  const trusted = trustProxy(env);
  const forwardedHost = trusted ? req.headers["x-forwarded-host"] : null;
  const host = validHost(forwardedHost || req.headers.host) || "localhost";
  const protocol = trusted
    ? firstHeader(req.headers["x-forwarded-proto"]) || (req.socket.encrypted ? "https" : "http")
    : (req.socket.encrypted ? "https" : "http");
  return new URL(req.url || "/", `${protocol === "https" ? "https" : "http"}://${host}`);
}

async function readBody(req, limit) {
  const declared = Number(req.headers["content-length"] || 0);
  if (declared > limit) throw Object.assign(new Error("Request body too large"), { statusCode: 413 });
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("Request body too large"), { statusCode: 413 });
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

function fetchHeaders(req, clientIp) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else if (value !== undefined) headers.set(name, value);
  }
  headers.set("CF-Connecting-IP", clientIp);
  return headers;
}

async function toFetchRequest(req, env, includeBody = true) {
  const method = req.method || "GET";
  const body = includeBody && method !== "GET" && method !== "HEAD"
    ? await readBody(req, Number(env.MAX_JSON_BODY_BYTES || 1_048_576))
    : undefined;
  return new Request(externalUrl(req, env), {
    method,
    headers: fetchHeaders(req, getClientIp(req, env)),
    body,
  });
}

async function sendFetchResponse(res, response, method = "GET") {
  const headers = {};
  for (const [name, value] of response.headers) headers[name] = value;
  const setCookies = response.headers.getSetCookie?.();
  if (setCookies?.length) headers["set-cookie"] = setCookies;
  headers["x-content-type-options"] ??= "nosniff";
  headers["x-frame-options"] ??= "DENY";
  headers["referrer-policy"] ??= "same-origin";
  res.writeHead(response.status, headers);
  if (method === "HEAD" || !response.body) {
    res.end();
    return;
  }
  res.end(Buffer.from(await response.arrayBuffer()));
}

function rejectUpgrade(socket, status, message) {
  if (!socket.destroyed) {
    socket.end(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  }
}

export async function createZeusServer({
  pool,
  env: suppliedEnv = process.env,
  migrate = true,
  schedulers = true,
} = {}) {
  if (!pool) throw new TypeError("createZeusServer requires a PostgreSQL-compatible pool");
  installStaticReader(projectRoot);
  if (migrate) await runMigrations(pool);
  const DB = new D1PostgresAdapter(pool);
  const env = { ...suppliedEnv, DB, NATIVE_SCHEDULERS: "1" };
  const tasks = new BackgroundTasks();
  const ctx = tasks.context();
  let schemaReady = false;
  await legacy.DbService.ensureSchema(DB);
  schemaReady = true;

  const wss = new WebSocketServer({
    noServer: true,
    clientTracking: true,
    maxPayload: Number(env.MAX_WEBSOCKET_FRAME_BYTES || 1_048_576),
    perMessageDeflate: false,
  });

  const server = http.createServer(async (req, res) => {
    try {
      const url = externalUrl(req, env);
      if (url.pathname === "/healthz") {
        const healthy = schemaReady && await checkDatabase(pool);
        await sendFetchResponse(res, new Response(JSON.stringify(healthy ? { status: "ok" } : { status: "unavailable" }), {
          status: healthy ? 200 : 503,
          headers: { "Content-Type": "application/json" },
        }), req.method);
        return;
      }

      const request = await toFetchRequest(req, env);
      if (url.pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method) && !isSameOrigin(request, env.PUBLIC_BASE_URL)) {
        await sendFetchResponse(res, new Response(JSON.stringify({ error: "Invalid request origin" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }), req.method);
        return;
      }
      const platformResponse = await handlePlatformRoute(request, url, env, legacy);
      const response = platformResponse || await legacyWorker.fetch(request, env, ctx);
      await sendFetchResponse(res, response, req.method);
    } catch (error) {
      if (!error.statusCode || error.statusCode >= 500) console.error("[http]", error);
      if (!res.headersSent) {
        const status = error.statusCode || 500;
        res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ error: status === 500 ? "Internal Server Error" : error.message }));
      } else {
        res.destroy();
      }
    }
  });

  server.on("upgrade", async (req, socket, head) => {
    try {
      if (!schemaReady) return rejectUpgrade(socket, 503, "Service Unavailable");
      const url = externalUrl(req, env);
      if (!url.pathname.startsWith("/stream/PANEL_ZEUS/")) return rejectUpgrade(socket, 404, "Not Found");
      const request = await toFetchRequest(req, env, false);
      wss.handleUpgrade(req, socket, head, (webSocket) => {
        webSocket.accept = () => {};
        webSocket.binaryType = "arraybuffer";
        wss.emit("connection", webSocket, req);
        legacy.handlevIees(env, null, ctx, request, webSocket).catch((error) => {
          console.error("[websocket]", error);
          webSocket.close(1011, "Internal Server Error");
        });
      });
    } catch (error) {
      console.error("[upgrade]", error);
      rejectUpgrade(socket, 500, "Internal Server Error");
    }
  });

  server.on("clientError", (_error, socket) => rejectUpgrade(socket, 400, "Bad Request"));
  const scheduler = schedulers ? startSchedulers({ pool, env, ctx, legacy }) : null;

  return {
    server,
    wss,
    env,
    tasks,
    async listen(port = Number(env.PORT || 3000), host = "0.0.0.0") {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve();
        });
      });
      return server.address();
    },
    async shutdown({ endPool = false } = {}) {
      schemaReady = false;
      const serverClosed = new Promise((resolve) => server.close(resolve));
      server.closeIdleConnections?.();
      await scheduler?.stop();
      for (const client of wss.clients) client.close(1012, "Service restart");
      wss.close();
      await closeAllSockets();
      await legacy.flushExpiredTraffic(env).catch((error) => console.error("[shutdown flush]", error));
      await tasks.drain(Math.min(Number(env.SHUTDOWN_TIMEOUT_MS || 25_000), 10_000));
      await serverClosed;
      if (endPool) await pool.end();
    },
  };
}

async function main() {
  try {
    if (process.env.NODE_ENV !== "production") process.loadEnvFile?.();
  } catch {}
  const pool = createPool();
  const app = await createZeusServer({ pool });
  const port = Number(process.env.PORT || 3000);
  await app.listen(port, "0.0.0.0");
  console.log(`ZEUS PANEL listening on 0.0.0.0:${port}`);

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received; shutting down`);
    const hardStop = setTimeout(() => process.exit(1), Number(process.env.SHUTDOWN_TIMEOUT_MS || 25_000));
    hardStop.unref?.();
    await app.shutdown({ endPool: true });
    clearTimeout(hardStop);
    process.exit(0);
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
