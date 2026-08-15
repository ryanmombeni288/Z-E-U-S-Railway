import net from "node:net";
import tls from "node:tls";

const activeSockets = new Set();

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function normalizePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TypeError("Invalid TCP port");
  }
  return port;
}

function toBytes(chunk) {
  if (chunk instanceof Uint8Array) return chunk;
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
  if (ArrayBuffer.isView(chunk)) {
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }
  return new Uint8Array(chunk);
}

export function connect(options) {
  const hostname = String(options?.hostname || "").trim();
  if (!hostname || hostname.includes("\0")) throw new TypeError("Invalid TCP hostname");
  const port = normalizePort(options?.port);
  const secure = options?.secureTransport === "on" || options?.tls === true;
  const openedState = deferred();
  const closedState = deferred();
  let openedSettled = false;
  let closedSettled = false;
  let readableController;

  const socket = secure
    ? tls.connect({ host: hostname, port, servername: net.isIP(hostname) ? undefined : hostname, rejectUnauthorized: options?.rejectUnauthorized !== false })
    : net.connect({ host: hostname, port, allowHalfOpen: options?.allowHalfOpen === true });

  activeSockets.add(socket);
  socket.setNoDelay(true);
  socket.setKeepAlive(true, 30_000);

  const connectTimeoutMs = Number(process.env.SOCKET_CONNECT_TIMEOUT_MS || 10_000);
  const connectTimer = setTimeout(() => {
    if (!openedSettled) socket.destroy(new Error("TCP connection timed out"));
  }, connectTimeoutMs);
  connectTimer.unref?.();

  const onOpen = () => {
    if (openedSettled) return;
    openedSettled = true;
    clearTimeout(connectTimer);
    openedState.resolve();
  };
  socket.once(secure ? "secureConnect" : "connect", onOpen);

  const readable = new ReadableStream({
    type: "bytes",
    start(controller) {
      readableController = controller;
      socket.on("data", (buffer) => {
        try {
          const copy = new Uint8Array(buffer.byteLength);
          copy.set(buffer);
          controller.enqueue(copy);
          if ((controller.desiredSize ?? 1) <= 0) socket.pause();
        } catch (error) {
          socket.destroy(error);
        }
      });
    },
    pull() {
      socket.resume();
    },
    cancel(reason) {
      socket.destroy(reason instanceof Error ? reason : undefined);
    },
  });

  const writable = new WritableStream({
    async write(chunk) {
      const bytes = toBytes(chunk);
      if (socket.destroyed || !socket.writable) throw new Error("Socket is closed");
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          socket.off("drain", onDrain);
          reject(error);
        };
        const onDrain = () => {
          socket.off("error", onError);
          resolve();
        };
        socket.once("error", onError);
        const accepted = socket.write(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), (error) => {
          if (accepted) {
            socket.off("error", onError);
            if (error) reject(error);
            else resolve();
          }
        });
        if (!accepted) socket.once("drain", onDrain);
      });
    },
    close() {
      return new Promise((resolve) => socket.end(resolve));
    },
    abort(reason) {
      socket.destroy(reason instanceof Error ? reason : undefined);
    },
  });

  socket.once("error", (error) => {
    clearTimeout(connectTimer);
    if (!openedSettled) {
      openedSettled = true;
      openedState.reject(error);
    }
    if (!closedSettled) {
      closedSettled = true;
      closedState.reject(error);
    }
    try {
      readableController?.error(error);
    } catch {}
  });

  socket.once("end", () => {
    try {
      readableController?.close();
    } catch {}
  });

  socket.once("close", () => {
    clearTimeout(connectTimer);
    activeSockets.delete(socket);
    if (!openedSettled) {
      openedSettled = true;
      openedState.reject(new Error("Socket closed before connecting"));
    }
    if (!closedSettled) {
      closedSettled = true;
      closedState.resolve();
    }
    try {
      readableController?.close();
    } catch {}
  });

  return {
    readable,
    writable,
    opened: openedState.promise,
    closed: closedState.promise,
    close() {
      socket.destroy();
    },
    get rawSocket() {
      return socket;
    },
  };
}

export async function closeAllSockets() {
  const closing = [];
  for (const socket of activeSockets) {
    closing.push(new Promise((resolve) => {
      socket.once("close", resolve);
      socket.destroy();
      setTimeout(resolve, 1_000).unref?.();
    }));
  }
  await Promise.allSettled(closing);
}

export function getActiveSocketCount() {
  return activeSockets.size;
}
