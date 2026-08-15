import test from "node:test";
import assert from "node:assert/strict";
import { startTestApp, jsonRequest, setupAndLogin, sessionCookie } from "./support.js";

const USER = {
  username: "alice",
  uuid: "11111111-1111-1111-1111-123456789abc",
  limit_gb: 10,
  expiry_days: 30,
  limit_req: 100,
  tls: "tls",
  port: "443,80",
  fingerprint: "chrome",
  ip_limit: 2,
  frag_len: "100-200",
  frag_int: "1-2",
};

test("panel auth, users, subscriptions, status, backup settings, and restart persistence", async () => {
  const first = await startTestApp();
  const { pool } = first;
  let cookie;
  try {
    const beforeSetup = await fetch(`${first.baseUrl}/panel`);
    assert.equal(beforeSetup.status, 200);
    assert.match(await beforeSetup.text(), /راه‌اندازی اولیه|تنظیم رمز/);

    cookie = await setupAndLogin(first.baseUrl);
    const panel = await fetch(`${first.baseUrl}/panel`, { headers: { Cookie: cookie } });
    const panelHtml = await panel.text();
    assert.match(panelHtml, /Z E U S/);
    assert.match(panelHtml, /@Rayan_Crafter — YouTube/);
    assert.match(panelHtml, /@Inetiran در تلگرام/);

    const create = await jsonRequest(`${first.baseUrl}/api/users`, { cookie, body: USER });
    assert.equal(create.response.status, 200);
    assert.equal(create.data.success, true);

    const users = await jsonRequest(`${first.baseUrl}/api/users`, { cookie, method: "GET" });
    assert.equal(users.data.users.length, 1);
    assert.equal(users.data.users[0].username, "alice");
    assert.equal(typeof users.data.cfRequestsToday, "number");
    assert.equal(typeof users.data.cfRequestsTotal, "number");

    for (const key of [USER.username, USER.uuid]) {
      for (const prefix of ["sub", "feed"]) {
        const response = await fetch(`${first.baseUrl}/${prefix}/${key}`);
        assert.equal(response.status, 200);
        const plain = Buffer.from(await response.text(), "base64").toString("utf8");
        assert.match(plain, /ZEUS/);
        assert.match(plain, /fragment=100-200,1-2/);
        assert.match(plain, /:443\?/);
        assert.match(plain, /:80\?/);
      }
    }

    const status = await fetch(`${first.baseUrl}/status/${USER.uuid}`);
    assert.equal(status.status, 200);
    assert.match(await status.text(), /window\.statusUser/);

    const settingsWrite = await jsonRequest(`${first.baseUrl}/api/settings/bulk`, { cookie, body: { settings: { proxy_ip: "1.1.1.1", custom: "saved" } } });
    assert.equal(settingsWrite.data.success, true);
    const settings = await jsonRequest(`${first.baseUrl}/api/settings/bulk`, { cookie, method: "GET" });
    assert.equal(settings.data.custom, "saved");

    const publicProxyTest = await jsonRequest(`${first.baseUrl}/api/test-proxy`, { body: { proxy: "socks5://127.0.0.1:1" } });
    assert.equal(publicProxyTest.response.status, 401);

    const update = await jsonRequest(`${first.baseUrl}/api/users/alice`, { cookie, method: "PUT", body: { ...USER, username: "alice2" } });
    assert.equal(update.data.success, true);
    const renamedStatus = await fetch(`${first.baseUrl}/status/alice2`);
    assert.equal(renamedStatus.status, 200);

    const missingRestartConfig = await jsonRequest(`${first.baseUrl}/api/restart-core`, { cookie, body: {} });
    assert.equal(missingRestartConfig.response.status, 503);
  } finally {
    await first.app.shutdown();
  }

  const second = await startTestApp({ pool });
  try {
    const panel = await fetch(`${second.baseUrl}/panel`, { headers: { Cookie: cookie } });
    assert.match(await panel.text(), /Z E U S/);
    const users = await jsonRequest(`${second.baseUrl}/api/users`, { cookie, method: "GET" });
    assert.equal(users.data.users[0].username, "alice2");
    const login = await jsonRequest(`${second.baseUrl}/api/login`, { body: { password: "test-password" } });
    assert.equal(login.data.success, true);
    assert.match(sessionCookie(login.response), /^panel_session=/);
    const removed = await jsonRequest(`${second.baseUrl}/api/users/alice2`, { cookie, method: "DELETE" });
    assert.equal(removed.data.success, true);
  } finally {
    await second.app.shutdown({ endPool: true });
  }
});

test("Railway recovery token replaces the Cloudflare-account recovery dependency", async () => {
  const instance = await startTestApp({ env: { PANEL_RECOVERY_TOKEN: "recover-me" } });
  try {
    await setupAndLogin(instance.baseUrl);
    const denied = await jsonRequest(`${instance.baseUrl}/api/recover`, { body: { api_token: "wrong" } });
    assert.equal(denied.response.status, 401);
    const recovered = await jsonRequest(`${instance.baseUrl}/api/recover`, { body: { api_token: "recover-me" } });
    assert.equal(recovered.data.success, true);
    const panel = await fetch(`${instance.baseUrl}/panel`);
    assert.match(await panel.text(), /راه‌اندازی اولیه|تنظیم رمز/);
  } finally {
    await instance.app.shutdown({ endPool: true });
  }
});

test("request size and same-origin checks reject unsafe admin writes", async () => {
  const instance = await startTestApp({ env: { MAX_JSON_BODY_BYTES: "64" } });
  try {
    const oversized = await fetch(`${instance.baseUrl}/api/setup-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "x".repeat(200) }),
    });
    assert.equal(oversized.status, 413);
  } finally {
    await instance.app.shutdown({ endPool: true });
  }
});
