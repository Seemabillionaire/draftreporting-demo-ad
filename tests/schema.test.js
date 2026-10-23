import test from "node:test";
import assert from "node:assert/strict";
import { buildFunctionSchema } from "../lib/gemini.js";
import { loadLibrary } from "./helpers.js";

function assertRequiredNames(schema, path) {
  if (!schema || typeof schema !== "object") return;
  if (schema.type === "OBJECT") {
    const properties = schema.properties || {};
    for (const name of schema.required || []) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(properties, name),
        "Missing required property at " + path + ": " + name
      );
    }
    for (const [name, value] of Object.entries(properties)) {
      assertRequiredNames(value, path + ".properties." + name);
    }
  }
  if (schema.type === "ARRAY") {
    assertRequiredNames(schema.items, path + ".items");
  }
}

for (const study of ["abdomen", "pelvis", "neck"]) {
  test("function schema required names exist for " + study, () => {
    const library = loadLibrary(study);
    const context = {
      studies: [study],
      findings: library.findings.map((finding) => ({ id: finding.id, study })),
      slots: library.slots.map((slot) => ({ ...slot, study }))
    };

    const schema = buildFunctionSchema(context);
    assertRequiredNames(schema, "parameters");
    assert.ok(schema.required.includes("unmatched"));
    assert.ok(Object.prototype.hasOwnProperty.call(schema.properties, "unmatched"));
  });
}
