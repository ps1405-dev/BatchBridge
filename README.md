# BatchBridge

BatchBridge is a focused hackathon MVP for a home baker: an AI wholesale-sales agent that turns a WhatsApp-first catalogue into nearby B2B opportunities.

## Working pilot flow

1. Enter a name and email to create a browser-local pilot session, or use the Asha demo account.
2. Start at **Command centre** and click **Run sales agent**.
2. Open **Local leads** to show AI-ranked local prospects and the reasons behind each score.
3. Click **Draft pitch**, then use **Outreach** to approve and send it.
4. Add wholesale products from **Catalogue**; all changes persist in browser storage.
5. Open **Agent decisions** and export the audit trail as judging evidence.

## Run locally

This is a dependency-free static app. Open `index.html` directly in a browser, or serve the folder with any static file server.

## What is real in this MVP

The full user workflow works locally: login/session, catalogue edits, lead scoring actions, outreach state, decision logging, and evidence export persist through browser `localStorage`.

## Production integration points

- Replace demo makers, prospects and activity with a database/API.
- Use Gemini on Google Cloud to create catalogue records, score prospects, generate personalised drafts and record agent rationale.
- Connect approved sending to WhatsApp Business API (the current “send” updates the real local sales pipeline, but does not send an external message).
- Retain the decision log and revenue/cost data for hackathon submission evidence.

The interface deliberately keeps human approval before messaging or commercial commitments.
