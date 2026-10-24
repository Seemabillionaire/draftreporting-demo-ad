import test from "node:test";
import assert from "node:assert/strict";
import { assemble, normalizeAge, paragraphBlocks, reportToText, BLANK } from "../public/src/assemble.js";
import { validateChecklist, validateReport } from "../public/src/validate.js";
import { loadLibrary, conflictLibrary, checklist, paragraph, segment } from "./helpers.js";

function assertValid(library, plan, report) {
  assert.deepEqual(validateReport(library, plan, report), []);
}

test("normal male", () => {
  const library = loadLibrary("abdomen");
  const plan = checklist();
  const report = assemble(library, plan);

  assert.equal(report.heading, "TEST HEADING ABDOMEN");
  assert.deepEqual(
    report.paragraphs.map((item) => item.id),
    ["p_organ_a", "p_organ_b", "p_paired", "p_no_label"]
  );
  assert.equal(segment(report, "p_organ_a", "a2").text, "TEST normal sentence A2 measuring " + BLANK + " cm.");
  assert.equal(report.impression.points.length, 1);
  assert.equal(report.impression.points[0].text, library.normalImpression);
  assert.equal(report.signature.length, 3);
  assert.ok(!reportToText(report).includes("TEST ORGAN C"));
  assertValid(library, plan, report);
});

test("normal female", () => {
  const library = loadLibrary("abdomen");
  const plan = checklist({ variant: "female" });
  const report = assemble(library, plan);

  assert.ok(report.paragraphs.some((item) => item.id === "p_female_only"));
  assert.equal(segment(report, "p_female_only", "c1").text, "TEST normal sentence C1.");
  assertValid(library, plan, report);
});

test("one finding", () => {
  const library = loadLibrary("abdomen");
  const plan = checklist({ findings: [{ id: "f_a_one" }] });
  const report = assemble(library, plan);

  assert.deepEqual(
    paragraph(report, "p_organ_a").segments.map((item) => item.id),
    ["a1", "f_a_one"]
  );
  assert.equal(segment(report, "p_organ_a", "f_a_one").text, "TEST finding A-one replaces A2.");
  assert.equal(report.impression.points[0].text, "TEST impression A-one.");
  assertValid(library, plan, report);
});

test("two findings on different paragraphs", () => {
  const library = loadLibrary("abdomen");
  const plan = checklist({ findings: [{ id: "f_a_one" }, { id: "f_confirm" }] });
  const report = assemble(library, plan);

  assert.equal(segment(report, "p_organ_a", "f_a_one").text, "TEST finding A-one replaces A2.");
  assert.equal(segment(report, "p_no_label", "f_confirm").text, "TEST finding marked for confirmation.");
  assert.equal(report.impression.points.length, 2);
  assertValid(library, plan, report);
});

test("two findings on the same paragraph", () => {
  const library = loadLibrary("abdomen");
  const plan = checklist({ findings: [{ id: "f_a_one" }, { id: "f_a_two" }] });
  const report = assemble(library, plan);

  assert.deepEqual(
    paragraph(report, "p_organ_a").segments.map((item) => item.id),
    ["a1", "f_a_two", "f_a_one"]
  );
  const text = reportToText(report);
  assert.equal(text.split("TEST finding A-one replaces A2.").length - 1, 1);
  assert.equal(text.split("TEST finding A-two inserted after A1.").length - 1, 1);
  assertValid(library, plan, report);
});

test("conflict", () => {
  const library = conflictLibrary();
  const plan = checklist({ findings: [{ id: "f_a_one" }, { id: "f_a_two" }] });
  const report = assemble(library, plan);

  const found = paragraph(report, "p_organ_a");
  assert.deepEqual(found.segments.map((item) => item.id), ["a1", "f_a_one", "f_a_two"]);
  assert.equal(report.flags.conflicts.length, 1);
  assert.deepEqual(report.flags.conflicts[0].findings, ["f_a_one", "f_a_two"]);
  assert.equal(segment(report, "p_organ_a", "f_a_one").text, "TEST finding A-one replaces A2.");
  assert.equal(segment(report, "p_organ_a", "f_a_two").text, "TEST finding A-two inserted after A1.");
  assertValid(library, plan, report);
});

