const { jsonrepair } = require("jsonrepair");

const GEMINI_API =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const GEMINI_FILES_API =
  "https://generativelanguage.googleapis.com/upload/v1beta/files";
const GEMINI_FILES_BASE =
  "https://generativelanguage.googleapis.com/v1beta";

// ── Call 1: structured fields + short prose sections (no facts) ───────────────

const EXTRACTION_PROMPT = `You are a Missouri employment litigation attorney assistant at Keenan & Bhatia, LLC. Analyze the uploaded documents (EEOC charge, right-to-sue letter, client intake notes, prior petition drafts, or other supporting materials) and perform two tasks:

1. Extract structured case data
2. Draft the shorter prose sections of a Missouri circuit court Petition (Introduction, Parties, Jurisdiction, Prayer)

Return ONLY a valid JSON object with the structure below. Do not fabricate facts not in the documents. Use [BRACKET PLACEHOLDERS] for required information you cannot determine. Never invent names, dates, or specific facts not stated in the documents. All prose sections must be written in THIRD PERSON — never use "I", "me", "my", or "we".

═══ PART 1: EXTRACTED FIELDS ═══

"court": {
  "county": string — County name only (e.g., "Jackson", "Buchanan", "St. Louis County", "City of St. Louis"),
  "state": "Missouri",
  "division": string|null — Venue sub-line if present (e.g., "AT KANSAS CITY"), null otherwise,
  "circuitLabel": string|null — For City of St. Louis cases only: "TWENTY-SECOND JUDICIAL CIRCUIT\\n(CITY OF ST. LOUIS)"; null otherwise
}

"plaintiff": {
  "captionName": string — Full name in ALL CAPS (e.g., "GARRY LIESS"),
  "fullName": string — Full name in title case (e.g., "Garry Liess"),
  "refName": string — Formal reference used in text (e.g., "Mr. Liess" or "Ms. Hughes"),
  "pronoun": "he"|"she"|"they",
  "possessivePronoun": "his"|"her"|"their",
  "objectPronoun": "him"|"her"|"them",
  "firmOffice": "stl" if documents reference the St. Louis office (4625 Lindell), otherwise "kc"
}

"defendants": array of:
  {
    "captionName": string — Name in ALL CAPS with legal designation (e.g., "WALMART, INC."),
    "serveLabel": "Serve at:"|"Serve RA:",
    "serveAddress": string — Complete service address (use \\n for line breaks),
    "incorporationState": string,
    "principalPOB": string — State of principal place of business,
    "citizenship": string — e.g., "Delaware and Arkansas",
    "refName": string — Short name used in body text (e.g., "Walmart Inc.", "Mosaic", "MCC")
  }

"collectiveDefendantRef": string — Collective short name for all defendants (e.g., "Walmart", "Mosaic", "MCC")

"claims": array using ONLY these exact keys:
  "race" | "color" | "sex" | "age" | "disability" | "retaliation" | "workers_comp" | "whistleblower" | "rsmo_105_055"

"adverseActions": array using ONLY these exact keys:
  "termination" | "discipline" | "pip" | "demotion" | "schedule_reduction" | "denial_of_accommodation" | "hostile_work_environment" | "other"

"caseTypeLabel": string|null — e.g., "Other Miscellaneous", or null

═══ PART 2: DRAFTED PROSE SECTIONS ═══

Write in plain prose — no markdown, no bullet points inside any section. Use the plaintiff's refName and defendants' refNames consistently. Write each paragraph as a complete, filing-quality sentence.

PARAGRAPH NUMBERING — GLOBAL RULE:
All numbered prose paragraphs across Introduction, Parties, Jurisdiction and Venue, and Facts form one single continuous sequence starting at 1. Each section picks up the counter where the previous section ended. The Prayer for Relief and Jury Demand do NOT participate in this sequence. Maintain the running count internally as you draft each section and open the next section at the correct continuation number.

"introduction": Draft the INTRODUCTION section as 5–10 numbered paragraphs, beginning at paragraph 1. Write with dramatic precision — objectively, sharply, and compellingly. This is the reader's first and most lasting impression of the case. Cover: the nature of the case and the law it invokes; who the plaintiff is and what they endured; who the defendants are and what they chose to do; the arc of the key events; and why this case demands adjudication. Do NOT enumerate specific numbered facts or legal elements — write with narrative power. All prose in THIRD PERSON only. Format: "1.\\t[Text].\\n2.\\t[Text]."

"partiesSection": Draft the complete PARTIES section as numbered paragraphs, continuing the counter from where introduction ended (e.g., if introduction ended at paragraph 7, begin with "8.\\t..."):
  - Plaintiff paragraph: residence, citizenship, employment status (was employed / is an employee)
  - One paragraph per defendant: entity type (corporation, LLC, nonprofit), state of incorporation, principal place of business, citizenship
  - If multiple defendants: a paragraph stating they "acted in concert with one another" and establishing the collective reference (e.g., "References to 'Walmart' include both Defendants unless otherwise specified.")
  Use \\n between numbered paragraphs.

"jurisdictionVenue": Draft the complete JURISDICTION AND VENUE section as numbered paragraphs, continuing from where partiesSection ended:
  - "This Court has subject matter jurisdiction under Mo. Const. art. V, § 14, and RSMo 478.070."
  - "No federal court has subject matter jurisdiction. The claims here arise solely under Missouri law."
  - If workers_comp in claims: "This action is non-removable because this action raises a claim under the Missouri Workers' Compensation Law, and Congress has categorically precluded the removal of actions raising claims under a workers' compensation law. See 28 U.S.C. § 1445(c); Humphrey v. Sequentia, Inc., 58 F.3d 1238 (8th Cir. 1995)."
  - Personal jurisdiction: "This Court has personal jurisdiction. Defendants employed [plaintiff refName] in Missouri, Defendants transact business in Missouri..."
  - Venue rationale: specific to the county/location where plaintiff worked or unlawful acts occurred, citing RSMo 213.111 if MHRA claims present
  Use \\n between numbered paragraphs.

"prayer": Draft the standard prayer for relief as a numbered list:
  "Plaintiff respectfully prays that this Court enter judgment against Defendants, and grant the following relief, believed to be in excess of $25,000:\\n1.\\tActual damages, including both economic and non-economic damages, including emotional distress damages;\\n2.\\tBackpay;\\n3.\\tFrontpay and/or reinstatement;\\n4.\\tPunitive damages;\\n5.\\tPre-judgment and post-judgment interest at the maximum legal rate;\\n6.\\tDeclaratory and injunctive relief, including but not limited to expungement of any negative personnel records and adjustment for the tax consequences of any lump-sum award;\\n7.\\tThe costs of this action;\\n8.\\tReasonable attorney's fees, expert expenses, and other disbursements; and\\n9.\\tAny other and further legal and/or equitable relief that this Court deems just and proper."

"summary": array of 3-5 plain-English strings summarizing what was found (e.g., ["Plaintiff: Garry Liess", "Defendants: Walmart Inc., Wal-Mart Associates Inc.", "Claims: Workers' comp retaliation, Age discrimination, MHRA Retaliation", "Court: Buchanan County Circuit Court"])

Return ONLY the JSON object. No markdown fences. No explanation. No extra text.

CRITICAL JSON RULES — you must follow these exactly or the output will be unparseable:
1. Every prose string value must be a valid JSON string enclosed in double quotes.
2. Never embed raw double-quote characters (" U+0022) inside a string value. If you need to represent a quotation or quoted speech within the text, use single quotes ('like this') instead.
3. Never embed raw newline, carriage-return, or tab characters inside a string value. Use \\n for line breaks and \\t for tabs.
4. Do not truncate or omit any section. Emit all fields completely.`;

