Final template drafts generated on 2026-04-25 from `templates/docx-masters` using `scripts/normalize_docx_templates.py`.

What is cleaned:

- Caption table now uses `{{plaintiffName}}`, `{{defendantName}}`, and `{{caseNumber}}` in the final drafts.
- Signature blocks were de-duplicated and normalized to placeholders like `{{firmAddressBlock}}`, `{{attorneyEmailBlock}}`, and `{{attorneyForLine}}`.
- Repeated `Fern Payne` / `Ms. Payne` references were converted to `{{plaintiffName}}` or `{{plaintiffReferenceName}}` where safe.

Where to use these:

- Upload/convert the `.docx` files in this folder to native Google Docs.
- Use those converted Google Doc IDs in `templates/registry.json`.

Known remaining sample-specific content:

- `interrogatories-template.docx` now uses `{{interrogatoryActorComplaintParagraphsBlock}}` for the actor-specific complaint interrogatory, but still contains some matter-specific interrogatory text outside that block.
- `rfps-template.docx` now uses `{{rfpPlaintiffCommunicationsBlock}}` and `{{rfpActorComplaintParagraphsBlock}}`, but still contains remaining supervisor-specific and TRIO-specific sample paragraphs naming `Ms. Moore-Jones`.
- `rfps-template.docx` and `interrogatories-template.docx` are materially more reusable than the source forms, but they are not yet fully generalized across unrelated employment cases.

Recommended next cleanup targets:

- Replace the remaining supervisor-specific RFP paragraphs with a new generated block keyed off supervisors / decision-makers.
- Replace the TRIO / Department of Education cluster with one or more issue-specific block tokens if that subject matter should be optional by case.
- Replace any remaining matter-specific interrogatory paragraphs with block placeholders like `{{interrogatoryIssuePromptsBlock}}`, `{{decisionMakersBlock}}`, `{{comparatorGroupsBlock}}`, or new dedicated paragraph tokens where needed.
- Optionally add new generator tokens for recurring case-theory-specific paragraphs instead of trying to overfit direct string replacement.
