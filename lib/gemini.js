import fs from "node:fs";
import path from "node:path";

const STUDIES = ["abdomen", "pelvis", "neck"];
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const ATTEMPT_TIMEOUTS = [2000, 5000, 10000];
const FUNCTION_NAME = "build_report_checklist";

const CLOSING_PATTERN = /(?:^|[\s.,!?;:]+)(?:please[\s.,!?;:]+)?(?:give|make|draft)[\s.,!?;:]+(?:me[\s.,!?;:]+)?(?:(?:a|the)[\s.,!?;:]+)?report[\s.,!?;:]*$/i;

export function stripClosingPhrases(text) {
  if (typeof text !== "string") return "";
  return text.replace(CLOSING_PATTERN, "").replace(/[ \t]+/g, " ").trim();
}

const AGE_ONES = new Map([
  ["zero", 0],
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12],
  ["thirteen", 13],
  ["fourteen", 14],
  ["fifteen", 15],
  ["sixteen", 16],
  ["seventeen", 17],
  ["eighteen", 18],
  ["nineteen", 19]
]);
const AGE_TENS = new Map([
  ["twenty", 20],
  ["thirty", 30],
  ["forty", 40],
  ["fifty", 50],
  ["sixty", 60],
  ["seventy", 70],
  ["eighty", 80],
  ["ninety", 90]
]);

function wordsToNumber(words) {
  let total = 0;
  let current = 0;
  let sawNumber = false;
  for (const word of words) {
    if (word === "and") continue;
    if (AGE_ONES.has(word)) {
      current += AGE_ONES.get(word);
      sawNumber = true;
    } else if (AGE_TENS.has(word)) {
      current += AGE_TENS.get(word);
      sawNumber = true;
    } else if (word === "hundred") {
      current = (current || 1) * 100;
      sawNumber = true;
    } else if (word === "thousand") {
      total += (current || 1) * 1000;
      current = 0;
      sawNumber = true;
    } else {
      return null;
    }
  }
  return sawNumber ? total + current : null;
}

function parseAgeNumber(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value !== "string") return null;
  const text = value
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text === "") return null;
  if (/^\d+$/.test(text)) return Number(text);
  return wordsToNumber(text.split(" "));
}

function formatAge(value, unit) {
  if (value === undefined || value === null) return "";
  let text = String(value).trim();
  if (text === "") return "";
  let unitText = typeof unit === "string" ? unit.toLowerCase() : "";

  const unitMatch = text.match(/\s*(years?|yrs?|months?|days?)\.?(?:\s+old)?\s*$/i);
  if (unitMatch) {
    text = text.slice(0, unitMatch.index).trim();
    unitText = unitMatch[1].toLowerCase();
  }

  const number = parseAgeNumber(text);
  if (number === null) return String(value).trim();
  if (unitText.startsWith("month")) return number + " " + (number === 1 ? "month" : "months");
  if (unitText.startsWith("day")) return number + " " + (number === 1 ? "day" : "days");
  return String(number);
}

export function normalizeIntoBy(text) {
  if (typeof text !== "string") return "";
  return text.replace(/\b(\d+(?:\.\d+)?)\s+into\s+(\d+(?:\.\d+)?)\b/gi, "$1 by $2");
}

const FILLER_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is",
  "it", "like", "of", "on", "or", "please", "that", "the", "there", "this",
  "to", "uh", "um", "was", "were", "with"
]);

export function splitImpression(text) {
  if (typeof text !== "string") return { body: "", impression: "" };
  const match = text.match(/\bimpression\b\s*[:\-–—]?\s*/i);
  if (!match) return { body: text.trim(), impression: "" };
  return {
    body: text.slice(0, match.index).trim(),
    impression: text.slice(match.index + match[0].length).trim()
  };
}

