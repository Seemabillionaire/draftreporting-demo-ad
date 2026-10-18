# TECH-STACK — Report Drafting Assistant: Demo Build

| | |
|---|---|
| Version | v1.3 (replaces v1.2 of 15 October 2026) |
| Date | 18 October 2026 |
| Status | Draft for Seema's approval (v1.2 was approved 15 Oct 2026). Companion to PRD.md v1.1 and IMPLEMENTATION-PLAN.md v1.3. Stack only: no requirements, no build order. |
| Changes | Hosting on the free Hobby plan (Seema, 14 Oct). Mumbai region confirmed. Build tooling added (VS Code, Kilo Code, DeepSeek). Library delivered separately, after the build starts. Local preview script added. (v1.1). Understanding the dictation moved from Claude to the Google Gemini free tier (Seema, 15 Oct) (v1.2). Node 22.x changed to Node 24.x: Seema's computer already runs Node 24, Vercel offers 24.x (its default) and 22.x, and Node 24 is supported longer (v1.3). |

## Constraints this stack is held to

| Code | Constraint | Source |
|---|---|---|
| C1 | Opens on the doctor's own computer through a web address. Nothing installed on his computer. | Decision 14 Oct |
| C2 | One-time login, remembered, protecting his templates. | PRD R20 |
| C3 | No database in the demo. The library is structured data files. | Decision 14 Oct |
| C4 | Stays usable when every AI provider is down or rate limited. | Outline (kept) |
| C5 | Built by an agent from a written brief: every choice pinned, nothing improvised. | Outline (kept) |
| C6 | Must cope with a weak or unstable internet connection. | Outline (kept) |
| C7 | Dummy cases only. No patient data stored, logged or kept. | PRD R21 |
| C8 | Report wording comes only from his library. AI never writes report text. | PRD R4 to R9, R17 |
| C9 | The build agent never sees his report wording. It builds against a placeholder library; Seema adds the real library files later. | Decision 15 Oct |

## The stack: what runs for the doctor

