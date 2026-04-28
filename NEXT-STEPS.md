# First Day Filings — Handoff

Repo: `C:\Users\noah\Documents\GitHub\first-day-filings`

---

## Where Things Stand

### The Old App
The Node.js app at `src/server.js` works end-to-end. The flow is:
1. User fills out intake form at `localhost:3000`
2. App copies Google Doc templates, replaces tokens, saves to Drive folder

The only bug: `omnibus_notice_of_deposition` in `templates/registry.json` has a wrong `googleTemplateDocId` — it points to the uploaded `.docx` file instead of the converted native Google Doc.

**Fix**: Get the correct Google Doc ID for the omnibus template, patch `templates/registry.json`, and the app works.

### The New Workflow (partially built)
The goal is a conversational Claude-native workflow:
1. Upload a Petition PDF to a Claude chat
2. Claude extracts case info automatically
3. Claude asks the ~6 questions it can't extract
4. Claude generates all 6 filings and pushes them to Drive

This was tested with **Almandinger v. City of Carthage** (Case No. 25AP-CC00032).

---

## Almandinger Case — What's Done

A Drive folder already exists:
- **Folder**: Almandinger v. City of Carthage — First Day Filings
- **Folder URL**: https://drive.google.com/drive/folders/1ca9PS-3xmaK2YApmAY6Xl3ZguPw3jCU9

Four plain-text documents were uploaded but have **wrong formatting** (no Century Schoolbook, no centering, no legal layout). They should be **deleted** before the real generation run:
- Omnibus Notice of Deposition — `11dSwSgj4_UDDsNlEgJDAsi8yy3XFo9ZQkG1ef8jb-CE`
- Notice of Corporate Representative Deposition — `1pG-n-P866AHifSDlfGyKfZzOGjLkjXnziemm2x8uh7k`
- First Requests for Production — `1C8upO_CUWh8Stx181ctVUzmokWc3nsqHpP6jAKqLQjI`
- First Interrogatories — `1lXpePsf3kdt1FI1W9NxvQPuYCX-PJahVhhPTAhTtoQg`

---

## Almandinger Intake Data (fully collected)

- **Court**: Circuit Court of Jasper County, Missouri
- **Plaintiff**: Abigael Almandinger
- **Defendant**: City of Carthage, Missouri ("the City")
- **Case No.**: 25AP-CC00032
- **Judge**: Judge Flanders (no division)
- **Service Date**: January 2, 2026
- **Signing Attorney**: Aaron Hadlow
- **All Attorneys**: Keenan, Bhatia, Montgomery, Hadlow, Orzick
- **Claims**: RSMo § 105.055 (public employee whistleblower), MHRA sex discrimination, MHRA age discrimination, MHRA disability discrimination, MHRA retaliation (RSMo Chapter 213)
- **Adverse Actions**: PIP (Oct 23, 2024), key fob deactivation, suspension without pay (Feb 10, 2025), 29 fabricated policy violations, second PIP (Feb 26, 2025), termination (June 24, 2025)
- **Key People**: Traci Cox (City Administrator/supervisor), Mayor Dan Rife, Interim Mayor Alan Snow, Michael Miller (HR Director), Michael Keith (IT Admin), Bill Hawkins (Chief of Police), Jana Schramm (Council member), Tiffany Cossey (Council member), Greg Dagnan (former City Admin), Aaron Borland (Golf Supt.)
- **Deponents (6)**: Traci Cox, Alan Snow, Dan Rife, Michael Miller, Bill Hawkins, Michael Keith — dates TBD
- **Corp Rep**: TBD date

---

## Immediate Next Steps

**Option A — Fix the local app and generate from templates (recommended)**
1. Get the correct native Google Doc ID for the omnibus notice template
2. Patch `templates/registry.json` (`omnibus_notice_of_deposition.googleTemplateDocId`)
3. Start the local server: `npm start` (or `node src/server.js`)
4. Fill in the Almandinger intake and generate all 6 docs into the existing Drive folder
5. Delete the 4 bad plain-text files listed above

**Option B — Claude conversational workflow**
The plain-text upload approach produces unformatted docs. For proper formatting, the options are:
- HTML upload (better than plain text, still not template-quality)
- Use the Docs API to apply formatting after creation
- Stick with Option A (copy templates, replace tokens)

---

## Useful Files

- `templates/registry.json` — template IDs (one is wrong)
- `src/google.js` — `copyGoogleDoc`, `replaceDocTokens`
- `src/generator.js` — `buildTokenMap`, token logic
- `src/server.js` — `/api/generate` endpoint
- `templates/final-docx-masters-v2` — formatted master templates

---

## Restart Prompt

```text
Continue working on first-day-filings in C:\Users\noah\Documents\GitHub\first-day-filings. Read NEXT-STEPS.md first, then continue from there.
```
