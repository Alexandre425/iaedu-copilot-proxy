# IAEdu Proxy — Copilot Instructions

## Quick Primer

**Project**: OpenAI-compatible proxy server that translates between OpenAI's Responses API and IAEdu's custom multipart `/stream` endpoint. Enables use of IAEdu models (GPT-5.5, Opus 4.7, etc.) in VSCode Copilot Chat without tool call support.

**Core Problem**: IAEdu API is non-standard—it's a bespoke multipart form-data streaming endpoint with no tool definitions, no message history array in requests (context maintained server-side via `thread_id`), and opaque model identity. The proxy must bridge this gap for Copilot compatibility.

**Tool Call Strategy**: The upstream IAEdu API does not natively emit tool call syntax. The proxy compensates via **prompt-injection translation**: inject tool definitions into the request, instruct the model to emit tool calls as `<tool_call>` blocks, then parse and translate those to OpenAI function_call items. Reliability depends on model compliance with instructions.

**Tech Stack**: Node.js 18+, Fastify, dotenv. ES modules (`"type": "module"`).

---

## Repository Map

```
src/
├── server.js             Main Fastify app, route handlers for /v1/responses and /v1/chat/completions
├── iaeduClient.js        Makes raw HTTP requests to IAEdu /stream endpoint
├── openaiMapper.js       Converts OpenAI request to IAEdu format; injects tools and tool results into prompts
├── responseFormatter.js  Parses IAEdu stream, detects <tool_call> blocks, converts to OpenAI SSE events
├── threadStore.js        Maps conversation keys to persistent thread_ids
├── toolFailureStore.js   Stores malformed tool-call errors and injects them into next prompt
├── config.js             Loads .env (IAEDU_API_KEY, IAEDU_ENDPOINT, IAEDU_CHANNEL_ID, etc.)
└── errors.js             Error mappings between formats

test/
├── iaeduClient.test.js       Tests raw IAEdu streaming behavior
├── openaiMapper.test.js      Tests format conversion logic
└── responseFormatter.test.js Tests response mapping

scripts/
└── diagnose-stream.js  Captures raw IAEdu stream output for debugging

.env (not in repo)      Secrets: IAEDU_API_KEY, IAEDU_ENDPOINT, IAEDU_CHANNEL_ID
```

### Key Data Flows

**Request Path**:
1. Copilot sends `POST /v1/responses` with optional `tools` array (Responses API)
2. `server.js` extracts user message, tools, and conversation key; retrieves pending tool failures
3. `openaiMapper.js` merges tool results (from prior failed calls) and builds tool-injected message with tool definitions and instructions
4. `threadStore.js` retrieves or creates persistent `thread_id` for this conversation
5. `iaeduClient.js` sends multipart request to IAEdu with the injected message

**Response Path**:
1. IAEdu streams newline-delimited JSON with `type: "token"` and `content` fields
2. `responseFormatter.js` buffers stream, detects `<tool_call>...</tool_call>` blocks, parses JSON inside
3. For valid tool calls: emits OpenAI SSE `response.output_item.added` with `type: "function_call"` followed by `response.function_call_arguments.*` events
4. For malformed calls: records error via `toolFailureStore` to be injected in next prompt, does not emit to Copilot
5. For normal text: emits `response.output_text.delta` events
6. `server.js` streams formatted events back to Copilot

**Tool Failure Recovery**:
1. If a tool call has invalid JSON, `responseFormatter.js` attempts recovery (e.g., remove trailing brace) via `splitJsonObjects`
2. If recovery fails, `toolFailureStore.addToolFailure()` stores the error with a short reason
3. On the next request from Copilot in the same conversation, `toolFailureStore.consumeToolFailures()` retrieves stored errors
4. Errors are formatted as `<tool_result>` items in the prompt, so the model sees why the call failed and can retry

IAEdu provides an example client in Python, which is in this repository as [iaedu-api-example.md](./iaedu-api-example.md).

---

## Architecture Notes

### Conversation State
- **Stateless proxy**: No message history stored locally
- **Thread ID persistence**: Each unique `conversation_id` or `user` gets a persistent `thread_id` (stored in-memory, lost on restart)
- **IAEdu maintains context**: The upstream API returns full thread history implicitly in each response

### Format Translation
- **OpenAI → IAEdu**: Requires parsing `input` array (from Responses API) or `messages` array (from Chat Completions), extracting text and images
- **IAEdu → OpenAI**: Streams newline-delimited JSON; proxy converts to SSE (Server-Sent Events) format with `response.created`, `response.output_item.added`, `response.content_block_delta`, `response.completed` events

### Tool Call Implementation
- Tools are injected into the prompt as text. The model is instructed to emit calls as `<tool_call>{"name":"...","arguments":{...}}</tool_call>` blocks.
- Reliability depends on whether the upstream model was trained to follow structured output instructions.
- Malformed JSON in tool calls is recovered when possible (e.g., extra trailing `}` is stripped); otherwise the error is reported to the model and the call is discarded from the client-facing response.
- No tool-specific reasoning: the model sees a flat list of tools with simple descriptions and parameter schemas, not a tool-use engine.
- Model receives error feedback via `<tool_results>` on the next turn if a call fails parsing or execution.

---

## Development Guidelines

### Code Organization
- Separation of concerns: API mapping, format translation, streaming, state management, tool injection, tool parsing all in separate modules
- No business logic in `server.js`—routes delegate to helper modules
- Tool injection logic in `openaiMapper.js` (building prompt with tool defs and results)
- Tool call parsing in `responseFormatter.js` (detecting and parsing `<tool_call>` blocks, with JSON recovery)
- Tool failure tracking in `toolFailureStore.js` (in-memory per-conversation store; lost on restart)
- Configuration centralized in `config.js`

### Error Handling
- Map IAEdu errors to OpenAI-compatible error format in `errors.js`
- Stream errors are caught and formatted as SSE error events
- Always include `conversation_id` or `user` in logs for debugging

### Testing
- Unit tests in `test/` mirror source module names
- Use `scripts/diagnose-stream.js` to capture raw IAEdu responses for debugging

### Common Tasks
- **Add new request field**: Update `openaiMapper.js` to extract and map to IAEdu format
- **Add new response event**: Update `responseFormatter.js` to parse IAEdu output and emit SSE events
- **Debug tool injection**: Run `node scripts/diagnose-stream.js "your message"` with a tool-equipped request to see how IAEdu handles prompt-injected tools
- **Improve tool JSON recovery**: Extend `recoverToolCallJson` in `responseFormatter.js` to handle additional malformation patterns
- **Tune tool list size**: Adjust `TOOL_LIST_LIMIT` in `openaiMapper.js` and `TOOL_RESULT_LIMIT` based on model context constraints
- **Monitor tool failures**: Check `toolFailureStore.js` logs or add metrics to track how often tool calls fail parsing

---

## Environment & Deployment

- **Node requirement**: 18+ (uses top-level await)
- **Required env vars**: `IAEDU_API_KEY`, `IAEDU_ENDPOINT`, `IAEDU_CHANNEL_ID`
- **Optional env vars**: `PORT` (default 3000), `DEFAULT_THREAD_ID`, `DEFAULT_USER_CONTEXT`
- **Scripts**: `npm run dev` (start server), `npm test` (run unit tests)
- **Health check**: `GET /health` returns `{"status":"ok"}`
