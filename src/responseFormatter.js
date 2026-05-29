import { randomUUID } from "node:crypto";

export function createResponseMetadata(model) {
  return {
    id: `resp_${randomUUID()}`,
    created: Math.floor(Date.now() / 1000),
    model: model || "unknown",
  };
}

export function createResponsesObject({ responseId, created, model, text }) {
  return {
    id: responseId,
    object: "response",
    created,
    model,
    output: [
      {
        id: `msg_${responseId}`,
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text,
          },
        ],
      },
    ],
    usage: {
      input_tokens: null,
      output_tokens: null,
      total_tokens: null,
    },
  };
}

export function createResponsesObjectWithOutput({ responseId, created, model, output }) {
  return {
    id: responseId,
    object: "response",
    created,
    model,
    output,
    usage: {
      input_tokens: null,
      output_tokens: null,
      total_tokens: null,
    },
  };
}

export function createChatCompletionObject({ responseId, created, model, text }) {
  return {
    id: responseId,
    object: "chat.completion",
    created,
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
    },
  };
}

export function writeSseEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

const TOOL_CALL_START = "<tool_call>";
const TOOL_CALL_END = "</tool_call>";

export function createToolCallParser() {
  return { buffer: "", inToolCall: false };
}

export function ingestToolCallText(parser, text) {
  if (!text) {
    return [];
  }

  parser.buffer += text;
  const outputs = [];

  while (parser.buffer.length > 0) {
    if (!parser.inToolCall) {
      const startIndex = parser.buffer.indexOf(TOOL_CALL_START);
      if (startIndex === -1) {
        const { safeText, remainder } = splitForToolStart(parser.buffer);
        if (safeText) {
          outputs.push({ type: "text", text: safeText });
        }
        parser.buffer = remainder;
        break;
      }

      if (startIndex > 0) {
        outputs.push({ type: "text", text: parser.buffer.slice(0, startIndex) });
      }

      parser.buffer = parser.buffer.slice(startIndex + TOOL_CALL_START.length);
      parser.inToolCall = true;
      continue;
    }

    const endIndex = parser.buffer.indexOf(TOOL_CALL_END);
    if (endIndex === -1) {
      break;
    }

    const raw = parser.buffer.slice(0, endIndex);
    outputs.push({
      type: "tool_call",
      raw,
      toolCall: parseToolCallPayload(raw),
    });

    parser.buffer = parser.buffer.slice(endIndex + TOOL_CALL_END.length);
    parser.inToolCall = false;
  }

  return outputs;
}

export function finalizeToolCallParser(parser) {
  const outputs = [];
  if (parser.inToolCall) {
    if (parser.buffer) {
      outputs.push({ type: "text", text: `${TOOL_CALL_START}${parser.buffer}` });
    }
    parser.buffer = "";
    parser.inToolCall = false;
    return outputs;
  }

  if (parser.buffer) {
    outputs.push({ type: "text", text: parser.buffer });
    parser.buffer = "";
  }

  return outputs;
}