test("unfilled slot", () => {
  const library = loadLibrary("abdomen");
  const plan = checklist({ findings: [{ id: "f_no_impression" }] });
  const report = assemble(library, plan);

  assert.equal(
    segment(report, "p_organ_b", "f_no_impression").text,
    "TEST finding with no impression, word " + BLANK + "."
  );
  assert.ok(report.flags.unfilledSlots.includes("f_word"));
  assertValid(library, plan, report);
});

test("choice slot", () => {
  const library = loadLibrary("abdomen");
  const plan = checklist({ slots: { a_len: 6.5, b_choice: "TEST OPTION TWO" } });
  const report = assemble(library, plan);

  assert.equal(segment(report, "p_organ_a", "a2").text, "TEST normal sentence A2 measuring 6.5 cm.");
  assert.equal(segment(report, "p_organ_b", "b1").text, "TEST normal sentence B1 with option TEST OPTION TWO.");
  assert.deepEqual(report.flags.unfilledSlots, []);
  assertValid(library, plan, report);
});

test("one-side kidney finding (split printed)", () => {
  const library = loadLibrary("abdomen");
  const plan = checklist({ findings: [{ id: "f_side" }] });
  const report = assemble(library, plan);

  const right = paragraph(report, "p_paired", "right");
  const left = paragraph(report, "p_paired", "left");
  assert.ok(right);
  assert.ok(left);
  assert.equal(right.label, "TEST RIGHT SIDE");
  assert.equal(left.label, "TEST LEFT SIDE");
  assert.deepEqual(right.segments.map((item) => item.id), ["f_side"]);
  assert.deepEqual(left.segments.map((item) => item.id), ["p_l1"]);
  assert.ok(!reportToText(report).includes("TEST both sides normal sentence."));
  assertValid(library, plan, report);
});

test("combined impression", () => {
  const library = loadLibrary("abdomen");
  const plan = checklist({ findings: [{ id: "f_a_one" }, { id: "f_a_two" }] });
  const report = assemble(library, plan);

  assert.equal(report.impression.points.length, 1);
  assert.equal(report.impression.points[0].text, "TEST combined impression for A-one and A-two.");
  assert.equal(report.impression.points[0].source.kind, "combined");
  assert.ok(!reportToText(report).includes("TEST impression A-one."));
  assert.ok(!reportToText(report).includes("TEST impression A-two."));
  assertValid(library, plan, report);
});

test("missing impression (highlighted blank)", () => {
  const library = loadLibrary("abdomen");
  const plan = checklist({
    findings: [{ id: "f_no_impression" }],
    slots: { f_word: "TEST WORD" }
  });
  const report = assemble(library, plan);

  assert.equal(report.impression.points.length, 1);
  assert.equal(report.impression.points[0].text, BLANK);
  assert.equal(report.impression.points[0].highlighted, true);
  assert.ok(report.flags.missingImpressions.includes("f_no_impression"));
  assertValid(library, plan, report);
});

test("matched Adv", () => {
  const library = loadLibrary("abdomen");
  const plan = checklist({ adv: ["TEST Adv: line one."] });
  const report = assemble(library, plan);

  assert.deepEqual(report.adv.map((item) => item.text), ["TEST Adv: line one."]);
  assert.equal(report.adv[0].highlighted, false);
  assert.deepEqual(report.flags.unmatchedAdv, []);
  assertValid(library, plan, report);
});

test("unmatched Adv", () => {
  const library = loadLibrary("abdomen");
  const plan = checklist({ adv: ["TEST Adv: line three."] });
  const report = assemble(library, plan);

  assert.equal(report.adv[0].highlighted, true);
  assert.deepEqual(report.flags.unmatchedAdv, ["TEST Adv: line three."]);
  assertValid(library, plan, report);

  const tampered = structuredClone(report);
  tampered.adv[0].text = "TEST Adv: invented line.";
  const errors = validateReport(library, plan, tampered);
  assert.ok(errors.some((error) => error.includes("not in the library and not a dictated value")));
});

