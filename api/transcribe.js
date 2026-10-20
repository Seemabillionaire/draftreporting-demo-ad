import path from "node:path";
import { getConfig, hasValidSession, sendConfigError, sendJson } from "../lib/auth.js";
import { loadKeyterms, transcribeAudio } from "../lib/deepgram.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const MAX_AUDIO_BYTES = 4300000;

function readAudioBody(request) {
  if (Buffer.isBuffer(request.body) || request.body instanceof Uint8Array) {
    const body = Buffer.from(request.body);
    if (body.length > MAX_AUDIO_BYTES) {
      return Promise.reject(Object.assign(new Error("Too large."), { code: "TOO_LARGE" }));
    }
    return Promise.resolve(body);
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_AUDIO_BYTES) {
        reject(Object.assign(new Error("Too large."), { code: "TOO_LARGE" }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

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
  if (!hasValidSession(request, config.secret)) {
    sendJson(response, 401, { error: "Sign in required." });
    return;
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    sendJson(response, 500, {
      error: "Speech to text is not configured. Missing environment variable: DEEPGRAM_API_KEY.",
      listMode: true
    });
    return;
  }

  const contentType = (request.headers["content-type"] || "").split(";")[0].trim();
  if (!contentType.startsWith("audio/")) {
    sendJson(response, 415, { error: "Send an audio recording.", listMode: true });
    return;
  }

  let audio;
  try {
    audio = await readAudioBody(request);
  } catch (error) {
    if (error.code === "TOO_LARGE") {
      sendJson(response, 413, {
        error: "The recording is too large to send. Keep it under 10 minutes.",
        listMode: true
      });
      return;
    }
    sendJson(response, 400, { error: "The recording could not be read.", listMode: true });
    return;
  }

  if (audio.length === 0) {
    sendJson(response, 400, { error: "The recording is empty.", listMode: true });
    return;
  }

  const started = Date.now();
  try {
    let keyterms;
    try {
      keyterms = await loadKeyterms(ROOT);
    } catch (error) {
      sendJson(response, 500, {
        error: "The library is unavailable. Use the list below.",
        listMode: true
      });
      return;
    }

    const result = await transcribeAudio({ audio, contentType, apiKey, keyterms });
    if (!result.ok) {
      const timedOut = result.reason === "timeout";
      sendJson(
        response,
        timedOut ? 504 : 502,
        {
          error: timedOut
            ? "Speech to text timed out. Use the list below."
            : "Speech to text failed. Use the list below.",
          listMode: true
        }
      );
      return;
    }

    sendJson(response, 200, { transcript: result.transcript });
  } finally {
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log("Transcription duration: " + seconds + "s");
  }
}
