import {
  getConfig,
  sendConfigError,
  sendJson,
  readJsonBody,
  passcodeMatches,
  sessionCookie
} from "../lib/auth.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed." }, { Allow: "POST" });
    return;
  }

  const config = getConfig();
  if (!config.ok) {
    sendConfigError(response, config);
    return;
  }

  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    sendJson(response, 400, { error: "Invalid request." });
    return;
  }

  const passcode = typeof body.passcode === "string" ? body.passcode : "";
  if (passcode.trim() === "") {
    sendJson(response, 400, { error: "Enter the passcode." });
    return;
  }
  if (!passcodeMatches(passcode, config.passcode)) {
    sendJson(response, 401, { error: "Wrong passcode." });
    return;
  }

  sendJson(response, 200, { ok: true }, { "Set-Cookie": sessionCookie(config.secret) });
}
