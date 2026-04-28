# Template Analysis

These notes were extracted from the source PDFs you provided on April 24, 2026 and drive the current questionnaire / template model.

## Cross-document constants

- Venue format is a Missouri state-court caption with two caption lines:
  `IN THE CIRCUIT COURT OF JACKSON COUNTY, MISSOURI`
  `AT KANSAS CITY`
- Plaintiff and defendant names appear in all five documents.
- A `Case No.` line appears in all five documents.
- Signature blocks recur with the same firm, attorney roster, office address, phone, and email block.
- A certificate of service appears in the notices and interrogatories.

## Omnibus notice

- The body is driven by a repeating schedule block:
  `Deponent`
  `Date & Time`
  `Location`
  `Video`
- The current sample contains at least these deponents:
  Gabrielle Moore-Jones
  Brandi Fockler
  Dr. Samaiyah Jones Scott
  Tiffany Bradley
  Tina Hafner
  Fred Wise
  Nancy Perez
- The introductory paragraph says the listed dates/times are placeholders and counsel will confer on mutually agreeable scheduling.

## Corporate representative notice

- The deponent is described generically as `Corporate Representative(s) for Defendants`.
- The notice includes:
  a `Location` line
  a `Date/Time` line
  a `Format` paragraph
  a separate `DOCUMENT REQUEST` section
  an `Exhibit A` topics list
- The format paragraph includes Zoom instructions and a video-recording statement.

## Interrogatories

- The sample is `Plaintiff's Interrogatories to Defendants (First Set)`.
- It includes a verification page at the end.
- The same named people and role-based categories recur across multiple numbered interrogatories.
- The matter-specific issues reflected in the sample include:
  accommodations
  protected leave
  performance improvement plan
  compensation reduction
  alleged discrimination / retaliation

## Requests for production

- The sample is very ESI-heavy and explicitly requires production in native format.
- There is a definitions/instructions section before the numbered requests.
- Repeating named-person lists appear again, especially in the email-box request.
- The sample request set is large, so the final Google Docs template should stay authoritative rather than trying to synthesize request text from scratch.

## Protective order

- The proposed order is largely fixed prose.
- The truly variable parts are:
  court caption
  action / case name
  party names
  collective shorthand for defendants
  confidential-material examples and any court- or matter-specific edits
- The sample uses multiple 14-day timing provisions in the designation challenge process.

## Implementation consequence

- The app should not generate these documents from freeform AI text.
- The correct workflow is:
  1. Convert each approved form into a Google Doc template.
  2. Replace variable text with placeholders.
  3. Use the app only to gather data, validate it, copy the template, and replace placeholders.

## Motion for entry of protective order

- The motion is short and mostly fixed.
- Variable parts are:
  caption
  plaintiff name in the body paragraph
  filing date
  signature block
  certificate of service date and signature lines
- The attorney roster is stored in a table rather than plain paragraphs, so the template conversion should preserve that layout while swapping in placeholders.
