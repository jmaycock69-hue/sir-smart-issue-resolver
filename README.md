# SIR — Smart Issue Resolver

SIR helps a consumer turn an account of a problem into a reviewed complaint, retain supporting records and track what happens next. It keeps the person in control of the facts, email approval, actual sending and case closure.

This release is an **Alexa+ experience simulation**, with a credential-free scripted Windows demonstration. It does not connect to Alexa devices or implement an MCP server. The optional live intake provider is separate from the scripted demonstration.

## Launch the Windows demonstration

1. Extract the complete release ZIP into a writable folder.
2. Have Node.js **22.13 or later** installed.
3. Double-click **START SIR DEMO.cmd**. The browser opens after startup.
4. Keep that window open. Press **Ctrl+C** in it to stop SIR safely.

The launcher uses relative paths, chooses a free localhost port and keeps demo cases in `data-demo` beside the application. It reopens an existing instance from this folder when its saved process and scripted health check are available. It clears API credentials for this demo process. No npm download is required for the packaged Windows demonstration; the PDF runtime is bundled.

From a terminal: `node support/launch-demo.mjs`. To check startup without opening the browser: `node support/launch-demo.mjs --no-browser`.

## Try the fictional Acorn complaint

Choose the example currently shown and select **Ask SIR**. Repeat for the three messages: Acorn Outdoor Supplies; the undelivered GBP 89.00 camping stove; a refund and written confirmation. The offline provider recognises this bounded sequence; it is not a general conversational AI.

Review the facts, confirm them and create the case. Choose **Order or agreement**, select `fixtures/Acorn_Order_Confirmation.pdf`, then **Read this document**. Suggestions appear automatically after extraction. Review the company, date, amount, currency and reference before saving. The source order date does not automatically become a payment or delivery date.

SIR then opens the complaint stage. Read or edit the draft, save any edits and continue to email review. Use `complaints@acorn.example` as the fictional recipient. Review the full message, tick the approval confirmation, approve and download the `.eml` file. **Downloading does not send it.** The file includes `X-Unsent: 1` for compatible mail clients.

The Outcome stage separates actual sending, merchant replies and resolution. If no outgoing message was sent, explicitly label a fictional reply as unsolicited. Otherwise record the actual sent date and a later review date before linking a reply. A due follow-up requires an unanswered sent message and fresh review and approval. Describe a resolution and explicitly confirm closure. Reopen the case through My cases; the saved history, sources and correspondence remain available.

## How the workflow works

The interface has five stages: Tell SIR → Evidence → Complaint → Email → Outcome. A persistent guide explains the next step and highlights its local control. My cases and Case history provide secondary access. Evidence comparisons, past versions and optional research sit behind disclosures.

PDF text extraction and labelled-text suggestions run locally. Scanned/image-only documents need a transcription; SIR does not perform OCR or authenticate documents. Suggested facts require human review. Conflicts block drafting; an explicit account-only path labels unsupported statements and cannot override conflicting records. Company comparisons ignore letter case; order references, dates and amounts retain their stricter comparisons. Original document bytes and reviewed corrections are preserved.

The Node HTTP server applies revision checks, evidence binding, approval invalidation, sending prerequisites, response linking and closure safeguards. Approved/exported/sent are distinct states. SIR has no email sending or inbox access.

## Source, tests and optional live intake

The clean application folder contains the application source, tests, fixtures, MIT licence, documentation and the required Windows PDF runtime. It can be staged as the GitHub repository; do not include case stores, .runtime, verification stores or recovery archives. `package-lock.json` and `THIRD-PARTY-NOTICES.md` retain the PDF dependency provenance. Native Windows PDF support is not claimed for other operating systems.

Run `npm test` from the application folder. Run `npm run verify:release` for an actual localhost process/restart smoke test. If a restricted Windows agent cannot write its system temporary folder, set TEMP and TMP to a writable test folder first. Test logs record this session's actual results; an in-process request test is not a browser or network test.

Advanced launchers are under `support/legacy`. Optional live intake requires a private API credential and explicit sharing consent. No successful live API call was verified for this release. Avoid entering real secrets in the fictional demonstration.

## Limits and release status

This is a single-user local prototype, not a hosted multi-user service or a legal-entitlement engine. The scripted conversation covers the Acorn scenario. No voice capture, live Alexa+, MCP, automatic sending, OCR, authenticated merchant identity or autonomous dispute resolution is claimed.

The owner provisionally accepted the seven-screen layout after manual inspection of the previous candidate. This final UI correction pass passes **121 automated tests, 0 failures**. The current execution environment blocks localhost connections and rendered-browser verification, so the owner must accept the corrected visual details locally before submission freeze. See `FINAL-UI-REPORT.md` for the current correction and verification status; `RELEASE-REPORT.md` records the historical 21 October candidate.

No repository was published, no reviewer invitation sent, no video uploaded and no competition entry submitted.
