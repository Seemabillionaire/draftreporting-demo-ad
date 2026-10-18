# IMPLEMENTATION PLAN — Report Drafting Assistant: Demo Build

| | |
|---|---|
| Version | v1.5 (replaces v1.4 of 18 October 2026) |
| Date | 18 October 2026 (evening, later) |
| Status | Draft for Seema's approval (v1.2 was approved 15 Oct 2026). Build order only. Requirements are in PRD.md (v1.1); stack choices are in TECH-STACK.md (v1.3). |
| Changes | All defaults confirmed by Seema. The library is kept out of the build and supplied later (new Step 7 and Step 11). Hosting on Vercel Hobby. Build with Kilo Code and DeepSeek. The library data model is now written out in full (Appendix C), including kidneys split by side and combined impressions. Word layout measured from his template (Appendix A). Kilo Code rules file added (Appendix B). Setup checklist added (Step 0). (v1.1). Step 9 uses the Google Gemini free tier instead of Claude; Gemini key in the setup list; free-tier limit check added to Step 11 (v1.2). Node 24.x instead of 22.x (Step 0). Steps 7 and 11: Seema, not the agent, runs the library check, so the real wording never passes through the build agent. Appendix B and D updated to match what was tested (v1.3). Appendix A corrected after comparing the Step 4 Word files with his templates: 11 letterhead paragraphs (was 9), header column widths 1980 / 3458 / 1110 / 2468, minimum row heights, default cell margins, "Years/ Male" shown when the age is not spoken, signature indent 5940 (v1.4). Header table cell margins now written explicitly as 108 twips left and right, 0 top and bottom, because the generated file has no table style and Word then prints the text against the left border (v1.5). |

**For the build agent:** follow this document literally, one step at a time. At the end of every step, show the "Check" result and stop until Seema says "next". If anything here is unclear, ask Seema; do not choose.

## Sequencing risk, first

**Speech comes late on purpose.** "Speak, and the report appears" is the impressive part. It depends on the library format, the assembler and the Word file. Built first, it would break every time those change. Speech is Step 8 of 12.

**The library is now off the critical path.** The build uses a placeholder library with obviously fake wording that exercises every feature of the real one. The real library (his wording, 44 findings) is prepared separately after Seema confirms it with Dr. Ashish, and it is loaded at Step 7 or, at the latest, Step 11. The risk moves: the real library is tested late. **Leave at least half a day between Step 11 and the demo.**

**Steps 1 to 6 need no AI.** Together they give a complete tool in "choose from list" mode, which is also the fallback when AI is down (TECH-STACK.md, C4).

## Decisions this plan builds to (all confirmed by Seema, 14 and 15 Oct)

| ID | Decision |
|---|---|
| D1 | Word file copies the layout of his template for that study (Appendix A). Plain A4; the blank letterhead space at the top is kept. |
| D2 | Findings: abdomen 34 (his "commonly used lines" file plus hepatomegaly, gall bladder polyp, simple liver cyst); pelvis 6 (female only); neck 4. |
| D3 | A measurement he does not speak stays as his dotted blank "……". |
| D4 | "TVS" or "transvaginal" spoken: "with TVS" pelvis heading; otherwise "without TVS". The two templates differ only in the heading. |
| D5 | Header: name, age, sex from his speech; date = the day the report is drafted, written DD/MM/YYYY (to be confirmed by Dr. Ashish); Patient ID and "Refd. By:" blank. The header label prints as **"Refd. By:"**. |
| D6 | Wording: his full reports win over his lines file; one report is picked per finding; every patient value becomes a blank. Recorded in the Source Table (kept outside the build). |
| D7 | "Adv:": if what he says matches one of his library "Adv:" lines, that line is used; otherwise his words are written as spoken and **highlighted** for him to check. |
| D8 | Signature: Dr. Ashish Dua only. |
| D9 | Hosting: Vercel Hobby, functions in `bom1` (Mumbai). Build tool: Kilo Code with DeepSeek on Seema's computer. Understanding the dictation: Google Gemini free tier. All accounts are Seema's. Nothing is installed on the doctor's computer. |
| D10 | The build agent never sees his report wording (TECH-STACK.md, C9). |

## What happens when he dictates a finding that is not in the library

**In the demo:** the report is built only from what matched. Everything he said that matched nothing is listed in a yellow box above the report: "Not in your library, not written". Nothing is guessed. He can type the sentence himself into the report before pressing Final. Nothing is saved, so the tool does not learn it.

