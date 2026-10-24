import { assemble, normalizeAge, paragraphBlocks } from "./src/assemble.js";
import { validateChecklist } from "./src/validate.js";
import { createReportBlob } from "./src/word.js";
import { initMicrophone } from "./mic.js";
import { buildReviewItems, buildRuleBlockers } from "./src/review.js";

const studySelect = document.getElementById("study");
const tvsRow = document.getElementById("tvs-row");
const tvsInput = document.getElementById("tvs");
const sexSelect = document.getElementById("sex");
const nameInput = document.getElementById("header-name");
const ageInput = document.getElementById("header-age");
const dateInput = document.getElementById("header-date");
const patientIdInput = document.getElementById("header-patient-id");
const referredByInput = document.getElementById("header-referred-by");
const findingsEl = document.getElementById("findings");
const slotsEl = document.getElementById("slots");
const reportEl = document.getElementById("report");
const placeholderBanner = document.getElementById("placeholder-banner");
const finalButton = document.getElementById("final");
const downloadButton = document.getElementById("download");
const copyButton = document.getElementById("copy");
const statusEl = document.getElementById("status");
const errorsEl = document.getElementById("errors");
const appShell = document.getElementById("app-shell");
const startupError = document.getElementById("startup-error");
const signoutButton = document.getElementById("signout");
const studyQuestion = document.getElementById("study-question");
const aiReview = document.getElementById("ai-review");
const aiReviewBody = document.getElementById("ai-review-body");
const aiError = document.getElementById("ai-error");

let library = null;
let reportBodyEl = null;
let currentReport = null;
let hasReport = false;
let isFinal = false;
let loadToken = 0;
let aiTranscript = "";
let aiBusy = false;
let currentUnmatched = [];
let reviewBlockers = [];
let ruleBlockers = [];
let sideMissing = [];
let aiAdv = [];
let spokenImpression = "";
let impressionUnmatched = [];
let sideGroupMissing = [];
let sideConflicts = [];
let finalBlocked = false;

function todayText() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return day + "/" + month + "/" + now.getFullYear();
}

