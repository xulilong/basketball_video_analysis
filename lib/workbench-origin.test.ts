import test from "node:test";
import assert from "node:assert/strict";
import { checkOrigin } from "./workbench-server";
test("accepts the browser's actual host when Next normalizes the URL", () => {
  assert.doesNotThrow(() => checkOrigin(new Request("http://localhost:3001/api/videos", { headers: { host: "127.0.0.1:3001", origin: "http://127.0.0.1:3001" } })));
});
test("rejects cross-origin requests and does not trust forwarded hosts", () => {
  assert.throws(() => checkOrigin(new Request("http://localhost:3001/api/videos", { headers: { host: "127.0.0.1:3001", origin: "https://elsewhere.example", "x-forwarded-host": "elsewhere.example" } })));
});
test("supports same-origin requests without a Host header and local CLI requests", () => {
  assert.doesNotThrow(() => checkOrigin(new Request("http://localhost:3001/api/videos", { headers: { origin: "http://localhost:3001" } })));
  assert.doesNotThrow(() => checkOrigin(new Request("http://localhost:3001/api/videos")));
});
