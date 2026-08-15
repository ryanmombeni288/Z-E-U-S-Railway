import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import WebSocket from "ws";
import { startTestApp, jsonRequest, setupAndLogin } from "./support.js";

const UUID = "22222222-2222-2222-2222-abcdef123456";

function uuidBytes(uuid) {
  return Buffer.from(uuid.replaceAll("-", ""), "hex");
}

function vlessFrame({ uuid = UUID, host, port, command = 1, payload = Buffer.alloc(0) }) {
  let address;
  let type;
  if (net.isIPv4(host)) {
    type = 1;
    address = Buffer.from(host.split(".").map(Number));
  } else if (net.isIPv6(host)) {
    type = 3;
    const parts = host.split(":");
    const omitted = 8 - parts.filter(Boolean).length;
    const expanded = [];
    for (const part of parts) {
      if (part === "") {
        if (!expanded.includes(null)) expanded.push(null, ...Array(omitted).fill("0"));
      } else expanded.push(part);
    }
    address = Buffer.alloc(16);
    expanded.filter((part) => part !== null).slice(0, 8).forEach((part, index) => address.writeUInt16BE(parseInt(part || "0", 16), index * 2));
  } else {
    type = 2;
    const domain = Buffer.from(host);
    address = Buffer.concat([Buffer.from([domain.length]), domain]);
  }
  const header = Buffer.alloc(1 + 16 + 1 + 1 + 2 + 1);
  let offset = 0;
  header[offset++] = 0;
  uuidBytes(uuid).copy(header, offset); offset += 16;
  header[offset++] = 0;
  header[offset++] = command;
  header.writeUInt16BE(port, offset); offset += 2;
  header[offset] = type;
  return Buffer.concat([header, address, payload]);
}

function openWebSocket(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers });
    socket.binaryType = "arraybuffer";
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function nextMessage(socket, timeout = 3_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for WebSocket data")), timeout);
    socket.once("message", (data) => {
      clearTimeout(timer);
      resolve(Buffer.from(data));
    });
    socket.once("close", () => {
      clearTimeout(timer);
      reject(new Error("WebSocket closed before returning data"));
    });
  });
}

function waitForClose(socket, timeout = 3_000) {
  return new Promise((resolve, reject) => {
    if (socket.readyState === WebSocket.CLOSED) return resolve();
    const timer = setTimeout(() => reject(new Error("Timed out waiting for WebSocket close")), timeout);
    socket.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function listenEcho(host = "127.0.0.1") {
  const server = net.createServer((socket) => socket.pipe(socket));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, resolve);
  });
  return server;
}

test("raw WebSocket -> VLESS -> TCP streams data for IPv4 and domains", async () => {
  const echo = await listenEcho();
  const targetPort = echo.address().port;
  const instance = await startTestApp();
  try {
    const cookie = await setupAndLogin(instance.baseUrl);
    const created = await jsonRequest(`${instance.baseUrl}/api/users`, {
      cookie,
      body: { username: "streamer", uuid: UUID, port: "443", tls: "tls", ip_limit: 3, limit_req: 100 },
    });
    assert.equal(created.data.success, true);

    for (const destination of ["127.0.0.1", "localhost"]) {
      const socket = await openWebSocket(`${instance.wsUrl}/stream/PANEL_ZEUS/abcdef123456`, { "CF-Connecting-IP": "198.51.100.10" });
      const responsePromise = nextMessage(socket);
      socket.send(vlessFrame({ host: destination, port: targetPort, payload: Buffer.from(`echo-${destination}`) }));
      const response = await responsePromise;
      assert.equal(response[0], 0);
      assert.equal(response[1], 0);
      assert.equal(response.subarray(2).toString(), `echo-${destination}`);
      socket.close();
      await waitForClose(socket);
    }

    await new Promise((resolve) => setTimeout(resolve, 80));
    const row = (await instance.pool.query("SELECT used_gb, used_req FROM users WHERE username = 'streamer'")).rows[0];
    assert.ok(Number(row.used_gb) > 0);
    assert.ok(Number(row.used_req) >= 2);
  } finally {
    await instance.app.shutdown({ endPool: true });
    await new Promise((resolve) => echo.close(resolve));
  }
});

