import "dotenv/config";
import Fastify from "fastify";
import { loadConfig } from "./config.js";
import { getThreadIdForKey } from "./threadStore.js";
import { buildMessageWithTools, extractTooling, extractUserMessage } from "./openaiMapper.js";
import { callIaeuStream } from "./iaeduClient.js";
import { mapIaeuError } from "./errors.js";
import { addToolFailure, consumeToolFailures } from "./toolFailureStore.js";
import {
  collectIaeuText,
  collectIaeuOutput,
  createChatCompletionObject,
  createResponseMetadata,
  createResponsesObject,
  createResponsesObjectWithOutput,
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
  const { model, input, stream, user, metadata, tools } = body;
  const { text, image } = extractUserMessage(input);

  const conversationKey =
    metadata?.conversation_id ||
    metadata?.conversationId ||
    body.conversation_id ||
    body.conversation ||
    user ||
    request.ip;

  const useToolTranslation = mode === "responses";
  const { tools: toolDefs, toolResults } = useToolTranslation
    ? extractTooling({ input, tools })
    : { tools: [], toolResults: [] };
  const pendingFailures = useToolTranslation
    ? consumeToolFailures(conversationKey)
    : [];
  const mergedToolResults = pendingFailures.length
    ? [...pendingFailures, ...toolResults]
    : toolResults;
  const onToolCallError = useToolTranslation
    ? (reason) => addToolFailure(conversationKey, reason)
    : undefined;
  const message = useToolTranslation
    ? buildMessageWithTools({
        userText: text,
        tools: toolDefs,
        toolResults: mergedToolResults,
      })
    : text;

  const threadId = getThreadIdForKey(conversationKey, config.defaultThreadId);

  const baseContext =
    config.defaultUserContext && typeof config.defaultUserContext === "object"
      ? config.defaultUserContext
      : {};
  let userContext = baseContext;
  if (metadata && typeof metadata === "object") {
    userContext = { ...userContext, ...metadata };
  }

  const responseMeta = createResponseMetadata(model);

  let iaeduResponse;
  try {
    iaeduResponse = await callIaeuStream({
      config,
      message,
      threadId,
      userId: user || undefined,
      userInfo: { user: user || null },
      userContext,
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
      onToolCallError,
    });

    reply.raw.end();
    return reply;
  }

  if (mode === "chat") {
    const textResponse = await collectIaeuText(iaeduResponse);
    const chatResponse = createChatCompletionObject({
      responseId: responseMeta.id,
      created: responseMeta.created,
      model: responseMeta.model,
      text: textResponse,
    });
    return reply.send(chatResponse);
  }

  const { output, text: outputText } = await collectIaeuOutput(iaeduResponse, {
    onToolCallError,
  });
  if (!output || output.length === 0) {
    const responsesObject = createResponsesObject({
      responseId: responseMeta.id,
      created: responseMeta.created,
      model: responseMeta.model,
      text: outputText || "",
    });
    return reply.send(responsesObject);
  }

  const responsesObject = createResponsesObjectWithOutput({
    responseId: responseMeta.id,
    created: responseMeta.created,
    model: responseMeta.model,
    output,
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
