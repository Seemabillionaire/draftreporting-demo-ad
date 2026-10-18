export const BLANK = "\u2026\u2026";

const SLOT_REFERENCE = /\{slot:([a-z][a-z0-9_]*)\}/g;

export function slotIdsIn(text) {
  const ids = [];
  if (typeof text !== "string") return ids;
  for (const match of text.matchAll(SLOT_REFERENCE)) ids.push(match[1]);
  return ids;
}

export function renderTemplate(text, slots = {}) {
  return text.replace(SLOT_REFERENCE, (whole, id) => {
    const value = slots[id];
    if (value === undefined || value === null || value === "") return BLANK;
    return String(value);
  });
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const CHECKLIST_FIELDS = new Set(["study", "variant", "header", "findings", "slots", "adv"]);
const HEADER_FIELDS = new Set(["name", "age", "sex", "date", "patientId", "referredBy"]);

export function validateChecklist(library, checklist) {
  const errors = [];

  if (!isPlainObject(checklist)) return ["checklist: expected an object"];

  for (const key of Object.keys(checklist)) {
    if (!CHECKLIST_FIELDS.has(key)) errors.push('checklist: unexpected field "' + key + '"');
  }

  if (checklist.study !== library.study) {
    errors.push('checklist.study: expected "' + library.study + '"');
  }

  const variantIds = library.variants.map((variant) => variant.id);
  if (typeof checklist.variant !== "string") {
    errors.push("checklist.variant: required");
  } else if (!variantIds.includes(checklist.variant)) {
    errors.push("checklist.variant: unknown variant " + JSON.stringify(checklist.variant));
  }

  if (checklist.header !== undefined) {
    if (!isPlainObject(checklist.header)) {
      errors.push("checklist.header: expected an object");
    } else {
      for (const [key, value] of Object.entries(checklist.header)) {
        if (!HEADER_FIELDS.has(key)) {
          errors.push('checklist.header: unexpected field "' + key + '"');
        } else if (typeof value !== "string") {
          errors.push("checklist.header." + key + ": expected a string");
        }
      }
    }
  }

  const selected = new Set();
  if (!Array.isArray(checklist.findings)) {
    errors.push("checklist.findings: expected a list");
  } else {
    checklist.findings.forEach((entry, index) => {
      const at = "checklist.findings[" + index + "]";
      if (!isPlainObject(entry)) {
        errors.push(at + ": expected an object");
        return;
      }
      for (const key of Object.keys(entry)) {
        if (key !== "id") errors.push(at + ': unexpected field "' + key + '"');
      }
      if (typeof entry.id !== "string" || entry.id === "") {
        errors.push(at + ".id: required");
        return;
      }
      const finding = library.findings.find((item) => item.id === entry.id);
      if (!finding) {
        errors.push(at + ".id: unknown finding " + JSON.stringify(entry.id));
        return;
      }
      if (selected.has(entry.id)) {
        errors.push(at + ".id: duplicate finding " + JSON.stringify(entry.id));
        return;
      }
      selected.add(entry.id);

      const paragraph = library.paragraphs.find((item) => item.id === finding.paragraph);
      if (typeof checklist.variant === "string" && paragraph && !paragraph.variants.includes(checklist.variant)) {
        errors.push(at + ".id: finding " + JSON.stringify(entry.id) + " is not available for this variant");
      }
      if (finding.side && paragraph && !paragraph.sideSplit) {
        errors.push(at + ".id: finding " + JSON.stringify(entry.id) + " has a side but its paragraph has no side split");
      }
    });
  }

  const slots = checklist.slots === undefined ? {} : checklist.slots;
  if (!isPlainObject(slots)) {
    errors.push("checklist.slots: expected an object");
  } else {
    for (const [id, value] of Object.entries(slots)) {
      const slot = library.slots.find((item) => item.id === id);
      if (!slot) {
        errors.push("checklist.slots: unknown slot " + JSON.stringify(id));
        continue;
      }
      if (slot.type === "number") {
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
          errors.push("checklist.slots." + id + ": expected a non-negative number");
        }
      } else if (slot.type === "choice") {
        if (typeof value !== "string" || !slot.options.includes(value)) {
          errors.push("checklist.slots." + id + ": expected one of the library options");
        }
      } else if (typeof value !== "string" || value.trim() === "") {
        errors.push("checklist.slots." + id + ": expected a non-empty word");
      }
    }
  }

  if (checklist.adv !== undefined) {
    if (!Array.isArray(checklist.adv)) {
      errors.push("checklist.adv: expected a list");
    } else {
      const seen = new Set();
      checklist.adv.forEach((line, index) => {
        if (typeof line !== "string" || line.trim() === "") {
          errors.push("checklist.adv[" + index + "]: expected a non-empty string");
        } else if (seen.has(line)) {
          errors.push("checklist.adv[" + index + "]: duplicate line");
        } else {
          seen.add(line);
        }
      });
    }
  }

  return errors;
}

