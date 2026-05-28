# IAEdu Proxy

OpenAI-compatible proxy for the IAEdu multipart `/stream` endpoint. This exposes `POST /v1/responses` and optionally `POST /v1/chat/completions`. Tool calls are not supported by the upstream API.

## What allows you to do

- Use IAEdu models (GPT-5.5, Opus 4.7, etc.) in VSCode Copilot Chat
- Ask general questions
- Include context in the attachments (e.g. code, terminal output, problems, git history, etc.)

## What it doesn't do

- Tool calls (e.g. code edits, terminal commands, repo search, etc.)

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
