import fs from "node:fs";
import path from "node:path";
import { getConfig, sendConfigError, sendJson, hasValidSession } from "../lib/auth.js";

const STUDIES = new Set(["abdomen", "pelvis", "neck"]);
const ROOT = path.resolve(import.meta.dirname, "..");

export default async function handler(request, response) {
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

  const url = new URL(request.url, "http://localhost");
  const study = url.searchParams.get("study");
  if (!STUDIES.has(study)) {
    sendJson(response, 400, { error: "Unknown study." });
    return;
  }

  try {
    const raw = await fs.promises.readFile(path.join(ROOT, "library", study + ".json"), "utf8");
    sendJson(response, 200, JSON.parse(raw));
  } catch (error) {
    sendJson(response, 500, { error: "Library file is missing." });
  }
}
