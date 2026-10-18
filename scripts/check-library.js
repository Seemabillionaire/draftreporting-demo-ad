import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const LIBRARY_DIR = path.join(ROOT, "library");
const SCHEMA_PATH = path.join(LIBRARY_DIR, "schema.json");
const FILES = ["abdomen.json", "pelvis.json", "neck.json"];
const REQUIRED_VARIANTS = {
  abdomen: ["male", "female"],
  pelvis: ["tvs", "default"],
  neck: ["default"]
};
const VARIANT_LABELS = {
  abdomen: { male: "Male abdomen", female: "Female abdomen" },
  pelvis: { tvs: "Pelvis with TVS", default: "Pelvis without TVS" },
  neck: { default: "Neck" }
};

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function matchesType(value, type) {
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  return typeOf(value) === type;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function resolveRef(root, ref) {
  if (!ref.startsWith("#/")) throw new Error("Unsupported $ref: " + ref);
  return ref
    .slice(2)
    .split("/")
    .reduce((node, part) => node[part.replace(/~1/g, "/").replace(/~0/g, "~")], root);
}

function validateNode(schema, value, at, root, errors) {
  if (schema === true) return;
  if (schema === false) {
    errors.push(at + ": value is not allowed");
    return;
  }
  if (schema.$ref) {
    validateNode(resolveRef(root, schema.$ref), value, at, root, errors);
    return;
  }

  if (schema.anyOf) {
    const branchErrors = [];
    let matched = false;
    for (const branch of schema.anyOf) {
      const local = [];
      validateNode(branch, value, at, root, local);
      if (local.length === 0) {
        matched = true;
        break;
      }
      branchErrors.push(local);
    }
    if (!matched) {
      const detail = branchErrors.map((entry) => entry[0]).join(" OR ");
      errors.push(at + ": matches none of the allowed shapes (" + detail + ")");
    }
  }

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => matchesType(value, type))) {
      errors.push(at + ": expected " + types.join(" or ") + ", got " + typeOf(value));
      return;
    }
  }

  if ("const" in schema && !deepEqual(value, schema.const)) {
    errors.push(at + ": expected " + JSON.stringify(schema.const) + ", got " + JSON.stringify(value));
  }

  if (schema.enum && !schema.enum.some((option) => deepEqual(value, option))) {
    errors.push(
      at + ": expected one of " + schema.enum.map((option) => JSON.stringify(option)).join(", ") +
        ", got " + JSON.stringify(value)
    );
  }

  if (typeof value === "string" && schema.pattern) {
    if (!new RegExp(schema.pattern).test(value)) {
      errors.push(at + ": does not match /" + schema.pattern + "/ (got " + JSON.stringify(value) + ")");
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(at + ": needs at least " + schema.minItems + " item(s)");
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(at + ": allows at most " + schema.maxItems + " item(s)");
    }
    if (schema.uniqueItems) {
      for (let i = 0; i < value.length; i += 1) {
        for (let j = i + 1; j < value.length; j += 1) {
          if (deepEqual(value[i], value[j])) {
            errors.push(at + ": items " + i + " and " + j + " are duplicates");
          }
        }
      }
    }
    if (schema.items) {
      value.forEach((item, index) => {
        validateNode(schema.items, item, at + "[" + index + "]", root, errors);
      });
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) {
      errors.push(at + ": needs at least " + schema.minProperties + " field(s)");
    }
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in value)) errors.push(at + ': missing required field "' + key + '"');
      }
    }
    const properties = schema.properties || {};
    for (const [key, child] of Object.entries(value)) {
      if (properties[key]) {
        validateNode(properties[key], child, at + "." + key, root, errors);
      } else if (schema.additionalProperties === false) {
        errors.push(at + ': unexpected field "' + key + '"');
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        validateNode(schema.additionalProperties, child, at + "." + key, root, errors);
      }
    }
  }
}

function paragraphSegmentIds(paragraph) {
  return paragraph.segments.map((segment) => segment.id);
}

function sideSegmentIds(paragraph) {
  if (!paragraph.sideSplit) return [];
  return [
    ...paragraph.sideSplit.right.segments.map((segment) => segment.id),
    ...paragraph.sideSplit.left.segments.map((segment) => segment.id)
  ];
}