// ── Call 2: facts only — dedicated full-budget call ───────────────────────────

function buildFactsPrompt({ plaintiffRefName, collectiveDefendantRef, jurisdictionVenue }) {
  const lastNum = findLastParagraphNum(jurisdictionVenue);
  const startAt = lastNum + 1;

  return `You are drafting the FACTS section of a Missouri employment litigation petition for Keenan & Bhatia, LLC.

Plaintiff: ${plaintiffRefName}
Defendants: ${collectiveDefendantRef || "Defendants"}

The Jurisdiction and Venue section ended at paragraph ${lastNum}. Begin Facts at paragraph ${startAt}.

══════════════════════════════════════════════════════════
YOUR SOLE TASK: Write an exhaustive, complete FACTS section.
══════════════════════════════════════════════════════════

NON-NEGOTIABLE RULES — violating any of these is unacceptable:

1. ZERO SUMMARIZATION. Every distinct event, date, comment, act, observation, complaint, response, and consequence from the source documents must appear as its own numbered paragraph. If the documents describe 80 incidents, you write 80+ paragraphs for them.

2. DO NOT COMBINE. Do not merge multiple events into a single paragraph. One incident = one paragraph (or more). Separate things that happened on separate dates always get separate paragraphs.

3. PRESERVE SPECIFICS. Every specific date, time, name, job title, location, dollar amount, percentage, quote, policy citation, and sequence of events must appear exactly as in the source documents.

4. ACTIVE VOICE ONLY — NO EXCEPTIONS. Every sentence must use active voice. Name the actor performing the action.
   - WRONG (passive): "Ms. Smith was terminated by Defendants." / "She was told by her supervisor." / "A complaint was filed."
   - RIGHT (active): "Defendants terminated Ms. Smith." / "Her supervisor told her." / "${plaintiffRefName} filed a complaint."
   - Passive constructions to eliminate entirely: "was [verb]ed by", "was subjected to", "was placed on", "was denied by", "was informed by", "was advised by", "was required to", "had been [verb]ed."
   - If no named actor is known, use "Defendants" or "the Company" as the subject.

5. DATE FIRST. When a paragraph describes an event tied to a specific date or time period, that date or time reference must be the very first thing in the paragraph — before the subject, before anything else.
   - CORRECT: "On March 15, 2022, Supervisor Jones told ${plaintiffRefName}..."
   - CORRECT: "In January 2021, Defendants placed ${plaintiffRefName} on a performance improvement plan..."
   - WRONG: "${plaintiffRefName} was told on March 15, 2022..."
   - WRONG: "Defendants, on January 5, 2022, terminated..."

6. FIRST PERSON → THIRD PERSON. All source documents are first-person. Convert every sentence to third person. "I reported to HR" becomes "${plaintiffRefName} reported to Human Resources." Never write "I", "me", "my", or "we".

7. EXHAUSTIVE CHRONOLOGY. Work through the source documents systematically from beginning to end. Do not skip anything because it seems minor, repetitive, or embarrassing. Attorneys need every fact.

8. LENGTH. A thorough facts section for a complex employment case routinely runs 60–150+ numbered paragraphs. Write until the source documents are fully exhausted. There is no length limit. Do NOT stop early.

9. SUBSECTION HEADERS. At each major narrative transition (e.g., shifting from background to the start of discrimination; from discrimination to formal complaints; from complaints to adverse actions; from adverse actions to termination; from termination to administrative proceedings), insert a creative, descriptive subsection header. Rules for headers:
   - The header is a plain line of text with NO paragraph number. It is NOT numbered.
   - Paragraph numbering continues uninterrupted immediately after the header on the very next line.
   - Write headers that are evocative and specific to this case — not generic labels. They should read like chapter titles that tell the story.
     Good examples: 'A Stellar Record, Suddenly Tarnished' / 'The Complaint That Changed Everything' / 'Defendants Choose Retaliation Over Accountability' / 'The Last Day — A Calculated Dismissal'
     Bad examples: 'Background' / 'Discrimination' / 'Termination'
   - Aim for 4–8 headers throughout the section, placed where they add narrative structure and emphasis.
   - Format in the JSON string: "...last numbered paragraph.\\n\\nHeader Text\\n\\n${startAt + 1}.\\t..." — two \\n before and after each header to create separation.

10. FINAL PARAGRAPH (verbatim, always last): "${plaintiffRefName} reserves the right to amend this action to raise any appropriate cause of action with relation back to the date of filing, including but not limited to any causes of action under Chapters 213 and 287, RSMo."

COVER IN THIS ORDER:
- ${plaintiffRefName}'s background: age, race, sex, disability, or other protected characteristics; years of relevant experience; education or credentials
- Employment history with this employer: exact hire date, job title(s), department, work location(s), direct supervisor(s) by name and title, starting pay and any changes, any promotions or positive performance history
- Every discriminatory or harassing act, comment, pattern, or incident — in strict chronological order with specific dates, names of perpetrators, exact words used where known, and witnesses present
- Every accommodation request made by ${plaintiffRefName}, when made, to whom, and what response (or non-response) followed
- Every internal complaint, HR report, or protected activity — date, method (written/verbal), to whom, exact substance of complaint
- Each response or non-response by Defendants to each complaint or report — dates, names of people involved, stated reasons
- Every adverse employment action (termination, demotion, PIP, discipline, schedule reduction, pay cut, failure to promote, reassignment): exact date, who made the actor's decision, reason given to ${plaintiffRefName}, and whether similarly situated employees outside the protected class were treated differently
- Filing date of the MCHR or EEOC charge; issuance date of the right-to-sue letter; any other administrative proceedings

FORMAT FOR NUMBERED PARAGRAPHS: "${startAt}.\\t[Paragraph text].\\n${startAt + 1}.\\t[Paragraph text]."
Begin every numbered paragraph with its sequential number followed by a period, a tab, then the paragraph text.

CRITICAL JSON RULES:
1. Return ONLY: { "facts": "..." }
2. Never embed raw double-quote characters inside the string — use single quotes for any quoted speech.
3. Use \\n for line breaks and \\t for tabs within the string value. Never embed literal newlines or tabs.
4. No markdown fences. No explanation before or after the JSON.`;
}

