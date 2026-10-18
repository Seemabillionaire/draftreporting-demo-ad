import { clearSessionCookie, sendJson } from "../lib/auth.js";

export default function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed." }, { Allow: "POST" });
    return;
  }
  sendJson(response, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
}
