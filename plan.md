**Proxy Plan (Standalone, OAI‑compat bridge for IAEdu)**

**Goal**
Expose an OpenAI‑compatible endpoint (Responses API preferred, Chat Completions if easier) that Copilot can call, while internally calling the IAEdu multipart `/stream` endpoint.

**Constraints & Observations**

- IAEdu expects multipart/form‑data POST with required fields:`channel_id` (string)
- `thread_id` (string)
- `user_info` (stringified JSON)
- `message` (string)
- optional `user_id`, `user_context`, `image`

- IAEdu uses `x-api-key` header
- Endpoint is streaming (`/stream`) but streaming format is unknown
- Copilot `customendpoint` sends JSON in OpenAI‑style (Responses API)
- We must translate requests and responses

---

### 1. Define the compatibility target
Pick one OpenAI‑style API to implement:

**Option A: Responses API**
Path: `POST /v1/responses`
Pros: future‑proof; Copilot already uses `apiType: "responses"`
Cons: payload structure slightly more complex

**Option B: Chat Completions API**
Path: `POST /v1/chat/completions`
Pros: simpler; more tools/libraries available
Cons: Copilot might be pinned to Responses in your config

**Decision**: stick with Responses API because your `apiType` is `responses`.

---

### 2. Map request fields
**Input (Responses)**:

- `input`: array of messages, or string
- `model`: model id string
- `user`: optional
- `stream`: boolean

**IAEdu mapping**:

- `message`: extract latest user content from Responses `input`
- `channel_id`: static config (env var)
- `thread_id`: either:deterministic per `conversation` from Copilot (if it provides one), or
- generate on first request and store in server memory by `user` or `conversation` token

- `user_info`: JSON string; if no user info, send `"{}"`
- `user_id`: map from Responses `user` if present
- `user_context`: optional; can include client metadata if desired
- `image`: if Responses includes image inputs, convert to file multipart

**Decisions**:

- Decide how to track `thread_id` per user/session.
If Copilot doesn’t supply a stable conversation id, add your own cookie/session mapping.

---

### 3. Decide streaming behavior
We must understand the IAEdu stream response:

- It might be SSE
- It might be chunked JSON
- It might be a raw text stream

**Action**:
Create a small diagnostic client to capture raw stream output, including headers and sample chunks. This informs how to translate to OpenAI streaming format.

**If IAEdu is SSE**:

- Parse `data:` lines and accumulate text
- For Responses streaming, emit `event: response.output_text.delta` with JSON payload

**If it’s chunked JSON**:

- Map chunks to deltas and flush

**If it’s plain text**:

- Treat each chunk as a delta

---

### 4. Response translation
**For Responses API (streamed)**
Emit OpenAI‑style SSE events:

- `event: response.created` with metadata
- `event: response.output_text.delta` for each token chunk
- `event: response.completed` at end

**Non‑streaming mode**
Buffer entire output; return a single JSON response:

-
-
-
-

---

### 5. Error handling + status mapping
Map IAEdu errors to OpenAI‑style errors:

- 401/403 -> `invalid_api_key`
- 404 -> `invalid_request_error` with message
- 5xx -> `server_error`
Include `request_id` in headers and body.

---

### 6. Configuration & secrets
Env vars:

- `IAEDU_API_KEY`
- `IAEDU_ENDPOINT`
- `IAEDU_CHANNEL_ID`
- Optional: default `THREAD_ID` or session store

Never hardcode in config files. Use `process.env`.

---

### 7. Minimal service shape
You can implement in Node (Express/Fastify) or Python (FastAPI). Either is fine. Requirements:

- Multipart form support
- Streaming proxy support
- SSE response support

**Key components**:

- `POST /v1/responses` (and optionally `/v1/chat/completions`)
- Request parser
- IAEdu request builder (multipart)
- Stream translator
- Error mapper

---

### 8. Testing plan

- **Unit tests**: request mapping (Responses -> IAEdu), response mapping (IAEdu -> Responses)
- **Integration tests**: hitting IAEdu in staging or with mocked responses
- **Manual tests**: using curl to stream through proxy; verify Copilot uses it without 404

---

### 9. Deployment plan

- Local dev: `localhost:PORT`
- Use a tunnel (ngrok/cloudflare) to give Copilot a public HTTPS endpoint
- Add to [chatLanguageModels.json](file:///home/alexandre/.config/Code/User/chatLanguageModels.json) `url` pointing at the proxy’s `/v1/responses`

---

### 10. Open questions to resolve early

- Exact IAEdu stream format (SSE? JSON? raw text?)
- Does IAEdu support non‑streaming responses?
- Any required headers beyond `x-api-key`?
- Does IAEdu accept image uploads; if yes, in what field name and mime?