function normalizeComparison(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

export function findImpressionUnmatched(impression, context) {
  if (typeof impression !== "string" || impression.trim() === "") return [];
  const terms = (context.findings || [])
    .flatMap((finding) => [finding.name, ...(finding.spoken || [])])
    .map(normalizeComparison)
    .filter((term) => term !== "");
  const clauses = impression
    .split(/[,;.]+|\band\b|\bwith\b/gi)
    .map((clause) => clause.trim())
    .filter((clause) => clause !== "");
  return clauses.filter((clause) => {
    const normalized = normalizeComparison(clause);
    return !terms.some((term) => normalized.includes(term));
  });
}

export function normalizeUnmatched(values, usedNumbers = []) {
  const used = new Set(usedNumbers.map((value) => String(value)));
  const phrases = [];
  const seen = new Set();

  for (const value of values) {
    if (typeof value !== "string") continue;
    const cleaned = stripClosingPhrases(value);
    const parts = cleaned.split(/[;,]+|(?<!\\d)\\.(?!\\d)/).map((part) => part.trim()).filter(Boolean);
    for (const part of parts) {
      const words = part
        .split(/\s+/)
        .filter((word) => !FILLER_WORDS.has(word.toLowerCase()))
        .filter((word) => !used.has(word.replace(/[.,]/g, "")));
      if (words.length === 0) continue;
      const phrase = words.slice(0, 8).join(" ");
      const key = phrase.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      phrases.push(phrase);
    }
  }

  return phrases;
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
        side: finding.side === true,
        sideGroup: typeof finding.sideGroup === "string" ? finding.sideGroup : null,
        study
      });
    }
    for (const slot of library.slots) {
      if (!slots.has(slot.id)) slots.set(slot.id, { ...slot, study });
    }
  }

  return { studies, findings, slots: Array.from(slots.values()) };
}

function assertRequiredProperties(schema, path) {
  if (!schema || typeof schema !== "object") return;
  if (schema.type === "OBJECT") {
    const properties = schema.properties || {};
    for (const name of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(properties, name)) {
        throw new Error("Schema required property missing at " + path + ": " + name);
      }
    }
    for (const [name, value] of Object.entries(properties)) {
      assertRequiredProperties(value, path + ".properties." + name);
    }
  }
  if (schema.type === "ARRAY") {
    assertRequiredProperties(schema.items, path + ".items");
  }
}

export function buildFunctionSchema(context) {
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

  const schema = {
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
        description: "Only when the doctor explicitly says male or female. Never infer from a name. Omit if not stated."
      },
      tvs: {
        type: "BOOLEAN",
        description: "True only when a TVS is explicitly spoken."
      },
      header: {
        type: "OBJECT",
        properties: {
          age: {
            type: "INTEGER",
            description: "Patient age as an integer number, or omit if not spoken."
          },
          ageUnit: {
            type: "STRING",
            enum: ["years", "months", "days"],
            description: "Unit for the age. Omit if the age was not spoken."
          }
        },
        required: []
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
      },
      unmatched: {
        type: "ARRAY",
        items: { type: "STRING" },
        description: "Spoken words that match no finding, slot or advice line."
      },
      sideMissing: {
        type: "ARRAY",
        items: { type: "STRING" },
        description: "Spoken side-specific findings where right or left was not stated."
      },
      sideGroupMissing: {
        type: "ARRAY",
        items: { type: "STRING" },
        description: "Side group values spoken without a right or left. Do not select either finding."
      }
    },
    required: ["studyUnclear", "study", "tvs", "header", "findings", "slots", "adv", "unmatched", "sideMissing", "sideGroupMissing"]
  };
  assertRequiredProperties(schema, "parameters");
  return schema;
}

