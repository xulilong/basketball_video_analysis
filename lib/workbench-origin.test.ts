import test from "node:test";
import assert from "node:assert/strict";
import { checkOrigin } from "./workbench-server";
test("accepts the browser's actual host when Next normalizes the URL", () => {
  assert.doesNotThrow(() =>
    checkOrigin(
      new Request("http://localhost:3001/api/videos", {
        headers: { host: "127.0.0.1:3001", origin: "http://127.0.0.1:3001" },
      })
    )
  );
});
test("rejects cross-origin requests and does not trust forwarded hosts", () => {
  assert.throws(() =>
    checkOrigin(
      new Request("http://localhost:3001/api/videos", {
        headers: {
          host: "127.0.0.1:3001",
          origin: "https://elsewhere.example",
          "x-forwarded-host": "elsewhere.example",
        },
      })
    )
  );
});
test("supports same-origin requests without a Host header and local CLI requests", () => {
  assert.doesNotThrow(() =>
    checkOrigin(
      new Request("http://localhost:3001/api/videos", {
        headers: { origin: "http://localhost:3001" },
      })
    )
  );
  assert.doesNotThrow(() =>
    checkOrigin(new Request("http://localhost:3001/api/videos"))
  );
});

test("configured HTTPS origin works behind a proxy without accepting forged origins", () => {
  const previous = process.env.BASKETBALL_PUBLIC_ORIGIN;
  process.env.BASKETBALL_PUBLIC_ORIGIN = "https://basketball.example.com";
  try {
    assert.doesNotThrow(() =>
      checkOrigin(
        new Request("http://app:3001/api/videos", {
          headers: {
            host: "basketball.example.com",
            origin: "https://basketball.example.com",
          },
        })
      )
    );
    for (const origin of [
      "https://elsewhere.example",
      "http://basketball.example.com",
      "null",
    ]) {
      assert.throws(() =>
        checkOrigin(
          new Request("http://app:3001/api/videos", {
            headers: {
              origin,
              "x-forwarded-host": "basketball.example.com",
              "x-forwarded-proto": "https",
            },
          })
        )
      );
    }
    process.env.BASKETBALL_PUBLIC_ORIGIN =
      "https://basketball.example.com/path";
    assert.throws(() => checkOrigin(new Request("http://app:3001/api/videos")));
  } finally {
    if (previous === undefined) delete process.env.BASKETBALL_PUBLIC_ORIGIN;
    else process.env.BASKETBALL_PUBLIC_ORIGIN = previous;
  }
});
