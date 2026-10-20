import fs from "node:fs";
import path from "node:path";

const STUDIES = ["abdomen", "pelvis", "neck"];
const MODEL = "gemini-3.8-flash";
const ATTEMPT_TIMEOUT_MS = 12000;
const FUNCTION_NAME = "build_report_checklist";

export function stripClosingPhrases(text) {
  return text
    .replace(
      /\bplease\s+(?:give\s+report|make\s+(?:a\s+)?report|draft\s+report)\b[\s.,!?]*/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

async function loadContext(root) {
  const studies = [];
  const findings = [];
  const slots = new Map();

  for (const study of STUDIES) {
    const raw = await fs.promises.readFile(path.join(root, "library", study + ".json"), "utf8");
    const library = JSON.parse(raw);
    studies.push(study);
    for (const finding of library.findings) {
      findings.push({
        id: finding.id,
        name: finding.name,
        spoken: finding.spoken,
        study
      });
    }
    for (const slot of library.slots) {
      if (!slots.has(slot.id)) slots.set(slot.id, { ...slot, study });
    }
  }

  return { studies, findings, slots: Array.from(slots.values()) };
}

function buildFunctionSchema(context) {
  const slotProperties = {};
  for (const slot of context.slots) {
    if (slot.type === "choice") {
      slotProperties[slot.id] = {
        type: "STRING",
        enum: slot.options,
        description: "Spoken choice for " + slot.id
      };
    } else if (slot.type === "number") {
      slotProperties[slot.id] = {
        type: "NUMBER",
        description: "Spoken measurement for " + slot.id + " in " + slot.unit
      };
    } else {
      slotProperties[slot.id] = {
        type: "STRING",
        description: "Spoken word for " + slot.id
      };
    }
  }

  return {
    type: "OBJECT",
    properties: {
      studyUnclear: {
        type: "BOOLEAN",
        description: "True only when the study cannot be determined from the dictation."
      },
      study: {
        type: "STRING",
        enum: context.studies,
        description: "The study named in the dictation."
      },
      sex: {
        type: "STRING",
        enum: ["M", "F"],
        description: "Patient sex."
      },
      tvs: {
        type: "BOOLEAN",
        description: "True only when a TVS is explicitly spoken."
      },
      header: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", description: "Patient name, or an empty string." },
          age: { type: "STRING", description: "Patient age as spoken, or an empty string." }
        },
        required: ["name", "age"]
      },
      findings: {
        type: "ARRAY",
        items: { type: "STRING", enum: context.findings.map((finding) => finding.id) },
        description: "Finding IDs that were clearly stated."
      },
      slots: {
        type: "OBJECT",
        properties: slotProperties,
        description: "Only spoken measurements, choices and words."
      },
      adv: {
        type: "ARRAY",
        items: { type: "STRING" },
        description: "Advice lines exactly as spoken; otherwise empty."
      }
    },
    required: ["studyUnclear", "study", "sex", "tvs", "header", "findings", "slots", "adv"]
  };
}