test("UUID authentication, request limits, and IP limits close unauthorized streams", async () => {
  const echo = await listenEcho();
  const targetPort = echo.address().port;
  const instance = await startTestApp();
  try {
    const cookie = await setupAndLogin(instance.baseUrl);
    await jsonRequest(`${instance.baseUrl}/api/users`, {
      cookie,
      body: { username: "limited", uuid: UUID, port: "443", tls: "tls", ip_limit: 1, limit_req: 10 },
    });

    const first = await openWebSocket(`${instance.wsUrl}/stream/PANEL_ZEUS/abcdef123456`, { "CF-Connecting-IP": "198.51.100.10" });
    first.send(vlessFrame({ host: "127.0.0.1", port: targetPort, payload: Buffer.from("one") }));
    assert.equal((await nextMessage(first)).subarray(2).toString(), "one");
    await new Promise((resolve) => setTimeout(resolve, 80));

    const second = await openWebSocket(`${instance.wsUrl}/stream/PANEL_ZEUS/abcdef123456`, { "CF-Connecting-IP": "203.0.113.10" });
    second.send(vlessFrame({ host: "127.0.0.1", port: targetPort, payload: Buffer.from("two") }));
    await waitForClose(second);

    const invalid = await openWebSocket(`${instance.wsUrl}/stream/PANEL_ZEUS/000000000000`, { "CF-Connecting-IP": "192.0.2.10" });
    invalid.send(vlessFrame({ uuid: "00000000-0000-0000-0000-000000000000", host: "127.0.0.1", port: targetPort }));
    await waitForClose(invalid);

    first.close();
    await waitForClose(first);
    await instance.pool.query("UPDATE users SET used_req = 10, limit_req = 10, active_ips = NULL WHERE username = 'limited'");
    const requestsExceeded = await openWebSocket(`${instance.wsUrl}/stream/PANEL_ZEUS/abcdef123456`, { "CF-Connecting-IP": "198.18.0.1" });
    requestsExceeded.send(vlessFrame({ host: "127.0.0.1", port: targetPort }));
    await waitForClose(requestsExceeded);
  } finally {
    await instance.app.shutdown({ endPool: true });
    await new Promise((resolve) => echo.close(resolve));
  }
});

test("IPv6 destinations stream when the host supports IPv6 loopback", async (t) => {
  let echo;
  try {
    echo = await listenEcho("::1");
  } catch {
    t.skip("IPv6 loopback is unavailable on this host");
    return;
  }
  const instance = await startTestApp();
  try {
    const cookie = await setupAndLogin(instance.baseUrl);
    await jsonRequest(`${instance.baseUrl}/api/users`, { cookie, body: { username: "ipv6", uuid: UUID, port: "443", tls: "tls" } });
    const socket = await openWebSocket(`${instance.wsUrl}/stream/PANEL_ZEUS/abcdef123456`, { "CF-Connecting-IP": "2001:db8:1::10" });
    socket.send(vlessFrame({ host: "::1", port: echo.address().port, payload: Buffer.from("ipv6") }));
    assert.equal((await nextMessage(socket)).subarray(2).toString(), "ipv6");
    socket.close();
    await waitForClose(socket);
  } finally {
    await instance.app.shutdown({ endPool: true });
    await new Promise((resolve) => echo.close(resolve));
  }
});

test("VLESS DNS command forwards framed DNS bytes over TCP", async () => {
  const dns = net.createServer((socket) => socket.on("data", (chunk) => socket.write(chunk)));
  await new Promise((resolve, reject) => {
    dns.once("error", reject);
    dns.listen(0, "127.0.0.1", resolve);
  });
  const instance = await startTestApp({ env: { DNS_SERVER: "127.0.0.1", DNS_PORT: String(dns.address().port) } });
  try {
    const cookie = await setupAndLogin(instance.baseUrl);
    await jsonRequest(`${instance.baseUrl}/api/users`, { cookie, body: { username: "dns", uuid: UUID, port: "443", tls: "tls" } });
    const socket = await openWebSocket(`${instance.wsUrl}/stream/PANEL_ZEUS/abcdef123456`, { "CF-Connecting-IP": "198.51.100.10" });
    const dnsFrame = Buffer.from([0, 4, 1, 2, 3, 4]);
    socket.send(vlessFrame({ host: "8.8.8.8", port: 53, command: 2, payload: dnsFrame }));
    const response = await nextMessage(socket);
    assert.deepEqual(response, Buffer.concat([Buffer.from([0, 0]), dnsFrame]));
    socket.close();
    await waitForClose(socket);
  } finally {
    await instance.app.shutdown({ endPool: true });
    await new Promise((resolve) => dns.close(resolve));
  }
});
