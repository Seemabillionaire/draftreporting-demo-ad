# PRD — Report Drafting Assistant: Demo Build

| | |
|---|---|
| Version | v1.1 (replaces v1.0 of 14 October 2026) |
| Date | 14 October 2026 |
| Status | Seema's decisions of 14 October recorded (natural speech, closing command, patient details). Requirements only: no technology choices, no build order. |
| Scope | Demo on dummy cases, three study types: ultrasound abdomen, pelvis, neck |

**Sources.** Call 1 transcript (24 Sept), Call 2 transcript (30 Sept), his voice note of 1 Oct as typed by Seema, his voice note on templates, Seema's requirements list of 14 Oct, and the audit of his 208 template and report files. The call transcripts are machine transcripts with gaps; Hindi was largely not captured. Quotes are reproduced exactly as transcribed, gaps and all.

**Decisions by Seema, 14 October 2026**

| Question | Decision |
|---|---|
| Natural speech in the demo | Accepted. He speaks findings as he naturally would; the wording still comes only from his templates. |
| Closing command | "Please give report". It ends the dictation and starts the draft for his review and sign-off. His own phrases ("please make a report", "please make report", "please draft report") are also accepted, so a slip of habit does not stop the draft. |
| Patient details in the demo | Spoken by him (dummy cases) and filled into the report header. |

---

## 1. The client, in five lines

1. A radiologist reporting about 30 cases a day: "I am, like, reporting around, 30 cases every day."
2. About two thirds are pregnancy scans in separate software ("For pregnancy scans, I have a separate software altogether"); the rest, about 10 a day, are general ultrasound reported in Word.
3. Today: reception registers the patient, he scans and dictates, a typist types into saved Word templates, "then they'll print it. Then I'll sign it."
4. His saved templates are his system: a normal per study, plus saved versions per finding ("Fatty liver template saved. Gallbladder stones kidney stones isolated finding").
5. He has tried a medical voice-to-text tool (Augnito) and a report generator (Larmor), and uses neither today.

His Word templates are not a workaround. They are a sound answer to his constraints: a fixed format he controls, usable by any typist, printable on the spot.

---

## 2. What he said, and what it means for the build

| What he said (verbatim) | What it means for the build |
|---|---|
| "Bluetooth mic. Mic on that patient and positive finding and please make a report." (Call 2) | The command is spoken, ends with a phrase he already uses, and carries patient details plus positive findings only. Normal organs come from the template. |
| "Please draft report." (Call 1) · "Please make report." (Call 1) · "please make a report." (Call 2) | He uses at least three versions of the closing command. The tool must accept his natural variants, not one fixed phrase. |
| "data entry operator who is not able to understand the medical words" (Call 1) | The problem underneath is dependence on a typist who knows medical vocabulary. The tool must get medical words right without that typist. |
| "It should be a part of it. Like, voice to text, integrate" (Call 2) | Voice capture is inside the tool. No separate dictation software. |
| "But that is only voice to text. That is not a chatbot." (Call 2, on his current tool) | Transcription alone does not solve his problem. The value is turning speech into a finished report in his format. |
| "Even ChatGPT also understands medical words quite accurately, though not 100% as good as Ognito, but reasonably fine." (1 Oct) | His bar for medical word recognition is "reasonably fine", not perfect. But he will compare it with a medical-grade tool he has used. |
| "every doctor has a slightly different way of writing the reports, so the chatbot should customize it as per the doctor's needs." (1 Oct) | Every word of the report body and impression comes from his own templates and saved findings. No generic wording. |
| "If I use it for ultrasound, then it sometimes made errors and generated reports as per the CT scan template or the MRI template" (1 Oct, on Larmor) | Choosing the wrong template is a known failure that cost a competitor his trust. Study type must be identified correctly, or the tool must ask. |
| "We just give them give the positive findings. Findings and impression." (Call 1) | Two sections: findings, impression. No history or technique sections. |
| "Minor punctuation, grammatical errors" (Call 1, on what he corrects) · "Spacing or formatting" (Call 1) | Layout, punctuation and spacing must match his templates exactly every time. That is the visible quality bar. |
| "She has fatty liver grade one. Please draft the report. Structured without doing any mistakes." (Call 1) | The grade is what he says. Nothing is chosen or added by the tool. |
| "Patient detail and may I ask a positive finding before I take the next patient, I quickly review it. Or, minor corrections." (Call 2) | Review happens between patients, so the draft must be ready fast and corrections must be quick on screen. |
| "I would rather have a downloadable doc file, which I can first save onto my desktop and then print it." (1 Oct) · "I think I would copy-paste it, not send it straight away." (1 Oct) | Output is copy-the-text or a Word file. Nothing is sent anywhere by the tool. |
| "For patient details, as of now, I think I'll have to speak." (1 Oct) · "patient name, age" (Call 1) | He expects to speak patient details, including the name. See Section 4, item 3: this conflicts with the privacy design. |
| "Manually print out." · "That's the second step." (Call 2, on PDF and delivery) | Delivery is Phase 2. Manual print and signature stay. |
| "English. English. English." (Call 1) | English only. |
| "the most commonly used templates are: ultrasound abdomen, TVS pelvis, ultrasound neck, ultrasound scrotum, ultrasound breasts" (templates voice note) | The demo's three study types (abdomen, pelvis, neck) are among his five most used. |

