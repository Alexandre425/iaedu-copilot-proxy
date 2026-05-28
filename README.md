# IAEdu Proxy

OpenAI-compatible proxy for the IAEdu multipart `/stream` endpoint. This exposes `POST /v1/responses` and optionally `POST /v1/chat/completions`.

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
