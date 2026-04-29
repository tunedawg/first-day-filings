# Google Doc Template Maps

Use this file when converting the five source pleadings into Google Docs masters. Keep all fixed prose in the Google Doc. Replace only the variable text or repeating blocks with the placeholders below.

## Shared caption block

Use these placeholders in all five templates:

- `{{courtName}}`
  Replace `IN THE CIRCUIT COURT OF JACKSON COUNTY, MISSOURI`
- `{{courtDivision}}`
  Replace `AT KANSAS CITY`
- `{{plaintiffName}}`
  Replace `FERN PAYNE`
- `{{defendantName}}`
  Replace `THE METROPOLITAN COMMUNITY COLLEGE FOUNDATION et al.`
- `{{caseNumber}}`
  Replace `2616-CV12184`

If the Google Doc preserves the two-line defendant formatting, keep the line breaks in the doc and replace the text only, not the table/caption layout.

## Shared signature block

Use these placeholders anywhere the attorney block recurs:

- `{{serviceDate}}`
  Replace `April 20, 2026`
- `{{firmName}}`
  Replace `KEENAN & BHATIA, LLC`
- `{{signingAttorney}}`
  Replace `Aaron Hadlow` in `/s/Aaron Hadlow` and certificate signature lines
- `{{attorneyRosterBlock}}`
  Replace the roster block:
  `Edward (E.E.) Keenan ...`
  `Sonal Bhatia ...`
  `JR Montgomery ...`
  `Aaron Hadlow ...`
  `Hilary J. Orzick ...`
- `{{firmAddressBlock}}`
  Replace:
  `4600 Madison Ave. Ste. 810`
  `Kansas City, Missouri 64112`
  `(816) 809-2100`
- `{{attorneyEmailBlock}}`
  Replace the stacked email lines
- `{{attorneyForLine}}`
  Replace `Attorneys for Plaintiff Fern Payne` or similar attorney-for line

## 1. Omnibus Notice of Deposition

### Title and intro

- Keep `OMNIBUS NOTICE OF DEPOSITION` fixed unless you expect title variants.
- Replace the plaintiff name inside the first sentence with `{{plaintiffName}}`.
- If you want the whole introductory paragraph editable, replace the entire paragraph with `{{omnibusIntroText}}`.

### Repeating deposition schedule

Replace the full schedule section beginning with the first `Deponent:` line and ending with the final `Video:` paragraph before the stenographic paragraph with:

- `{{omnibusScheduleBlocks}}`

The app renders this from `omnibusDeponentsJson`.

Expected JSON item shape:

```json
[
  {
    "deponent": "Gabrielle Moore-Jones",
    "date": "July 6, 2026",
    "time": "10:00 AM CT",
    "location": "Keenan & Bhatia, LLC\n4600 Madison Ave. Ste. 810\nKansas City, MO 64112\nAnd via Zoom",
    "video": "The deposition will be video recorded by Noah Tunis or an authorized representative of Keenan & Bhatia, LLC."
  }
]
```

### Tail paragraph

The paragraph beginning `These depositions will be taken stenographically...` can stay fixed unless you want these variables:

- `{{videoOperatorName}}`
  Replace `Noah Tunis`
- `{{firmName}}`
  Replace `Keenan & Bhatia`

### Certificate of service

Suggested replacements:

- `{{serviceDate}}`
  Replace both `April 20, 2026` references
- `{{signingAttorney}}`
  Replace `/s/ Aaron Hadlow`

## 2. Notice of Corporate Representative Deposition

### Title and intro

- Keep `NOTICE OF R. 57.03(b)(4) DEPOSITION` fixed unless you need rule-variant templates.
- If you want the whole intro editable, replace the full notice paragraph block with `{{corpRepIntroText}}`.
  Current app does not yet define this token, so default is to keep fixed prose and replace smaller fields below.

### Notice particulars

- `{{corpRepEntity}}`
  Replace `Corporate Representative(s) for Defendants`
- `{{corpRepLocation}}`
  Replace `Known to Defendants.`
- `{{corpRepDateTime}}`
  Replace the full `As agreed by the parties...` line
- `{{corpRepFormat}}`
  Replace the full format paragraph beginning `Via Zoom. Please contact E.E. Keenan...`
- `{{corpRepDocumentRequest}}`
  Replace the paragraph under `DOCUMENT REQUEST`

### Exhibit A

Replace everything under `TOPICS` through the last numbered topic with:

- `{{corpRepTopicsBlock}}`

That token should contain the full numbered topic list exactly as it should appear in the final document.

