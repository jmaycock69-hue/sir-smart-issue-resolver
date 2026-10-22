# SIR 0.4.0 — final UI correction pass

22 October 2026. Prepared for the owner's final acceptance. No publication or submission has occurred.

## Scope and result

The owner provisionally accepted all seven screens after manual inspection of the 21 October candidate. This pass makes the requested UI corrections in a separate copy. It does not claim a new rendered-browser visual acceptance.

- Removed the duplicate horizontal stage row. All seven sidebar destinations remain functional; existing contextual continuation controls are retained.
- Removed redundant restore/next-step status strips and the duplicate correspondence progress paragraph. Validation messages, meaningful save/approval/export confirmations and safety warnings remain. Informational save messages clear when the user moves to a different screen.
- Guidance follows the current screen while preserving the saved next action for resume. A draft awaiting approval still points to Email. Outcome describes actual sending, linked replies, unsolicited contact and resolution rather than draft editing. No workflow permission was changed.
- Put Continue to email review on a separate, centered action row beneath the editor. Fresh-draft generation remains a secondary, separate action.
- Increased email preview minimum height to 620px. Evidence and email approval use the same bordered confirmation treatment. The actual entered recipient is used in the preview; an empty field is explicitly labelled as missing, and reserved example addresses are labelled as test contacts. Recipient validation and approval invalidation remain in place.
- Reduced the resolution disclosure heading's visual emphasis while retaining response, sending, follow-up and resolution controls and their existing availability rules.
- Corrected the startup Working indicator's ellipsis/full-stop mismatch and added completion cleanup. Sidebar stage text is 17px.
- Preserved Acorn_Order_Confirmation.pdf and the My cases / Case history layouts. No dependency or architecture changes.

## Verification

| Check | Result |
| --- | --- |
| Original local candidate baseline | 112 passed, 0 failed, 0 skipped |
| Corrected candidate, including focused UI checks | 121 passed, 0 failed, 0 skipped |
| Focused tests added | 9 passed: stage/resume guidance, sent/unsolicited prerequisites, recipient preview and approval reset, all seven navigation destinations, startup cleanup, status preservation, action-row/confirmation structure |
| Complaint engine, launcher, fixture and runtime | Byte-for-byte comparison against the supplied Desktop candidate; unchanged |
| Existing cases, evidence and correspondence | Original Desktop installation untouched; data-demo copied intact into the private working copy |
| Real localhost release smoke | Blocked: connect EACCES to 127.0.0.1 in this execution environment |
| Rendered browser verification | Blocked: in-app browser ERR_CONNECTION_TIMED_OUT for the corrected localhost app; no visual pass claimed |
| Second machine / real email client | Not tested in this pass |

The focused UI tests execute the production navigation and preview handlers and deterministic presentation functions; layout checks inspect source structure and CSS. These checks do not replace rendered-browser verification. Existing automated tests exercise evidence extraction, comparison, draft editing, explicit approval, actual unsent .eml bytes, response linking, resolution and persistence. The release verification folder records final extracted-package tests and launcher checks separately.

## Preservation and packaging

The private working copy retains the owner's existing data-demo records. The distributable judge ZIP and source ZIP intentionally contain no saved cases, credentials or .runtime state. Launching a clean judge package creates its own data-demo store. The previous release and recovery archives are not replaced.

The required bundled Windows PDF runtime is unchanged. The source package's ignore rules explicitly retain vendor/node_modules so a future GitHub upload does not accidentally omit that existing runtime. This changes packaging rules only; it introduces no dependency.

The judge launcher remains START SIR DEMO.cmd, requiring an installed Node.js 22.13 or later. It uses the existing credential-free scripted mode, clears API credentials for its child process and never sends email. Optional live intake is separate and is not required for the judge demonstration.

## Final acceptance

Ready for the owner's final local acceptance of these UI corrections, subject to the environment limits above. Launch the separate working copy to inspect the existing cases; use the clean judge ZIP for independent reviewer distribution after acceptance. Check the sidebar, current-screen guidance, complaint continuation row, taller email preview, entered recipient and explicit approval once locally before freezing the submission assets.

No additional feature development is included. Repository publication, video upload and hackathon submission remain subject to explicit owner approval.
