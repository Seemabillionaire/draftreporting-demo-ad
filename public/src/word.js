import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType
} from "../vendor/docx-9.8.1/index.mjs";
import { normalizeAge, paragraphBlocks } from "./assemble.js";

const FONT = "Times New Roman";
const BODY_SIZE = 24;
const HEADING_SIZE = 26;
const SPACER_SIZE = 18;
const COLUMN_WIDTHS = [1980, 3458, 1110, 2468];
const TABLE_WIDTH = 9016;
const ROW_HEIGHTS = [389, 363, 363];
const SIGNATURE_INDENT = 5940;

function textRun(text, options = {}) {
  const run = {
    text,
    font: FONT,
    size: options.size === undefined ? BODY_SIZE : options.size
  };
  if (options.bold) run.bold = true;
  if (options.underline) run.underline = { type: UnderlineType.SINGLE };
  if (options.highlight) run.highlight = "yellow";
  return new TextRun(run);
}

function emptyParagraph(size, line = 240) {
  return new Paragraph({
    spacing: { after: 0, line },
    children: [textRun("", { size })]
  });
}

function spacerParagraph() {
  return new Paragraph({
    spacing: { after: 0, line: 240 },
    children: [textRun("", { size: SPACER_SIZE })]
  });
}

function bodyParagraph(part) {
  const children = [];
  if (part.label !== "") {
    children.push(textRun(part.label, { bold: true, underline: true }));
  }
  if (part.rest !== "") children.push(textRun(part.rest));
  return new Paragraph({ alignment: AlignmentType.JUSTIFIED, children });
}

function headerCell(text, width) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 0, line: 240 },
        children: [textRun(text)]
      })
    ]
  });
}

function headerTable(header) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
  const borders = {
    top: border,
    bottom: border,
    left: border,
    right: border,
    insideHorizontal: border,
    insideVertical: border
  };
  const sexText =
    header.sex === "F" ? "Female" : header.sex === "M" ? "Male" : "Sex not stated";
  const age = normalizeAge(header.age);
  const ageSex = age === "" ? "Years/ " + sexText : age + " Years/ " + sexText;

  const rows = [
    ["Patient\u2019s Name:", header.name, "Age/Sex:", ageSex],
    ["Patient Id:", header.patientId, "Date:", header.date],
    ["Refd. By:", header.referredBy, "", ""]
  ].map(
    (values, rowIndex) =>
      new TableRow({
        height: { value: ROW_HEIGHTS[rowIndex], rule: HeightRule.ATLEAST },
        children: values.map((value, index) => headerCell(value, COLUMN_WIDTHS[index]))
      })
  );

  return new Table({
    rows,
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: COLUMN_WIDTHS,
    layout: TableLayoutType.FIXED,
    margins: { top: 0, bottom: 0, left: 108, right: 108 },
    borders
  });
}

function impressionParagraphs(impression) {
  const label = textRun(impression.label, { bold: true, underline: true });
  if (impression.points.length <= 1) {
    const children = [label];
    if (impression.points.length === 1) {
      children.push(
        textRun(impression.points[0].text, {
          bold: true,
          highlight: impression.points[0].highlighted
        })
      );
    }
    return [new Paragraph({ alignment: AlignmentType.LEFT, children })];
  }

  const paragraphs = [new Paragraph({ alignment: AlignmentType.LEFT, children: [label] })];
  for (const point of impression.points) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          textRun("- " + point.text, { bold: true, highlight: point.highlighted })
        ]
      })
    );
  }
  return paragraphs;
}

function advParagraphs(adv) {
  return adv.map(
    (line) =>
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [textRun(line.text, { highlight: line.highlighted })]
      })
  );
}

function signatureParagraphs(signature) {
  return signature.map(
    (line) =>
      new Paragraph({
        alignment: AlignmentType.LEFT,
        indent: { left: SIGNATURE_INDENT },
        spacing: { after: 0, line: 240 },
        children: [textRun(line, { bold: true })]
      })
  );
}

export function reportToWordModel(report) {
  const header = report.header ?? {
    name: "",
    age: "",
    sex: "M",
    date: "",
    patientId: "",
    referredBy: ""
  };
  return {
    study: report.study,
    heading: report.heading,
    header: { ...header, age: normalizeAge(header.age) },
    paragraphs: report.paragraphs.flatMap((paragraph) => paragraphBlocks(paragraph)),
    impression: {
      label: report.impression.label,
      points: report.impression.points.map((point) => ({
        text: point.text,
        highlighted: point.highlighted
      }))
    },
    adv: report.adv.map((line) => ({ text: line.text, highlighted: line.highlighted })),
    signature: [...report.signature]
  };
}

export function buildReportDocument(model) {
  const children = [];
  for (let index = 0; index < 11; index += 1) {
    children.push(emptyParagraph(BODY_SIZE, index < 1 ? 247 : 246));
  }
  children.push(headerTable(model.header));
  children.push(emptyParagraph(BODY_SIZE));
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [textRun(model.heading, { size: HEADING_SIZE, bold: true, underline: true })]
    })
  );

  model.paragraphs.forEach((paragraph, index) => {
    children.push(bodyParagraph(paragraph));
    if (index < model.paragraphs.length - 1) children.push(spacerParagraph());
  });

  children.push(...impressionParagraphs(model.impression));
  children.push(...advParagraphs(model.adv));
  children.push(...signatureParagraphs(model.signature));

  return new Document({
    creator: "Report Drafting Assistant",
    title: "Report",
    styles: {
      default: {
        document: {
          run: { font: FONT, size: BODY_SIZE },
          paragraph: {
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 160, line: 259 }
          }
        }
      }
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 0, right: 1440, bottom: 0, left: 1440, header: 0, footer: 0 }
          }
        },
        children
      }
    ]
  });
}

export async function createReportBlob(model) {
  const document = buildReportDocument(model);
  return Packer.toBlob(document);
}



