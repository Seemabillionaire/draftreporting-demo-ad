import { getConfig, sendConfigError, sendJson, hasValidSession } from "../lib/auth.js";

export default function handler(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed." }, { Allow: "GET" });
    return;
  }

  const config = getConfig();
  if (!config.ok) {
    sendConfigError(response, config);
    return;
  }

  if (!hasValidSession(request, config.secret)) {
    sendJson(response, 401, { error: "Sign in required." });
    return;
  }

  sendJson(response, 200, { signedIn: true });
}