export async function pipeIaeuToResponses({ iaeduResponse, res, responseId, created, model }) {
  const state = { seenToken: false };
  const parser = createToolCallParser();
  const outputItems = [];
  let messageItem = null;
  let messageText = "";
  let messageOutputIndex = null;
  writeSseEvent(res, "response.created", {
    id: responseId,
    object: "response",
    created,
    model,
  });

  const ensureMessageItem = () => {
    if (messageItem) {
      return;
    }

    messageOutputIndex = outputItems.length;
    messageItem = {
      id: `msg_${responseId}_${messageOutputIndex}`,
      type: "message",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: "",
        },
      ],
    };
    outputItems.push(messageItem);

    writeSseEvent(res, "response.output_item.added", {
      response_id: responseId,
      output_index: messageOutputIndex,
      item: messageItem,
    });
    writeSseEvent(res, "response.content_part.added", {
      response_id: responseId,
      output_index: messageOutputIndex,
      content_index: 0,
      item_id: messageItem.id,
      part: {
        type: "output_text",
        text: "",
      },
    });
  };

  const appendTextDelta = (text) => {
    if (!text) {
      return;
    }
    ensureMessageItem();
    messageText += text;
    writeSseEvent(res, "response.output_text.delta", {
      response_id: responseId,
      output_index: messageOutputIndex,
      content_index: 0,
      item_id: messageItem.id,
      delta: text,
    });
  };

  const finalizeMessageItem = () => {
    if (!messageItem) {
      return;
    }

    messageItem.content[0].text = messageText;
    writeSseEvent(res, "response.output_text.done", {
      response_id: responseId,
      output_index: messageOutputIndex,
      content_index: 0,
      text: messageText,
    });
    writeSseEvent(res, "response.content_part.done", {
      response_id: responseId,
      output_index: messageOutputIndex,
      content_index: 0,
      item_id: messageItem.id,
      part: {
        type: "output_text",
        text: messageText,
      },
    });
    writeSseEvent(res, "response.output_item.done", {
      response_id: responseId,
      output_index: messageOutputIndex,
      item: messageItem,
    });

    messageItem = null;
    messageText = "";
    messageOutputIndex = null;
  };

  const emitToolCall = (segment) => {
    finalizeMessageItem();

    if (!segment?.toolCall?.name) {
      const fallbackText = `${TOOL_CALL_START}${segment?.raw ?? ""}${TOOL_CALL_END}`;
      appendTextDelta(fallbackText);
      return;
    }

    const outputIndex = outputItems.length;
    const itemId = `fc_${responseId}_${outputIndex}`;
    const callId = `call_${randomUUID()}`;
    const argumentsJson = serializeToolArguments(segment.toolCall.arguments);
    const item = {
      id: itemId,
      type: "function_call",
      call_id: callId,
      name: segment.toolCall.name,
      arguments: "",
    };

    outputItems.push(item);
    writeSseEvent(res, "response.output_item.added", {
      response_id: responseId,
      output_index: outputIndex,
      item,
    });
    writeSseEvent(res, "response.function_call_arguments.delta", {
      response_id: responseId,
      output_index: outputIndex,
      item_id: itemId,
      delta: argumentsJson,
    });
    writeSseEvent(res, "response.function_call_arguments.done", {
      response_id: responseId,
      output_index: outputIndex,
      item_id: itemId,
      arguments: argumentsJson,
    });

    item.arguments = argumentsJson;
    writeSseEvent(res, "response.output_item.done", {
      response_id: responseId,
      output_index: outputIndex,
      item,
    });
  };

  const reader = iaeduResponse.body?.getReader?.();
  let buffer = "";

  if (!reader) {
    const text = await iaeduResponse.text();
    for (const segment of ingestToolCallText(parser, text)) {
      if (segment.type === "text") {
        appendTextDelta(segment.text);
      } else {
        emitToolCall(segment);
      }
    }
  } else {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += new TextDecoder().decode(value, { stream: true });
      const { events, remainder } = parseStreamBuffer(buffer);
      buffer = remainder;

      for (const eventText of events) {
        const delta = extractDeltaFromChunk(eventText, state);
        if (delta.done) {
          continue;
        }
        if (delta.text) {
          for (const segment of ingestToolCallText(parser, delta.text)) {
            if (segment.type === "text") {
              appendTextDelta(segment.text);
            } else {
              emitToolCall(segment);
            }
          }
        }
      }
    }

    if (buffer.trim()) {
      const delta = extractDeltaFromChunk(buffer, state);
      if (delta.text) {
        for (const segment of ingestToolCallText(parser, delta.text)) {
          if (segment.type === "text") {
            appendTextDelta(segment.text);
          } else {
            emitToolCall(segment);
          }
        }
      }
    }
  }

  for (const segment of finalizeToolCallParser(parser)) {
    if (segment.type === "text") {
      appendTextDelta(segment.text);
    }
  }

  finalizeMessageItem();

  const responseObject = createResponsesObjectWithOutput({
    responseId,
    created,
    model,
    output: outputItems,
  });
  writeSseEvent(res, "response.completed", {
    ...responseObject,
    response: responseObject,
  });
}