function humanize(id) {
  return id
    .split("_")
    .filter((part) => part !== "")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function hasPlaceholderText(value) {
  if (typeof value === "string") return value.startsWith("TEST");
  if (Array.isArray(value)) return value.some(hasPlaceholderText);
  if (value !== null && typeof value === "object") {
    return Object.values(value).some(hasPlaceholderText);
  }
  return false;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function showStartupError(message) {
  startupError.textContent = message;
  startupError.hidden = false;
  appShell.hidden = true;
  signoutButton.hidden = true;
}

function showErrors(errors) {
  const list = document.createElement("ul");
  for (const error of errors) {
    const item = document.createElement("li");
    item.textContent = error;
    list.append(item);
  }
  errorsEl.replaceChildren(list);
  errorsEl.hidden = false;
}

function hideErrors() {
  errorsEl.replaceChildren();
  errorsEl.hidden = true;
}

function variantFor() {
  if (!library) return "default";
  if (library.study === "abdomen") {
    return sexSelect.value === "F" ? "female" : sexSelect.value === "M" ? "male" : null;
  }
  if (library.study === "pelvis") return tvsInput.checked ? "tvs" : "default";
  return "default";
}

function setFinal(value) {
  isFinal = value;
  finalButton.disabled = value || !hasReport || finalBlocked;
  downloadButton.disabled = !value || !hasReport || finalBlocked;
  copyButton.disabled = !value || !hasReport || finalBlocked;
  if (reportBodyEl) reportBodyEl.contentEditable = hasReport ? "true" : "false";
}

function clearReport() {
  hasReport = false;
  currentReport = null;
  reportBodyEl = null;
  reportEl.replaceChildren();
  setFinal(false);
}

function applyStudyRules() {
  const study = library.study;
  tvsRow.hidden = study !== "pelvis";
  if (study === "pelvis") {
    tvsInput.checked = tvsInput.checked && !tvsRow.hidden;
    sexSelect.value = "F";
    sexSelect.disabled = true;
  } else {
    sexSelect.disabled = false;
  }
}

function buildFindings() {
  findingsEl.replaceChildren();
  if (library.findings.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No findings in this library.";
    findingsEl.append(empty);
    return;
  }
  for (const finding of library.findings) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "finding";
    input.value = finding.id;
    const text = document.createElement("span");
    text.textContent = finding.name;
    label.append(input, text);
    if (finding.status === "for_confirmation") {
      const note = document.createElement("span");
      note.className = "confirmation";
      note.textContent = "For your confirmation";
      text.append(note);
    }
    findingsEl.append(label);
  }
}

function buildSlots() {
  slotsEl.replaceChildren();
  if (library.slots.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No measurements or choices.";
    slotsEl.append(empty);
    return;
  }
  for (const slot of library.slots) {
    const label = document.createElement("label");
    label.className = "field";
    const name = document.createElement("span");
    const control = document.createElement(slot.type === "choice" ? "select" : "input");
    control.dataset.slotId = slot.id;
    control.dataset.slotType = slot.type;

    if (slot.type === "number") {
      name.textContent = humanize(slot.id) + " (" + slot.unit + ")";
      control.type = "number";
      control.min = "0";
      control.step = "any";
      control.autocomplete = "off";
    } else if (slot.type === "choice") {
      name.textContent = humanize(slot.id);
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "\u2014";
      control.append(blank);
      for (const option of slot.options) {
        const item = document.createElement("option");
        item.value = option;
        item.textContent = option;
        control.append(item);
      }
    } else {
      name.textContent = humanize(slot.id);
      control.type = "text";
      control.autocomplete = "off";
    }

    label.append(name, control);
    slotsEl.append(label);
  }
}

function syncFindings() {
  const variant = variantFor();
  if (!variant) {
    for (const input of findingsEl.querySelectorAll('input[name="finding"]')) input.disabled = false;
    return;
  }
  const paragraphs = new Map(library.paragraphs.map((paragraph) => [paragraph.id, paragraph]));
  for (const input of findingsEl.querySelectorAll('input[name="finding"]')) {
    const finding = library.findings.find((item) => item.id === input.value);
    const paragraph = finding ? paragraphs.get(finding.paragraph) : null;
    const available = paragraph ? paragraph.variants.includes(variant) : false;
    input.disabled = !available;
    if (!available) input.checked = false;
  }
}

function currentHeader() {
  return {
    name: nameInput.value.trim(),
    age: ageInput.value.trim(),
    sex: sexSelect.value,
    date: dateInput.value.trim(),
    patientId: patientIdInput.value.trim(),
    referredBy: referredByInput.value.trim()
  };
}

function collectChecklist() {
  const findings = [];
  for (const input of findingsEl.querySelectorAll('input[name="finding"]:checked')) {
    if (!input.disabled) findings.push({ id: input.value });
  }

  const slots = {};
  for (const control of slotsEl.querySelectorAll("[data-slot-id]")) {
    const id = control.dataset.slotId;
    const type = control.dataset.slotType;
    if (type === "number") {
      if (control.value === "") continue;
      slots[id] = Number(control.value);
    } else if (type === "choice") {
      if (control.value === "") continue;
      slots[id] = control.value;
    } else {
      const value = control.value.trim();
      if (value === "") continue;
      slots[id] = value;
    }
  }

  return {
    study: library.study,
    variant: variantFor(),
    header: currentHeader(),
    findings,
    slots,
    adv: [...aiAdv]
  };
}

function headerTable(header) {
  const table = document.createElement("table");
  table.className = "header-table";
  const body = document.createElement("tbody");
  const sexText =
    header.sex === "F" ? "Female" : header.sex === "M" ? "Male" : "Sex not stated";
  const age = normalizeAge(header.age);
  const ageSex = age === "" ? sexText : age + " Years/ " + sexText;

  const rows = [
    ["Patient\u2019s Name:", header.name, "Age/Sex:", ageSex],
    ["Patient Id:", header.patientId, "Date:", header.date],
    ["Refd. By:", header.referredBy, "", ""]
  ];

  for (const values of rows) {
    const row = document.createElement("tr");
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    body.append(row);
  }
  table.append(body);
  return table;
}

function renderReport(report) {
  reportEl.replaceChildren();

  const space = document.createElement("div");
  space.className = "letterhead-space";
  reportEl.append(space, headerTable(report.header));

  const body = document.createElement("div");
  body.id = "report-body";
  body.contentEditable = "true";
  body.spellcheck = false;

  const heading = document.createElement("p");
  heading.className = "report-heading";
  heading.textContent = report.heading;
  body.append(heading);

  for (const paragraph of report.paragraphs) {
    for (const block of paragraphBlocks(paragraph)) {
      const line = document.createElement("p");
      line.className = "report-paragraph";
      if (block.label !== "") {
        const label = document.createElement("span");
        label.className = "report-label";
        label.textContent = block.label;
        line.append(label, document.createTextNode(block.rest));
      } else {
        line.textContent = block.rest;
      }
      body.append(line);
    }
  }

  const points = report.impression.points;
  const impression = document.createElement("p");
  impression.className = "report-impression";
  const impressionLabel = document.createElement("span");
  impressionLabel.className = "report-label";
  impressionLabel.textContent = report.impression.label;
  impression.append(impressionLabel);

  if (points.length <= 1) {
    if (points.length === 1) {
      const point = document.createElement("span");
      if (points[0].highlighted) point.className = "highlight";
      point.textContent = points[0].text;
      impression.append(point);
    }
    body.append(impression);
  } else {
    body.append(impression);
    for (const entry of points) {
      const line = document.createElement("p");
      line.className = "report-impression-point";
      line.append(document.createTextNode("- "));
      const point = document.createElement("span");
      if (entry.highlighted) point.className = "highlight";
      point.textContent = entry.text;
      line.append(point);
      body.append(line);
    }
  }

  for (const line of report.adv) {
    const paragraph = document.createElement("p");
    paragraph.className = "report-adv";
    const text = document.createElement("span");
    if (line.highlighted) text.className = "highlight";
    text.textContent = line.text;
    paragraph.append(text);
    body.append(paragraph);
  }

  for (const line of report.signature) {
    const paragraph = document.createElement("p");
    paragraph.className = "report-signature";
    if (body.querySelector(".report-signature") === null) {
      paragraph.classList.add("report-signature-first");
    }
    paragraph.textContent = line;
    body.append(paragraph);
  }

  reportEl.append(body);
  reportBodyEl = body;
  currentReport = report;
  hasReport = true;
  setFinal(false);
  renderReview(report);
}

function snapshotWordModel() {
  const headingElement = reportBodyEl.querySelector(".report-heading");
  const paragraphs = Array.from(reportBodyEl.querySelectorAll(".report-paragraph")).map(
    (element, index) => {
      const text = element.textContent;
      const labelElement = element.querySelector(".report-label");
      const original = currentReport.paragraphs[index];
      let label = labelElement ? labelElement.textContent : "";
      if (label === "" && original && original.label !== "" && text.startsWith(original.label)) {
        label = original.label;
      }
      return {
        label,
        rest: label === "" ? text : text.slice(label.length)
      };
    }
  );

  const impressionElement = reportBodyEl.querySelector(".report-impression");
  const labelElement = impressionElement
    ? impressionElement.querySelector(".report-label")
    : null;
  const label = labelElement ? labelElement.textContent : currentReport.impression.label;
  const pointElements = Array.from(reportBodyEl.querySelectorAll(".report-impression-point"));
  let points;

  if (pointElements.length > 0) {
    points = pointElements.map((element, index) => ({
      text: element.textContent.replace(/^-\s?/, ""),
      highlighted:
        element.querySelector(".highlight") !== null ||
        currentReport.impression.points[index]?.highlighted === true
    }));
  } else {
    const full = impressionElement ? impressionElement.textContent : "";
    points = [
      {
        text: full.startsWith(label) ? full.slice(label.length) : full,
        highlighted:
          Boolean(impressionElement && impressionElement.querySelector(".highlight")) ||
          currentReport.impression.points[0]?.highlighted === true
      }
    ];
  }

  return {
    study: currentReport.study,
    heading: headingElement ? headingElement.textContent : currentReport.heading,
    header: currentHeader(),
    paragraphs,
    impression: { label, points },
    adv: Array.from(reportBodyEl.querySelectorAll(".report-adv")).map((element, index) => ({
      text: element.textContent,
      highlighted:
        element.querySelector(".highlight") !== null ||
        currentReport.adv[index]?.highlighted === true
    })),
    signature: Array.from(reportBodyEl.querySelectorAll(".report-signature")).map(
      (element) => element.textContent
    )
  };
}

function setMicStatus(message) {
  const element = document.getElementById("mic-status");
  if (element) element.textContent = message;
}

function renderReview(report) {
  if (!library) {
    aiReview.hidden = true;
    aiReviewBody.replaceChildren();
    return;
  }
  const sections = buildReviewItems({
    report,
    library,
    unmatched: currentUnmatched,
    blockers: [...reviewBlockers, ...ruleBlockers],
    sideConflicts,
    spokenImpression,
    impressionUnmatched
  });
  if (sections.length === 0) {
    aiReviewBody.replaceChildren();
    aiReview.hidden = true;
    return;
  }

  const elements = sections.map((section) => {
    const wrapper = document.createElement("section");
    const heading = document.createElement("h3");
    heading.textContent = section.title;
    const list = document.createElement("ul");
    for (const text of section.items) {
      const item = document.createElement("li");
      item.textContent = text;
      list.append(item);
    }
    wrapper.append(heading, list);
    return wrapper;
  });
  aiReviewBody.replaceChildren(...elements);
  aiReview.hidden = false;
}

function clearAiMessages() {
  aiError.textContent = "";
  aiError.hidden = true;
  aiReviewBody.replaceChildren();
  aiReview.hidden = true;
  studyQuestion.hidden = true;
  currentUnmatched = [];
  reviewBlockers = [];
  sideMissing = [];
  aiAdv = [];
  spokenImpression = "";
  impressionUnmatched = [];
  sideGroupMissing = [];
  sideConflicts = [];
}

function showAiError(message) {
  aiError.textContent = message;
  aiError.hidden = false;
}

function showAiReview(errors) {
  reviewBlockers = errors;
  renderReview(currentReport);
}

async function applyAiChecklist(plan) {
  if (
    !plan ||
    typeof plan.study !== "string" ||
    !["abdomen", "pelvis", "neck"].includes(plan.study)
  ) {
    showAiError("The AI returned an unknown study. Use the list below.");
    return;
  }

  studySelect.value = plan.study;
  if (!library || library.study !== plan.study) {
    await loadStudy(plan.study);
  }
  if (!library || library.study !== plan.study) {
    showAiError("The library could not be loaded. Use the list below.");
    return;
  }

  const sex = plan.study === "pelvis" ? "F" : plan.header?.sex === "F" ? "F" : plan.header?.sex === "M" ? "M" : "";
  sexSelect.value = sex;
  if (plan.study === "pelvis") {
    sexSelect.disabled = true;
    tvsInput.checked = plan.variant === "tvs";
    tvsRow.hidden = false;
  } else {
    sexSelect.disabled = false;
    tvsInput.checked = false;
    tvsRow.hidden = true;
  }

  ageInput.value = normalizeAge(plan.header?.age === undefined ? "" : String(plan.header.age));
  syncFindings();

  const wantedFindings = new Set(
    Array.isArray(plan.findings) ? plan.findings.map((finding) => finding.id) : []
  );
  for (const input of findingsEl.querySelectorAll('input[name="finding"]')) {
    input.checked = wantedFindings.has(input.value);
  }

  const slots = plan.slots && typeof plan.slots === "object" ? plan.slots : {};
  for (const control of slotsEl.querySelectorAll("[data-slot-id]")) {
    const value = slots[control.dataset.slotId];
    control.value = value === undefined || value === null ? "" : String(value);
  }

  aiAdv = Array.isArray(plan.adv) ? plan.adv : [];
  reviewBlockers = [];
  update();
  aiError.hidden = true;
  studyQuestion.hidden = true;
  if (finalBlocked) {
    setMicStatus("Choose the missing details in the yellow box.");
  } else {
    setMicStatus("Report drafted from the dictation. Review the report on the right.");
  }
}
async function runAi(transcript, study = null) {
  if (aiBusy) return;
  aiBusy = true;
  aiTranscript = transcript;
  clearAiMessages();
  setMicStatus("Understanding the dictation...");

  try {
    const body = { transcript, screenStudy: studySelect.value };
    if (study !== null) body.study = study;
    const response = await fetch("/api/understand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000)
    });
    let data = {};
    try {
      data = await response.json();
    } catch (error) {
      data = {};
    }

    if (response.status === 429) {
      const message =
        typeof data.error === "string"
          ? data.error
          : "AI limit reached for today: please choose from the list";
      showAiError(message);
      setMicStatus(message);
      return;
    }

    if (!response.ok) {
      const message =
        typeof data.error === "string" && data.error.trim() !== ""
          ? data.error.trim()
          : "AI could not understand the dictation. Use the list below.";
      showAiError(
        message + (message.endsWith(".") ? "" : ".") + " The transcript is kept above."
      );
      setMicStatus("Use the list below.");
      return;
    }

    if (data.needsStudy === true) {
      studyQuestion.hidden = false;
      setMicStatus("Choose the study below.");
      return;
    }

    if (!data.checklist) {
      showAiError("AI did not return a checklist. Use the list below.");
      setMicStatus("Use the list below.");
      return;
    }

    currentUnmatched = Array.isArray(data.unmatched) ? data.unmatched : [];
    sideMissing = Array.isArray(data.sideMissing) ? data.sideMissing : [];
    sideGroupMissing = Array.isArray(data.sideGroupMissing) ? data.sideGroupMissing : [];
    sideConflicts = Array.isArray(data.sideConflicts) ? data.sideConflicts : [];
    spokenImpression = typeof data.spokenImpression === "string" ? data.spokenImpression : "";
    impressionUnmatched = Array.isArray(data.impressionUnmatched) ? data.impressionUnmatched : [];
    reviewBlockers = [];
    await applyAiChecklist(data.checklist);
  } catch (error) {
    showAiError(
      "The AI service could not be reached. Use the list below. The transcript is kept above."
    );
    setMicStatus("Use the list below.");
  } finally {
    aiBusy = false;
  }
}

