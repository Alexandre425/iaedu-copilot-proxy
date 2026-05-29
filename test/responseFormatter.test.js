import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createToolCallParser,
  extractDeltaFromEvent,
  finalizeToolCallParser,
  ingestToolCallText,
  splitJsonObjects,
  splitSseEvents,
} from "../src/responseFormatter.js";

test("splitSseEvents returns remainder", () => {
  const result = splitSseEvents("data: hello\n\npartial");
  assert.deepEqual(result.events, ["data: hello"]);
  assert.equal(result.remainder, "partial");
});

test("extractDeltaFromEvent handles data lines", () => {
  const result = extractDeltaFromEvent("data: hello");
  assert.equal(result.text, "hello");
});

test("extractDeltaFromEvent handles json payload", () => {
  const result = extractDeltaFromEvent('data: {"text":"hi"}');
  assert.equal(result.text, "hi");
});

test("extractDeltaFromEvent handles IAEdu token json", () => {
  const result = extractDeltaFromEvent('{"type":"token","content":"Hello"}');
  assert.equal(result.text, "Hello");
});

test("extractDeltaFromEvent handles IAEdu message json", () => {
  const result = extractDeltaFromEvent(
    '{"type":"message","content":{"content":"Hello!"}}'
  );
  assert.equal(result.text, "Hello!");
});

test("extractDeltaFromEvent handles IAEdu done json", () => {
  const result = extractDeltaFromEvent('{"type":"done","content":"id"}');
  assert.equal(result.done, true);
});

test("splitJsonObjects handles concatenated objects", () => {
  const payload =
    '{"type":"token","content":"Hi"}{"type":"token","content":"!"}';
  const result = splitJsonObjects(payload);
  assert.equal(result.events.length, 2);
  assert.equal(result.events[0].content, "Hi");
  assert.equal(result.events[1].content, "!");
  assert.equal(result.remainder, "");
});

test("tool call parser yields text and tool call segments", () => {
  const parser = createToolCallParser();
  const outputs = ingestToolCallText(
    parser,
    'Hello <tool_call>{"name":"read_file","arguments":{"path":"a"}}</tool_call> done'
  );

  assert.equal(outputs.length, 3);
  assert.equal(outputs[0].type, "text");
  assert.equal(outputs[1].type, "tool_call");
  assert.equal(outputs[1].toolCall.name, "read_file");
  assert.equal(outputs[2].type, "text");
});

test("tool call parser handles partial markers", () => {
  const parser = createToolCallParser();
  const first = ingestToolCallText(parser, "Hello <tool_");
  const second = ingestToolCallText(
    parser,
    'call>{"name":"echo","arguments":{}}</tool_call>'
  );
  const final = finalizeToolCallParser(parser);

  assert.equal(first.length, 1);
  assert.equal(first[0].type, "text");
  assert.equal(second.length, 1);
  assert.equal(second[0].type, "tool_call");
  assert.equal(final.length, 0);
});

test("tool call parser reports malformed json", () => {
  const parser = createToolCallParser();
  const outputs = ingestToolCallText(parser, "<tool_call>not json</tool_call>");

  assert.equal(outputs.length, 1);
  assert.equal(outputs[0].type, "tool_call");
  assert.equal(outputs[0].toolCall, null);
  assert.equal(outputs[0].error, "malformed json");
});

test("tool call parser recovers extra trailing brace", () => {
  const parser = createToolCallParser();
  const outputs = ingestToolCallText(
    parser,
    '<tool_call>{"name":"list_dir","arguments":{"path":"/tmp"}}}</tool_call>'
  );

  assert.equal(outputs.length, 1);
  assert.equal(outputs[0].type, "tool_call");
  assert.equal(outputs[0].toolCall.name, "list_dir");
  assert.equal(outputs[0].error, null);
});
