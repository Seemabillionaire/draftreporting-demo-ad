import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { assemble } from "../src/assemble.js";
import { createReportBlob, reportToWordModel } from "../src/word.js";
import { loadLibrary, checklist } from "./helpers.js";

function extractZipEntry(buffer, wanted) {
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) break;
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString("utf8", offset + 30, offset + 30 + nameLength);
    const dataStart = offset + 30 + nameLength + extraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    if (name === wanted) {
      if (method === 0) return data.toString("utf8");
      if (method === 8) return zlib.inflateRawSync(data).toString("utf8");
      throw new Error("Unsupported ZIP compression method " + method);
    }
    offset = dataStart + compressedSize;
  }
  throw new Error("ZIP entry not found: " + wanted);
}

const CASES = [
  { study: "abdomen", variant: "male" },
  { study: "pelvis", variant: "tvs" },
  { study: "neck", variant: "default" }
];

for (const { study, variant } of CASES) {
  test("Word labels are not garbled: " + study, async () => {
    const library = loadLibrary(study);
    const plan = checklist({
      study,
      variant,
      header: {
        name: "TEST PATIENT",
        age: "",
        sex: variant === "male" ? "M" : "F",
        date: "18/10/2026",
        patientId: "",
        referredBy: ""
      }
    });
    const report = assemble(library, plan);
    const blob = await createReportBlob(reportToWordModel(report));
    const documentXml = extractZipEntry(Buffer.from(await blob.arrayBuffer()), "word/document.xml");
    const texts = Array.from(documentXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g), (match) => match[1]);

    assert.ok(texts.length > 0);
    for (const text of texts) {
      assert.ok(!text.includes("\u00c3"), "garbled character found in Word text");
      assert.ok(!text.includes("\u00e2\u20ac"), "garbled character found in Word text");
    }

    const tableStart = documentXml.indexOf("<w:tbl>");
    const firstCellText = documentXml.slice(tableStart).match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/);
    assert.ok(firstCellText);
    assert.equal(firstCellText[1], "Patient\u2019s Name:");
  });
}

test("Word table cell margins are explicit on all studies", async () => {
  for (const { study, variant } of CASES) {
    const library = loadLibrary(study);
    const plan = checklist({
      study,
      variant,
      header: {
        name: "TEST PATIENT",
        age: "",
        sex: variant === "male" ? "M" : "F",
        date: "18/10/2026",
        patientId: "",
        referredBy: ""
      }
    });
    const report = assemble(library, plan);
    const blob = await createReportBlob(reportToWordModel(report));
    const documentXml = extractZipEntry(Buffer.from(await blob.arrayBuffer()), "word/document.xml");
    const cellMargins = documentXml.match(/<w:tblCellMar>([\s\S]*?)<\/w:tblCellMar>/);

    assert.ok(cellMargins, "table cell margins are missing: " + study);
    for (const [side, expected] of [
      ["top", 0],
      ["left", 108],
      ["bottom", 0],
      ["right", 108]
    ]) {
      const tag = cellMargins[1].match(new RegExp("<w:" + side + "\\b[^>]*/>"));
      assert.ok(tag, "missing " + side + " cell margin: " + study);
      const value = tag[0].match(/w:w="(\d+)"/);
      assert.ok(value, "missing " + side + " cell margin value: " + study);
      assert.equal(Number(value[1]), expected);
    }
  }
});