async function handleTranscript(transcript) {
  aiTranscript = transcript;
  await runAi(transcript);
}

function computeRuleBlockers(sideFindingChosen) {
  if (!library) return [];
  return buildRuleBlockers({
    study: library.study,
    sex: sexSelect.value,
    sideMissing,
    sideGroupMissing,
    sideFindingChosen
  });
}

function update() {
  if (!library) return;
  const checkedSide = Array.from(
    findingsEl.querySelectorAll('input[name="finding"]:checked')
  ).some((input) => {
    const finding = library.findings.find((item) => item.id === input.value);
    return finding && finding.side === true;
  });
  if (checkedSide) sideMissing = [];
  const checkedGroups = new Set();
  const groupSelections = new Map();
  for (const input of findingsEl.querySelectorAll('input[name="finding"]:checked')) {
    const finding = library.findings.find((item) => item.id === input.value);
    if (finding && typeof finding.sideGroup === "string" && finding.sideGroup !== "") {
      checkedGroups.add(finding.sideGroup);
      if (!groupSelections.has(finding.sideGroup)) groupSelections.set(finding.sideGroup, []);
      groupSelections.get(finding.sideGroup).push(finding.id);
    }
  }
  if (checkedGroups.size > 0) {
    sideGroupMissing = sideGroupMissing.filter((group) => !checkedGroups.has(group));
  }
  sideConflicts = Array.from(groupSelections.entries())
    .filter((entry) => entry[1].length > 1)
    .map((entry) => ({ group: entry[0], findings: entry[1] }));
  ruleBlockers = computeRuleBlockers(checkedSide);
  finalBlocked = ruleBlockers.length > 0;
  setFinal(false);
  syncFindings();

  if (library.study === "abdomen" && !["M", "F"].includes(sexSelect.value)) {
    hideErrors();
    clearReport();
    renderReview(null);
    setStatus("Choose sex to build the report.");
    return;
  }

  const plan = collectChecklist();
  const errors = validateChecklist(library, plan);
  if (errors.length > 0) {
    showErrors(errors);
    clearReport();
    setStatus("Fix the items above. Nothing has been added to the report.");
    return;
  }
  hideErrors();
  try {
    renderReport(assemble(library, plan));
    setStatus("Review the report, edit any word, then press Final.");
  } catch (error) {
    showErrors([error.message]);
    clearReport();
    setStatus("The report could not be built. Nothing has been added.");
  }
}

