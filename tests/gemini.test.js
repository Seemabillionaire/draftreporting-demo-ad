import test from "node:test";
import assert from "node:assert/strict";
import { buildChecklist, stripClosingPhrases } from "../lib/gemini.js";

const CONTEXT = { studies: ["abdomen"] };
const CLOSING_PHRASES = [
  "please give report",
  "please give me report",
  "please give me the report",
  "please make a report",
  "please make report",
  "please make the report",
  "please draft report"
];

function args(overrides = {}) {
  return {
    studyUnclear: false,
    study: "abdomen",
    sex: "M",
    tvs: false,
    header: { name: "TEST PATIENT", age: 28, ageUnit: "years" },
    findings: [],
    slots: {},
    adv: [],
    ...overrides
  };
}

test("closing phrases are removed only at the end", () => {
  for (const phrase of CLOSING_PHRASES) {
    assert.equal(stripClosingPhrases("TEST DICTATION " + phrase), "TEST DICTATION");
    assert.equal(
      stripClosingPhrases("TEST DICTATION, " + phrase.toUpperCase() + "!"),
      "TEST DICTATION"
    );
  }
  assert.equal(
    stripClosingPhrases("TEST DICTATION please give report and more"),
    "TEST DICTATION please give report and more"
  );
});

test("ages are returned as digits and months or days stay spoken", () => {
  const cases = [
    [{ age: "twenty eight years", ageUnit: "years" }, "28"],
    [{ age: "twenty-eight", ageUnit: "years" }, "28"],
    [{ age: 28, ageUnit: "years" }, "28"],
    [{ age: "28 years", ageUnit: "years" }, "28"],
    [{ age: "28 years old" }, "28"],
    [{ age: 3, ageUnit: "months" }, "3 months"],
    [{ age: "3 months" }, "3 months"],
    [{ age: 10, ageUnit: "days" }, "10 days"],
    [{ age: "3 months 2 days" }, "3 months 2 days"],
    [{ age: "28 please give report", ageUnit: "years" }, "28"]
  ];

  for (const [header, expected] of cases) {
    const result = buildChecklist({
      args: args({ header: { name: "TEST PATIENT", ...header } }),
      context: CONTEXT,
      studyHint: null
    });
    assert.equal(result.needsStudy, false);
    assert.equal(result.checklist.header.age, expected);
  }
});

test("closing phrases cannot survive into advice, words or the name", () => {
  const result = buildChecklist({
    args: args({
      header: { name: "TEST PATIENT please give report", age: 28, ageUnit: "years" },
      slots: {
        a_len: 6.5,
        f_word: "please make the report",
        b_choice: "please draft report"
      },
      adv: ["Please give me the report.", "TEST ADVICE"]
    }),
    context: CONTEXT,
    studyHint: null
  });

  assert.equal(result.checklist.header.name, "TEST PATIENT");
  assert.deepEqual(result.checklist.adv, ["TEST ADVICE"]);
  assert.deepEqual(result.checklist.slots, { a_len: 6.5 });
  assert.ok(!JSON.stringify(result.checklist).toLowerCase().includes("please give"));
  assert.ok(!JSON.stringify(result.checklist).toLowerCase().includes("please make"));
  assert.ok(!JSON.stringify(result.checklist).toLowerCase().includes("please draft"));
});
