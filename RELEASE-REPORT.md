> Historical 21 October report. The 22 October correction pass and current acceptance status are recorded in FINAL-UI-REPORT.md.

# SIR 0.4.0 release candidate — 21 October 2026

**Substantial redesign implemented; local visual acceptance remains a blocker.** The complaint engine and safeguards remain in place. This is not a claim that the brief's full definition of done has been achieved: a first-time rendered-browser walkthrough could not be completed in this environment.

## 1. Implementation summary

- Replaced the competing side-panel workflow and overloaded Drafts & Activity screen with focused Tell SIR, Evidence, Complaint, Email and Outcome stages, plus secondary My cases and Case history views.
- Rebuilt the styling around 18px body/form text, 19px guidance, larger headings, comfortable controls, wider reading/editing areas, a stronger next-action border and keyboard focus. Mobile/tablet breakpoints and reduced-motion rules are included; their rendered results remain unverified.
- Kept one visible local control for the current action. The top guide offers a transition only when another stage needs opening; it no longer also executes the action. Complaint-to-email and account-only continuation use their local controls.
- Consolidated evidence review, hid the redundant suggestion action for uploaded previews, moved original text/extraction notes behind disclosures and retained the explicit account-only alternative. The local extraction action already suggests facts automatically.
- Added conservative extraction for a business heading followed by an order-confirmation suffix. The supplied Acorn PDF now suggests ACORN OUTDOOR SUPPLIES, ACORN-1042, GBP and 89.00. Company comparisons ignore letter case; different companies and case-sensitive order-reference mismatches still block drafting. Original source text is retained unchanged.
- Reduced technical wording in generated complaints while retaining consumer-account language, explicit account-only labelling, fictional-demo identification and source references. Sending/export warnings remain in the app.
- Added START SIR DEMO.cmd and a version-checked launcher that chooses a free port, clears demo API credentials, retains local case data, reports startup errors and can reopen an already-running instance from its state file and scripted health check. Ctrl+C is the stop mechanism.
- Staged MIT licensing, clean source/runtime distribution, README, judge guide, local acceptance checklist, submission drafts, video outline and current rule checks. No publication or submission occurred.

## 2. UX control audit

| Previous issue | Candidate change |
| --- | --- |
| Top banner and side panel compete with local actions | Competing side panel removed from the visible interface; guide navigates only between stages |
| Two Prepare complaint buttons | One visible preparation action; the old duplicate is retained only as a hidden compatibility reference |
| Navigation points back to the current stage | Guide transition hidden on the target stage; local action receives emphasis |
| Go to Record as sent inside the same section | Removed from visible interaction |
| Suggest facts after upload appears ineffective | Hidden when an uploaded preview already contains suggestions; pasted-text alternative remains separate |
| Draft saved button stays disabled | Save action appears for unsaved edits; persistent saved state remains readable |
| Draft, email approval, sending, reply and closure on one screen | Separate Complaint, Email and Outcome stages; Outcome has focused expandable groups |
| Large empty policy panel in offline demo | Optional disclosure hidden for scripted cases without retained research/review requirements |
| Repeated case-strip guidance and technical metadata | Case strip keeps identity/status only; extraction mechanics and originals are secondary |
| All three scripted examples compete | Only the next example is shown; summary confirmation replaces the composer when ready, with an explicit conversation return |

Hidden compatibility controls preserve existing event-handler references. They are not presented as user choices. This avoids broad engine changes, but leaves presentation code with legacy wrappers; a future cleanup could simplify it after visual acceptance.

## 3. Guided walkthrough

1. **Tell SIR:** read the current question and use the next example or a live-consented message. Review supplied facts, edit if needed, explicitly confirm and create the case.
2. **Evidence:** the guide confirms creation and explains what to add. Choose a type and document, read it, review the suggested facts and confirm saving. A no-records checkbox provides the explicit account-only route. Conflicts reveal comparison/fact review rather than bypassing safeguards.
3. **Complaint:** successful evidence review opens drafting. Prepare the complaint, read/edit it and save manual changes. Continue locally to email review.
4. **Email:** check recipient, subject and full preview. Confirm, approve the exact message and download the unsent file. Persistent state distinguishes prepared, approved, exported and recorded sent.
5. **Outcome:** after export, instructions explain opening and sending outside SIR. Actual sending, unsolicited/linked replies, due follow-ups and explicit resolution are separate actions. Closure routes to retained history.
6. **Reopen:** My cases restores the selected record; the guide offers its relevant next stage. Case history holds events, correspondence and earlier drafts. Original sources remain reviewable through Evidence.

## 4. Regression and verification

