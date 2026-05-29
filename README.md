# IAEdu Proxy

OpenAI-compatible proxy for the IAEdu multipart `/stream` endpoint. This exposes `POST /v1/responses` and optionally `POST /v1/chat/completions`.

## What it allows you to do

- Use IAEdu models (GPT-5.5, Opus 4.7, etc.) in VSCode Copilot Chat
- Ask general questions and request code edits, searches, file reads, and other tool-based actions
- Include context in the attachments (e.g. code, terminal output, problems, git history, etc.)
- Proxy-mediated tool calls: the proxy injects available tools into the model's prompt and translates tool calls back to the OpenAI Responses API

## Tool calls (experimental)

Tool calls are now supported via **prompt-injection translation**. The proxy:
1. Injects tool definitions into the system message sent to IAEdu
2. Instructs the model to emit tool calls in the response
3. Parses these blocks from the response stream and converts them to OpenAI function_call items
4. Forwards tool call results and reports malformed tool calls back to the model

**Caveats:**
- Tool call reliability depends on whether the upstream IAEdu model follows the tool-use instructions. If the model is not fine-tuned for structured output, calls may be malformed or absent.
- This approach is **experimental** and subject to change as we learn its limits.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file based on `.env.example`. Find your key, endpoint and channel ID in the IAEdu UI (choose a model, open the chat, click the top right corner). The remaining fields are optional.

3. Start the server:

```bash
npm run dev
```

The server listens on `http://localhost:3000` by default.

4. Add the model to copilot chat:

Model Picker > Settings > Add Models... > Custom Endpoint

Pick any name, you don't need to put the API key in (it's in the `.env` file), and pick the "Responses" API. A window will open with a JSON config like the following. Fill in the `id` and pick an appropriate model `name`, based on the API info in the IAEdu UI.

```jsonc
{
    "name": "IAEdu",
    "vendor": "customendpoint",
    "apiType": "responses",
    "models": [
        {
            "id": "<model_id_from_iaedu>",
            "name": "<model_name>",
            "url": "http://localhost:3000",
            "toolCalling": true, // this is required for the model to appear in the UI
            "vision": false,
            "maxInputTokens": 128000,
            "maxOutputTokens": 16000
        }
    ]
}
```

## Endpoints

- `POST /v1/responses` (Responses API)
- `POST /v1/chat/completions` (Chat Completions API)
- `GET /health`

## Diagnostics

Capture raw IAEdu stream output:

```bash
node scripts/diagnose-stream.js "hello"
```

## Environment variables

- `IAEDU_API_KEY` (required)
- `IAEDU_ENDPOINT` (required, base url or full `/stream` url)
- `IAEDU_CHANNEL_ID` (required)
- `PORT` (optional, default 3000)
- `DEFAULT_THREAD_ID` (optional fallback)
- `DEFAULT_USER_CONTEXT` (optional JSON string)