---

## 3. The problems, ranked by what they cost him

1. **Dependence on a trained typist.** When the typist is absent or untrained, his reports slow down or come out wrong, because the staff do not understand "the medical words". This costs his time on every report that day, and errors in signed reports.
2. **Correction time on every report.** "Minor punctuation, grammatical errors" and "Spacing or formatting" are fixed by hand on each report. This is small each time, but it repeats on about 10 reports a day.
3. **The tools he tried did not fit.** Augnito types words but does not build the report. Larmor built reports, but on the wrong template for ultrasound and in someone else's format. The cost is money and time already spent, and a higher bar of trust for the next tool.
4. **Delivery of reports to patients and doctors.** He called it "the second step". It costs him nothing in the demo and is out of scope.

---

## 4. What does NOT add up

**1. The demo approach I recommended earlier, keyword rules with the browser's built-in speech, is wrong for this client.** He expects the tool to understand medical words "reasonably fine" and to take natural dictation: "This is a patient, like, with fatty liver. Please make report." A demo that needs each finding spoken by an exact name, and that may mishear long medical words, shows him a weaker tool than the two he has already used and dropped. The demo must therefore meet two requirements together: it understands findings spoken naturally, and every word of the report still comes only from his templates. If both cannot be met in the time available, show fewer findings properly rather than many findings badly. *Decision 14 Oct: natural speech accepted for the demo.*

**2. The chosen closing command is not his phrase.** He said "Please draft report", "Please make report" and "please make a report". Making him learn a new command breaks the promise that nothing new is learned. The tool must accept his own variants. *Decision 14 Oct: the main command is "please give report"; his own phrases are also accepted. Show him the new command at the start of the demo.*

**3. Patient details: his workflow and our privacy design contradict each other.** He said "For patient details, as of now, I think I'll have to speak", and in Call 1 listed "patient name, age". The call sheet suggests age and sex only, and the draft data processing agreement (Clause 2.4) says names must not be dictated into the tool. For the demo this is harmless, since the cases are dummy. *Decision 14 Oct: in the demo, patient details are spoken and fill the header.* For the pilot, one of the two must change before the agreement is signed.

**4. "Works without a trained typist" is Seema's reading, and his own words pull both ways.** He said "Staff untrained and understanding medical language" and spoke of "a dumb, typist", which is the need. He also said "Currently, I have a good typist, so I don't really need it" and "staff reasonably efficient" (Call 2). On good-typist days the tool saves little. Its value is reliability on bad days and fewer corrections on all days. This is not only a software problem: someone still registers the patient, prints and hands over the report. The tool removes the medical-vocabulary dependence, not the staff.

**5. "My whole idea is to save my time" against "by the time I finish the scan in ten minutes".** If the typist already finishes during the 10-minute scan, the time saved per report is small. The transcript is too broken here to be sure. The demo should show that a draft is ready the moment he stops speaking, and the pilot should measure whether that saves time.

**6. Three study types cannot be confirmed by him in the time available.** Abdomen has his own finding lines ("1- commonly used lines Abdomen"). Pelvis and neck have only whole reports, so their finding blocks must be taken from his reports, unconfirmed. Given "every doctor has a slightly different way of writing", showing unconfirmed wording risks "that is not how I write". Pelvis and neck must use his wording word for word from his own reports, and must be labelled for his confirmation.

**7. Login is our requirement, not his.** He never asked for one. It protects his templates, which are his intellectual property, and that is a valid reason. But a doctor between patients will not tolerate repeated logins. It must be a one-time sign-in on his computer.

**8. His own abdomen lines file has an error.** The cholelithiasis line reads "shows diffusely increased echogenicity, suggestive of grade I fatty liver". That is the fatty liver sentence. Until he corrects it, the demo must use the gall stone wording from his own cholelithiasis report.

---

## 5. Requirements for the demo

**Speaking and drafting**

