import test from "node:test";
import assert from "node:assert/strict";
import { assemble, reportToText } from "../public/src/assemble.js";
import { buildReviewItems, buildRuleBlockers } from "../public/src/review.js";
import { conflictLibrary, checklist, loadLibrary } from "./helpers.js";

test("unmatched words are listed and absent from the report", () => {
  const library = loadLibrary("abdomen");
  const report = assemble(library, checklist());
  const items = buildReviewItems({
    report,
    library,
    unmatched: ["TEST UNKNOWN FINDING"]
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].key, "unmatched");
  assert.deepEqual(items[0].items, ["TEST UNKNOWN FINDING"]);
  assert.ok(!reportToText(report).includes("TEST UNKNOWN FINDING"));
});

test("conflicts, confirmation, impression blanks and Adv are all listed", () => {
  const library = conflictLibrary();
  const report = assemble(
    library,
    checklist({
      findings: [
        { id: "f_a_one" },
        { id: "f_a_two" },
        { id: "f_confirm" },
        { id: "f_no_impression" }
      ],
      slots: { f_word: "TEST WORD" },
      adv: ["TEST Adv: line three."]
    })
  );
  const items = buildReviewItems({ report, library });
  const keys = items.map((item) => item.key);

  assert.ok(keys.includes("conflicts"));
  assert.ok(keys.includes("forConfirmation"));
  assert.ok(keys.includes("missingImpressions"));
  assert.ok(keys.includes("unmatchedAdv"));
  assert.equal(report.flags.conflicts.length, 1);
  assert.equal(report.flags.forConfirmation.length, 1);
  assert.equal(report.flags.missingImpressions.length, 1);
  assert.equal(report.adv.filter((line) => line.highlighted).length, 1);
});

test("sex and side block Final until chosen", () => {
  assert.deepEqual(
    buildRuleBlockers({ study: "abdomen", sex: "", sideMissing: [] }),
    ["Sex not stated"]
  );
  assert.deepEqual(
    buildRuleBlockers({ study: "pelvis", sex: "F", sideMissing: [] }),
    []
  );
  assert.deepEqual(
    buildRuleBlockers({
      study: "abdomen",
      sex: "M",
      sideMissing: ["left kidney cyst"],
      sideFindingChosen: false
    }),
    ["Side not stated: left kidney cyst"]
  );
  assert.deepEqual(
    buildRuleBlockers({
      study: "abdomen",
      sex: "M",
      sideMissing: ["left kidney cyst"],
      sideFindingChosen: true
    }),
    []
  );
});
test("spoken impression is shown in the yellow panel and uses saved lines", () => {
  const library = loadLibrary("abdomen");
  const report = assemble(library, checklist());
  const items = buildReviewItems({
    report,
    library,
    spokenImpression: "TEST SPOKEN IMPRESSION",
    impressionUnmatched: ["TEST UNKNOWN IMPRESSION TERM"]
  });

  const section = items.find((item) => item.key === "spokenImpression");
  assert.ok(section);
  assert.deepEqual(section.items, [
    "You also said this impression: TEST SPOKEN IMPRESSION. The report uses your saved lines.",
    "Said in the impression but not as a finding: TEST UNKNOWN IMPRESSION TERM"
  ]);
});
test("sideGroup missing blocks Final and both sides are flagged", () => {
  assert.deepEqual(
    buildRuleBlockers({
      study: "pelvis",
      sex: "F",
      sideGroupMissing: ["TEST PELVIS SIDE GROUP"]
    }),
    ["Side not stated for TEST PELVIS SIDE GROUP"]
  );

  const library = loadLibrary("pelvis");
  const items = buildReviewItems({
    report: null,
    library,
    sideConflicts: [
      {
        group: "TEST PELVIS SIDE GROUP",
        findings: ["pf_right", "pf_left"]
      }
    ]
  });
  const section = items.find((item) => item.key === "sideConflicts");
  assert.ok(section);
  assert.ok(section.items[0].includes("TEST PELVIS RIGHT FINDING"));
  assert.ok(section.items[0].includes("TEST PELVIS LEFT FINDING"));
});