**For the pilot (not built in this demo; recorded so it is not lost):** the same yellow box, plus an "Add to library" action. His typed sentence for that finding is saved as a *candidate*, with every number turned into a blank, and he is asked, once, "Use this wording for [finding] from now on?". Only after his yes, and Seema's check that no patient detail remains, does it become a confirmed library finding with its impression line, used from the next report onwards. It is never added automatically, because a one-off sentence with one patient's details would otherwise become his standard wording. This is the "his wording: ask, apply after yes" correction type in the Master Plan. It needs a database, an approval screen and a versioned library, which are pilot items.

---

## The one decision most expensive to reverse: the library data model

**Findings replace parts of an organ paragraph, not the whole paragraph.** His normal liver paragraph has four parts. Fatty liver changes part 2 only ("shows diffusely increased echogenicity- s/o grade I fatty. It shows normal outline."). A haemangioma changes part 3 only. Fatty liver plus haemangioma must change both. Storing whole paragraphs makes that impossible, and changing the model after Step 2 means rewriting the assembler, the tests, the AI's allowed values and the Word export.

The model is fixed in full in **Appendix C**, so that Seema can have the real library files prepared to the same format while the build runs. In short:

- **Study:** heading(s), impression label, normal impression, signature lines, report variants (male/female abdomen; with/without TVS pelvis), ordered paragraphs.
- **Paragraph:** optional label (printed bold and underlined), the exact text after the label, and ordered **segments**, each with an ID and exact normal text.
- **Side split:** the kidneys paragraph also holds his "Right Kidney" and "Left Kidney" version. If any finding on one side is chosen, the split version is printed instead of "Both kidneys".
- **Finding:** ID, name, spoken names, paragraph, segments it **replaces** and/or the segment it is **inserted after**, exact text, slots, impression line (or none), status (`confirmed` / `for_confirmation`), source file.
- **Slot:** a blank inside any text: number (with unit), choice (fixed list), or word. Unfilled slots print as "……".
- **Combined impression:** when two listed findings are both chosen, one combined line replaces their two lines (hepatomegaly with fatty liver).
- **Missing impression:** a finding with no impression line adds a highlighted "……" impression point for him to fill.
- **Conflict:** if two chosen findings replace the same segment, both texts are shown and flagged; nothing is merged.

---

## The steps

### Step 0 — Setup (Seema, before the agent starts)
- **Done by Seema:** the checklist in Appendix D (accounts, keys, installs, project folder, rules file).
- **Check:** Kilo Code opens the project, reads Appendix B's rules file and can list the three documents in `docs/`.

### Step 1 — Library schema and the placeholder library
- **Built:** `library/schema.json` implementing Appendix C exactly; `library/abdomen.json`, `pelvis.json`, `neck.json` filled with **placeholder text only** (Appendix C, "Placeholder library"); `scripts/check-library.js`, which validates the files against the schema and prints every normal report and every finding as plain text.
- **Why here:** everything else reads this format.
- **Check:** the script passes and prints the placeholder normals for: male abdomen, female abdomen, pelvis with TVS, pelvis without TVS, neck.
- **Breaks downstream if wrong:** every report, the AI's allowed values, the Word file, and the real library files being prepared in parallel.

### Step 2 — Assembler and validator
- **Built:** `src/assemble.js` (checklist in, report out) and `src/validate.js` (rejects any sentence not in the library and not a dictated value), with `node --test` cases for: normal male; normal female; one finding; two findings on different paragraphs; two findings on the same paragraph; a conflict; an unfilled slot; a choice slot; a one-side kidney finding (split printed); a combined impression; a missing impression (highlighted blank); a matched and an unmatched "Adv:"; impression points in paragraph order with "- " dashes.
- **Why here:** the "nothing invented" guarantee lives here (PRD R4 to R9).
- **Check:** all tests pass; 14 sample reports written as text files for Seema to read.
- **Breaks downstream if wrong:** every report.

### Step 3 — "Choose from list" screen
- **Built:** the single page: choose study (and TVS for pelvis), sex, findings, slot values and header fields; the report appears; edit on screen; Final; copy only after Final (PRD R12 to R14). If any loaded library text starts with "TEST", the page shows "PLACEHOLDER LIBRARY" in red at the top. Served locally by `scripts/serve.js`.
- **Why here:** the core tool and the AI-down fallback.
- **Check:** on `http://localhost`, build a two-finding abdomen report, edit a word, press Final, copy.
- **Breaks downstream if wrong:** Steps 8 to 10 feed this screen.

