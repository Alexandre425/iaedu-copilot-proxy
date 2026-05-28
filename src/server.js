import "dotenv/config";
import Fastify from "fastify";
import { loadConfig } from "./config.js";
import { getThreadIdForKey } from "./threadStore.js";
import { extractUserMessage } from "./openaiMapper.js";
import { callIaeuStream } from "./iaeduClient.js";
import { mapIaeuError } from "./errors.js";
import {
  collectIaeuText,
  createChatCompletionObject,
  createResponseMetadata,
  createResponsesObject,
  pipeIaeuToResponses,
} from "./responseFormatter.js";

const config = loadConfig();
const app = Fastify({ logger: true, ignoreTrailingSlash: true });

app.get("/health", async () => ({ status: "ok" }));

app.post("/v1/responses", async (request, reply) => {
  return handleResponsesRequest({ request, reply, config, mode: "responses" });
});

app.post("/v1/chat/completions", async (request, reply) => {
  return handleResponsesRequest({ request, reply, config, mode: "chat" });
});

app.listen({ port: config.port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error, "failed to start server");
  process.exit(1);
});

async function handleResponsesRequest({ request, reply, config, mode }) {
  const body = request.body || {};
  const { model, input, stream, user, metadata } = body;
  const toolsCount = Array.isArray(body.tools) ? body.tools.length : 0;
  const toolChoice = body.tool_choice || body.toolChoice || null;
  request.log.info(
    {
      hasTools: toolsCount > 0,
      toolsCount,
      toolChoice,
    },
    "copilot tool metadata"
  );
  if (toolsCount > 0) {
    const toolNames = body.tools
      .map((tool) => tool?.name || tool?.function?.name || tool?.tool?.name)
      .filter(Boolean)
      .slice(0, 10);
    request.log.info(
      {
        sampleToolNames: toolNames,
        firstToolKeys: Object.keys(body.tools[0] || {}),
      },
      "copilot tool schema sample"
    );
  }
  const { text, image } = extractUserMessage(input);

  const conversationKey =
    metadata?.conversation_id ||
    metadata?.conversationId ||
    body.conversation_id ||
    body.conversation ||
    user ||
    request.ip;

  const threadId = getThreadIdForKey(conversationKey, config.defaultThreadId);

  const baseContext =
    config.defaultUserContext && typeof config.defaultUserContext === "object"
      ? config.defaultUserContext
      : {};
  let userContext = baseContext;
  if (metadata && typeof metadata === "object") {
    userContext = { ...userContext, ...metadata };
  }
  if (toolsCount > 0 || toolChoice) {
    userContext = {
      ...userContext,
      copilot_tools: {
        tool_choice: toolChoice,
        tools: Array.isArray(body.tools) ? body.tools : [],
      },
    };
  }

  const responseMeta = createResponseMetadata(model);

  let iaeduResponse;
  try {
    iaeduResponse = await callIaeuStream({
      config,
      message: text,
      threadId,
      userId: user || undefined,
      userInfo: { user: user || null },
      userContext,
      tools: Array.isArray(body.tools) ? body.tools : null,
      toolChoice,
      image,
    });
  } catch (error) {
    request.log.error({ error }, "failed to call iaedu");
    return reply.status(502).send({
      error: {
        message: "Failed to reach IAEdu",
        type: "server_error",
        param: null,
        code: null,
      },
    });
  }

  if (!iaeduResponse.ok) {
    const errorText = await safeReadText(iaeduResponse);
    const mapped = mapIaeuError(iaeduResponse.status, errorText);
    reply.status(mapped.status);
    reply.header("x-request-id", responseMeta.id);
    return reply.send(mapped.body);
  }

  reply.header("x-request-id", responseMeta.id);

  const wantsStream = Boolean(stream) || request.headers.accept?.includes("text/event-stream");

  if (wantsStream) {
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    });

    await pipeIaeuToResponses({
      iaeduResponse,
      res: reply.raw,
      responseId: responseMeta.id,
      created: responseMeta.created,
      model: responseMeta.model,
    });

    reply.raw.end();
    return reply;
  }

  const textResponse = await collectIaeuText(iaeduResponse);

  if (mode === "chat") {
    const chatResponse = createChatCompletionObject({
      responseId: responseMeta.id,
      created: responseMeta.created,
      model: responseMeta.model,
      text: textResponse,
    });
    return reply.send(chatResponse);
  }

  const responsesObject = createResponsesObject({
    responseId: responseMeta.id,
    created: responseMeta.created,
    model: responseMeta.model,
    text: textResponse,
  });

  return reply.send(responsesObject);
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch (error) {
    return "";
  }
}
