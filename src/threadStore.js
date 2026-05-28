import { randomUUID } from "node:crypto";

const threadByKey = new Map();

export function getThreadIdForKey(key, fallbackThreadId = null) {
  if (!key) {
    return fallbackThreadId || randomUUID();
  }

  if (!threadByKey.has(key)) {
    threadByKey.set(key, fallbackThreadId || randomUUID());
  }

  return threadByKey.get(key);
}