### Step 4 — Word file
- **Built:** Word download using `docx` 9.8.1 copied locally, to Appendix A; enabled only after Final (PRD R15).
- **Check:** download a placeholder abdomen, pelvis and neck report; open each in Word; measurements match Appendix A (margins, font, sizes, table widths, signature position).
- **Breaks downstream if wrong:** the printed report.

### Step 5 — Deploy and login
- **Built:** Vercel project (Hobby), `vercel.json` with `"regions": ["bom1"]`, passcode login and cookie, library served only through the login-checked function. Environment variables set by Seema in Vercel (Appendix D).
- **Why here:** before any AI key is used, and the first secure web address for the microphone.
- **Check:** open the address, sign in, build and download a report. Signed out, the library address and any `.json` path return an error. The function region shows `bom1` in the deployment summary.
- **Breaks downstream if wrong:** keys exposed; microphone blocked.

### Step 6 — Microphone capture
- **Built:** microphone chooser with device name, level meter, one button to start and stop, playback (PRD R1). No transcription yet.
- **Check:** **on the doctor's own computer, with his Bluetooth mic**, Seema records a sentence and plays it back.
- **Breaks downstream if wrong:** Step 8 receives silence or the wrong microphone.

### Step 7 — Library check-in (agent stops and asks)
- **Agent asks Seema:** "Are the real library files ready?"
  - **If Seema provides them:** Seema closes Kilo Code, copies `abdomen.json`, `pelvis.json`, `neck.json` into `library/`, replacing the placeholders, and runs `node scripts/check-library.js` herself in an ordinary terminal window, not in the Kilo Code chat. **Seema compares every printed finding with the Source Table.** The agent never opens, prints, quotes or summarises anything in `library/` after this point (AGENTS.md rule 11), so the doctor's wording never reaches the build model. If the agent must change code afterwards, Seema first moves the real files out of `library/` and puts the placeholders back (Claude gives the commands), then restores the real files.
  - **If Seema says "continue with placeholder":** continue to Step 8. Step 11 then becomes the load point and is a hard stop.
- **Why here:** Steps 8 and 9 are best tested on real medical words; the agent must not wait for them.
- **Breaks downstream if wrong:** wrong wording in front of the doctor.

