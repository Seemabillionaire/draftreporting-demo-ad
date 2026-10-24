import {
  BLANK,
  normalizeSlotValues,
  renderTemplate,
  slotIdsIn,
  validateChecklist
} from "./validate.js";

export { BLANK, renderTemplate };

function pushUnique(list, value) {
  if (!list.includes(value)) list.push(value);
}

function applySegments(segments, findings, options) {
  const { paragraphId, side, render, flags } = options;
  const placed = new Set();
  const targets = new Map();

  for (const finding of findings) {
    for (const segmentId of finding.replaces) {
      if (!targets.has(segmentId)) targets.set(segmentId, []);
      targets.get(segmentId).push(finding);
    }
  }

  const output = [];
  const addFinding = (finding) => {
    output.push({
      id: finding.id,
      text: render(finding.text),
      source: { kind: "finding", finding: finding.id }
    });
    placed.add(finding.id);
  };

  for (const segment of segments) {
    const replacing = targets.get(segment.id) || [];
    if (replacing.length > 1) {
      flags.conflicts.push({
        paragraph: paragraphId,
        side,
        segment: segment.id,
        findings: replacing.map((finding) => finding.id)
      });
    }
    for (const finding of replacing) {
      if (!placed.has(finding.id)) addFinding(finding);
    }
    if (replacing.length === 0) {
      output.push({
        id: segment.id,
        text: render(segment.text),
        source:
          side === null
            ? { kind: "normal", segment: segment.id }
            : { kind: "side-normal", side, segment: segment.id }
      });
    }
    for (const finding of findings) {
      if (finding.insertAfter === segment.id && !placed.has(finding.id)) addFinding(finding);
    }
  }

  return output;
}

function buildImpression(library, findings, render, flags) {
  if (findings.length === 0) {
    return {
      label: library.impressionLabel,
      points: [
        {
          text: render(library.normalImpression),
          highlighted: false,
          source: { kind: "normal" }
        }
      ]
    };
  }

  const selected = new Set(findings.map((finding) => finding.id));
  const order = new Map(library.paragraphs.map((paragraph, index) => [paragraph.id, index]));
  const selection = new Map(findings.map((finding, index) => [finding.id, index]));
  const usedInCombined = new Set();
  const entries = [];

  for (const combined of library.combinedImpressions) {
    if (!combined.findings.every((id) => selected.has(id))) continue;
    for (const id of combined.findings) usedInCombined.add(id);
    const first = Math.min(...combined.findings.map((id) => order.get(selectedFindingParagraph(findings, id))));
    const firstSelection = Math.min(...combined.findings.map((id) => selection.get(id)));
    entries.push({
      order: first,
      selection: firstSelection,
      text: render(combined.text),
      highlighted: false,
      source: { kind: "combined", findings: [...combined.findings] }
    });
  }

  for (const finding of findings) {
    if (usedInCombined.has(finding.id)) continue;
    if (finding.impression === null) {
      pushUnique(flags.missingImpressions, finding.id);
      entries.push({
        order: order.get(finding.paragraph),
        selection: selection.get(finding.id),
        text: BLANK,
        highlighted: true,
        source: { kind: "missing", finding: finding.id }
      });
    } else {
      entries.push({
        order: order.get(finding.paragraph),
        selection: selection.get(finding.id),
        text: render(finding.impression),
        highlighted: false,
        source: { kind: "finding", finding: finding.id }
      });
    }
  }

  entries.sort((a, b) => a.order - b.order || a.selection - b.selection);

  return {
    label: library.impressionLabel,
    points: entries.map((entry) => ({
      text: entry.text,
      highlighted: entry.highlighted,
      source: entry.source
    }))
  };
}

function selectedFindingParagraph(findings, id) {
  return findings.find((finding) => finding.id === id).paragraph;
}

