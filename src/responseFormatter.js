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

export async function pipeIaeuToResponses({ iaeduResponse, res, responseId, created, model }) {
  let aggregated = "";
  const state = { seenToken: false };
  writeSseEvent(res, "response.created", {
    id: responseId,
    object: "response",
    created,
    model,
  });
  const outputItem = {
    id: `msg_${responseId}`,
    type: "message",
    role: "assistant",
    content: [
      {
        type: "output_text",
        text: "",
      },
    ],
  };
  writeSseEvent(res, "response.output_item.added", {
    response_id: responseId,
    output_index: 0,
    item: outputItem,
  });
  writeSseEvent(res, "response.content_part.added", {
    response_id: responseId,
    output_index: 0,
    content_index: 0,
    item_id: outputItem.id,
    part: {
      type: "output_text",
      text: "",
    },
  });

  const reader = iaeduResponse.body?.getReader?.();
  let buffer = "";

  if (!reader) {
    const text = await iaeduResponse.text();
    aggregated = text;
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
          aggregated += delta.text;
          writeSseEvent(res, "response.output_text.delta", {
            response_id: responseId,
            output_index: 0,
            content_index: 0,
            item_id: outputItem.id,
            delta: delta.text,
          });
        }
      }
    }

    if (buffer.trim()) {
      const delta = extractDeltaFromChunk(buffer, state);
      if (delta.text) {
        aggregated += delta.text;
        writeSseEvent(res, "response.output_text.delta", {
          response_id: responseId,
          output_index: 0,
          content_index: 0,
          item_id: outputItem.id,
          delta: delta.text,
        });
      }
    }
  }

  outputItem.content[0].text = aggregated;
  writeSseEvent(res, "response.output_text.done", {
    response_id: responseId,
    output_index: 0,
    content_index: 0,
    text: aggregated,
  });
  writeSseEvent(res, "response.content_part.done", {
    response_id: responseId,
    output_index: 0,
    content_index: 0,
    item_id: outputItem.id,
    part: {
      type: "output_text",
      text: aggregated,
    },
  });
  writeSseEvent(res, "response.output_item.done", {
    response_id: responseId,
    output_index: 0,
    item: outputItem,
  });

  const responseObject = createResponsesObject({
    responseId,
    created,
    model,
    text: aggregated,
  });
  responseObject.output[0] = outputItem;
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