### Step 8 — Speech to text
- **Built:** server function sending the recording to Deepgram `nova-3-medical`, with key terms **generated from the library** (paragraph labels, finding names and spoken names; within Deepgram's 500-token limit). Editable transcript box. Timeout 8 s, one retry; then a message and the list mode.
- **Check:** speak a dummy case, the text appears. Turn off the internet: the list mode still works.
- **Breaks downstream if wrong:** Step 9 understands the wrong words.

### Step 9 — Understanding the dictation
- **Built:** server function calling the Gemini API (model per TECH-STACK.md) with function calling forced to one function, whose parameter `enum` lists are **generated from the library at run time**. It returns the Step 2 checklist; the assembler builds the report. The closing phrases ("please give report", "please make a report", "please make report", "please draft report") are removed from the text; the report is drafted when he presses stop. Timeout 6 s, one retry; then the list mode opens with the transcript kept. If Gemini answers that the free-tier limit is reached, the list mode opens at once with the message "AI limit reached for today: please choose from the list". Any ID not in the library is rejected by the validator and listed in the yellow box.
- **Check:** speak naturally and the report appears (PRD R2 to R11). With the Gemini key removed, the list mode opens and nothing is lost.
- **Breaks downstream if wrong:** the demo's main moment.

### Step 10 — Yellow box: unmatched, conflicts, items to check
- **Built:** one panel listing: words that matched nothing (not written); segment conflicts; findings marked `for_confirmation`; highlighted impression blanks; highlighted unmatched "Adv:".
- **Check:** dictate a finding not in the library; it is listed and absent from the report.

### Step 11 — Real library and test run (hard stop if the real library is not yet loaded)
- **If still on placeholder:** agent stops: "Real library needed." Seema loads the files as in Step 7.
- **Built:** 20 dummy dictations (Claude drafts them from the Source Table; they never go into the build chat) across the three studies (two findings, same paragraph, one-side kidney, unknown finding, "Adv:", pelvis TVS, hepatomegaly with fatty liver). **Seema runs each one herself** in the deployed demo and fills a results table (case, expected, actual, pass or fail); the agent is given only the pass or fail result and the case number, never the report text. Key terms are adjusted from those results.
- **Check:** a results table: case, expected, actual, pass or fail. Seema notes in Google AI Studio how many requests the test run used against the free daily limit; a demo day must stay well under it. Every finding printed by `check-library.js` (run by Seema, as in Step 7) compared word for word with the Source Table.

### Step 12 — Rehearsal pack
- **Built:** a one-page script for Seema (passcode, five dictations, what to do if the AI is slow) and a run-through on the doctor's computer the day before.
- **Check:** Seema runs it end to end on the deployed address.

---

## Steps that can silently half-work

| Step | How it fails silently | The check that catches it |
|---|---|---|
| 1, 7, 11 library | A file passes the schema but a word is miscopied or a blank is wrong. | Print every finding and compare word for word with the Source Table. Schema checks cannot catch wrong words. |
| 2 assembler | Two findings on one paragraph read well but one finding's text is dropped. | Same-paragraph test checks both texts are present. |
| 2 assembler | A one-side kidney finding is added to "Both kidneys" instead of the split version. | One-side kidney test. |
| 4 Word file | The file opens, but margins, sizes or the table differ from his. | Measure against Appendix A in Word. |
| 5 login | The library is also reachable without login. | Signed out, request every `.json` path. |
| 6 microphone | It records from the laptop's own microphone. | Device name shown; test on his computer with his mic. |
| 8 speech | Medical words work in Seema's voice but not his. | Repeat the key-term check with his voice or a recording. |
| 9 understanding | Allowed values typed by hand drift from the library. | Values generated at run time; test that renames a finding ID and expects failure. |
| 9 fallback | Never triggered in testing. | Run Steps 8 and 9 with keys removed. |
| 7/11 load | The placeholder library is still loaded on demo day. | The page shows "PLACEHOLDER LIBRARY" in red whenever any placeholder text is loaded. |

---

## Appendix A — Word layout (measured from his "whole abdomen male" template)

| Element | Specification |
|---|---|
| Page | A4 (11906 × 16838 twips). Margins: left and right 1440 twips (1 inch); top 0; bottom 0. No header or footer. |
| Letterhead space | 11 empty paragraphs (single line spacing, no space after), Times New Roman 12 pt, before the header table. Measured in all three of his abdomen templates and his pelvis template. The header table must start 156 pt from the top of the page, so it lines up with a pre-printed letterhead. |
| Default text | Times New Roman 12 pt, justified, spacing after 8 pt, line spacing 1.08. |
| Header table | 4 columns, widths 1980 / 3458 / 1110 / 2468 twips (total 9016); all borders single, 0.5 pt; cell margins written explicitly in the table itself: left 108 and right 108 twips, top 0 and bottom 0 (his Normal Table style; do not rely on a default, the generated file has none); minimum row heights 389 / 363 / 363 twips for rows 1 / 2 / 3. Row 1: "Patient’s Name:" · name · "Age/Sex:" · "{age} Years/ {Male or Female}" (if the age is not spoken, print "Years/ Male" or "Years/ Female", as his template does). Row 2: "Patient Id:" · blank · "Date:" · date. Row 3: "Refd. By:" · blank · blank · blank. 12 pt, not bold. Same on all three studies. |
| Heading | One empty paragraph, then the study heading, 13 pt, bold, underlined, centred. |
| Paragraphs | Label bold and underlined, followed by the label's separator and text in plain 12 pt (separator stored in the library, e.g. ": – "). One empty 9 pt paragraph between paragraphs. Neck paragraphs have no label and start with "- ". |
| Impression | Label "IMPRESSION" bold and underlined; the rest of the line bold. Two or more points: each on its own paragraph starting "- ", bold, in paragraph order. Highlighted items (missing impression, unmatched "Adv:") use yellow highlight. |
| Signature | Three lines, 12 pt bold, spacing after 0, left indent 5940 twips (measured from the position of Dr. Ashish's block in his template): "Dr. Ashish Dua, MD" / "Consultant Radiologist" / "Ex. PGI, Chd." |

Pelvis and neck use the same page, table and signature; their headings, labels, separators and impression labels come from the library.

## Appendix B — Kilo Code rules file

Save as `.kilocode/rules/build-rules.md` in the project. Tested on 18 Oct 2026: Kilo Code did not load this file by itself, so the same rules are also placed in the project's `AGENTS.md` (AGENTS_Report_Demo_v1.0.md), which it does load. Keep both.

```
You are building the demo described in docs/PRD.md, docs/TECH-STACK.md and docs/IMPLEMENTATION-PLAN.md.
1. Follow docs/IMPLEMENTATION-PLAN.md literally, one step at a time, in order. Do not start the next step until Seema types "next".
2. At the end of each step, show the step's "Check" result and stop.
3. If anything is unclear or missing, ask Seema. Never choose on her behalf.
4. Never write, invent or rephrase report wording. Report text comes only from files in library/.
5. Never put real report wording in the repository. Use placeholder text until Seema loads the real library.
6. Use only the tools, libraries and exact versions in docs/TECH-STACK.md. No version ranges. Nothing from the Hard exclusions table.
7. Never put API keys or the passcode in code or in the repository. They live only in Vercel environment variables.
8. Never store or log audio, transcripts, names or any header field.
9. Do not read files outside this project folder.
```

## Appendix C — Library file format

One file per study: `library/abdomen.json`, `library/pelvis.json`, `library/neck.json`.

| Field | Meaning |
|---|---|
| `schemaVersion` | `"1.0"` |
| `study` | `"abdomen"`, `"pelvis"` or `"neck"` |
| `headings` | Object of heading text by variant, e.g. `{"default": "...", "tvs": "..."}` |
| `variants` | List of `{id, when}`: abdomen `male` (`{"sex":"M"}`), `female` (`{"sex":"F"}`); pelvis `tvs` (`{"tvs":true}`), `default`; neck `default` |
| `impressionLabel` | Exact text, e.g. `"IMPRESSION: – "` |
| `normalImpression` | Exact text used when no finding is chosen |
| `signature` | List of three lines |
| `paragraphs` | Ordered list of `{id, label, separator, variants, segments, sideSplit}`. `label` may be empty. `variants` lists which report variants include it. `segments` is an ordered list of `{id, text}` |
| `sideSplit` | Only for kidneys: `{ "right": {label, separator, segments}, "left": {label, separator, segments} }`, used when any chosen finding has a side |
| `slots` | List of `{id, type, unit, options}`; `type` is `number`, `choice` or `word`. Written inside text as `{slot:ID}`. A paragraph's own blanks (e.g. normal liver length) are slots too |
| `findings` | List of `{id, name, spoken, paragraph, side, replaces, insertAfter, text, impression, advLine, status, source}`. `replaces` is a list of segment IDs (may be empty); `insertAfter` is a segment ID or null; `side` is true if the finding has a right/left; `impression` is text or null; `status` is `confirmed` or `for_confirmation` |
| `combinedImpressions` | List of `{findings: [id, id], text}` |
| `advLines` | His "Adv:" lines, exact text |

**Placeholder library (for the build agent):** the same structure with fake text only, for example paragraph label "TEST ORGAN A", segments "test normal sentence A1.", "test normal sentence A2 measuring {slot:a_len} cm.", findings "TEST FINDING A-ONE replaces A2", "TEST FINDING A-TWO inserted after A1", one side-split paragraph "TEST PAIRED ORGAN", one finding with no impression, one combined impression, two "Adv:" lines, and one finding marked `for_confirmation`. Every placeholder string starts with "TEST" so the red "PLACEHOLDER LIBRARY" label from Step 3 can detect it.

## Appendix D — Setup checklist

**Seema's computer (once, before Step 1):**
1. Install Node.js 24 (LTS) and Git. Confirm with `node --version` (shows v24.x).
2. VS Code with the Kilo Code extension; add a DeepSeek API key in Kilo Code's provider settings and choose DeepSeek as the model. Turn on DeepSeek's opt-out from training if your account offers it.
3. Create a **private** GitHub repository and open it in VS Code. Create the folders `docs/` and `.kilocode/rules/`.
4. Copy into `docs/`: PRD.md (v1.1), TECH-STACK_v1.3.md saved as `TECH-STACK.md`, and this file saved as `IMPLEMENTATION-PLAN.md`. Save Appendix B as `.kilocode/rules/build-rules.md`.
5. Do **not** put the Source Table, his report files or the Library Review file in this folder.

**Before Step 5:** a Vercel account (Hobby) connected to the GitHub repository; a Deepgram account and API key (free $200 starting credit); a Gemini API key from Google AI Studio, signed in with Seema's existing Google account (AI Studio creates the project and key; if she has used Google Cloud before, import that project first); in AI Studio, confirm that the chosen model shows a free tier and note its daily limit; a passcode for Dr. Ashish; a cookie secret (the agent will give the command to generate it). Seema enters these four values in Vercel, Project Settings, Environment Variables.

**The doctor's computer (Step 6 and demo day):** nothing to install. Google Chrome up to date; Bluetooth microphone paired; internet; the web address; the passcode. First visit: Chrome asks for the microphone, click Allow.

**Before Step 7 or 11:** the three real library files, prepared from the Source Table after Dr. Ashish's answers.
