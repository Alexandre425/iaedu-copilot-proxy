import "dotenv/config";
import { loadConfig } from "../src/config.js";
import { callIaeuStream } from "../src/iaeduClient.js";

const message = process.argv.slice(2).join(" ") || "Hello";
const config = loadConfig();

const response = await callIaeuStream({
  config,
  message,
  threadId: config.defaultThreadId || "diagnostic-thread",
  userId: "diagnostic",
  userInfo: { user: "diagnostic" },
  userContext: { source: "diagnose-stream" },
  image: null,
});

console.log("Status:", response.status);
console.log("Headers:", Object.fromEntries(response.headers.entries()));

const reader = response.body?.getReader?.();
if (!reader) {
  console.log(await response.text());
  process.exit(0);
}

while (true) {
  const { done, value } = await reader.read();
  if (done) {
    break;
  }
  const chunk = new TextDecoder().decode(value, { stream: true });
  console.log("--- chunk ---");
  console.log(chunk);
}