function collectSlotRefs(text, at, refs, errors) {
  if (typeof text !== "string") return;
  const pattern = /\{slot:([^{}]*)\}/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const slotId = match[1];
    if (!/^[a-z][a-z0-9_]*$/.test(slotId)) {
      errors.push(at + ": malformed slot reference {" + "slot:" + slotId + "}");
    } else {
      refs.push({ slotId, at });
    }
  }
}

function collectTextValues(library, errors) {
  const values = [];
  const push = (at, value) => {
    if (typeof value !== "string") return;
    values.push({ at, value });
    if (value !== "" && !value.startsWith("TEST")) {
      errors.push(at + ": placeholder text must start with TEST (got " + JSON.stringify(value) + ")");
    }
  };

  for (const [key, value] of Object.entries(library.headings)) push("headings." + key, value);
  push("impressionLabel", library.impressionLabel);
  push("normalImpression", library.normalImpression);
  library.signature.forEach((line, index) => push("signature[" + index + "]", line));
  library.slots.forEach((slot, index) => {
    if (slot.unit !== undefined) push("slots[" + index + "].unit", slot.unit);
    if (slot.options) slot.options.forEach((option, optionIndex) => push("slots[" + index + "].options[" + optionIndex + "]", option));
  });
  library.paragraphs.forEach((paragraph, pIndex) => {
    const base = "paragraphs[" + pIndex + "]";
    push(base + ".label", paragraph.label);
    push(base + ".separator", paragraph.separator);
    paragraph.segments.forEach((segment, sIndex) => push(base + ".segments[" + sIndex + "].text", segment.text));
    if (paragraph.sideSplit) {
      for (const side of ["right", "left"]) {
        const part = paragraph.sideSplit[side];
        push(base + ".sideSplit." + side + ".label", part.label);
        push(base + ".sideSplit." + side + ".separator", part.separator);
        part.segments.forEach((segment, sIndex) =>
          push(base + ".sideSplit." + side + ".segments[" + sIndex + "].text", segment.text)
        );
      }
    }
  });
  library.findings.forEach((finding, index) => {
    const base = "findings[" + index + "]";
    push(base + ".name", finding.name);
    finding.spoken.forEach((spoken, spokenIndex) => push(base + ".spoken[" + spokenIndex + "]", spoken));
    push(base + ".text", finding.text);
    if (finding.impression !== null) push(base + ".impression", finding.impression);
    if (finding.advLine !== null) push(base + ".advLine", finding.advLine);
    push(base + ".source", finding.source);
  });
  library.combinedImpressions.forEach((combined, index) => push("combinedImpressions[" + index + "].text", combined.text));
  library.advLines.forEach((line, index) => push("advLines[" + index + "]", line));

  return values;
}