async function loadStudy(study) {
  const token = ++loadToken;
  document.documentElement.dataset.ready = "false";
  setStatus("Loading library...");
  try {
    const response = await fetch("/api/library?study=" + encodeURIComponent(study), {
      cache: "no-store"
    });
    if (response.status === 401) {
      window.location.replace("/login.html");
      return;
    }
    if (!response.ok) {
      let data = {};
      try {
        data = await response.json();
      } catch (error) {
        data = {};
      }
      throw new Error(
        typeof data.error === "string" ? data.error : "Library could not be loaded."
      );
    }
    const loaded = await response.json();
    if (token !== loadToken) return;
    library = loaded;
    placeholderBanner.hidden = !hasPlaceholderText(library);
    applyStudyRules();
    buildFindings();
    buildSlots();
    update();
    document.documentElement.dataset.ready = "true";
  } catch (error) {
    if (token !== loadToken) return;
    library = null;
    placeholderBanner.hidden = true;
    clearReport();
    showErrors([error.message]);
    setStatus("The library could not be loaded.");
    document.documentElement.dataset.ready = "true";
  }
}

async function start() {
  dateInput.value = todayText();
  setStatus("Checking sign-in...");
  try {
    const response = await fetch("/api/session", { cache: "no-store" });
    if (response.status === 401) {
      window.location.replace("/login.html");
      return;
    }
    if (!response.ok) {
      let data = {};
      try {
        data = await response.json();
      } catch (error) {
        data = {};
      }
      showStartupError(
        typeof data.error === "string" ? data.error : "The app is not available."
      );
      return;
    }
    appShell.hidden = false;
    signoutButton.hidden = false;
    initMicrophone(handleTranscript);
    await loadStudy("abdomen");
  } catch (error) {
    showStartupError("The server could not be reached.");
  }
}

