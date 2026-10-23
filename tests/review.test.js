import test from "node:test";
import assert from "node:assert/strict";
import { assemble, reportToText } from "../public/src/assemble.js";
import { buildReviewItems } from "../public/src/review.js";
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