export async function collectIaeuText(iaeduResponse) {
  const reader = iaeduResponse.body?.getReader?.();
  let buffer = "";
  let aggregated = "";
  const state = { seenToken: false };

  if (!reader) {
    return iaeduResponse.text();
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += new TextDecoder().decode(value, { stream: true });
    const { events, remainder } = parseStreamBuffer(buffer);
    buffer = remainder;

    for (const eventText of events) {
      const delta = extractDeltaFromChunk(eventText, state);
      if (!delta.done && delta.text) {
        aggregated += delta.text;
      }
    }
  }

  if (buffer.trim()) {
    const delta = extractDeltaFromChunk(buffer, state);
    if (delta.text) {
      aggregated += delta.text;
    }
  }

  return aggregated;
}

export async function collectIaeuOutput(iaeduResponse) {
  const reader = iaeduResponse.body?.getReader?.();
  let buffer = "";
  const state = { seenToken: false };
  const parser = createToolCallParser();
  const outputItems = [];
  let messageItem = null;
  let messageText = "";

  const appendText = (text) => {
    if (!text) {
      return;
    }

    if (!messageItem) {
      messageItem = {
        id: `msg_${randomUUID()}`,
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: "",
          },
        ],
      };
      outputItems.push(messageItem);
    }

    messageText += text;
    messageItem.content[0].text = messageText;
  };

  const finalizeMessage = () => {
    if (!messageItem) {
      return;
    }
    messageItem.content[0].text = messageText;
    messageItem = null;
    messageText = "";
  };

  const emitToolCallItem = (segment) => {
    finalizeMessage();

    if (!segment?.toolCall?.name) {
      const fallbackText = `${TOOL_CALL_START}${segment?.raw ?? ""}${TOOL_CALL_END}`;
      appendText(fallbackText);
      return;
    }

    const argumentsJson = serializeToolArguments(segment.toolCall.arguments);
    outputItems.push({
      id: `fc_${randomUUID()}`,
      type: "function_call",
      call_id: `call_${randomUUID()}`,
      name: segment.toolCall.name,
      arguments: argumentsJson,
    });
  };

  if (!reader) {
    const text = await iaeduResponse.text();
    for (const segment of ingestToolCallText(parser, text)) {
      if (segment.type === "text") {
        appendText(segment.text);
      } else {
        emitToolCallItem(segment);
      }
    }
  } else {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += new TextDecoder().decode(value, { stream: true });
      const { events, remainder } = parseStreamBuffer(buffer);
      buffer = remainder;

      for (const eventText of events) {
        const delta = extractDeltaFromChunk(eventText, state);
        if (!delta.done && delta.text) {
          for (const segment of ingestToolCallText(parser, delta.text)) {
            if (segment.type === "text") {
              appendText(segment.text);
            } else {
              emitToolCallItem(segment);
            }
          }
        }
      }
    }

    if (buffer.trim()) {
      const delta = extractDeltaFromChunk(buffer, state);
      if (delta.text) {
        for (const segment of ingestToolCallText(parser, delta.text)) {
          if (segment.type === "text") {
            appendText(segment.text);
          } else {
            emitToolCallItem(segment);
          }
        }
      }
    }
  }

  for (const segment of finalizeToolCallParser(parser)) {
    if (segment.type === "text") {
      appendText(segment.text);
    }
  }

  finalizeMessage();

  const combinedText = outputItems
    .filter((item) => item.type === "message")
    .map((item) => item.content?.[0]?.text || "")
    .join("");

  return { output: outputItems, text: combinedText };
}

export function splitSseEvents(buffer) {
  const chunks = buffer.split(/\n\n/);
  const remainder = chunks.pop() || "";
  return {
    events: chunks,
    remainder,
  };
}

export function splitJsonObjects(buffer) {
  const events = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < buffer.length; i += 1) {
    const char = buffer[i];

    if (start === -1) {
      if (char === "{") {
        start = i;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        const chunk = buffer.slice(start, i + 1);
        const parsed = safeJsonParse(chunk);
        events.push(parsed ?? chunk);
        start = -1;
      }
    }
  }

  const remainder = start === -1 ? "" : buffer.slice(start);
  return { events, remainder };
}