| LAYER | CHOICE | THE CONSTRAINT THAT FORCED IT |
|---|---|---|
| Hosting | Vercel, **Hobby (free) plan** (Seema's decision, 14 Oct). One project, one production deployment, linked to a Git repository. | C1: a secure (https) web address, which Chrome requires before it allows the microphone. **Flag:** Vercel's terms limit Hobby to "non-commercial, personal use only". If the account is paused, switch the same project to the free 14-day Pro trial; no code changes. |
| Server region | Vercel functions pinned to Mumbai: `"regions": ["bom1"]` in `vercel.json`. Hobby allows one region; `bom1` is confirmed in Vercel's region list (Mumbai, India). | PRD R11 (draft within seconds). Vercel's default (`iad1`, USA) would add a round trip across the world on every call. |
| Server runtime | Vercel Node.js functions, Node 24.x (set in Vercel Project Settings and in `package.json` as `"engines": {"node": "24.x"}`; Vercel offers only the major version and applies minor and patch updates itself), calling outside services with built-in `fetch` only. | C5: one runtime with standard APIs. Rejected the Edge runtime and provider SDKs. |
| Front end | One static HTML page, plain JavaScript as ES modules, no framework, no build step. | C5. Rejected React and Next.js. |
| Styling | One hand-written CSS file. | C5. Rejected Tailwind. |
| Microphone capture | Browser `getUserMedia` and `MediaRecorder` (Opus audio), with a microphone chooser showing the device name and a level meter. | PRD R1. Rejected the Web Speech API (no medical vocabulary, PRD R10). |
| Speech to text | Deepgram (free $200 starting credit on Seema's new account), model `nova-3-medical`, pre-recorded endpoint, called from a server function, with key terms generated from the library (Deepgram limit: 500 tokens per request). | PRD R10, R11; C2. Rejected live streaming (C6). **Flag:** Deepgram processes outside India: dummy cases only (C7), not for the pilot. |
| Understanding the dictation | Google Gemini API, **free tier**, called from a server function with plain `fetch`, using function calling forced to one function (`tool_choice` with `allowed_tools`, mode `any`). The function's parameters use `enum` lists of the library's own study, finding, slot and choice IDs, generated from the library at run time. It returns IDs, spoken values and header fields, never sentences. Model: `gemini-3.8-flash`, **confirmed as free-tier in Seema's Google AI Studio before the first deploy**; if it is not, use the free-tier Flash model AI Studio lists and record it here. | C8: the AI only chooses from his library. PRD R2, R11. Cost zero (Seema, 15 Oct). **Flags:** Google's pricing page says free-tier content is "used to improve our products": dummy dictations only; the model sees the dictation and finding names, never his report wording. Daily free-tier limits are shown in AI Studio; when a limit is reached the tool opens the list mode (C4). Not for the pilot. |
| Report assembly | A deterministic function in the browser that builds the report from the library, plus a validator that rejects any sentence not in the library and not a dictated value. | C8, C4. |
| AI-down fallback | Manual mode on the same screen ("choose from list"). Timeouts: speech 8 s, understanding 6 s, one retry each, then manual mode. | C4, C6. |
| Library storage | One JSON file per study type (`abdomen.json`, `pelvis.json`, `neck.json`) with a schema version, in a `library/` folder that is **not** served as static files. Served only through a login-checked function. During the build the folder holds the placeholder library; Seema replaces it with the real files at the plan's library step. | C3, C2, C9. |
| Login | One shared passcode, checked by a server function, which sets an HttpOnly, Secure, SameSite=Strict cookie signed with Node's `crypto` (HMAC), valid 30 days. | C2, C5. |
| Secrets | Vercel environment variables: Deepgram key, Gemini key, passcode, cookie secret. Never in the browser, never in the repository. | C2, C5. |
| Word file | `docx` library, **pinned to exactly 9.8.1**, copied into the repository and run in the browser. Layout per IMPLEMENTATION-PLAN.md, Appendix A. | PRD R15, C6. **Flag:** `docx` releases very often; upgrade only on purpose. |
| Copy text | `navigator.clipboard.writeText`. | PRD R14. |
| Session state | In memory only. Reloading clears the case. | C7. |
| Browser | Google Chrome, current version, desktop. | C1, PRD R1. |
| Tests | Node's built-in test runner (`node --test`). | PRD R10, C5. |
| Dependency control | Exact versions only, lockfile committed. | C5. |
| Logging | Status codes and timings only. Never transcript text, header fields or audio. | C7. |

## The stack: what Seema uses to build it (never runs for the doctor)

| LAYER | CHOICE | WHY |
|---|---|---|
| Editor | VS Code on Seema's computer. | Seema's decision, 15 Oct. |
| Build agent | Kilo Code extension in VS Code, using DeepSeek as its model, with the project rules file from IMPLEMENTATION-PLAN.md, Appendix B. | Seema's decision, 15 Oct. The rules file makes it build one step at a time and stop for checks (C5). |
| Local preview | A small Node script (`scripts/serve.js`, built-in `node:http`, no dependency) that serves the page on `http://localhost` for Steps 1 to 4. | Steps 1 to 4 need no server functions, so no Vercel tool is needed until Step 5. Chrome treats `localhost` as secure. |
| Deploy | Push to the Git repository linked to Vercel; Vercel deploys automatically. | No deploy tool to install. |
| Accounts | All accounts and keys are Seema's own: Vercel, Deepgram, Google AI Studio (her existing Google account), DeepSeek. Dr. Ashish needs none. | Seema, 15 Oct. |
| What the build agent may read | The `docs/` folder (PRD, TECH-STACK, IMPLEMENTATION-PLAN) and the code. **Not** his report files, the source table, or the real library. | C9. DeepSeek's privacy policy (updated 10 Feb 2026) says data is stored in the People's Republic of China and may be used to train models. |

## Flags

- **Hobby plan terms:** non-commercial personal use only. Fallback: Pro trial, same project.
- **Deepgram and Gemini process outside India; Gemini's free tier may use content to improve Google's products.** Fine for dummy cases. Not for the pilot without a change.
- **DeepSeek sees the planning documents**, which quote Dr. Ashish's words from calls (no patient data). It never sees his report wording.
- **`docx` changes often.** Pinned exactly.
- **Touch support:** not assessed. Desktop Chrome only.

## Hard exclusions

| Do not use | Reason |
|---|---|
| React, Next.js, Vue, Svelte or any framework | C5. |
| Vite, webpack or any bundler; TypeScript compilation | C5. |
| Tailwind or any CSS framework | C5. |
| Supabase, Firebase or any database in the demo | C3. |
| Supabase Auth, NextAuth, Clerk, Auth0 | C2, C5. |
| LangChain, LlamaIndex or any agent framework | C5. |
| Provider SDKs (Deepgram, Google) | C5: plain `fetch` only. |
| The Web Speech API (`SpeechRecognition`) | PRD R10. |
| DeepSeek or any model other than those in the first table, inside the tool | Not chosen; untested; data location. |
| Letting the AI write or rephrase report text, at any step | C8. |
| Prompt-only safeguards in place of the validator | C8. |
| Public static files for the library | C2. |
| Real report wording in the repository before the plan's library step | C9. |
| API keys in browser code, in the repository or in public environment variables | C2. |
| Scripts or fonts loaded from a CDN at runtime | C6. |
| localStorage, sessionStorage or IndexedDB for case data | C7. |
| Storing or logging audio or transcripts | C7. |
| Analytics, trackers or error-reporting services | C7. |
| Retry loops beyond one retry | C4. |
| Live streaming speech over WebSockets | C6. |
| `html-docx-js` | Unmaintained. |
| Any version given as a range (`^`, `~`, `latest`) | C5. |