export function assemble(library, checklist) {
  const checklistErrors = validateChecklist(library, checklist);
  if (checklistErrors.length > 0) {
    throw new Error("Invalid checklist:\n" + checklistErrors.join("\n"));
  }

  const slots = checklist.slots === undefined ? {} : checklist.slots;
  const renderSlots = normalizeSlotValues(library, slots);
  const flags = {
    conflicts: [],
    unmatchedAdv: [],
    missingImpressions: [],
    forConfirmation: [],
    unfilledSlots: []
  };

  const render = (text) => {
    for (const id of slotIdsIn(text)) {
      const value = slots[id];
      if (value === undefined || value === null || value === "") pushUnique(flags.unfilledSlots, id);
    }
    return renderTemplate(text, renderSlots);
  };

  const findings = checklist.findings.map((entry) =>
    library.findings.find((finding) => finding.id === entry.id)
  );
  const variant = checklist.variant;
  const findingsByParagraph = new Map();
  for (const finding of findings) {
    if (!findingsByParagraph.has(finding.paragraph)) findingsByParagraph.set(finding.paragraph, []);
    findingsByParagraph.get(finding.paragraph).push(finding);
    if (finding.status === "for_confirmation") pushUnique(flags.forConfirmation, finding.id);
  }

  const paragraphs = [];
  for (const paragraph of library.paragraphs) {
    if (!paragraph.variants.includes(variant)) continue;
    const paragraphFindings = findingsByParagraph.get(paragraph.id) || [];
    if (paragraph.sideSplit && paragraphFindings.some((finding) => finding.side)) {
      for (const side of ["right", "left"]) {
        const part = paragraph.sideSplit[side];
        const ids = new Set(part.segments.map((segment) => segment.id));
        const sideFindings = paragraphFindings.filter(
          (finding) =>
            finding.replaces.some((id) => ids.has(id)) ||
            (finding.insertAfter !== null && ids.has(finding.insertAfter))
        );
        paragraphs.push({
          id: paragraph.id,
          side,
          label: part.label,
          separator: part.separator,
          segments: applySegments(part.segments, sideFindings, {
            paragraphId: paragraph.id,
            side,
            render,
            flags
          })
        });
      }
    } else {
      paragraphs.push({
        id: paragraph.id,
        side: null,
        label: paragraph.label,
        separator: paragraph.separator,
        segments: applySegments(paragraph.segments, paragraphFindings, {
          paragraphId: paragraph.id,
          side: null,
          render,
          flags
        })
      });
    }
  }

  const adv = (checklist.adv === undefined ? [] : checklist.adv).map((line) => {
    const matched = library.advLines.includes(line);
    if (!matched) pushUnique(flags.unmatchedAdv, line);
    return {
      text: line,
      highlighted: !matched,
      source: matched ? { kind: "library" } : { kind: "dictated" }
    };
  });

  return {
    study: library.study,
    variant,
    heading: library.headings[variant] !== undefined ? library.headings[variant] : library.headings.default,
    header:
      checklist.header === undefined
        ? null
        : { ...checklist.header, age: normalizeAge(checklist.header.age) },
    paragraphs,
    impression: buildImpression(library, findings, render, flags),
    adv,
    signature: library.signature.map((line) => render(line)),
    flags
  };
}

export function normalizeAge(value) {
  const text =
    typeof value === "string" ? value.trim() : value === undefined || value === null ? "" : String(value).trim();
  return text.replace(/\s*(?:years?|yrs?)\.?\s*$/i, "").trim();
}

export function paragraphParts(paragraph) {
  const body = paragraph.segments.map((segment) => segment.text).join(" ");
  if (paragraph.label === "") return { label: "", rest: body };
  const gap = /^[\s:;,.\-\u2013\u2014]/.test(paragraph.separator) ? "" : " ";
  return { label: paragraph.label, rest: gap + paragraph.separator + body };
}

export function paragraphLine(paragraph) {
  const parts = paragraphParts(paragraph);
  return parts.label + parts.rest;
}

export function paragraphBlocks(paragraph) {
  const parts = paragraphParts(paragraph);
  const chunks = parts.rest.split(/\r?\n\s*\r?\n(?=- )/);
  return [
    { label: parts.label, rest: chunks[0] },
    ...chunks.slice(1).map((rest) => ({ label: "", rest }))
  ];
}

export function reportToText(report) {
  const lines = [report.heading, ""];

  for (const paragraph of report.paragraphs) {
    for (const block of paragraphBlocks(paragraph)) {
      lines.push(block.label === "" ? block.rest : block.label + block.rest);
      lines.push("");
    }
  }

  const points = report.impression.points;
  if (points.length <= 1) {
    lines.push(report.impression.label + (points.length === 1 ? points[0].text : ""));
  } else {
    lines.push(report.impression.label);
    for (const point of points) lines.push("- " + point.text);
  }

  if (report.adv.length > 0) {
    for (const line of report.adv) lines.push(line.text);
  }

  lines.push("");
  lines.push(...report.signature);

  return lines.join("\n");
}
