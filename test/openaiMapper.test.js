import assert from "node:assert/strict";
import { test } from "node:test";
import { extractUserMessage } from "../src/openaiMapper.js";

test("extractUserMessage handles string input", () => {
  const result = extractUserMessage("hello");
  assert.equal(result.text, "hello");
});

test("extractUserMessage prefers last user message", () => {
  const result = extractUserMessage([
    { role: "user", content: "first" },
    { role: "assistant", content: "skip" },
    { role: "user", content: "second" },
  ]);
  assert.equal(result.text, "second");
});

test("extractUserMessage joins text parts", () => {
  const result = extractUserMessage([
    {
      role: "user",
      content: [
        { type: "input_text", text: "hello" },
        { type: "input_text", text: "world" },
      ],
    },
  ]);
  assert.equal(result.text, "hello\nworld");
});