If you want the allegation-sensitive items broken out instead of maintaining one full topics block, replace specific numbered topics with placeholders such as:

- `{{claimsAndCountsBlock}}`
- `{{protectedTraitsBlock}}`
- `{{retaliationActivitiesBlock}}`
- `{{adverseActionsBlock}}`
- `{{complaintTypesBlock}}`
- `{{decisionMakersBlock}}`
- `{{comparatorGroupsBlock}}`
- `{{corpRepIssueTopicsBlock}}`

This is the right approach for items like your current Topics 2 and 17-22, where the content changes with the actual discrimination, retaliation, accommodation, or whistleblower theories in the case.

## 3. Proposed Protective Order

This document is mostly fixed prose. Replace only the party-specific values unless you want a more generalized order.

### Opening paragraphs

- `{{plaintiffName}}`
  Replace `Fern Payne`
- `{{targetDefendants}}`
  Replace `The Metropolitan Community College Foundation, Metropolitan Community College, and The Junior College District of Metropolitan Kansas City`
- `{{collectiveDefendantShortName}}`
  Replace `MCC`

### Definitions section

- `{{protectiveOrderActionName}}`
  Replace `Fern Payne V. The Metropolitan Community College Foundation, Case No. 2616-CV12184`
- `{{confidentialMaterialsDefinition}}`
  Replace the full text of definition `c. "Confidential Materials" means ...`
- `{{confidentialityExamplesBlock}}`
  Optional. If you want the examples portion separately editable, use this inside the Confidential Materials definition.

### Court / judge line

- `{{judgeName}}`
  Replace `HON. ADAM CAINE`
- `{{orderDateLine}}`
  Optional. Replace the blank `Dated:` line if you want it prefilled.

Because this order contains substantial fixed legal language, use one stable Google Docs master and keep edits minimal.

## 4. Plaintiff's Interrogatories to Defendants (First Set)

### Header and opening paragraph

- `{{interrogatorySetLabel}}`
  Replace `(First Set)` if needed
- `{{plaintiffName}}`
  Replace `Plaintiff Fern Payne`
- `{{targetDefendants}}`
  Replace the defined defendants block
- `{{responseDeliveryInstructions}}`
  Replace the service/response sentence beginning `Please respond within thirty days...`

### Repeating named-person list

The following recurring list appears in Interrogatory 3 and should be templated as a single block:

- `{{additionalRoleBasedPersonsBlock}}`
  For the role-based entries only
- `{{keyPersonsBlock}}`
  For the named-person entries if you want them rendered together

Practical recommendation:

- Replace subparts `(a)` through `(m)` in Interrogatory 3 with one token:
  `{{interrogatory3SubjectsBlock}}`

Current app note:

- The app now renders `{{interrogatory3SubjectsBlock}}` directly from:
  `keyPersonsList`
  `additionalRoleBasedPersons`

### Matter-specific questions

These are the most likely lines to vary between cases and should be turned into paragraph placeholders if you want reusable masters:

- `{{interrogatory8Text}}`
  Replace the performance-deficiency question
- `{{interrogatory13Text}}`
  Replace the litigation-hold question
- `{{interrogatory17Text}}`
  Replace the TRIO metrics question
- `{{interrogatory18Text}}`
  Replace the essential job functions / in-person attendance question

If your firm usually reuses the entire question set with only names and dates changed, leave the numbered questions fixed and replace only the party names and repeated blocks.

For allegation-sensitive interrogatories like the current Items 3 and 4, consider replacing those paragraphs with:

- `{{interrogatoryIssuePromptsBlock}}`
- `{{claimsAndCountsBlock}}`
- `{{protectedTraitsBlock}}`
- `{{retaliationActivitiesBlock}}`
- `{{complaintTypesBlock}}`
- `{{decisionMakersBlock}}`

That gives the questionnaire a direct place to capture the substantive theories that drive those requests.

### Count-specific identity fields

For Interrogatories 7, 10, 11, 15, and 16, replace the Payne-specific status fields with:

- `{{interrogatoryProtectedStatusFields}}`
  Replace `race, age, known disability status`

Where those interrogatories ask whether the person has ever complained of `discrimination or retaliation`, replace only that subject phrase with:

- `{{interrogatoryComplaintTypes}}`
  Example output for Payne-style claims: `race discrimination, age discrimination, disability discrimination or failure to accommodate, and retaliation`

### Closing / verification

- `{{serviceDate}}`
  Replace `April 20, 2026`
- `{{signingAttorney}}`
  Replace signature lines
- `{{verificationState}}`
  Replace `STATE OF ________________`
