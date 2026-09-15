import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  accountChannel,
  notifyAccountChange,
  accountRequest,
} from "./account-client";

test("unsupported cross-tab notifications cannot prevent authentication", () => {
  const original = globalThis.BroadcastChannel;
  try {
    Object.defineProperty(globalThis, "BroadcastChannel", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    assert.equal(accountChannel(), null);
    assert.doesNotThrow(notifyAccountChange);
    Object.defineProperty(globalThis, "BroadcastChannel", {
      configurable: true,
      writable: true,
      value: class {
        constructor() {
          throw new Error("disabled");
        }
      },
    });
    assert.equal(accountChannel(), null);
    assert.doesNotThrow(notifyAccountChange);
  } finally {
    Object.defineProperty(globalThis, "BroadcastChannel", {
      configurable: true,
      writable: true,
      value: original,
    });
  }
});
test("authentication times out for stalled headers/body and can subsequently reconnect", async () => {
  const original = globalThis.fetch;
  let mode = "headers";
  const server = createServer((req, res) => {
    if (mode === "headers") return;
    res.writeHead(200, { "Content-Type": "application/json" });
    if (mode === "body") {
      res.write("{");
      return;
    }
    res.end(JSON.stringify({ user: null }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address() as { port: number };
  globalThis.fetch = (input, opts) =>
    original(`http://127.0.0.1:${address.port}${input}`, opts);
  try {
    await assert.rejects(accountRequest(undefined, 40), /连接超时/);
    mode = "body";
    await assert.rejects(accountRequest(undefined, 40), /连接超时/);
    mode = "ok";
    assert.deepEqual(await accountRequest(undefined, 1000), { user: null });
  } finally {
    globalThis.fetch = original;
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
