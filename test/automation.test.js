import test from "node:test";
import assert from "node:assert/strict";
import { checkAutoResets, checkAutoRotates } from "../Source.js";
import { startTestApp, jsonRequest, setupAndLogin } from "./support.js";

test("automatic quota resets and clean-IP rotation persist in PostgreSQL", async () => {
  const instance = await startTestApp();
  try {
    const cookie = await setupAndLogin(instance.baseUrl);
    const created = await jsonRequest(`${instance.baseUrl}/api/users`, {
      cookie,
      body: {
        username: "automation",
        uuid: "33333333-3333-3333-3333-333333333333",
        used_gb: 4,
        used_req: 99,
        auto_reset_vol_days: 1,
        auto_reset_req_days: 1,
        auto_rotate_ip: 1,
        rotate_time: 1,
        ip_operator: "all",
        ip_count: 3,
        port: "443",
        tls: "tls",
      },
    });
    assert.equal(created.data.success, true);
    await instance.pool.query("UPDATE users SET last_reset_vol_time = 0, last_reset_req_time = 0, last_rotate_time = 0 WHERE username = 'automation'");

    const ctx = instance.app.tasks.context();
    await checkAutoResets(instance.app.env, ctx);
    await checkAutoRotates(instance.app.env, ctx);
    await instance.app.tasks.drain();

    const user = (await instance.pool.query("SELECT used_gb, used_req, ips, last_rotate_time FROM users WHERE username = 'automation'")).rows[0];
    assert.equal(Number(user.used_gb), 0);
    assert.equal(Number(user.used_req), 0);
    assert.equal(String(user.ips).trim().split("\n").length, 3);
    assert.ok(Number(user.last_rotate_time) > 0);
  } finally {
    await instance.app.shutdown({ endPool: true });
  }
});

test("required static proxy and scanner data is packaged", async () => {
  const instance = await startTestApp();
  try {
    for (const file of ["ips.txt", "vip-list", "proxy/US.txt", "proxy_vip/US.txt", "zeus-scanner.txt"]) {
      const response = await globalThis.__ZEUS_STATIC_READ__(file);
      assert.equal(response.ok, true, file);
      assert.ok((await response.arrayBuffer()).byteLength > 0, file);
    }
  } finally {
    await instance.app.shutdown({ endPool: true });
  }
});