test("impression points in paragraph order with '- ' dashes", () => {
  const library = loadLibrary("abdomen");
  const plan = checklist({
    findings: [{ id: "f_confirm" }, { id: "f_no_impression" }, { id: "f_a_one" }],
    slots: { f_word: "TEST WORD" }
  });
  const report = assemble(library, plan);

  assert.deepEqual(
    report.impression.points.map((point) => point.text),
    ["TEST impression A-one.", BLANK, "TEST impression for confirmation."]
  );

  const text = reportToText(report);
  const first = text.indexOf("- TEST impression A-one.");
  const second = text.indexOf("- " + BLANK);
  const third = text.indexOf("- TEST impression for confirmation.");
  assert.ok(first !== -1 && second !== -1 && third !== -1);
  assert.ok(first < second && second < third);
  assertValid(library, plan, report);
});

test("rejects an unknown finding id", () => {
  const library = loadLibrary("abdomen");
  const plan = checklist({ findings: [{ id: "f_missing" }] });

  const errors = validateChecklist(library, plan);
  assert.ok(errors.length > 0);
  assert.throws(() => assemble(library, plan), /Invalid checklist/);
});

test("rejects a choice that is not in the library", () => {
  const library = loadLibrary("abdomen");
  const plan = checklist({ slots: { b_choice: "TEST OPTION THREE" } });

  const errors = validateChecklist(library, plan);
  assert.ok(errors.some((error) => error.includes("expected one of the library options")));
});

test("rejects an unknown variant", () => {
  const library = loadLibrary("abdomen");
  const plan = checklist({ variant: "default" });

  const errors = validateChecklist(library, plan);
  assert.ok(errors.some((error) => error.includes("unknown variant")));
});

test("rejects a sentence that is not in the library", () => {
  const library = loadLibrary("abdomen");
  const plan = checklist();
  const report = assemble(library, plan);
  const tampered = structuredClone(report);
  tampered.paragraphs[0].segments[0].text = "TEST invented sentence.";

  const errors = validateReport(library, plan, tampered);
  assert.ok(errors.some((error) => error.includes("does not match the library sentence")));
});

test("age units are stripped from the stored header", () => {
  const library = loadLibrary("abdomen");
  const plan = checklist({ header: { age: "27 years" } });
  const report = assemble(library, plan);

  assert.equal(report.header.age, "27");
  assert.equal(normalizeAge("27 Years."), "27");
  assert.equal(normalizeAge("27 yrs"), "27");
  assert.equal(normalizeAge("27 yr"), "27");
  assert.equal(normalizeAge("27 year"), "27");
  assert.equal(normalizeAge("3 months"), "3 months");
  assert.equal(normalizeAge("10 days"), "10 days");
  assert.equal(normalizeAge("27 years 6 months"), "27 years 6 months");
});
test("word slots print dimensions with x", () => {
  const library = loadLibrary("abdomen");
  for (const value of ["5 by 3", "1.8 by 1.8 by 4.3"]) {
    const plan = checklist({
      findings: [{ id: "f_no_impression" }],
      slots: { f_word: value }
    });
    const report = assemble(library, plan);
    const text = segment(report, "p_organ_b", "f_no_impression").text;
    assert.ok(text.includes(value.replace(/\s+by\s+/gi, " x ")));
    assertValid(library, plan, report);
  }

  const errors = validateChecklist(library, checklist({ slots: { a_len: "5 by 3" } }));
  assert.ok(errors.some((error) => error.includes("expected a non-negative number")));
});

test("a finding bullet after a blank line becomes a new block", () => {
  const library = loadLibrary("abdomen");
  const finding = library.findings.find((item) => item.id === "f_a_one");
  finding.text = finding.text + "\n\n- TEST extra bullet line.";
  const report = assemble(library, checklist({ findings: [{ id: "f_a_one" }] }));
  const blocks = paragraphBlocks(report.paragraphs.find((item) => item.id === "p_organ_a"));

  assert.equal(blocks.length, 2);
  assert.equal(blocks[1].label, "");
  assert.equal(blocks[1].rest, "- TEST extra bullet line.");
  assert.ok(reportToText(report).includes("- TEST extra bullet line."));
});