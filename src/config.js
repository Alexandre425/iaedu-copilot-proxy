const REQUIRED_VARS = ["IAEDU_API_KEY", "IAEDU_ENDPOINT", "IAEDU_CHANNEL_ID"];

export function loadConfig(env = process.env) {
  const missing = REQUIRED_VARS.filter((key) => !env[key]);
  if (missing.length > 0) {
    const list = missing.join(", ");
    throw new Error(`Missing required env vars: ${list}`);
  }

  const endpoint = normalizeEndpoint(env.IAEDU_ENDPOINT);
  const defaultUserContext = parseOptionalJson(env.DEFAULT_USER_CONTEXT);

  return {
    apiKey: env.IAEDU_API_KEY,
    endpoint,
    channelId: env.IAEDU_CHANNEL_ID,
    port: Number(env.PORT || 3000),
    defaultThreadId: env.DEFAULT_THREAD_ID || null,
    defaultUserContext,
  };
}

function normalizeEndpoint(endpoint) {
  return endpoint.trim().replace(/\/$/, "");
}

function parseOptionalJson(value) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error("DEFAULT_USER_CONTEXT must be valid JSON");
  }
}
