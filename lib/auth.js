import crypto from "node:crypto";

export const COOKIE_NAME = "demo_session";
export const PASSCODE_ENV = "DEMO_PASSCODE";
export const SECRET_ENV = "COOKIE_SECRET";
export const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const MAX_BODY_BYTES = 4096;

export function getConfig() {
  const passcode = process.env[PASSCODE_ENV];
  const secret = process.env[SECRET_ENV];
  const missing = [];
  if (!passcode) missing.push(PASSCODE_ENV);
  if (!secret) missing.push(SECRET_ENV);
  return { ok: missing.length === 0, missing, passcode, secret };
}

export function sendJson(response, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Length", Buffer.byteLength(body));
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  response.end(body);
}

export function sendConfigError(response, config) {
  sendJson(response, 500, {
    error:
      "Server is not configured. Missing environment variable(s): " + config.missing.join(", ")
  });
}

export function readJsonBody(request, maxBytes = MAX_BODY_BYTES) {
  if (request.body !== undefined) {
    if (Buffer.isBuffer(request.body)) {
      if (request.body.length > maxBytes) {
        return Promise.reject(new Error("Request is too large."));
      }
      const raw = request.body.toString("utf8");
      if (raw.trim() === "") return Promise.resolve({});
      try {
        return Promise.resolve(JSON.parse(raw));
      } catch (error) {
        return Promise.reject(new Error("Invalid JSON."));
      }
    }
    if (request.body !== null && typeof request.body === "object") {
      return Promise.resolve(request.body);
    }
    if (typeof request.body === "string") {
      if (Buffer.byteLength(request.body) > maxBytes) {
        return Promise.reject(new Error("Request is too large."));
      }
      if (request.body.trim() === "") return Promise.resolve({});
      try {
        return Promise.resolve(JSON.parse(request.body));
      } catch (error) {
        return Promise.reject(new Error("Invalid JSON."));
      }
    }
    return Promise.resolve({});
  }

  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("Request is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (raw.trim() === "") {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function parseCookies(request) {
  const header = request.headers.cookie || "";
  const cookies = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name !== "") cookies[name] = value;
  }
  return cookies;
}

function secureAttribute() {
  return process.env.VERCEL || process.env.NODE_ENV === "production" ? "; Secure" : "";
}

function signature(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function sessionCookie(secret) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = "v1." + issuedAt;
  const value = payload + "." + signature(payload, secret);
  return (
    COOKIE_NAME +
    "=" +
    value +
    "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" +
    MAX_AGE_SECONDS +
    secureAttribute()
  );
}

export function clearSessionCookie() {
  return (
    COOKIE_NAME +
    "=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT" +
    secureAttribute()
  );
}

export function hasValidSession(request, secret) {
  const value = parseCookies(request)[COOKIE_NAME];
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const issuedAt = Number(parts[1]);
  if (!Number.isInteger(issuedAt)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (issuedAt > now + 60 || now - issuedAt > MAX_AGE_SECONDS) return false;
  const payload = parts[0] + "." + parts[1];
  const expected = Buffer.from(signature(payload, secret));
  const actual = Buffer.from(parts[2]);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function passcodeMatches(input, expected) {
  const left = crypto.createHash("sha256").update(input).digest();
  const right = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(left, right);
}