- R1. He presses one button to start and stop speaking, using his own Bluetooth mic in his browser on his own computer.
- R2. He speaks the case in natural English: patient details, study type and positive findings, in any order, ending with the closing command "please give report". His own phrases ("please make a report", "please make report", "please draft report") are also accepted.
- R2a. Patient details he speaks (name, age, sex; dummy in the demo) fill the matching header fields. Fields he does not speak stay blank for typing.
- R3. The tool identifies the study type (abdomen, pelvis with TVS, pelvis without TVS, neck) and the sex, and uses his matching normal template. If the study type is unclear, it asks rather than guesses.
- R4. Each positive finding replaces the matching normal organ paragraph with his saved wording. Organs he does not mention stay as in his normal template.
- R5. Numbers he speaks (sizes, volumes, measurements) fill the matching blanks. Blanks he does not fill stay as his dotted blanks.
- R6. Grades and categories appear only when he says them. The tool never chooses one.
- R7. The impression is built from the impression lines of the findings he named, as dash bullets, in organ order. "No significant abnormality detected" appears only when no finding is named.
- R8. "Adv:" lines appear only when he says them.
- R9. Anything he says that has no saved wording is shown to him, flagged, and not written into the report.
- R10. Medical words he commonly uses are recognised reasonably well. Before he sees the demo, it must pass a test on a list of his most frequent terms.
- R11. The draft appears within a few seconds of the closing command.

**Reviewing and output**

- R12. The draft shows on screen in his layout: header fields, heading, organ paragraphs, impression, signature block (Dr. Ashish Dua only).
- R13. He can correct any word on screen.
- R14. He marks the report Final. Only then can it be copied or downloaded.
- R15. The download is a Word file that matches his current template's layout, ready to save and print.
- R16. Nothing is sent anywhere by the tool.

**Library**

- R17. Templates and finding wording are held as structured records: study, sex, normal paragraphs per organ, finding blocks per organ, impression lines, blanks. So each report can be rebuilt exactly, and the library can grow.
- R18. Demo library: abdomen (male and female normals, with findings from his lines file and reports), pelvis (with TVS and without TVS normals, with findings from his reports), neck (normal, with findings from his reports). Each finding carries its source file.
- R19. Pelvis and neck finding blocks are marked "for your confirmation".

**Access and data**

- R20. Only people we authorise can open the demo. One sign-in per computer, remembered.
- R21. Dummy cases only. No real patient data is entered, stored or kept.

---

## 6. Explicitly out of scope, and why

| Out of scope | Why |
|---|---|
| Real patient data | No data agreement is signed and no compliant hosting is in place. The demo is dummy cases only. |
| Obstetric scans | "For pregnancy scans, I have a separate software altogether"; PC-PNDT obligations. |
| Scrotum, breast, small parts, Doppler, other study types | The demo shows three study types; the rest follow in the pilot or later. |
| PDF, WhatsApp delivery, digital signature | "That's the second step." Manual print and signature stay. |
| Connecting to his hospital or clinic software | Not asked for the first step; nothing he uses is replaced. |
| Correction log, daily check-ins, success counts | These belong to the one-week pilot, not a demo. |
| Typist accounts, several users, template editing by him | Not needed to show how the tool works; added in the pilot if wanted. |
| Images or scan interpretation | The tool drafts what he says. It never reads images. |

---

## 7. Open questions to answer before building

Questions 1 to 3 of v1.0 (closing command, natural speech, patient details in the demo) are decided; see the decisions table at the top.

1. **Patient details in the pilot.** Which changes: his workflow (age and sex only) or the agreement (names allowed, then removed before storage)? Not needed for the demo.
2. **Printing.** Does he print on plain paper or pre-printed letterhead? Are the header fields (name, ID, date, referred by) filled by the typist before printing today?
3. **Pelvis.** Will he say "TVS" when it is a transvaginal scan, so the tool picks between the two pelvis normals?
4. **Findings for pelvis and neck.** Which findings to include? Proposed from his reports: pelvis (fibroids, adenomyosis, endometriotic cyst, polycystic ovaries, thickened endometrium, haemorrhagic cyst); neck (diffuse thyroid disease, multinodular goitre, Hashimoto's thyroiditis, cervical lymphadenopathy). Where he has two or three versions of one finding, which is current?
5. **Measurements.** On a normal report, does he dictate measurements or leave blanks? (Call sheet item 2.)
6. **Two beds.** He said "I have two ultrasound beds." Is there one computer or two? Which one will the demo run on?
7. **Who signs in.** Him only, or also the typist?
8. **Demo date and place.** When, and on which computer?