export function validateReport(library, checklist, report) {
  const errors = [];
  if (!isPlainObject(report)) return ["report: expected an object"];
  if (!isPlainObject(checklist)) return ["checklist: expected an object"];

  const slots = isPlainObject(checklist.slots) ? checklist.slots : {};
  const variant = checklist.variant;
  const selected = new Set(
    Array.isArray(checklist.findings) ? checklist.findings.map((entry) => entry.id) : []
  );
  const dictatedAdv = Array.isArray(checklist.adv) ? checklist.adv : [];

  const expectedHeading =
    library.headings[variant] !== undefined ? library.headings[variant] : library.headings.default;
  if (report.heading !== expectedHeading) {
    errors.push("report.heading: does not match the library heading");
  }

  if (!Array.isArray(report.paragraphs)) {
    errors.push("report.paragraphs: expected a list");
  } else {
    report.paragraphs.forEach((outputParagraph, index) => {
      const at = "report.paragraphs[" + index + "]";
      const paragraph = library.paragraphs.find((item) => item.id === outputParagraph.id);
      if (!paragraph) {
        errors.push(at + ": unknown paragraph " + JSON.stringify(outputParagraph.id));
        return;
      }
      if (!paragraph.variants.includes(variant)) {
        errors.push(at + ": paragraph " + JSON.stringify(paragraph.id) + " is not in this variant");
      }

      let part = paragraph;
      if (outputParagraph.side !== null && outputParagraph.side !== undefined) {
        if (!paragraph.sideSplit || !["right", "left"].includes(outputParagraph.side)) {
          errors.push(at + ": paragraph has no such side");
          return;
        }
        part = paragraph.sideSplit[outputParagraph.side];
      }

      if (outputParagraph.label !== part.label) {
        errors.push(at + ".label: does not match the library label");
      }
      if (outputParagraph.separator !== part.separator) {
        errors.push(at + ".separator: does not match the library separator");
      }

      if (!Array.isArray(outputParagraph.segments)) {
        errors.push(at + ".segments: expected a list");
        return;
      }
      outputParagraph.segments.forEach((segment, segmentIndex) => {
        const segmentAt = at + ".segments[" + segmentIndex + "]";
        const source = segment.source;
        if (!isPlainObject(source)) {
          errors.push(segmentAt + ".source: required");
          return;
        }
        if (source.kind === "finding") {
          const finding = library.findings.find((item) => item.id === source.finding);
          if (!finding) {
            errors.push(segmentAt + ".source: unknown finding");
            return;
          }
          if (!selected.has(finding.id)) {
            errors.push(segmentAt + ": finding was not chosen");
          }
          if (finding.paragraph !== paragraph.id) {
            errors.push(segmentAt + ": finding belongs to another paragraph");
          }
          if (segment.text !== renderTemplate(finding.text, slots)) {
            errors.push(segmentAt + ".text: does not match the library finding");
          }
          return;
        }
        if (source.kind === "normal" || source.kind === "side-normal") {
          if (source.kind === "side-normal" && source.side !== outputParagraph.side) {
            errors.push(segmentAt + ".source: side does not match");
          }
          const pool =
            source.kind === "side-normal" ? part.segments : paragraph.segments;
          const librarySegment = pool.find((item) => item.id === source.segment);
          if (!librarySegment) {
            errors.push(segmentAt + ".source: unknown segment");
            return;
          }
          if (segment.text !== renderTemplate(librarySegment.text, slots)) {
            errors.push(segmentAt + ".text: does not match the library sentence");
          }
          return;
        }
        errors.push(segmentAt + ".source: unknown source kind");
      });
    });
  }

  if (!isPlainObject(report.impression)) {
    errors.push("report.impression: expected an object");
  } else {
    if (report.impression.label !== library.impressionLabel) {
      errors.push("report.impression.label: does not match the library label");
    }
    if (!Array.isArray(report.impression.points) || report.impression.points.length === 0) {
      errors.push("report.impression.points: expected at least one point");
    } else {
      report.impression.points.forEach((point, index) => {
        const at = "report.impression.points[" + index + "]";
        if (!isPlainObject(point) || !isPlainObject(point.source)) {
          errors.push(at + ": missing source");
          return;
        }
        if (typeof point.highlighted !== "boolean") {
          errors.push(at + ".highlighted: expected true or false");
        }
        if (point.source.kind === "normal") {
          if (selected.size !== 0) errors.push(at + ": normal impression used with findings");
          if (point.text !== renderTemplate(library.normalImpression, slots)) {
            errors.push(at + ".text: does not match the library normal impression");
          }
          if (point.highlighted !== false) errors.push(at + ".highlighted: must be false");
          return;
        }
        if (point.source.kind === "finding") {
          const finding = library.findings.find((item) => item.id === point.source.finding);
          if (!finding) {
            errors.push(at + ".source: unknown finding");
            return;
          }
          if (!selected.has(finding.id)) errors.push(at + ": finding was not chosen");
          if (finding.impression === null) {
            errors.push(at + ": finding has no impression line");
            return;
          }
          if (point.text !== renderTemplate(finding.impression, slots)) {
            errors.push(at + ".text: does not match the library impression");
          }
          if (point.highlighted !== false) errors.push(at + ".highlighted: must be false");
          return;
        }
        if (point.source.kind === "combined") {
          const combined = library.combinedImpressions.find((item) => {
            if (!Array.isArray(point.source.findings)) return false;
            return (
              item.findings.length === point.source.findings.length &&
              item.findings.every((id) => point.source.findings.includes(id))
            );
          });
          if (!combined) {
            errors.push(at + ".source: unknown combined impression");
            return;
          }
          if (!combined.findings.every((id) => selected.has(id))) {
            errors.push(at + ": combined impression used without both findings");
          }
          if (point.text !== renderTemplate(combined.text, slots)) {
            errors.push(at + ".text: does not match the library combined impression");
          }
          if (point.highlighted !== false) errors.push(at + ".highlighted: must be false");
          return;
        }
        if (point.source.kind === "missing") {
          const finding = library.findings.find((item) => item.id === point.source.finding);
          if (!finding) {
            errors.push(at + ".source: unknown finding");
            return;
          }
          if (!selected.has(finding.id)) errors.push(at + ": finding was not chosen");
          if (finding.impression !== null) errors.push(at + ": finding has its own impression line");
          if (point.text !== BLANK) errors.push(at + ".text: expected the dotted blank");
          if (point.highlighted !== true) errors.push(at + ".highlighted: must be true");
          return;
        }
        errors.push(at + ".source: unknown source kind");
      });
    }
  }

  if (!Array.isArray(report.adv)) {
    errors.push("report.adv: expected a list");
  } else {
    const seen = new Set();
    report.adv.forEach((entry, index) => {
      const at = "report.adv[" + index + "]";
      if (!isPlainObject(entry) || typeof entry.text !== "string") {
        errors.push(at + ": expected an object with text");
        return;
      }
      if (typeof entry.highlighted !== "boolean") {
        errors.push(at + ".highlighted: expected true or false");
      }
      if (seen.has(entry.text)) errors.push(at + ": duplicate line");
      seen.add(entry.text);
      if (library.advLines.includes(entry.text)) {
        if (entry.highlighted !== false) errors.push(at + ".highlighted: must be false for a library line");
        return;
      }
      if (!dictatedAdv.includes(entry.text)) {
        errors.push(at + ": not in the library and not a dictated value");
        return;
      }
      if (entry.highlighted !== true) errors.push(at + ".highlighted: must be true for a dictated line");
    });
    dictatedAdv.forEach((line, index) => {
      if (!seen.has(line)) errors.push("report.adv: dictated line " + (index + 1) + " is missing");
    });
  }

  if (!Array.isArray(report.signature)) {
    errors.push("report.signature: expected a list");
  } else {
    if (report.signature.length !== library.signature.length) {
      errors.push("report.signature: wrong number of lines");
    }
    library.signature.forEach((line, index) => {
      if (report.signature[index] !== line) {
        errors.push("report.signature[" + index + "]: does not match the library line");
      }
    });
  }

  return errors;
}