function buildPrompt(context, transcript, studyHint) {
  const findingLines = context.studies.map((study) => {
    const list = context.findings
      .filter((finding) => finding.study === study)
      .map((finding) => finding.id + " = " + finding.name + " (spoken: " + finding.spoken.join(", ") + ")")
      .join("; ");
    return study + ": " + list;
  });
  const slotLines = context.studies.map((study) => {
    const list = context.slots
      .filter((slot) => slot.study === study)
      .map((slot) => {
        if (slot.type === "choice") return slot.id + " (choice: " + slot.options.join(", ") + ")";
        if (slot.type === "number") return slot.id + " (number, " + slot.unit + ")";
        return slot.id + " (word)";
      })
      .join("; ");
    return study + ": " + list;
  });

  return [
    "Convert one doctor's dictation into a checklist by calling " + FUNCTION_NAME + ".",
    "Do not write report sentences. Use only IDs from the enum lists.",
    "Only choose a finding that was clearly stated. Do not add normal findings.",
    "Only fill a slot when the value was spoken. Never choose a grade or category that was not said.",
    "Use TVS only when explicitly spoken.",
    "If the study cannot be determined, set studyUnclear to true. Do not guess.",
    studyHint ? "The study is " + studyHint + "; set that study and studyUnclear false." : "",
    "Findings by study:",
    findingLines.join("\n"),
    "Slots by study:",
    slotLines.join("\n"),
    "Return only advice that was spoken; otherwise return an empty array.",
    "Dictation:",
    transcript
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function isQuotaError(status, data) {
  if (status === 429) return true;
  const error = data && data.error;
  if (!error) return false;
  return /RESOURCE_EXHAUSTED|quota|rate limit/i.test(
    String(error.status || "") + " " + String(error.message || "")
  );
}

export async function understandDictation({ transcript, apiKey, studyHint, root }) {
  const cleaned = stripClosingPhrases(transcript);
  if (cleaned === "") return { ok: false, reason: "empty" };

  let context;
  try {
    context = await loadContext(root);
  } catch (error) {
    return { ok: false, reason: "library" };
  }

  const body = {
    contents: [{ role: "user", parts: [{ text: buildPrompt(context, cleaned, studyHint) }] }],
    tools: [
      {
        functionDeclarations: [
          {
            name: FUNCTION_NAME,
            description: "Return the structured checklist selected from the library.",
            parameters: buildFunctionSchema(context)
          }
        ]
      }
    ],
    toolConfig: {
      functionCallingConfig: { mode: "ANY", allowedFunctionNames: [FUNCTION_NAME] }
    },
    generationConfig: { temperature: 0 }
  };

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (response.status === 429) return { ok: false, reason: "limit" };

    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      let data = null;
      try {
        data = JSON.parse(raw);
      } catch (error) {
        data = null;
      }
      if (isQuotaError(response.status, data)) return { ok: false, reason: "limit" };
      const message =
        data && data.error && typeof data.error.message === "string" && data.error.message.trim() !== ""
          ? data.error.message.trim()
          : "Gemini returned HTTP " + response.status + ".";
      return { ok: false, reason: "gemini", status: response.status, message: message.slice(0, 500) };
    }

    const data = await response.json();
    if (isQuotaError(response.status, data)) return { ok: false, reason: "limit" };

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const part = parts.find((item) => item.functionCall);
    if (!part || part.functionCall.name !== FUNCTION_NAME) {
      const text = parts
        .filter((item) => typeof item.text === "string")
        .map((item) => item.text.trim())
        .filter((item) => item !== "")
        .join(" ");
      return {
        ok: false,
        reason: "gemini",
        status: 502,
        message: text !== "" ? text.slice(0, 500) : "Gemini did not return the checklist."
      };
    }

    return { ok: true, cleaned, context, args: part.functionCall.args || {} };
  } catch (error) {
    if (controller.signal.aborted) {
      return { ok: false, reason: "timeout", status: 504, message: "Gemini did not respond within 12 seconds." };
    }
    return {
      ok: false,
      reason: "gemini",
      status: 502,
      message: error && error.message ? String(error.message) : "Gemini could not be reached."
    };
  } finally {
    clearTimeout(timer);
  }
}

export function buildChecklist({ args, context, studyHint }) {
  const requestedStudy = studyHint || args.study;
  if (args.studyUnclear === true && !studyHint) return { needsStudy: true };
  if (!context.studies.includes(requestedStudy)) return { needsStudy: true };

  const study = requestedStudy;
  const sex = study === "pelvis" ? "F" : args.sex === "F" ? "F" : "M";
  const tvs = study === "pelvis" && args.tvs === true;
  const variant =
    study === "abdomen" ? (sex === "F" ? "female" : "male") : study === "pelvis" ? (tvs ? "tvs" : "default") : "default";
  const rawHeader = args.header && typeof args.header === "object" ? args.header : {};
  const name = typeof rawHeader.name === "string" ? rawHeader.name.trim() : "";
  const age =
    typeof rawHeader.age === "string" || typeof rawHeader.age === "number"
      ? String(rawHeader.age).trim()
      : "";

  const findingIds = Array.isArray(args.findings)
    ? Array.from(new Set(args.findings.filter((id) => typeof id === "string")))
    : [];
  const slots =
    args.slots && typeof args.slots === "object" && !Array.isArray(args.slots) ? args.slots : {};
  const adv = Array.isArray(args.adv)
    ? Array.from(
        new Set(
          args.adv
            .filter((line) => typeof line === "string")
            .map((line) => line.trim())
            .filter((line) => line !== "")
        )
      )
    : [];

  return {
    needsStudy: false,
    checklist: {
      study,
      variant,
      header: { name, age, sex },
      findings: findingIds.map((id) => ({ id })),
      slots,
      adv
    }
  };
}
