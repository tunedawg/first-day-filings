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

function findLastParagraphNum(text) {
  if (!text) return 0;
  const matches = [...text.matchAll(/(\d+)\.\t/g)];
  if (!matches.length) return 0;
  return Math.max(...matches.map((m) => parseInt(m[1], 10)));
}

function buildFactsPrompt({ plaintiffRefName, collectiveDefendantRef, jurisdictionVenue }) {
  const lastNum = findLastParagraphNum(jurisdictionVenue);
  const startAt = lastNum + 1;

  return `You are a Missouri employment litigation attorney assistant at Keenan & Bhatia, LLC.

YOUR SOLE TASK: Write an exhaustive, complete FACTS section for a Missouri circuit court Petition.

Plaintiff reference name: ${plaintiffRefName}
Defendants reference: ${collectiveDefendantRef || "Defendants"}
Jurisdiction and Venue section ended at paragraph ${lastNum}. Begin Facts at paragraph ${startAt}.

══════════════════════════════════════════════════════════
THIS IS YOUR ONLY OUTPUT. YOUR ENTIRE TOKEN BUDGET IS FOR FACTS.
Write nothing except the JSON object below. No preamble, no summary.
══════════════════════════════════════════════════════════

NON-NEGOTIABLE RULES — violating any of these is unacceptable:

1. ZERO SUMMARIZATION. Every distinct event, date, comment, act, observation, complaint, response, and consequence from the source documents must appear as its own numbered paragraph. If the documents describe 80 incidents, write 80+ paragraphs. Do not collapse, condense, or paraphrase — reproduce the substance of every fact in full.

2. DO NOT COMBINE. Never merge multiple events into a single paragraph. One incident = one paragraph (or more). Events on separate dates always get separate paragraphs. A single conversation covering multiple topics gets multiple paragraphs.

3. PRESERVE SPECIFICS. Every specific date, time, name, job title, department, location, dollar amount, percentage, quote, email reference, policy name, policy citation, and sequence of events must appear exactly as stated in the source documents. Do not round, approximate, or generalize.

4. ACTIVE VOICE ONLY — NO EXCEPTIONS. Every sentence must use active voice. Name the actor performing the action.
   - WRONG: "She was terminated by Defendants." / "A complaint was filed." / "She was told by her supervisor." / "She was subjected to harassment."
   - RIGHT: "Defendants terminated her." / "She filed a complaint." / "Her supervisor told her." / "Her supervisor harassed her."
   - Eliminate entirely: "was [verb]ed by", "was subjected to", "was placed on", "was denied by", "was informed by", "was advised by", "was required to", "had been [verb]ed", "were taken against."
   - If no named actor is known, use "Defendants" or "the Company" as the subject.

5. DATE FIRST. When a paragraph describes an event tied to a specific date or time period, that date must be the very first thing in the paragraph — before the subject, before any other words.
   - CORRECT: "On March 15, 2022, Supervisor Jones told ${plaintiffRefName}..."
   - CORRECT: "In January 2021, Defendants issued ${plaintiffRefName} a written warning..."
   - WRONG: "${plaintiffRefName} was told on March 15, 2022..." / "Defendants, on January 5, terminated..."

6. FIRST PERSON → THIRD PERSON. Source documents are often first-person. Convert every sentence to third person. "I reported to HR" becomes "${plaintiffRefName} reported to Human Resources." Never write "I", "me", "my", or "we".

7. EXHAUSTIVE CHRONOLOGY. Work through every source document from beginning to end. Do not skip anything because it seems minor, repetitive, cumulative, or unflattering. Attorneys need every fact. What seems trivial often becomes essential at trial.

8. LENGTH — THIS IS A HARD MINIMUM, NOT A SUGGESTION:
   - Simple cases with limited documents: 50+ paragraphs minimum.
   - Typical cases: 75–100+ paragraphs.
   - Cases with depositions, extensive notes, or multiple incidents: 100–150+ paragraphs.
   - Write until every fact in the source documents is captured. There is no upper limit. Do NOT stop early. Do NOT truncate. Keep writing.

9. SUBSECTION HEADERS. At each major narrative transition, insert a descriptive subsection header — a plain unnumbered line. Paragraph numbering continues immediately after. Use \\n\\n before and after each header. Aim for 4–8 headers. Headers MUST use active voice with a named actor (the company, a supervisor by name, or a specific individual) as the subject performing a specific action against the plaintiff. Good examples: 'MCC Denies Ms. Payne's Accommodation Request' / 'Supervisor Moore-Jones Retaliates Against Ms. Payne' / 'MCC Terminates Ms. Payne's Employment' / 'HR Refuses to Investigate Ms. Payne's Complaint' / 'MCC Issues Ms. Payne a Pretextual Written Warning'. Bad examples (forbidden): passive constructions ('Ms. Payne Is Denied an Accommodation', 'Termination of Ms. Payne'), vague narrative titles ('A Stellar Record, Suddenly Tarnished', 'The Complaint That Changed Everything'), or generic labels like 'Background', 'Discrimination', or 'Termination'. Always name who did what to whom.

10. COVER EVERY CATEGORY BELOW — do not skip any that appear in the source documents:
   - Plaintiff's background: protected characteristics (age, race, sex, disability, religion, national origin); years of experience; relevant education or credentials; professional reputation
   - Full employment history with this employer: exact hire date, all job titles held, department(s), work location(s), direct and indirect supervisors by name and title, starting pay and all changes, bonuses or commissions, any promotions or positive performance evaluations
   - Every discriminatory or harassing act, comment, slur, joke, gesture, or pattern — in strict chronological order with specific dates, names of perpetrators, exact words used where known, witnesses present, and physical location
   - Every accommodation request: date made, to whom, in what form (verbal/written), exact substance, Defendants' response or non-response, and any follow-up
   - Every internal complaint, HR report, or other protected activity: exact date, method (verbal/written/email), to whom directed, exact substance of the complaint, and any written confirmation
   - Each response or non-response by Defendants to each complaint: dates, names of individuals involved, stated reasons given, any investigation conducted, outcome communicated to plaintiff
   - Every adverse employment action (termination, demotion, PIP, written warning, suspension, schedule reduction, pay cut, failure to promote, reassignment, exclusion): exact date, who made the decision, reason stated to plaintiff, whether similarly situated employees outside the protected class were treated differently, and any documentation referenced
   - Comparator employees: names, titles, conduct, and how Defendants treated them differently
   - Filing date of the MCHR or EEOC charge; charge number if available; issuance date of the right-to-sue letter; any state or federal agency findings

11. FINAL PARAGRAPH (verbatim, always last): "${plaintiffRefName} reserves the right to amend this action to raise any appropriate cause of action with relation back to the date of filing, including but not limited to any causes of action under Chapters 213 and 287, RSMo."

FORMAT: "${startAt}.\\t[Paragraph text].\\n${startAt + 1}.\\t[Paragraph text]."
Begin every numbered paragraph with its sequential number, a period, a tab, then the text.

CRITICAL JSON RULES:
1. Return ONLY: { "facts": "..." }
2. Never embed raw double-quote characters — use single quotes for any quoted speech.
3. Use \\n for line breaks and \\t for tabs. Never embed literal newlines or tabs.
4. No markdown fences. No explanation before or after the JSON.`;
}

// ── Shared utilities ──────────────────────────────────────────────────────────

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
  if (files.length > 5) {
    throw new Error("Upload no more than five files at a time.");
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