// ── Shared utilities ──────────────────────────────────────────────────────────

function findLastParagraphNum(text) {
  if (!text) return 0;
  const matches = [...text.matchAll(/(\d+)\.\t/g)];
  if (!matches.length) return 0;
  return Math.max(...matches.map((m) => parseInt(m[1], 10)));
}

// Walk the JSON character by character so we can safely escape literal control
// chars that Gemini sometimes emits inside string values despite being asked not to.
// Handles all U+0000–U+001F control chars plus U+2028/U+2029 (line/paragraph separators).
function sanitizeJsonString(text) {
  let out = "";
  let inString = false;
  let i = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i);
    const ch = text[i];
    if (inString) {
      if (ch === "\\") {
        out += ch + (text[i + 1] ?? "");
        i += 2;
        continue;
      }
      if (ch === '"') {
        inString = false;
        out += ch;
      } else if (cp < 0x20) {
        if (cp === 0x09) out += "\\t";
        else if (cp === 0x0a) out += "\\n";
        else if (cp === 0x0d) out += "\\r";
        else out += `\\u${cp.toString(16).padStart(4, "0")}`;
      } else if (cp === 0x2028) {
        out += "\\u2028";
      } else if (cp === 0x2029) {
        out += "\\u2029";
      } else {
        out += ch;
      }
    } else {
      if (ch === '"') inString = true;
      out += ch;
    }
    i++;
  }
  return out;
}

