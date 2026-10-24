import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChecklist,
  buildPrompt,
  findImpressionUnmatched,
  normalizeIntoBy,
  splitImpression,
  stripClosingPhrases,
  understandDictation
} from "../lib/gemini.js";
import { assemble, reportToText } from "../public/src/assemble.js";
import { loadLibrary } from "./helpers.js";

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

  assert.equal(result.checklist.header.name, "");
  assert.deepEqual(result.checklist.adv, ["TEST ADVICE"]);
  assert.deepEqual(result.checklist.slots, { a_len: 6.5 });
  assert.ok(!JSON.stringify(result.checklist).toLowerCase().includes("please give"));
  assert.ok(!JSON.stringify(result.checklist).toLowerCase().includes("please make"));
  assert.ok(!JSON.stringify(result.checklist).toLowerCase().includes("please draft"));
});

test("unknown findings and unmatched words stay out of the checklist", () => {
  const context = {
    studies: ["abdomen"],
    findings: [{ id: "f_a_one", study: "abdomen" }]
  };
  const result = buildChecklist({
    args: args({
      findings: ["f_a_one", "f_missing"],
      unmatched: ["TEST UNKNOWN FINDING", "please give report"]
    }),
    context,
    studyHint: null
  });

  assert.deepEqual(result.checklist.findings, [{ id: "f_a_one" }]);
  assert.deepEqual(result.unmatched, [
    "TEST UNKNOWN FINDING",
    "Unknown finding ID: f_missing"
  ]);
});
test("sex is only what was said; pelvis is female", () => {
  const context = { studies: ["abdomen", "pelvis"], findings: [] };
  const abdomenUnknown = buildChecklist({
    args: args({ study: "abdomen", sex: undefined }),
    context,
    screenStudy: "abdomen"
  });
  assert.equal(abdomenUnknown.checklist.header.sex, "");
  assert.equal(abdomenUnknown.checklist.variant, null);

  const abdomenFemale = buildChecklist({
    args: args({ study: "abdomen", sex: "F" }),
    context,
    screenStudy: "abdomen"
  });
  assert.equal(abdomenFemale.checklist.header.sex, "F");
  assert.equal(abdomenFemale.checklist.variant, "female");

  const pelvis = buildChecklist({
    args: args({ study: "pelvis", sex: undefined }),
    context,
    screenStudy: "pelvis"
  });
  assert.equal(pelvis.checklist.header.sex, "F");
});

test("a spoken patient name is never extracted", () => {
  const result = buildChecklist({
    args: args({
      study: "abdomen",
      sex: "M",
      header: { name: "TEST SPOKEN NAME", age: 28, ageUnit: "years" }
    }),
    context: { studies: ["abdomen"], findings: [] },
    screenStudy: "abdomen"
  });
  assert.equal(result.checklist.header.name, "");
});

test("study uses the screen when not spoken and asks on conflict", () => {
  const context = { studies: ["abdomen", "pelvis", "neck"], findings: [] };

  const unclear = buildChecklist({
    args: args({ studyUnclear: true, study: "abdomen" }),
    context,
    screenStudy: "neck"
  });
  assert.equal(unclear.needsStudy, false);
  assert.equal(unclear.checklist.study, "neck");

  const conflict = buildChecklist({
    args: args({ studyUnclear: false, study: "abdomen" }),
    context,
    screenStudy: "pelvis"
  });
  assert.equal(conflict.needsStudy, true);
  assert.equal(conflict.conflict, true);
});

test("a side-specific finding without a side is listed", () => {
  const result = buildChecklist({
    args: args({ sideMissing: ["left kidney cyst"], findings: [] }),
    context: { studies: ["abdomen"], findings: [] },
    screenStudy: "abdomen"
  });
  assert.deepEqual(result.sideMissing, ["left kidney cyst"]);
  assert.deepEqual(result.checklist.findings, []);
});

test("measurements normalize X into Y and ignore used numbers in unmatched text", () => {
  assert.equal(normalizeIntoBy("TEST 5 into 3 cm"), "TEST 5 by 3 cm");
  const result = buildChecklist({
    args: args({
      slots: { a_len: 5 },
      unmatched: ["um the 5 liver thing", "6.5 and the kidney"]
    }),
    context: { studies: ["abdomen"], findings: [] },
    screenStudy: "abdomen"
  });
  assert.deepEqual(result.unmatched, ["liver thing", "6.5 kidney"]);
});

