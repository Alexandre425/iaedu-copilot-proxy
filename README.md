# IAEdu Proxy

OpenAI-compatible proxy for the IAEdu multipart `/stream` endpoint. This exposes `POST /v1/responses` and optionally `POST /v1/chat/completions`. Tool calls are not supported by the upstream API, but the `toolCalling` flag is included so the model appears in the picker.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file based on `.env.example`.

3. Start the server:

```bash
npm run dev
```

The server listens on `http://localhost:3000` by default.

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


## Configuring VSCode

Add an entry like this to your `/home/<user>/.config/Code/User/chatLanguageModels.json`:

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

Find the relevant information in the IAEdu "API Info" popup.