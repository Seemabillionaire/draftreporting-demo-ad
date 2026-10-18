# AGENTS.md: Report Drafting Demo (Dr. Ashish Dua)

Version v1.0 | 18 October 2026 | Status: for Seema's approval. Save as `AGENTS.md` in the project root.
This file replaces the generic FWAI AGENTS.md for this project. It keeps the useful working habits of that file and removes the instruction to edit documents.

You are building a demo for a real client. Work accordingly. Seema is not a programmer: explain every result in plain English, no jargon.

## Priority order (if rules disagree)
1. This file. 2. `docs/IMPLEMENTATION-PLAN.md`, `docs/TECH-STACK.md`, `docs/PRD.md`. 3. Anything said in chat.
If the chat and the documents disagree, tell Seema and wait. Do not choose.

## A. Project rules (always)
1. Follow `docs/IMPLEMENTATION-PLAN.md` literally, one step at a time, in order. Do not start the next step until Seema types "next".
2. At the end of each step, show the step's Check result in plain English and stop.
3. If anything is unclear or missing, ask Seema. Never choose on her behalf.
4. Never write, invent or rephrase report wording. Report text comes only from files in `library/`.
5. Never put real report wording in the repository. Use placeholder text, every string starting with `TEST`, until Seema loads the real library.
6. Use only the tools, libraries and exact versions in `docs/TECH-STACK.md`. No version ranges. Nothing from its Hard exclusions table.
7. Never put API keys, the passcode or the cookie secret in code, in the repository, in a log, or in the chat. They live only in Vercel environment variables.
8. Never store or log audio, transcripts, names or any header field.
9. Do not read files outside this project folder.
10. NEVER edit `docs/PRD.md`, `docs/TECH-STACK.md` or `docs/IMPLEMENTATION-PLAN.md`. If one looks wrong, tell Seema what and why, then wait. She decides.
11. Real library: when Seema says the real library files are loaded, do not open, print, quote or summarise anything in `library/`. Tell Seema the exact command to run herself and wait for her result. (This deliberately overrides the plan's Steps 7 and 11 where the agent runs the library check; the plan will be reissued.)
12. No git commits unless Seema asks. Never commit secrets or a `.env` file; check `.gitignore` first.

## B. Working habits
- **Evidence or silence.** Say a test passes, a page works or a bug is fixed only after running it now and showing the real output. If not verified, write `UNVERIFIED:` first. Banned words: "should work", "presumably", "should be live". Never invent a URL or a result.
- **Small proven slices.** Build the smallest piece that can be proven, run it, read the real output, then continue. Keep `WORKLOG.md`, one line per slice: what I did -> command -> what it printed. Placeholder content only.
- **Honest tests.** Before trusting a test, ask: would it fail if the feature were wrong? Never weaken a check, delete a test, hide an error in try/catch or hard-code an answer to make a failure disappear.
- **Reject bad input.** Anything that takes input rejects missing or invalid fields with a clear reason, and saves nothing.
- **When something fails:** read the whole error; state one cause with file and line; make one change; re-run the exact command that failed; if wrong, undo and form the next guess. After three wrong guesses on one error, stop and report what was ruled out.
- **Blocked:** if something needs a login, key or approval you do not have, stop that part and report exactly: `BLOCKED: <the thing>` / `Tried:` / `Got:` / `Wall:` / `To unblock: <what, and who>`. Carry on with parts that do not depend on it.
- **Deploying (Step 5 onward):** build and run locally and fetch the page first; after deploying, fetch the live URL and show the real status. A 404 or 500 means failed. Every environment variable the app reads must also be set in Vercel. Before shipping, confirm no key reaches the browser.
- **Never touch:** anything you did not create in this session (projects, deployments, DNS, repos, branches); destructive commands with wildcards; force-push; security or login checks changed to "make it work".
- **Files whose first line contains `PROTECTED`:** do not edit, move or delete them.
- **No unrequested extras:** no code comments, extra documents or features Seema did not ask for.
- **Report.** At the end of a step, state in the chat: what was built, the Check result, files created, anything `UNVERIFIED`. Write `REPORT.md` only when Seema asks.