// Upload one file to Gemini Files API; returns { uri, name } for use in file_data refs.
// Uses multipart/form-data with named fields (metadata + file) as required by the API.
// Files auto-expire after 48 hours. Upload once, reference in multiple calls.
async function uploadToGeminiFiles(apiKey, file) {
  const buffer = Buffer.from(file.contentBase64, "base64");
  const mimeType = file.contentType || "application/pdf";

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify({ file: { display_name: file.name } })], { type: "application/json" })
  );
  form.append("file", new Blob([buffer], { type: mimeType }), file.name);

  let res;
  try {
    res = await fetch(`${GEMINI_FILES_API}?key=${apiKey}`, {
      method: "POST",
      headers: { "X-Goog-Upload-Protocol": "multipart" },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    const cause = e?.cause?.message || e?.cause?.code || "";
    throw new Error(`File upload failed for "${file.name}": ${e.message}${cause ? ` — ${cause}` : ""}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => "(unreadable)");
    throw new Error(`File upload error ${res.status} for "${file.name}": ${err}`);
  }

  const result = await res.json();
  return { uri: result.file.uri, name: result.file.name };
}

// Best-effort delete after calls finish (files also auto-expire in 48h).
async function deleteGeminiFile(apiKey, fileName) {
  await fetch(`${GEMINI_FILES_BASE}/${fileName}?key=${apiKey}`, { method: "DELETE" }).catch(() => {});
}

async function callGemini(apiKey, parts, label = "Gemini") {
  let response;
  try {
    response = await fetch(`${GEMINI_API}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { response_mime_type: "application/json", maxOutputTokens: 65536 },
      }),
      signal: AbortSignal.timeout(300_000), // 5-minute hard cap per call
    });
  } catch (e) {
    const cause = e?.cause?.message || e?.cause?.code || e?.cause?.toString() || "";
    throw new Error(`${label} request failed: ${e.message}${cause ? ` — ${cause}` : ""}`);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "(unreadable)");
    throw new Error(`${label} API error ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error(`${label} returned an empty response.`);

  const stripped = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  const jsonText = sanitizeJsonString(stripped);

  try {
    return JSON.parse(jsonText);
  } catch (_) {
    try {
      return JSON.parse(jsonrepair(jsonText));
    } catch (_2) {
      return JSON.parse(jsonrepair(stripped));
    }
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

async function extractPetitionContext(files, onProgress = () => {}) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("Upload at least one document (EEOC charge, right-to-sue letter, intake notes, etc.).");
  }
  if (files.length > 15) {
    throw new Error("Upload no more than fifteen files at a time.");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured. Contact your administrator.");
  }

  // Sequential uploads so the caller receives per-file progress events.
  const uploadResults = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress({ type: "progress", step: "uploading", fileName: file.name, index: i + 1, total: files.length });
    if (file.contentType === "application/pdf") {
      const uploaded = await uploadToGeminiFiles(apiKey, file);
      uploadResults.push({ part: { file_data: { mime_type: "application/pdf", file_uri: uploaded.uri } }, geminiName: uploaded.name });
    } else {
      const text = Buffer.from(file.contentBase64, "base64").toString("utf8");
      uploadResults.push({ part: { text: `Document: ${file.name}\n\n${text}` }, geminiName: null });
    }
  }

  const fileParts = uploadResults.map((r) => r.part);
  const uploadedFileNames = uploadResults.map((r) => r.geminiName).filter(Boolean);

  try {
    onProgress({ type: "progress", step: "analyzing" });
    const extracted = await callGemini(apiKey, [{ text: EXTRACTION_PROMPT }, ...fileParts], "Extraction call");

    const { summary = [], ...fields } = extracted;

    const plaintiffRefName = fields.plaintiff?.refName || fields.plaintiff?.fullName || "Plaintiff";
    const collectiveDefendantRef = fields.collectiveDefendantRef || "Defendants";
    const jurisdictionVenue = fields.jurisdictionVenue || "";

    onProgress({ type: "progress", step: "drafting_facts" });
    const factsPrompt = buildFactsPrompt({ plaintiffRefName, collectiveDefendantRef, jurisdictionVenue });
    const factsResult = await callGemini(apiKey, [{ text: factsPrompt }, ...fileParts], "Facts drafting call");

    fields.facts = factsResult.facts || "";

    return { ok: true, summary, fields, documents: files.map((f) => ({ name: f.name })) };
  } finally {
    await Promise.all(uploadedFileNames.map((name) => deleteGeminiFile(apiKey, name)));
  }
}

module.exports = { extractPetitionContext };