| Check | Actual result |
| --- | --- |
| Baseline suite with workspace TEMP/TMP | 109 passed, zero failed/skipped |
| Candidate automated suite | 112 passed, zero failed/skipped in the recorded candidate run; final packaged run is recorded separately |
| Supplied Acorn PDF | Real bundled PDF worker extraction; merchant/reference/amount/currency assertions pass; original bytes retained |
| Scripted intake → evidence → edited draft → approval → export | Production request handlers exercised in-process against real disk stores |
| Exported email content | Actual .eml bytes retained and checked for X-Unsent: 1; no sent state inferred |
| Unsolicited reply and explicit resolution | Saved and recovered with a new CaseStore instance; original document bytes retained |
| Sent-linked reply and due follow-up | Explicit sending consent required; follow-up generated; reply linked to its message; obsolete follow-up export blocked |
| Account-only and closure safeguards | Account-only consent required; closed-case follow-up rejected; existing automated safeguards retained |
| Startup helper without browser | Node 24.14.0 started the packaged app helper, selected a free port and printed readiness; browser auto-open was deliberately suppressed |
| Actual localhost HTTP/restart smoke | Failed to connect: EACCES on 127.0.0.1; cannot count as passed |
| Rendered browser walkthrough | Localhost timed out; browser policy also denied a local-file replay. No DOM interaction or screenshot-based visual pass is claimed |
| Responsive/keyboard/reduced-motion visual checks | Implemented in source, untested in rendered browser |
| Browser download/Outlook opening for this release | Untested. Prior manual success reported by the owner belongs to the baseline, not this candidate |
| Clean extracted package | See final-extraction-tests.txt and FINAL-PACKAGE-VERIFICATION.json in the handover verification folder |
| Second physical machine / live AI call | Untested |

The initial default-temp baseline test attempt encountered EPERM writes in the sandbox temporary directory. Setting TEMP and TMP to the permitted workspace resolved it. That failed attempt and the blocked HTTP log are retained separately; neither was used to conceal an application regression.

## 5. Known issues, ranked

**P1 — submission blocker:** the substantially changed UI has not been executed and visually accepted in a rendered browser. Its controller bootstrap, stage transitions, responsive layout and keyboard flow still require LOCAL-ACCEPTANCE.md. Automated engine and script-parse checks cannot establish first-time usability. Do not record the final video before that pass.

**P1 — category/admin blocker:** no organizer confirmation of this particular deterministic rehearsal as a qualifying agentic simulation. Optional live intake exists, but no successful live API call was verified here. Keep claims precise and confirm the intended submission positioning.

**P1 — administration outstanding:** repository publication/reviewer access, actual video recording/upload, owner feedback, eligibility/ownership confirmations and final Devpost submission. The MIT licence and drafts are staged, not publicly published.

**P2 — environment-limited verification:** actual HTTP process restart, repeat-launch health check, normal browser download, Outlook opening, and second-machine launch remain unverified for this candidate.

**P2 — maintainability:** focused views reuse legacy presentation handlers and hidden compatibility references. The complaint/storage/correspondence engine was deliberately not broadly refactored.

## 6. Release and launcher locations

- Judge/application ZIP in the handover: `SIR-Judge-Windows-x64-0.4.0-RC-2026-10-21.zip`.
- Extracted app folder: `SIR-0.4.0-RC-2026-10-21`.
- Primary entry: **START SIR DEMO.cmd** at that folder's root.
- Handover ZIP: `SIR-Redesign-Handover-2026-10-21.zip`; its exact downloadable path is provided in the delivery response.

## 7. GitHub readiness

The clean application contains source, tests, fictional fixtures, dependency notices, MIT licence, run instructions and the necessary bundled Windows PDF runtime. It excludes saved cases, credentials, .runtime state, private recovery files and old archives. A separate local staging repository is prepared if git initialization succeeds; its actual status is recorded in the handover. No remote is configured or pushed. Owner approval remains required before publication or reviewer invitations.

## 8. Submission assets

README; one-minute judge guide; local acceptance checklist; current submission checklist; project title, short description, problem/solution, simulation statement, architecture, technical challenges, feedback prompts and 2m45s video outline. Official rules and FAQ were rechecked on 21 October. Current Amazon handles omit the previously listed chris-trag. The masked Devpost reviewer email still needs verification before an invitation. No AWS or live Alexa capability is invented.

## 9. Preservation

The 32,416,989-byte Wednesday handover archive was copied from its original local output after the remote transfer failed DNS resolution. The original archive and the existing Desktop installation were not modified. A separate copy of the Desktop data-demo folder preserves the cases available at collection time. Recovery copies are confined to the private handover and excluded from the application/repository. Existing evidence names and historical entries were not rewritten. Hash inventories record the copied baseline and preserved data.

## 10. Remaining work

Run LOCAL-ACCEPTANCE.md on the owner's normal Windows/browser setup, fix any observed UI defects, then approve the visual result. Complete the outstanding category/administrative decisions and record the final video. Only after those checks can the brief's judge-ready definition of done be claimed.
