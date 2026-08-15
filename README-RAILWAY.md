# ZEUS PANEL on Railway

This project ports the existing ZEUS PANEL v1.11.4 Worker application to a persistent Node.js service while retaining the original panel HTML, Persian RTL interface, user fields, route contracts, subscription format, proxy formats, smart buffering, and raw VLESS-over-WebSocket transport.

## Architecture mapping

| Cloudflare runtime | Railway implementation |
| --- | --- |
| Worker `fetch()` | Node `http` server and WHATWG Request/Response bridge |
| `cloudflare:sockets.connect()` | `node:net` / `node:tls` Web Stream adapter with drain-based backpressure |
| `WebSocketPair` | `ws` no-server HTTP upgrade handling |
| D1 | PostgreSQL through a narrow D1 compatibility adapter |
| `ctx.waitUntil()` | Tracked background task manager with shutdown draining |
| `caches.default` | Bounded in-process TTL cache |
| request-triggered reset/rotation | Persistent scheduler with PostgreSQL advisory locks |
| Cloudflare GraphQL request totals | Application request counters; JSON field names remain `cfRequestsToday` and `cfRequestsTotal` |
| Worker update/restart | Railway GraphQL deploy/restart controls, with optional GitHub workflow dispatch |
| `CF-Connecting-IP` | Trusted-proxy helper using Railway forwarding headers with socket fallback |

The original monolithic UI and application logic remain in `Source.js`. Railway-specific behavior is isolated under `src/` to minimize frontend and subscription regressions.

## Deploy to Railway

