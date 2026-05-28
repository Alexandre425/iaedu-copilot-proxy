import assert from "node:assert/strict";
import { test } from "node:test";
import { buildStreamUrl } from "../src/iaeduClient.js";

test("buildStreamUrl appends /stream", () => {
  assert.equal(buildStreamUrl("https://example.com"), "https://example.com/stream");
});

test("buildStreamUrl keeps /stream", () => {
  assert.equal(buildStreamUrl("https://example.com/stream"), "https://example.com/stream");
});
