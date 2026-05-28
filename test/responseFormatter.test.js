import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractDeltaFromEvent,
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