1. Push this project to a GitHub repository.
2. Create a new project in the [Railway dashboard](https://railway.com/new).
3. Add a PostgreSQL service to the project.
4. Add this GitHub repository as a service and select the intended deployment branch.
5. In the ZEUS service variables, set `DATABASE_URL` to a reference to the PostgreSQL service's `DATABASE_URL`, such as `${{Postgres.DATABASE_URL}}`.
6. Set `SESSION_SECRET` to a long random value. Also set `PANEL_RECOVERY_TOKEN` if Railway-native password recovery is wanted.
7. Optionally set `PUBLIC_BASE_URL=https://your-domain.example`. When omitted, ZEUS validates and uses Railway's forwarded public host.
8. For panel restart/update controls, set `RAILWAY_TOKEN` and use the Railway-provided `RAILWAY_SERVICE_ID`, `RAILWAY_ENVIRONMENT_ID`, and `RAILWAY_DEPLOYMENT_ID`. Set `RAILWAY_TOKEN_TYPE=project` for a project token; account/workspace tokens use `account`.
9. Generate a Railway public domain in the service Networking settings.
10. Confirm the health-check path is `/healthz`. The included `railway.toml` sets this automatically.
11. Deploy. Railway runs `npm run migrate` before `npm start`.
12. Open `https://your-domain/panel`.
13. Create the initial panel password.

Railway services linked to a GitHub repository can autodeploy new commits from the configured branch. Railway documents the current behavior in [GitHub autodeploys](https://docs.railway.com/deployments/github-autodeploys). The included config follows Railway's current [config-as-code reference](https://docs.railway.com/config-as-code/reference), and API controls use the documented [GraphQL endpoint](https://docs.railway.com/integrations/api).

## Custom domains

Add the domain in the ZEUS service Networking settings, configure the DNS records Railway displays, and wait for certificate issuance. Then set `PUBLIC_BASE_URL=https://panel.example.com` so subscription host/SNI generation is deterministic. Railway terminates public TLS; the Node process continues listening on plain HTTP at `0.0.0.0:$PORT`.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Railway PostgreSQL connection string |
| `PORT` | Injected | Internal HTTP port; defaults to `3000` locally |
| `SESSION_SECRET` | Yes | Deployment secret reserved for secure session evolution |
| `PUBLIC_BASE_URL` | No | Explicit public HTTPS origin for subscriptions and origin checks |
| `PANEL_RECOVERY_TOKEN` | Recommended | Replaces Cloudflare-account ownership recovery |
| `TRUST_PROXY` | Railway default | Enables trusted forwarded-host/client-IP handling |
| `MAX_JSON_BODY_BYTES` | No | JSON body limit; default 1 MiB |
| `MAX_WEBSOCKET_FRAME_BYTES` | No | WebSocket frame limit; default 1 MiB |
| `SHUTDOWN_TIMEOUT_MS` | No | Graceful shutdown ceiling; default 25 seconds |
| `DNS_SERVER`, `DNS_PORT` | No | TCP DNS upstream; defaults to `8.8.4.4:53` |
| `RAILWAY_EDGE_PORT_MAPPING` | No | Maps saved Cloudflare edge ports to public 443/80 in generated Railway links; default enabled |
| `RAILWAY_TOKEN` | No | Railway API token for restart/update actions |
| `RAILWAY_TOKEN_TYPE` | No | `account` or `project` token header mode |
| `RAILWAY_SERVICE_ID` | No | Railway-provided service identifier |
| `RAILWAY_ENVIRONMENT_ID` | No | Railway-provided environment identifier |
| `RAILWAY_DEPLOYMENT_ID` | No | Railway-provided current deployment identifier |
| `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_WORKFLOW_ID`, `GITHUB_BRANCH` | No | Optional workflow-dispatch update path |
| `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `WORKER_NAME` | No | Optional legacy Cloudflare integrations only |

Do not commit real values. Use `.env.example` as the key list and Railway Variables for deployment secrets.

## PostgreSQL schema

Migration `migrations/001_initial.sql` creates:

- `users`, retaining all ZEUS fields including quota, device/IP, DNS filtering, fragmentation metadata, proxy, reset, and rotation fields;
- `settings`, retaining the existing key/value model and `panel_password` compatibility;
- `sessions`, available for session-token evolution without changing the `panel_session` cookie contract;
- `runtime_statistics`, for persistent runtime counters;
- `schema_migrations`, for transactional migration tracking.

Usernames have a case-insensitive unique index, UUIDs are indexed, and `port` is text so legacy comma-separated port values remain importable.

## Import an existing ZEUS backup

The panel's existing JSON export/import flow remains compatible. For a server-side transactional import:

```bash
npm run import:d1 -- ./zeus_backup.json
```

Add `--replace` to clear current users/settings inside the same transaction before importing. The importer accepts the panel format (`{ users, settings }`) and legacy top-level user arrays. An invalid row rolls back the complete import.

## External ports and TLS

Railway's public HTTP service exposes HTTPS/WSS through its TLS terminator. Saved ZEUS `port` values remain unchanged in PostgreSQL. During subscription generation, Cloudflare TLS edge ports map to public `443`, and non-TLS edge ports map to `80`. Set `RAILWAY_EDGE_PORT_MAPPING=0` only when a custom networking setup really exposes the saved ports.

The application itself always listens on:

```js
const port = Number(process.env.PORT || 3000);
server.listen(port, "0.0.0.0");
```

## Operational notes and platform differences

- Run one Railway replica. Live connection maps, batched byte counters, login throttles, and DNS caches are process-local by design; durable user/settings data is PostgreSQL-backed.
- `frag_len` and `frag_int` retain their original behavior: they change the client fragment parameter in subscription links. The server-side data path separately retains ZEUS's adaptive smart-buffering and backpressure behavior.
- `cfRequestsToday` and `cfRequestsTotal` keep their names for frontend compatibility but count ZEUS application requests on Railway.
- `/api/recover` now validates `PANEL_RECOVERY_TOKEN`; it does not require a Cloudflare account.
- `/api/update-panel` redeploys the configured Railway service or dispatches an explicitly configured GitHub workflow. It never edits the ephemeral running filesystem.
- `/api/restart-core` uses Railway's deployment restart mutation. Missing credentials produce a helpful JSON error.
- `ips.txt`, `proxy/`, `proxy_vip/`, `vip-list`, `zeus-relay.sh`, and `zeus-scanner.txt` remain bundled in the image.
- Railway public TLS does not reproduce Cloudflare's global edge network or its complete alternate-edge-port behavior; the compatibility mapping isolates this unavoidable difference.

## Local validation

Use a real PostgreSQL connection for normal development:

```bash
npm install
npm run migrate
npm test
npm start
```

For schema/start smoke checks only, the development dependency supports `DATABASE_URL=pgmem://local`. It is rejected when `NODE_ENV=production` and is not a persistence substitute.

The automated suite covers migrations, the D1 adapter, setup/login/logout-compatible sessions, users CRUD, subscriptions by username and UUID, status pages, backup normalization/settings, proxy parsing, a SOCKS5 handshake, quota resets, IP rotation, static data, VLESS parsing and UUID authentication, request/device limits, traffic accounting, persistence across restart, and actual WebSocket → VLESS → TCP echo transfer for IPv4, domains, and IPv6.
