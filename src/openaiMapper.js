export function extractUserMessage(input) {
  const messages = normalizeInputToMessages(input);
  if (messages.length === 0) {
    return { text: "", image: null };
  }

  const lastUser = findLastUserMessage(messages) || messages[messages.length - 1];
  const contentParts = normalizeContentParts(lastUser.content);

  return {
    text: extractTextFromParts(contentParts),
    image: extractFirstImage(contentParts),
  };
}

export function extractTooling({ input, tools }) {
  return {
    tools: normalizeTools(tools),
    toolResults: extractToolResults(input),
  };
}

export function buildMessageWithTools({ userText, tools, toolResults }) {
  const safeText = typeof userText === "string" ? userText.trim() : "";
  if (!Array.isArray(tools) || tools.length === 0) {
    return safeText;
  }

  const toolDefs = tools
    .slice(0, TOOL_LIST_LIMIT)
    .map((tool) => formatToolDefinition(tool))
    .filter(Boolean)
    .join("\n");

  const resultsSection = formatToolResults(toolResults);

  return `You are a coding assistant with proxy-mediated tool access.

The tools listed in the <tools> block are executable in this environment. They are intentionally provided through this prompt, not a native tools field. The proxy will intercept ALL <tool_call> blocks, execute them, and return results inside <tool_results>.

When you need to use a tool, emit a <tool_call> block with valid JSON. You may include normal text before and/or after tool calls, and you may emit multiple tool calls in the same message. Each tool call must be in its own <tool_call>...</tool_call> block:
<tool_call>{"name":"tool_name","arguments":{...}}</tool_call>

The JSON inside <tool_call> must be valid JSON:
- use double quotes for keys and string values
- include all required arguments from the tool schema
- no comments and no trailing commas

The tool call results will be returned when you finish your message, inside a <tool_results> block. If a tool call is malformed, you will receive a tool result describing the failure.

Do not claim you cannot use tools because they are prompt-described. In this environment, emitting <tool_call> blocks is the correct way to run tools. Do not include a call ID; the proxy will assign one.

Only call tools when useful for the user request. You may explain what you are doing in plain text, then include tool calls as needed.

After receiving <tool_results>, treat them as authoritative and continue. If you need another tool, call it in a new tool call.

Example (search for JS files):
User: Find JS files in the workspace.
Assistant:
<tool_call>{"name":"file_search","arguments":{"query":"**/*.js"}}</tool_call>

Example (text + tool call in same message):
User: Read the config file and summarize it.
Assistant:
I will read the config file, then summarize it.
<tool_call>{"name":"read_file","arguments":{"filePath":"src/config.js","startLine":1,"endLine":200}}</tool_call>

Available tools:
<tools>
${toolDefs}
</tools>${resultsSection}
User: ${safeText}`.trim();
}

const TOOL_LIST_LIMIT = 200;
const TOOL_RESULT_LIMIT = 10000;

function normalizeInputToMessages(input) {
  if (!input) {
    return [];
  }

  if (typeof input === "string") {
    return [{ role: "user", content: input }];
  }

  if (!Array.isArray(input)) {
    return [];
  }

  const looksLikeMessages = input.some((item) => typeof item === "object" && item && "role" in item);
  if (looksLikeMessages) {
    return input.filter((item) => typeof item === "object" && item);
  }

  return [{ role: "user", content: input }];
}

function findLastUserMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      return messages[i];
    }
  }
  return null;
}

function normalizeContentParts(content) {
  if (content == null) {
    return [];
  }

  if (typeof content === "string") {
    return [{ type: "input_text", text: content }];
  }

  if (Array.isArray(content)) {
    return content.filter(Boolean);
  }

  if (typeof content === "object") {
    return [content];
  }

  return [];
}

function extractTextFromParts(parts) {
  const texts = [];
  for (const part of parts) {
    if (!part || typeof part !== "object") {
      continue;
    }
    if (typeof part.text === "string") {
      texts.push(part.text);
      continue;
    }
    if (typeof part.content === "string") {
      texts.push(part.content);
    }
  }

  return texts.join("\n").trim();
}

