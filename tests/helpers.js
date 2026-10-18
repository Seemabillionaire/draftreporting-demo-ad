import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function loadLibrary(study) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "library", study + ".json"), "utf8"));
}

export function conflictLibrary() {
  const library = loadLibrary("abdomen");
  const finding = library.findings.find((item) => item.id === "f_a_two");
  finding.replaces = ["a2"];
  finding.insertAfter = null;
  return library;
}

export function checklist(overrides = {}) {
  return {
    study: "abdomen",
    variant: "male",
    findings: [],
    slots: {},
    adv: [],
    ...overrides
  };
}

export function paragraph(report, id, side = null) {
  return report.paragraphs.find((item) => item.id === id && item.side === side);
}

export function segment(report, paragraphId, segmentId) {
  const found = report.paragraphs
    .filter((item) => item.id === paragraphId)
    .flatMap((item) => item.segments)
    .find((item) => item.id === segmentId);
  return found;
}
