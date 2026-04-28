# First Day Filings

This app captures matter details once, lets the user select a first-day filing document set, then creates perfectly formatted Google Docs by copying your law firm's master templates and replacing placeholders.

## Why this structure

- Formatting stays with your approved Google Docs templates.
- The app owns only intake, validation, placeholder mapping, and Drive output.
- New document types can be added by editing `templates/registry.json` instead of changing application code.
- Case-theory fields such as discrimination counts, retaliation theories, protected categories, and complaint types should be captured in the questionnaire and then fed into allegation-sensitive template sections.
- The current template set includes the motion seeking entry of the protective order as a separate filing.

## MVP workflow

1. Open the web app.
2. Select the filings to generate.
3. Complete the intake questionnaire.
4. Click `Generate to Google Drive`.
5. The server creates a matter folder, copies each Google Docs template into it, and replaces placeholders like `{{debtorName}}`.

## Template setup

Each source document should be a Google Doc containing placeholders such as:

- `{{courtName}}`
- `{{courtDivision}}`
- `{{plaintiffName}}`
- `{{defendantName}}`
- `{{caseNumber}}`
- `{{serviceDate}}`
- `{{firmName}}`
- `{{firmAddressBlock}}`
- `{{signingAttorney}}`
- `{{attorneyRoster}}`
- `{{attorneyEmails}}`
- `{{corpRepTopics}}`
- `{{targetDefendants}}`
- `{{confidentialMaterialsDefinition}}`

Update [templates/registry.json](C:/Users/noah/Documents/GitHub/first-day-filings/templates/registry.json) and replace each `googleTemplateDocId` with the real Google Docs template ID.

Use [data/template-analysis.md](C:/Users/noah/Documents/GitHub/first-day-filings/data/template-analysis.md) as the placeholder-mapping guide for the five sample forms you provided.
Use [data/google-doc-template-maps.md](C:/Users/noah/Documents/GitHub/first-day-filings/data/google-doc-template-maps.md) as the line-by-line conversion checklist when turning the pleadings into Google Docs templates.

## Google credentials

The server expects a service account JSON blob in `GOOGLE_SERVICE_ACCOUNT_JSON`.

Example PowerShell session:

```powershell
$env:GOOGLE_SERVICE_ACCOUNT_JSON = Get-Content .\service-account.json -Raw
npm run dev
```

Important:

- Share the template docs and destination Drive folder with the service account email.
- If you use a shared drive, give the service account access there as well.

## Run locally

```powershell
cd C:\Users\noah\Documents\GitHub\first-day-filings
npm run dev
```

Then open `http://localhost:3000`.

## Next implementation steps

- Convert each approved pleading into a Google Doc master and replace the variable text with placeholders.
- Replace the placeholder template IDs with your actual Google Docs template IDs.
- Keep the long-form request and order text in the templates; use the app only for variable fields and repeating lists.
- For allegation-sensitive items, replace the specific numbered paragraphs with placeholders that come from the new `Claims, Counts, and Allegations` questionnaire section.
- Add matter-specific logic where a document needs optional clauses or alternate sections.
- Add user authentication if multiple firm users will access this outside an internal network.
