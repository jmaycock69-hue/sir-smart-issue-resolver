# Submission drafts — owner review required

## Project title and short description

**SIR — Smart Issue Resolver**

A simulated Alexa+ consumer advocate that helps people explain a problem, review evidence, prepare a grounded complaint and track the outcome, while retaining human approval over every email export and case closure.

## Problem

People facing an undelivered order or disputed charge often have scattered records and little confidence about what to say next. Ordinary forms collect information but leave the person to organise the evidence, write the complaint and remember the follow-up. SIR aims to make that process understandable and manageable.

## Solution and distinguishing features

SIR guides a complaint through five stages: an account of what happened, evidence review, complaint drafting, explicit email approval and outcome tracking. It retains original sources, compares structured facts, blocks factual conflicts and keeps earlier drafts and case history. People without records can explicitly use an account-only route, with unsupported statements labelled. The app exports an unsent email file; it never sends a complaint or claims sending happened without confirmation.

The demonstration uses the fictional Acorn Outdoor Supplies case: an undelivered camping stove, order ACORN-1042, GBP 89.00. The user reviews every fact, inspects the PDF suggestions, edits the complaint, approves an export and records a fictional reply and refund. My cases and Case history show continuity after reopening.

## Alexa+ simulation explanation

This is a web simulation of the intended Alexa+ interaction, not a live Alexa integration. Its credential-free provider recognises a bounded three-message Acorn conversation. The same application includes an optional live AI intake provider, requiring private credentials and consent; no successful live call was verified during this release session. No MCP implementation, device connection or voice capture is claimed. The evidence, complaint, approval, unsent export and local case persistence workflows are implemented rather than mocked.

The official rules permit simulated Alexa+ experiences using an AI or agentic tool, with simulation source and video required. The entrant still needs to establish that this particular scripted experience satisfies the intended category; general permission to simulate is not organizer approval of SIR. Do not claim that Alexa hardware or gated developer tools were used.

## Technical architecture

A browser interface calls a local Node.js HTTP server. ConversationService and a bounded DemoProvider handle the offline intake. CaseStore persists cases and revision history. Local PDF text extraction and conservative labelled-text patterns propose evidence facts. Reviewed evidence is bound to the correct case/revision and original file bytes are retained. The complaint model compares facts and produces reviewable wording. Correspondence logic enforces approval, export, actual sending, response linking, follow-up and closure rules. There is no outbound email transport.

## Technical challenges and lessons

The hardest product issue was guiding a person through the full lifecycle without exposing the complexity of the case model. Repeated next-step banners and an overloaded activity screen made implemented features hard to use. This candidate replaces those with focused stages, one local next action and secondary access to history and optional details.

Evidence extraction also needs semantic care. An order date should not silently become a payment date; an all-capitals company heading should not create a false conflict with the same company in title case. Suggestions retain source text and require review. Actual conflicting names, references and dates remain subject to the existing safeguards.

Testing must distinguish real request-handler execution, disk persistence, network access and rendered browser interaction. This session could exercise the first two, but localhost networking and local-file browser preview were blocked. The remaining visual checks are explicitly listed rather than reported as passed.

## Developer feedback — factual draft to personalise

- **Tools used:** Node.js; browser JavaScript/HTML/CSS; the bundled PDF.js text extraction runtime; the scripted local provider; optional OpenAI-compatible intake code. Confirm the owner's complete tool list and actual development history before submitting.
- **What worked:** the simulation route allows the consumer workflow to be demonstrated without hardware or credentials. Revision checks and separate correspondence states made safeguards testable.
- **What needs work:** the category documentation should keep the simulation exception and runtime integration requirements clearly aligned. The entrant needs a clear account of what qualifies as an agentic simulated experience. Local execution restrictions in this coding environment blocked network/browser acceptance; this is an environment observation, not a demonstrated Amazon SDK defect.
- **Onboarding:** this release session did not onboard to gated Alexa+ tooling. Do not invent an SDK setup story or claim a live Alexa connection.
- **Would build again:** owner to confirm. Suggested direction if accurate: Yes; a consumer advocate is a useful conversational use case, and a future integration could connect the demonstrated workflow to an available Alexa+ agent surface while retaining review and sending safeguards.

## Demo video outline — approximately 2 minutes 45 seconds

| Time | Show | Suggested narration |
| --- | --- | --- |
| 0:00–0:15 | SIR opening screen | “Resolving a consumer problem should not require learning a case-management system. SIR helps you work through it one step at a time.” |
| 0:15–0:45 | Three Acorn messages and fact confirmation | “This is our simulated Alexa+ experience. The offline rehearsal uses a fictional order, while the case workflow is implemented locally. SIR clarifies the issue and asks me to confirm the facts.” |
| 0:45–1:15 | PDF review and saved evidence | “I add my order confirmation. SIR suggests facts from its text, keeps the original and lets me review the result. It checks agreement without pretending to authenticate the document.” |
| 1:15–1:45 | Complaint editing and email review | “The complaint is prepared for my review. I can edit it, check the recipient and approve the exact email.” |
| 1:45–2:05 | Unsent .eml export | “SIR exports an unsent file. I decide whether to send it outside the app. Downloading never means it was sent.” |
| 2:05–2:35 | Fictional reply, resolution and reopened history | “I can record an unsolicited reply without inventing an outgoing message. Here I record a fictional refund and explicitly close the case. Its history and evidence remain available.” |
| 2:35–2:45 | Case overview | “SIR turns a scattered complaint into a clear, reviewable journey, with the consumer in control.” |

Record only the locally accepted final build. Do not show real case data, secrets or unrelated accounts. The recorded video, public video link and GitHub repository URL are still outstanding.
