const failuresByKey = new Map();

export function addToolFailure(key, reason) {
  if (!key) {
    return;
  }

  const message = normalizeFailureReason(reason);
  const entry = {
    name: "tool_call_error",
    content: `Tool call failed: ${message}.`,
  };

  const existing = failuresByKey.get(key) || [];
  existing.push(entry);
  failuresByKey.set(key, existing);
}

export function consumeToolFailures(key) {
  if (!key) {
    return [];
  }

  const entries = failuresByKey.get(key) || [];
  failuresByKey.delete(key);
  return entries;
}

function normalizeFailureReason(reason) {
  if (typeof reason !== "string" || !reason.trim()) {
    return "malformed json";
  }

  return reason.trim();
}
