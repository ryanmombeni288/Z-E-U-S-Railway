# ZEUS Railway Compatibility Audit

## Route inventory

- `GET /`
- `GET /panel`
- `GET /login`
- `GET /sub/:usernameOrUuid`
- `GET /feed/:usernameOrUuid`
- `GET /status/:usernameOrUuid`
- `POST /api/setup-password`
- `POST /api/login`
- `POST /api/logout`
- `POST /api/recover`
- `POST /api/change-password`
- `GET|POST /api/settings/bulk`
- `GET|POST /api/proxy-ip`
- `POST /api/test-proxy`
- `GET|POST /api/users`
- `PUT|DELETE /api/users/:username`
- `POST /api/auto-update-setup`
- `POST /api/update-panel`
- `POST /api/restart-core`
- `GET /healthz` (Railway addition)
- `GET /stream/PANEL_ZEUS/:uuidSuffix[/loc-N]` with WebSocket upgrade

## Database inventory

The source contains settings selects/upserts/deletes; users create/read/update/delete; quota/reset/rotation updates; active-IP/last-active updates; batched traffic/request accounting; schema creation; SQLite `PRAGMA table_info`; and case-insensitive username comparisons. The adapter explicitly translates only the known SQLite differences: placeholders, `INSERT OR REPLACE` on `settings`, the users `AUTOINCREMENT` DDL, `PRAGMA table_info(users)`, and username `COLLATE NOCASE`.

## User fields retained

`id`, `username`, `uuid`, `limit_gb`, `expiry_days`, `ips`, `connection_type`, `tls`, `port`, `used_gb`, `is_active`, `last_active`, `created_at`, `fingerprint`, `max_connections`, `limit_req`, `used_req`, `ip_limit`, `active_ips`, `block_porn`, `block_ads`, `frag_len`, `frag_int`, `lifetime_used_gb`, `user_proxy_ip`, `user_proxy_iata`, `user_socks5`, `auto_reset_vol_days`, `auto_reset_req_days`, `last_reset_vol_time`, `last_reset_req_time`, `auto_rotate_ip`, `rotate_time`, `ip_operator`, `ip_count`, `last_rotate_time`, and `auto_rotate_user_proxy`.

## Process state retained

`GLOBAL_TRAFFIC_CACHE`, `ACTIVE_CONNECTIONS_COUNT`, `GLOBAL_LAST_ACTIVE_WRITE`, `GLOBAL_LAST_DB_WRITE`, `GLOBAL_WRITE_LOCK`, `DNS_CACHE`, `USER_REQ_CACHE`, `LOGIN_ATTEMPTS`, request counters, automatic-reset timestamps, automatic-rotation timestamps, and VIP-country caching remain single-process state. Railway deployment guidance therefore specifies one replica.

## Networking inventory

- raw WebSocket frames (no Socket.IO);
- VLESS UUID/header/address parsing for IPv4, domain, and IPv6;
- TCP streaming with bounded queues and WebSocket backpressure;
- TCP DNS forwarding and DoH filtering;
- SOCKS4/SOCKS4a, SOCKS5 with optional username/password, HTTP CONNECT, and HTTPS CONNECT proxy transport;
- direct routing, per-location proxy selection, failed-proxy replacement, active-IP/device enforcement, request/traffic/expiry enforcement, and cleanup accounting;
- private/local destination and risky-port blocking in production.

## Cloudflare primitive disposition

- `cloudflare:sockets`: replaced by `src/compat/sockets.js`.
- `WebSocketPair`: bypassed by Node HTTP upgrade + `ws`; the legacy branch remains for source compatibility only.
- D1/`env.DB`: provided by the PostgreSQL D1 adapter.
- `caches.default`: installed as a bounded TTL cache.
- `ctx.waitUntil`: tracked background-task context.
- request-lifecycle automation: disabled under Node; persistent scheduler owns resets/rotation.
- Cloudflare GraphQL usage: application request counters retain frontend field names.
- Worker update/restart/recovery: Railway/GitHub controls and an environment recovery token.
- `CF-Connecting-IP`: normalized by a trusted-proxy helper before entering legacy code.
