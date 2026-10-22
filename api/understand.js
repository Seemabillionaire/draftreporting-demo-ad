import path from "node:path";
import {
  getConfig,
  hasValidSession,
  readJsonBody,
  sendConfigError,
  sendJson
} from "../lib/auth.js";
import { buildChecklist, understandDictation } from "../lib/gemini.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const STUDIES = new Set(["abdomen", "pelvis", "neck"]);

export default async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed." }, { Allow: "POST" });
    return;
  }

  const started = Date.now();
  let statusCode = 500;
  let answeredModel = "none";
  const reply = (status, payload, headers = {}) => {
    statusCode = status;
    sendJson(response, status, payload, headers);
  };

  try {
    const config = getConfig();
    if (!config.ok) {
      reply(500, {
        error:
          "Server is not configured. Missing environment variable(s): " + config.missing.join(", ")
      });
      return;
    }
    if (!hasValidSession(request, config.secret)) {
      reply(401, { error: "Sign in required." });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      reply(500, {
        error: "AI is not configured. Missing environment variable: GEMINI_API_KEY.",
        listMode: true
      });
      return;
    }

    let body;
    try {
      body = await readJsonBody(request, 65536);
    } catch (error) {
      reply(400, { error: "Invalid request." });
      return;
    }

    const transcript = typeof body.transcript === "string" ? body.transcript : "";
    if (transcript.trim() === "") {
      reply(400, { error: "No dictation text was received. Use the list below.", listMode: true });
      return;
    }

    let studyHint = null;
    if (body.study !== undefined) {
      if (typeof body.study !== "string" || !STUDIES.has(body.study)) {
        reply(400, { error: "Unknown study.", listMode: true });
        return;
      }
      studyHint = body.study;
    }

    const result = await understandDictation({
      transcript,
      apiKey,
      studyHint,
      root: ROOT
    });

    if (!result.ok) {
      if (result.reason === "limit") {
        reply(429, {
          error: "AI limit reached for today: please choose from the list",
          limit: true,
          listMode: true
        });
        return;
      }
      if (result.reason === "empty") {
        reply(400, { error: "No dictation text was found. Use the list below.", listMode: true });
        return;
      }
      if (result.reason === "library") {
        reply(500, { error: "The library is unavailable. Use the list below.", listMode: true });
        return;
      }
      if (result.reason === "timeout") {
        reply(504, {
          error: result.message || "Gemini did not respond within 15 seconds.",
          listMode: true
        });
        return;
      }
      if (result.reason === "gemini") {
        const status =
          Number.isInteger(result.status) && result.status >= 400 && result.status <= 599
            ? result.status
            : 502;
        reply(status, {
          error: result.message || "Gemini returned an error. Use the list below.",
          listMode: true
        });
        return;
      }
      reply(502, { error: "AI could not understand the dictation. Use the list below.", listMode: true });
      return;
    }

    answeredModel = result.model || "none";
    const built = buildChecklist({
      args: result.args,
      context: result.context,
      studyHint
    });
    if (built.needsStudy) {
      reply(200, { needsStudy: true });
      return;
    }

    reply(200, { checklist: built.checklist });
  } finally {
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      "Understanding duration: " + seconds + "s, status: " + statusCode + ", model: " + answeredModel
    );
  }
}
