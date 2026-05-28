export function buildStreamUrl(baseEndpoint) {
  if (baseEndpoint.endsWith("/stream")) {
    return baseEndpoint;
  }
  return `${baseEndpoint}/stream`;
}

export async function callIaeuStream({
  config,
  message,
  threadId,
  userId,
  userInfo,
  userContext,
  tools,
  toolChoice,
  image,
}) {
  const url = buildStreamUrl(config.endpoint);
  const form = new FormData();

  form.append("channel_id", config.channelId);
  form.append("thread_id", threadId);
  form.append("user_info", JSON.stringify(userInfo || {}));
  form.append("message", message || "");

  if (userId) {
    form.append("user_id", userId);
  }

  if (userContext) {
    form.append("user_context", JSON.stringify(userContext));
  }

  if (tools && tools.length > 0) {
    form.append("tools", JSON.stringify(tools));
  }

  if (toolChoice) {
    form.append("tool_choice", JSON.stringify(toolChoice));
  }

  if (image?.buffer) {
    const blob = new Blob([image.buffer], { type: image.mimeType || "application/octet-stream" });
    form.append("image", blob, image.filename || "image");
  }

  return fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
    },
    body: form,
  });
}
