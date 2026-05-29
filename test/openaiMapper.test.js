import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildMessageWithTools,
  extractTooling,
  extractUserMessage,
} from "../src/openaiMapper.js";

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

test("extractTooling normalizes tools and tool results", () => {
  const tooling = extractTooling({
    tools: [
      {
        type: "function",
        function: {
          name: "read_file",
          description: "Read a file",
          parameters: { type: "object", properties: { path: { type: "string" } } },
        },
      },
    ],
    input: [
      {
        type: "function_call_output",
        name: "read_file",
        output: "file contents",
      },
    ],
  });

  assert.equal(tooling.tools.length, 1);
  assert.equal(tooling.tools[0].name, "read_file");
  assert.equal(tooling.toolResults.length, 1);
  assert.equal(tooling.toolResults[0].content, "file contents");
});

test("buildMessageWithTools injects tool definitions", () => {
  const message = buildMessageWithTools({
    userText: "hello",
    tools: [
      {
        name: "read_file",
        description: "Read a file",
        parameters: { type: "object", properties: { path: { type: "string" } } },
      },
    ],
    toolResults: [],
  });

  assert.ok(message.includes("<tool_call>"));
  assert.ok(message.includes("read_file"));
  assert.ok(message.includes("User: hello"));
});
