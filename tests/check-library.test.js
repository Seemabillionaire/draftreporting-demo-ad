import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadLibrary } from "./helpers.js";
import { validateLibraryData, textRuleErrors } from "../scripts/check-library.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const schemas = {
  placeholder: JSON.parse(fs.readFileSync(path.join(ROOT, "library", "schema.json"), "utf8")),
  real: JSON.parse(fs.readFileSync(path.join(ROOT, "library", "schema.real.json"), "utf8"))
};

function replaceTest(value) {
  if (typeof value === "string") return value.replaceAll("TEST", "REAL");
  if (Array.isArray(value)) return value.map(replaceTest);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceTest(item)]));
  }
  return value;
}

test("placeholder and real-style libraries select their own schemas", () => {
  const placeholder = loadLibrary("abdomen");
  const real = replaceTest(structuredClone(placeholder));
  real.paragraphs[0].separator = "";

  const placeholderResult = validateLibraryData(placeholder, schemas);
  const realResult = validateLibraryData(real, schemas);

  assert.equal(placeholderResult.mode, "placeholder");
  assert.deepEqual(placeholderResult.errors, []);
  assert.equal(realResult.mode, "real");
  assert.deepEqual(realResult.errors, []);
});

test("real text rule rejects TEST text and the placeholder rule requires it", () => {
  const realErrors = [];
  textRuleErrors([{ at: "file", value: "TEST text" }], "real", realErrors);
  assert.ok(realErrors.length > 0);

  const placeholderErrors = [];
  textRuleErrors([{ at: "file", value: "real text" }], "placeholder", placeholderErrors);
  assert.ok(placeholderErrors.length > 0);
});