studySelect.addEventListener("change", () => {
  const previousStudy = library ? library.study : null;
  library = null;
  if (previousStudy === "pelvis" && studySelect.value !== "pelvis") {
    sexSelect.value = "";
  }
  findingsEl.replaceChildren();
  slotsEl.replaceChildren();
  clearReport();
  loadStudy(studySelect.value);
});
tvsInput.addEventListener("change", update);
sexSelect.addEventListener("change", update);
for (const input of [nameInput, ageInput, dateInput, patientIdInput, referredByInput]) {
  input.addEventListener("input", update);
}
ageInput.addEventListener("blur", () => {
  const normalized = normalizeAge(ageInput.value);
  if (normalized !== ageInput.value) {
    ageInput.value = normalized;
    update();
  }
});
findingsEl.addEventListener("change", update);
slotsEl.addEventListener("input", update);
slotsEl.addEventListener("change", update);

finalButton.addEventListener("click", () => {
  if (!hasReport) return;
  setFinal(true);
  setStatus("Final. You can copy the report now.");
});

copyButton.addEventListener("click", async () => {
  if (!isFinal || !hasReport) return;
  try {
    await navigator.clipboard.writeText(reportEl.innerText.trim());
    setStatus("Copied.");
  } catch (error) {
    setStatus("Copy failed. Select the report text and copy it manually.");
  }
});

downloadButton.addEventListener("click", async () => {
  if (!isFinal || !hasReport || !currentReport) return;
  downloadButton.disabled = true;
  setStatus("Preparing Word file...");
  try {
    const model = snapshotWordModel();
    const blob = await createReportBlob(model);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "report-" + model.study + ".docx";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("Word file downloaded.");
  } catch (error) {
    setStatus("The Word file could not be made.");
  } finally {
    downloadButton.disabled = !isFinal || !hasReport;
  }
});

reportEl.addEventListener("input", () => {
  if (isFinal) {
    setFinal(false);
    setStatus("Edited. Press Final again to copy.");
  }
});

for (const button of document.querySelectorAll("[data-study]")) {
  button.addEventListener("click", () => {
    if (aiBusy || aiTranscript === "") return;
    runAi(aiTranscript, button.dataset.study);
  });
}
signoutButton.addEventListener("click", async () => {
  signoutButton.disabled = true;
  try {
    await fetch("/api/logout", { method: "POST" });
  } catch (error) {
    signoutButton.disabled = false;
    return;
  }
  window.location.replace("/login.html");
});

start();