function checkReferences(library, errors, warnings) {
  const variantIds = library.variants.map((variant) => variant.id);
  const expected = REQUIRED_VARIANTS[library.study];
  for (const id of expected) {
    if (!variantIds.includes(id)) errors.push("variants: missing required variant " + JSON.stringify(id));
  }
  for (const id of variantIds) {
    if (!expected.includes(id)) errors.push("variants: unexpected variant " + JSON.stringify(id));
  }

  for (const variant of library.variants) {
    if (library.headings[variant.id] === undefined && library.headings.default === undefined) {
      errors.push("headings: no heading for variant " + JSON.stringify(variant.id));
    }
  }
  if (library.study === "pelvis" && library.headings.tvs === undefined) {
    errors.push('headings: pelvis requires a "tvs" heading');
  }

  const paragraphIds = new Set();
  const segmentIds = new Set();
  for (const paragraph of library.paragraphs) {
    if (paragraphIds.has(paragraph.id)) errors.push("paragraphs: duplicate paragraph id " + JSON.stringify(paragraph.id));
    paragraphIds.add(paragraph.id);
    for (const id of [...paragraphSegmentIds(paragraph), ...sideSegmentIds(paragraph)]) {
      if (segmentIds.has(id)) errors.push("paragraphs: duplicate segment id " + JSON.stringify(id));
      segmentIds.add(id);
    }
    for (const variantId of paragraph.variants) {
      if (!variantIds.includes(variantId)) {
        errors.push("paragraphs: paragraph " + JSON.stringify(paragraph.id) + " lists unknown variant " + JSON.stringify(variantId));
      }
    }
  }

  const slotIds = new Set();
  for (const slot of library.slots) {
    if (slotIds.has(slot.id)) errors.push("slots: duplicate slot id " + JSON.stringify(slot.id));
    slotIds.add(slot.id);
  }

  const slotRefs = [];
  for (const paragraph of library.paragraphs) {
    paragraph.segments.forEach((segment) =>
      collectSlotRefs(segment.text, "paragraphs[" + paragraph.id + "].segments[" + segment.id + "]", slotRefs, errors)
    );
    if (paragraph.sideSplit) {
      for (const side of ["right", "left"]) {
        paragraph.sideSplit[side].segments.forEach((segment) =>
          collectSlotRefs(
            segment.text,
            "paragraphs[" + paragraph.id + "].sideSplit." + side + ".segments[" + segment.id + "]",
            slotRefs,
            errors
          )
        );
      }
    }
  }
  for (const finding of library.findings) {
    collectSlotRefs(finding.text, "findings[" + finding.id + "].text", slotRefs, errors);
    if (finding.impression !== null) collectSlotRefs(finding.impression, "findings[" + finding.id + "].impression", slotRefs, errors);
  }
  const usedSlots = new Set();
  for (const ref of slotRefs) {
    if (!slotIds.has(ref.slotId)) {
      errors.push(ref.at + ": unknown slot " + JSON.stringify(ref.slotId));
    } else {
      usedSlots.add(ref.slotId);
    }
  }
  for (const slot of library.slots) {
    if (!usedSlots.has(slot.id)) warnings.push("slots: slot " + JSON.stringify(slot.id) + " is never used");
  }

  const findingIds = new Set();
  const spokenSeen = new Map();
  const findingNames = new Map();
  for (const finding of library.findings) {
    if (findingIds.has(finding.id)) errors.push("findings: duplicate finding id " + JSON.stringify(finding.id));
    findingIds.add(finding.id);
    if (findingNames.has(finding.name)) errors.push("findings: duplicate finding name " + JSON.stringify(finding.name));
    findingNames.set(finding.name, finding.id);
    for (const spoken of finding.spoken) {
      if (spokenSeen.has(spoken)) {
        errors.push("findings: spoken name " + JSON.stringify(spoken) + " is used by both " + spokenSeen.get(spoken) + " and " + finding.id);
      }
      spokenSeen.set(spoken, finding.id);
    }

    const paragraph = library.paragraphs.find((entry) => entry.id === finding.paragraph);
    if (!paragraph) {
      errors.push("findings[" + finding.id + "]: unknown paragraph " + JSON.stringify(finding.paragraph));
      continue;
    }
    const normalIds = paragraphSegmentIds(paragraph);
    const splitIds = sideSegmentIds(paragraph);
    const allowed = finding.side ? splitIds : normalIds;
    if (finding.side && !paragraph.sideSplit) {
      errors.push("findings[" + finding.id + "]: side finding but paragraph has no sideSplit");
    }
    for (const segmentId of finding.replaces) {
      if (!allowed.includes(segmentId)) {
        errors.push("findings[" + finding.id + "]: replaces unknown segment " + JSON.stringify(segmentId));
      }
    }
    if (finding.insertAfter !== null && !allowed.includes(finding.insertAfter)) {
      errors.push("findings[" + finding.id + "]: insertAfter unknown segment " + JSON.stringify(finding.insertAfter));
    }
    if (finding.advLine !== null && !library.advLines.includes(finding.advLine)) {
      errors.push("findings[" + finding.id + "]: advLine is not one of the library advLines");
    }
  }

  for (const combined of library.combinedImpressions) {
    for (const findingId of combined.findings) {
      if (!findingIds.has(findingId)) {
        errors.push("combinedImpressions: unknown finding " + JSON.stringify(findingId));
      }
    }
  }
}