function extractFirstImage(parts) {
  for (const part of parts) {
    const imageUrl = part?.image_url?.url || part?.image_url || part?.url;
    if (typeof imageUrl === "string" && imageUrl.startsWith("data:")) {
      const parsed = parseDataUrl(imageUrl);
      if (parsed) {
        return parsed;
      }
    }
  }
  return null;
}

function parseDataUrl(dataUrl) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  const mimeType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  return {
    buffer,
    mimeType,
    filename: `image.${mimeType.split("/")[1] || "bin"}`,
  };
}

function normalizeTools(tools) {
  if (!Array.isArray(tools)) {
    return [];
  }

  return tools.map(normalizeToolDefinition).filter(Boolean);
}

function normalizeToolDefinition(tool) {
  if (!tool || typeof tool !== "object") {
    return null;
  }

  let definition = tool;
  if (tool.type === "function" && tool.function) {
    definition = tool.function;
  }

  const name = typeof definition.name === "string" ? definition.name.trim() : "";
  if (!name) {
    return null;
  }

  const description =
    typeof definition.description === "string" ? definition.description : "";
  const parameters =
    definition.parameters && typeof definition.parameters === "object"
      ? definition.parameters
      : {};

  return { name, description, parameters };
}

function extractToolResults(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  const results = [];
  for (const item of input) {
    if (!item || typeof item !== "object") {
      continue;
    }

    if (item.type === "function_call_output" || item.type === "tool_result") {
      const content = normalizeToolResultContent(
        item.output ?? item.content ?? item.result
      );
      if (!content) {
        continue;
      }
      results.push({
        name: extractToolResultName(item),
        callId: extractToolResultCallId(item),
        content,
      });
      continue;
    }

    if (item.role === "tool") {
      const content = normalizeToolResultContent(item.content);
      if (!content) {
        continue;
      }
      results.push({
        name: extractToolResultName(item),
        callId: extractToolResultCallId(item),
        content,
      });
    }
  }

  return results;
}

function extractToolResultName(item) {
  return (
    item.name ||
    item.tool_name ||
    item.toolName ||
    item.function_name ||
    item.functionName ||
    ""
  );
}

function extractToolResultCallId(item) {
  return item.call_id || item.tool_call_id || item.toolCallId || "";
}

function normalizeToolResultContent(content) {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === "string" ? part.text : part?.content))
      .filter((text) => typeof text === "string")
      .join("\n")
      .trim();
  }

  if (content && typeof content === "object") {
    if (typeof content.text === "string") {
      return content.text.trim();
    }
    if (typeof content.content === "string") {
      return content.content.trim();
    }
  }

  return "";
}

function formatToolDefinition(tool) {
  if (!tool) {
    return "";
  }

  const description = tool.description
    ? `  Description: ${tool.description}`
    : "  Description: (none)";
  const parameters = JSON.stringify(tool.parameters || {});

  return `<tool name="${escapeAttributeValue(tool.name)}">\n${description}\n  Parameters: ${parameters}\n</tool>`;
}

function formatToolResults(toolResults) {
  if (!Array.isArray(toolResults) || toolResults.length === 0) {
    return "";
  }

  const items = toolResults
    .map((result) => {
      const label = escapeAttributeValue(result.name || result.callId || "tool");
      const content = truncateToolResult(result.content);
      return `<result for="${label}">\n${content}\n</result>`;
    })
    .join("\n");

  return `\n\n<tool_results>\n${items}\n</tool_results>`;
}

function truncateToolResult(value) {
  if (typeof value !== "string") {
    return "";
  }

  if (value.length <= TOOL_RESULT_LIMIT) {
    return value;
  }

  return `${value.slice(0, TOOL_RESULT_LIMIT)}\n...`;
}

function escapeAttributeValue(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/"/g, "'").replace(/\s+/g, " ").trim();
}
