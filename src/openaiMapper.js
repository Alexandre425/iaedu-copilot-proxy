export function extractUserMessage(input) {
  const messages = normalizeInputToMessages(input);
  if (messages.length === 0) {
    return { text: "", image: null };
  }

  const lastUser = findLastUserMessage(messages) || messages[messages.length - 1];
  const contentParts = normalizeContentParts(lastUser.content);

  return {
    text: extractTextFromParts(contentParts),
    image: extractFirstImage(contentParts),
  };
}

function normalizeInputToMessages(input) {
  if (!input) {
    return [];
  }

  if (typeof input === "string") {
    return [{ role: "user", content: input }];
  }

  if (!Array.isArray(input)) {
    return [];
  }

  const looksLikeMessages = input.some((item) => typeof item === "object" && item && "role" in item);
  if (looksLikeMessages) {
    return input.filter((item) => typeof item === "object" && item);
  }

  return [{ role: "user", content: input }];
}

function findLastUserMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      return messages[i];
    }
  }
  return null;
}

function normalizeContentParts(content) {
  if (content == null) {
    return [];
  }

  if (typeof content === "string") {
    return [{ type: "input_text", text: content }];
  }

  if (Array.isArray(content)) {
    return content.filter(Boolean);
  }

  if (typeof content === "object") {
    return [content];
  }

  return [];
}

function extractTextFromParts(parts) {
  const texts = [];
  for (const part of parts) {
    if (!part || typeof part !== "object") {
      continue;
    }
    if (typeof part.text === "string") {
      texts.push(part.text);
      continue;
    }
    if (typeof part.content === "string") {
      texts.push(part.content);
    }
  }

  return texts.join("\n").trim();
}

function extractFirstImage(parts) {
  for (const part of parts) {
    const imageUrl = part?.image_url?.url || part?.image_url || part?.url;
    if (typeof imageUrl === "string" && imageUrl.startsWith("data:")) {
      const parsed = parseDataUrl(imageUrl);
      if (parsed) {
        return parsed;
      }
    }
  }
  return null;
}

function parseDataUrl(dataUrl) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  const mimeType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  return {
    buffer,
    mimeType,
    filename: `image.${mimeType.split("/")[1] || "bin"}`,
  };
}
