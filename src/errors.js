const STATUS_TO_TYPE = new Map([
  [401, "invalid_api_key"],
  [403, "invalid_api_key"],
  [404, "invalid_request_error"],
]);

export function mapIaeuError(status, message) {
  const type = STATUS_TO_TYPE.get(status) || (status >= 500 ? "server_error" : "invalid_request_error");
  return {
    status,
    body: {
      error: {
        message: message || "IAEdu request failed",
        type,
        param: null,
        code: null,
      },
    },
  };
}
