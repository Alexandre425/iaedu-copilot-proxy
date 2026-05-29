# IAEdu Proxy — Copilot Instructions

## Quick Primer

**Project**: OpenAI-compatible proxy server that translates between OpenAI's Responses API and IAEdu's custom multipart `/stream` endpoint. Enables use of IAEdu models (GPT-5.5, Opus 4.7, etc.) in VSCode Copilot Chat without tool call support.

**Core Problem**: IAEdu API is non-standard—it's a bespoke multipart form-data streaming endpoint with no tool definitions, no message history array in requests (context maintained server-side via `thread_id`), and opaque model identity. The proxy must bridge this gap for Copilot compatibility.

**Key Constraint**: **Tool calls are not supported**. The upstream IAEdu API does not emit tool call syntax. The proxy forwards text-only responses. Copilot must operate in text-only mode with this endpoint.

**Tech Stack**: Node.js 18+, Fastify, dotenv. ES modules (`"type": "module"`).

---

## Repository Map

```
src/
├── server.js             Main Fastify app, route handlers for /v1/responses and /v1/chat/completions
├── iaeduClient.js        Makes raw HTTP requests to IAEdu /stream endpoint
├── openaiMapper.js       Converts OpenAI request format to IAEdu request format
├── responseFormatter.js  Converts IAEdu streaming response back to OpenAI format
├── threadStore.js        Maps conversation keys to persistent thread_ids
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
1. Copilot sends `POST /v1/responses` or `/v1/chat/completions` (OpenAI format)
2. `server.js` extracts user message and conversation key
3. `openaiMapper.js` transforms to IAEdu multipart request
4. `threadStore.js` retrieves or creates thread_id for this conversation
5. `iaeduClient.js` streams response from IAEdu

**Response Path**:
1. IAEdu returns newline-delimited JSON with `type` and `content` fields
2. `responseFormatter.js` collects tokens and builds OpenAI-compliant SSE stream
3. Server pipes formatted events back to Copilot

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

### Tool Call Limitations
- IAEdu model never emits tool call syntax → proxy cannot fabricate it
- Copilot config must set `"toolCalling": true` in model config (required for UI visibility), but no tools will actually execute
- Plain text mode only

---

## Development Guidelines

### Code Organization
- Separation of concerns: API mapping, format translation, streaming, state management all in separate modules
- No business logic in `server.js`—routes delegate to helper modules
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
- **Debug IAEdu format**: Run `node scripts/diagnose-stream.js "your message"` to see raw output

---

## Environment & Deployment

- **Node requirement**: 18+ (uses top-level await)
- **Required env vars**: `IAEDU_API_KEY`, `IAEDU_ENDPOINT`, `IAEDU_CHANNEL_ID`
- **Optional env vars**: `PORT` (default 3000), `DEFAULT_THREAD_ID`, `DEFAULT_USER_CONTEXT`
- **Scripts**: `npm run dev` (start server), `npm test` (run unit tests)
- **Health check**: `GET /health` returns `{"status":"ok"}`