- `{{verificationCounty}}`
  Replace `COUNTY OF ______________`
- `{{verificationDay}}`
  Replace `_____`
- `{{verificationMonth}}`
  Replace `_______________`
- `{{verificationYear}}`
  Replace `20____`
- `{{verificationAffiantName}}`
  Replace the blank verifier name line
- `{{verificationEntity}}`
  Replace the defendant name line in the verification
- `{{verificationCapacity}}`
  Replace the capacity/authority line
- `{{notaryExpirationDate}}`
  Replace the notary expiration blank if you prefill it

## 5. Plaintiff's Requests for Production of Documents and Things to Defendants (First Set)

### Header and opening paragraph

- `{{rfpSetLabel}}`
  Replace `(First Set)` if needed
- `{{plaintiffName}}`
  Replace `Plaintiff Fern Payne`
- `{{targetDefendants}}`
  Replace the defined defendants block
- `{{productionFormatInstructions}}`
  Replace the paragraph beginning `Please respond within thirty days...`

### Definitions and instructions

Keep most of this section fixed. Replace only these if you want them editable:

- `{{targetDefendants}}`
  In definition 2
- `{{esiInstructionText}}`
  Replace instruction 11

### Repeating person-list requests

The following RFPs contain the same or similar subject list blocks:

- Request 3
- Request 4
- Request 5
- Request 46

Recommended placeholders:

- `{{rfpSubjectListBlock}}`
  Replace the `(a)` through `(n)` list in Requests 3-5
- `{{rfpEmailBoxSubjectListBlock}}`
  Replace the `(a)` through `(m)` list in Request 46

Current app note:

- The app now renders `{{rfpSubjectListBlock}}` directly from:
  `keyPersonsList`
  `additionalRoleBasedPersons`
  plus the trial-witness catchall entry
- The app now renders `{{rfpEmailBoxSubjectListBlock}}` directly from:
  `keyPersonsList`
  `additionalRoleBasedPersons`

### Matter-specific request paragraphs

These requests are the most likely to be case-specific and should become full-paragraph placeholders if you want one generalized RFP master:

- `{{rfp32Text}}`
  Formal verbal warning request
- `{{rfp33Text}}`
  PIP request
- `{{rfp63Text}}` through `{{rfp72Text}}`
  TRIO / Department of Education / data-falsification request cluster

If these requests are typical for this practice area, keep them fixed in the master.

### Closing

- `{{serviceDate}}`
  Replace `April 20, 2026`
- `{{signingAttorney}}`
  Replace signature lines

## 6. Motion for Entry of Protective Order

This filing is mostly fixed prose and should be easy to template.

### Header and body

- `{{courtName}}`
- `{{courtDivision}}`
- `{{plaintiffName}}`
- `{{defendantName}}`
- `{{caseNumber}}`

Replace the body paragraph:

- `Plaintiff Fern Payne hereby moves the Court to enter the attached and proposed protective order which is submitted contemporaneously with this motion.`

with:

- `Plaintiff {{plaintiffName}} hereby moves the Court to enter the attached and proposed protective order which is submitted contemporaneously with this motion.`

### Signature and service

- `{{serviceDate}}`
- `{{firmName}}`
- `{{signingAttorney}}`
- `{{firmAddressBlock}}`
- `{{attorneyEmailBlock}}`
- `{{attorneyForLine}}`

### Attorney roster table

If you keep the roster table in Google Docs, replace the attorney-name side with:

- `{{attorneyRosterBlock}}`

If Google Docs conversion collapses the table, it is acceptable to move that roster into the normal stacked signature block style used by the other templates.

## Current rendered block tokens

The app now renders these block tokens directly:

- `{{omnibusScheduleBlocks}}`
- `{{attorneyRosterBlock}}`
- `{{attorneyEmailBlock}}`
- `{{keyPersonsBlock}}`
- `{{additionalRoleBasedPersonsBlock}}`
- `{{interrogatory3SubjectsBlock}}`
- `{{rfpSubjectListBlock}}`
- `{{rfpEmailBoxSubjectListBlock}}`
- `{{claimsAndCountsBlock}}`
- `{{protectedTraitsBlock}}`
- `{{retaliationActivitiesBlock}}`
- `{{adverseActionsBlock}}`
- `{{complaintTypesBlock}}`
- `{{comparatorGroupsBlock}}`
- `{{decisionMakersBlock}}`
- `{{corpRepIssueTopicsBlock}}`
- `{{interrogatoryIssuePromptsBlock}}`
- `{{corpRepTopicsBlock}}`