test("closing grammar accepts optional please, me, a and the", () => {
  const cases = [
    "give report",
    "please give me a report",
    "please give me the report",
    "please make a report",
    "make report",
    "draft the report"
  ];
  for (const phrase of cases) {
    assert.equal(stripClosingPhrases("TEST DICTATION " + phrase + "."), "TEST DICTATION");
  }
});
test("the prompt requires units and rejects finding or grade numbers", () => {
  const prompt = buildPrompt({ studies: ["abdomen"], findings: [], slots: [] }, "TEST", null);
  assert.ok(prompt.includes("Only fill a number slot from a spoken number with a unit or measurement word"));
  assert.ok(prompt.includes("Do not treat numbers in finding names, grades or counts"));
  assert.ok(prompt.includes("Interpret 'X into Y' as 'X by Y'"));
});
test("spoken impression is separated and kept out of the Gemini request", async () => {
  assert.deepEqual(splitImpression("TEST BEFORE Impression: TEST IMPRESSION WORDS"), {
    body: "TEST BEFORE",
    impression: "TEST IMPRESSION WORDS"
  });

  const originalFetch = globalThis.fetch;
  let prompt = "";
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    prompt = body.contents[0].parts[0].text;
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ functionCall: { name: "build_report_checklist", args: {} } }]
            }
          }
        ]
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const result = await understandDictation({
      transcript: "TEST BEFORE Impression: TEST IMPRESSION WORDS",
      apiKey: "test",
      studyHint: null,
      root: process.cwd()
    });
    assert.equal(result.spokenImpression, "TEST IMPRESSION WORDS");
    assert.ok(!prompt.includes("TEST IMPRESSION WORDS"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("impression terms that match no finding are listed", () => {
  const context = {
    findings: [{ name: "TEST KNOWN FINDING", spoken: ["TEST KNOWN"] }]
  };
  assert.deepEqual(
    findImpressionUnmatched("TEST KNOWN FINDING and TEST UNKNOWN THING", context),
    ["TEST UNKNOWN THING"]
  );
  assert.deepEqual(
    findImpressionUnmatched("TEST UNKNOWN THING", context),
    ["TEST UNKNOWN THING"]
  );
});
test("sideGroup right, left, missing and both", () => {
  const library = loadLibrary("pelvis");
  const context = {
    studies: ["pelvis"],
    findings: library.findings.map((finding) => ({
      id: finding.id,
      name: finding.name,
      spoken: finding.spoken,
      side: finding.side,
      sideGroup: finding.sideGroup,
      study: "pelvis"
    }))
  };
  const build = (findings, sideGroupMissing = []) =>
    buildChecklist({
      args: args({
        study: "pelvis",
        sex: "F",
        findings,
        sideGroupMissing
      }),
      context,
      screenStudy: "pelvis"
    });

  const right = build(["pf_right"]);
  assert.deepEqual(right.checklist.findings, [{ id: "pf_right" }]);
  assert.deepEqual(right.sideGroupMissing, []);
  assert.deepEqual(right.sideConflicts, []);
  assert.ok(reportToText(assemble(library, right.checklist)).includes("TEST pelvis right finding replaces A1."));

  const left = build(["pf_left"]);
  assert.deepEqual(left.checklist.findings, [{ id: "pf_left" }]);
  assert.ok(reportToText(assemble(library, left.checklist)).includes("TEST pelvis left finding replaces A2."));

  const missing = build([], ["TEST PELVIS SIDE GROUP"]);
  assert.deepEqual(missing.checklist.findings, []);
  assert.deepEqual(missing.sideGroupMissing, ["TEST PELVIS SIDE GROUP"]);

  const both = build(["pf_right", "pf_left"]);
  assert.deepEqual(both.checklist.findings, [{ id: "pf_right" }, { id: "pf_left" }]);
  assert.deepEqual(both.sideConflicts, [
    { group: "TEST PELVIS SIDE GROUP", findings: ["pf_right", "pf_left"] }
  ]);
});