import fs from "node:fs";
import path from "node:path";

const STUDIES = ["abdomen", "pelvis", "neck"];
const KEYTERM_TOKEN_BUDGET = 450;
const ATTEMPTS = 2;
const ATTEMPT_TIMEOUT_MS = 60000;

function addTerm(terms, seen, value) {
  if (typeof value !== "string") return;
  const term = value.trim().replace(/\s+/g, " ");
  if (term === "") return;
  const key = term.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  terms.push(term);
}

export async function loadKeyterms(root) {
  const terms = [];
  const seen = new Set();

  for (const study of STUDIES) {
    const raw = await fs.promises.readFile(path.join(root, "library", study + ".json"), "utf8");
    const library = JSON.parse(raw);
    for (const paragraph of library.paragraphs) {
      addTerm(terms, seen, paragraph.label);
    }
    for (const finding of library.findings) {
      addTerm(terms, seen, finding.name);
      for (const spoken of finding.spoken) addTerm(terms, seen, spoken);
    }
  }

  const selected = [];
  let tokens = 0;
  for (const term of terms) {
    const estimate = Math.max(1, Math.ceil(term.length / 4));
    if (tokens + estimate > KEYTERM_TOKEN_BUDGET) break;
    selected.push(term);
    tokens += estimate;
  }
  return selected;
}

export async function transcribeAudio({ audio, contentType, apiKey, keyterms }) {
  const params = new URLSearchParams();
  params.set("model", "nova-3-medical");
  params.set("language", "en");
  params.set("smart_format", "true");
  params.set("punctuate", "true");
  for (const term of keyterms) params.append("keyterm", term);
  const url = "https://api.deepgram.com/v1/listen?" + params.toString();

  let lastReason = "failed";
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: "Token " + apiKey,
          "Content-Type": contentType
        },
        body: audio,
        signal: controller.signal
      });
      if (!response.ok) {
        lastReason = "failed";
        await response.text().catch(() => {});
        continue;
      }
      const data = await response.json();
      const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
      return {
        ok: true,
        transcript: typeof transcript === "string" ? transcript : ""
      };
    } catch (error) {
      lastReason = controller.signal.aborted ? "timeout" : "failed";
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, reason: lastReason };
}