function renderText(text) {
  return text.replace(/\{slot:[a-z][a-z0-9_]*\}/g, "......");
}

function renderParagraph(paragraph) {
  const body = paragraph.segments.map((segment) => renderText(segment.text)).join(" ");
  return paragraph.label === "" ? body : paragraph.label + " " + paragraph.separator + body;
}

function normalReportLines(library, variantId) {
  const lines = [];
  lines.push(library.headings[variantId] !== undefined ? library.headings[variantId] : library.headings.default);
  for (const paragraph of library.paragraphs) {
    if (!paragraph.variants.includes(variantId)) continue;
    lines.push(renderParagraph(paragraph));
    lines.push("");
  }
  lines.push(library.impressionLabel + renderText(library.normalImpression));
  lines.push("");
  lines.push(...library.signature);
  return lines;
}

function loadLibraries(schema) {
  const results = [];
  for (const file of FILES) {
    const filePath = path.join(LIBRARY_DIR, file);
    const errors = [];
    const warnings = [];
    let library = null;
    try {
      library = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
      results.push({ file, library: null, errors: ["cannot read or parse JSON: " + error.message], warnings });
      continue;
    }
    validateNode(schema, library, file, schema, errors);
    if (errors.length === 0) {
      const expectedStudy = path.basename(file, ".json");
      if (library.study !== expectedStudy) {
        errors.push(file + '.study: expected "' + expectedStudy + '", got ' + JSON.stringify(library.study));
      }
      checkReferences(library, errors, warnings);
      collectTextValues(library, errors);
    }
    results.push({ file, library, errors, warnings });
  }
  return results;
}

function printNormalReports(results) {
  let count = 0;
  for (const result of results) {
    if (!result.library) continue;
    const library = result.library;
    for (const variant of library.variants) {
      const label = VARIANT_LABELS[library.study][variant.id];
      console.log("");
      console.log("=== " + label + " (" + library.study + " / " + variant.id + ") ===");
      for (const line of normalReportLines(library, variant.id)) console.log(line);
      count += 1;
    }
  }
  return count;
}

function printFindings(results) {
  let count = 0;
  for (const result of results) {
    if (!result.library) continue;
    const library = result.library;
    console.log("");
    console.log("=== Findings: " + library.study + " ===");
    for (const finding of library.findings) {
      console.log("");
      console.log(finding.id + " | " + finding.name + " | " + finding.status + " | paragraph " + finding.paragraph);
      console.log("  Replaces: " + (finding.replaces.length === 0 ? "(none)" : finding.replaces.join(", ")));
      console.log("  Insert after: " + (finding.insertAfter === null ? "(none)" : finding.insertAfter));
      console.log("  Text: " + renderText(finding.text));
      console.log("  Impression: " + (finding.impression === null ? "(none)" : renderText(finding.impression)));
      console.log("  Adv: " + (finding.advLine === null ? "(none)" : renderText(finding.advLine)));
      console.log("  Source: " + finding.source);
      count += 1;
    }
  }
  return count;
}

function main() {
  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
  } catch (error) {
    console.error("FAIL: cannot read schema.json: " + error.message);
    process.exitCode = 1;
    return;
  }

  console.log("Library check");
  console.log("Schema: library/schema.json");
  console.log("");

  const results = loadLibraries(schema);
  let failed = false;

  for (const result of results) {
    if (result.errors.length === 0) {
      console.log(result.file + ": PASS (schema and references)");
    } else {
      failed = true;
      console.log(result.file + ": FAIL");
      for (const error of result.errors) console.log("  ERROR " + error);
    }
    for (const warning of result.warnings) console.log("  WARN  " + warning);
  }

  if (failed) {
    console.log("");
    console.log("Check: FAIL - fix the errors above and run this script again.");
    process.exitCode = 1;
    return;
  }

  const normalCount = printNormalReports(results);
  const findingCount = printFindings(results);

  console.log("");
  console.log("---");
  console.log("Files validated: " + results.length + " (abdomen, pelvis, neck)");
  console.log("Normal reports printed: " + normalCount);
  console.log("Findings printed: " + findingCount);
  console.log("Placeholder check: every text value starts with TEST.");
  console.log("Check: PASS");
}

main();