export function parseStreamBuffer(buffer) {
  if (buffer.includes("data:") || buffer.includes("event:")) {
    return splitSseEvents(buffer);
  }

  return splitJsonObjects(buffer);
}

function extractDeltaFromChunk(chunk, state) {
  if (typeof chunk === "string") {
    return extractDeltaFromEvent(chunk);
  }

  if (chunk && typeof chunk === "object") {
    if (chunk.type === "done") {
      return { done: true };
    }
    if (chunk.type === "token" && typeof chunk.content === "string") {
      state.seenToken = true;
      return { text: chunk.content };
    }
    if (chunk.type === "message") {
      if (state.seenToken) {
        return {};
      }
      const messageText = chunk.content?.content;
      if (typeof messageText === "string") {
        return { text: messageText };
      }
    }

    if (typeof chunk.text === "string") {
      return { text: chunk.text };
    }
    if (typeof chunk.delta === "string") {
      return { text: chunk.delta };
    }
  }

  return {};
}

export function extractDeltaFromEvent(eventText) {
  const lines = eventText.split(/\r?\n/).map((line) => line.trim());
  const dataLines = lines.filter((line) => line.startsWith("data:"));

  if (dataLines.length === 0) {
    const { text, done } = extractIaeuDelta(lines);
    if (done || text) {
      return { text, done };
    }
    return { text: eventText };
  }

  const payload = dataLines.map((line) => line.replace(/^data:\s*/, "")).join("\n");
  if (payload === "[DONE]") {
    return { done: true };
  }

  const parsed = safeJsonParse(payload);
  if (parsed && typeof parsed === "object") {
    const text = parsed.text || parsed.delta || parsed.output_text || parsed.message;
    if (typeof text === "string") {
      return { text };
    }
  }

  return { text: payload };
}

function extractIaeuDelta(lines) {
  const texts = [];
  let done = false;

  for (const line of lines) {
    if (!line) {
      continue;
    }
    const parsed = safeJsonParse(line);
    if (!parsed || typeof parsed !== "object") {
      continue;
    }
    if (parsed.type === "done") {
      done = true;
      continue;
    }
    if (parsed.type === "token" && typeof parsed.content === "string") {
      texts.push(parsed.content);
      continue;
    }
    if (parsed.type === "message") {
      const messageText = parsed.content?.content;
      if (typeof messageText === "string") {
        texts.push(messageText);
      }
      continue;
    }
    if (typeof parsed.text === "string") {
      texts.push(parsed.text);
    }
  }

  return { text: texts.join(""), done };
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function parseToolCallPayload(raw) {
  const parsed = safeJsonParse(raw.trim());
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const name =
    typeof parsed.name === "string"
      ? parsed.name
      : typeof parsed.tool_name === "string"
        ? parsed.tool_name
        : typeof parsed.toolName === "string"
          ? parsed.toolName
          : "";

  const argumentsValue =
    "arguments" in parsed
      ? parsed.arguments
      : "args" in parsed
        ? parsed.args
        : parsed.arguments;

  if (!name) {
    return null;
  }

  return { name, arguments: argumentsValue };
}

function splitForToolStart(text) {
  const keepLength = longestSuffixPrefix(text, TOOL_CALL_START);
  if (keepLength === 0) {
    return { safeText: text, remainder: "" };
  }

  return {
    safeText: text.slice(0, text.length - keepLength),
    remainder: text.slice(text.length - keepLength),
  };
}

function longestSuffixPrefix(text, marker) {
  const maxLength = Math.min(text.length, marker.length - 1);
  for (let i = maxLength; i > 0; i -= 1) {
    if (marker.startsWith(text.slice(-i))) {
      return i;
    }
  }
  return 0;
}

function serializeToolArguments(argumentsValue) {
  if (argumentsValue == null) {
    return "{}";
  }

  if (typeof argumentsValue === "string") {
    return argumentsValue;
  }

  try {
    return JSON.stringify(argumentsValue);
  } catch (error) {
    return "{}";
  }
}
