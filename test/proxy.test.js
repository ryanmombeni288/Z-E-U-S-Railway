import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { connectSocks5 } from "../Source.js";

async function listenSocks5() {
  const server = net.createServer((socket) => {
    let state = 0;
    socket.on("data", (chunk) => {
      if (state === 0) {
        state = 1;
        socket.write(Buffer.from([5, 0]));
      } else if (state === 1) {
        state = 2;
        socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
      } else {
        socket.write(chunk);
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server;
}

test("SOCKS5 handshake, destination request, and tunneled bytes work end to end", async () => {
  const server = await listenSocks5();
  const port = server.address().port;
  let socket;
  try {
    socket = await connectSocks5(`127.0.0.1:${port}`, "example.com", 443, Buffer.from("through-socks"));
    const reader = socket.readable.getReader();
    const result = await reader.read();
    assert.equal(Buffer.from(result.value).toString(), "through-socks");
    reader.releaseLock();
  } finally {
    socket?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