export function buildPrompt(context, transcript, studyHint) {
  const findingLines = context.studies.map((study) => {
    const list = context.findings
      .filter((finding) => finding.study === study)
      .map((finding) => finding.id + " = " + finding.name + " (spoken: " + finding.spoken.join(", ") + ")" + (finding.side ? " [side-specific]" : "") + (finding.sideGroup ? " [side group: " + finding.sideGroup + "]" : ""))
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
    "Only set sex when male or female is explicitly spoken. Never infer sex from a name. Omit sex when it is not stated. Pelvis is female by study.",
    "Do not extract a patient name, Patient ID or Referred by. Never put a patient name in unmatched.",
    "If the study is not explicitly spoken, set studyUnclear to true; the screen selection is used. If the spoken study conflicts with the screen, the app will ask.",
    "A finding marked side-specific is valid only when right or left is explicitly spoken. Otherwise put the spoken phrase in sideMissing and do not select that finding.",
    "Findings sharing a side group are one condition, one per side. Select one only when right or left is explicitly spoken. If the condition is spoken without a side, put the side group value in sideGroupMissing and select neither finding.",
    "Return the patient age as an integer and set ageUnit to years, months or days. Omit both if the age was not spoken.",
    "Only fill a number slot from a spoken number with a unit or measurement word. Do not treat numbers in finding names, grades or counts (for example 'finding one') as measurements. Interpret 'X into Y' as 'X by Y' with two numbers.",
    "If the study cannot be determined, set studyUnclear to true. Do not guess.",
    studyHint ? "The study is " + studyHint + "; set that study and studyUnclear false." : "",
    "Findings by study:",
    findingLines.join("\n"),
    "Slots by study:",
    slotLines.join("\n"),
    "Return only advice that was spoken; otherwise return an empty array.",
    "Put clearly spoken clinical words that match no finding, slot or advice line into unmatched as short phrases. Omit filler words and numbers already used as measurements. These words must not be written into the report.",
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
  const cleaned = normalizeIntoBy(stripClosingPhrases(transcript));
  if (cleaned === "") return { ok: false, reason: "empty" };
  const parts = splitImpression(cleaned);
  const dictation = parts.body;
  const spokenImpression = parts.impression;

  let context;
  try {
    context = await loadContext(root);
  } catch (error) {
    return { ok: false, reason: "library" };
  }

  const body = {
    contents: [{ role: "user", parts: [{ text: buildPrompt(context, dictation, studyHint) }] }],
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
  let lastFailure = {
    ok: false,
    reason: "timeout",
    status: 504,
    message: "Gemini did not respond after 3 attempts."
  };

  for (const timeoutMs of ATTEMPT_TIMEOUTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

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
        lastFailure = {
          ok: false,
          reason: "gemini",
          status: response.status,
          message: message.slice(0, 500)
        };
        continue;
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
        lastFailure = {
          ok: false,
          reason: "gemini",
          status: 502,
          message: text !== "" ? text.slice(0, 500) : "Gemini did not return the checklist."
        };
        continue;
      }

      return {
      ok: true,
      model: typeof data.modelVersion === "string" ? data.modelVersion : MODEL,
      cleaned,
      context,
      spokenImpression,
      impressionUnmatched: findImpressionUnmatched(spokenImpression, context),
      args: part.functionCall.args || {}
      };
    } catch (error) {
      if (controller.signal.aborted) {
        lastFailure = {
          ok: false,
          reason: "timeout",
          status: 504,
          message: "Gemini did not respond after 3 attempts."
        };
      } else {
        lastFailure = {
          ok: false,
          reason: "gemini",
          status: 502,
          message: error && error.message ? String(error.message) : "Gemini could not be reached."
        };
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return lastFailure;
}

export function buildChecklist({ args, context, studyHint, screenStudy }) {
  const screen = context.studies.includes(screenStudy) ? screenStudy : null;
  let study;

  if (studyHint) {
    if (!context.studies.includes(studyHint)) return { needsStudy: true };
    study = studyHint;
  } else if (args.studyUnclear === true || !context.studies.includes(args.study)) {
    if (!screen) return { needsStudy: true };
    study = screen;
  } else if (screen && args.study !== screen) {
    return { needsStudy: true, conflict: true };
  } else {
    study = args.study;
  }

  const sex = study === "pelvis" ? "F" : args.sex === "F" ? "F" : args.sex === "M" ? "M" : "";
  const tvs = study === "pelvis" && args.tvs === true;
  const variant =
    study === "abdomen"
      ? sex === "F"
        ? "female"
        : sex === "M"
          ? "male"
          : null
      : study === "pelvis"
        ? tvs
          ? "tvs"
          : "default"
        : "default";
  const rawHeader = args.header && typeof args.header === "object" ? args.header : {};
  const ageValue =
    typeof rawHeader.age === "string" ? stripClosingPhrases(rawHeader.age) : rawHeader.age;
  const age = formatAge(ageValue, rawHeader.ageUnit);

  const knownFindingIds = new Set(
    (context.findings || []).filter((finding) => finding.study === study).map((finding) => finding.id)
  );
  const spokenFindingIds = Array.isArray(args.findings)
    ? Array.from(new Set(args.findings.filter((id) => typeof id === "string")))
    : [];
  const findingIds = spokenFindingIds.filter((id) => knownFindingIds.has(id));
  const selectedFindings = findingIds
    .map((id) => (context.findings || []).find((finding) => finding.id === id))
    .filter(Boolean);
  const groupSelections = new Map();
  for (const finding of selectedFindings) {
    if (typeof finding.sideGroup !== "string" || finding.sideGroup === "") continue;
    if (!groupSelections.has(finding.sideGroup)) groupSelections.set(finding.sideGroup, []);
    groupSelections.get(finding.sideGroup).push(finding.id);
  }
  const sideConflicts = Array.from(groupSelections.entries())
    .filter((entry) => entry[1].length > 1)
    .map((entry) => ({ group: entry[0], findings: entry[1] }));
  const selectedGroups = new Set(groupSelections.keys());
  const knownGroups = new Set(
    (context.findings || [])
      .map((finding) => finding.sideGroup)
      .filter((group) => typeof group === "string" && group !== "")
  );
  const sideGroupMissing = Array.isArray(args.sideGroupMissing)
    ? Array.from(
        new Set(
          args.sideGroupMissing
            .filter((group) => typeof group === "string")
            .map((group) => stripClosingPhrases(group))
            .filter((group) => group !== "" && knownGroups.has(group) && !selectedGroups.has(group))
        )
      )
    : [];

  const rawSlots =
    args.slots && typeof args.slots === "object" && !Array.isArray(args.slots) ? args.slots : {};
  const slots = {};
  for (const [id, value] of Object.entries(rawSlots)) {
    if (typeof value === "string") {
      const cleaned = stripClosingPhrases(value);
      if (cleaned !== "") slots[id] = cleaned;
    } else {
      slots[id] = value;
    }
  }
  const usedNumbers = Object.values(slots)
    .filter((value) => typeof value === "number")
    .map((value) => String(value));

  const rawUnmatched = Array.isArray(args.unmatched)
    ? args.unmatched.filter((word) => typeof word === "string")
    : [];
  for (const id of spokenFindingIds) {
    if (!knownFindingIds.has(id)) rawUnmatched.push("Unknown finding ID: " + id);
  }
  const uniqueUnmatched = normalizeUnmatched(rawUnmatched, usedNumbers);
  const sideMissing = normalizeUnmatched(
    Array.isArray(args.sideMissing) ? args.sideMissing : [],
    usedNumbers
  );

  const adv = Array.isArray(args.adv)
    ? Array.from(
        new Set(
          args.adv
            .filter((line) => typeof line === "string")
            .map((line) => stripClosingPhrases(line))
            .filter((line) => line !== "")
        )
      )
    : [];

  return {
    needsStudy: false,
    checklist: {
      study,
      variant,
      header: { name: "", age, sex },
      findings: findingIds.map((id) => ({ id })),
      slots,
      adv
    },
    unmatched: uniqueUnmatched,
    sideMissing,
    sideGroupMissing,
    sideConflicts
  };
}
