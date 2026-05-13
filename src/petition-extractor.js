const GEMINI_API =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const PETITION_PROMPT = `You are a Missouri employment litigation attorney assistant at Keenan & Bhatia, LLC. Analyze the uploaded documents (EEOC charge, right-to-sue letter, client intake notes, prior petition drafts, or other supporting materials) and perform two tasks:

1. Extract structured case data
2. Draft the prose sections of a Missouri circuit court Petition

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

"partiesSection": Draft the complete PARTIES section as numbered paragraphs:
  - Plaintiff paragraph: residence, citizenship, employment status (was employed / is an employee)
  - One paragraph per defendant: entity type (corporation, LLC, nonprofit), state of incorporation, principal place of business, citizenship
  - If multiple defendants: a paragraph stating they "acted in concert with one another" and establishing the collective reference (e.g., "References to 'Walmart' include both Defendants unless otherwise specified.")
  Use \\n between numbered paragraphs (e.g., "1.\\tPlaintiff Garry Liess...\\n2.\\tDefendant Walmart Inc...").

"jurisdictionVenue": Draft the complete JURISDICTION AND VENUE section as numbered paragraphs:
  - "This Court has subject matter jurisdiction under Mo. Const. art. V, § 14, and RSMo 478.070."
  - "No federal court has subject matter jurisdiction. The claims here arise solely under Missouri law."
  - If workers_comp in claims: "This action is non-removable because this action raises a claim under the Missouri Workers' Compensation Law, and Congress has categorically precluded the removal of actions raising claims under a workers' compensation law. See 28 U.S.C. § 1445(c); Humphrey v. Sequentia, Inc., 58 F.3d 1238 (8th Cir. 1995)."
  - Personal jurisdiction: "This Court has personal jurisdiction. Defendants employed [plaintiff refName] in Missouri, Defendants transact business in Missouri..."
  - Venue rationale: specific to the county/location where plaintiff worked or unlawful acts occurred, citing RSMo 213.111 if MHRA claims present
  Use \\n between numbered paragraphs.

"facts": Draft the FACTS section as numbered paragraphs in chronological order. Write in THIRD PERSON ONLY — never use "I", "me", "my", "we". Convert any first-person language from the source documents into third-person narrative. Include EVERY factual allegation from the source documents — do not summarize or omit anything. The petition reader should not need to read the underlying charge to understand what happened. Cover:
  - Plaintiff's background: age if known, protected characteristics, years of experience, tenure at this employer
  - Employment history: exact hire date, job title(s), work location(s), supervisor(s), performance record
  - Every discriminatory incident, comment, act, or pattern described in the documents — in chronological order with specific dates where available
  - Every internal complaint, HR report, accommodation request, or protected activity — with specific dates
  - Details of any investigation or Defendant's response (or lack thereof)
  - Every adverse employment action: termination, discipline, PIP, demotion, schedule reduction, denial of accommodation — with dates and stated reasons given by Defendant
  - MCHR/EEOC charge filing date and the right-to-sue letter issuance date
  - Final paragraph (always include verbatim): "[Plaintiff refName] reserves the right to amend this action to raise any appropriate cause of action with relation back to the date of filing, including but not limited to any causes of action under Chapters 213 and 287, RSMo."
  Format: "1.\\t[Text].\\n2.\\t[Text]." — number every fact paragraph sequentially starting at 1. Keep track of the final fact paragraph number; count body paragraphs must continue from that number. Use [BRACKET PLACEHOLDERS] only for information genuinely absent from the documents.

"counts": Draft ALL applicable COUNT sections. COUNT HEADERS are NOT numbered. Each COUNT BODY paragraph is numbered, continuing sequentially from where the facts ended. For example, if facts ended at paragraph 54, the first body paragraph of Count I is "55.\\t[text]." This numbering runs through every body paragraph of every count.

  COUNT HEADER FORMAT (not numbered — just these lines, separated by \\n):
  workers_comp:    "COUNT I\\nDISCRIMINATION FOR EXERCISE OF WORKERS' COMPENSATION RIGHTS\\nRSMo 287.780\\n(Against All Defendants)"
  race:            "COUNT I\\nVIOLATION OF THE MISSOURI HUMAN RIGHTS ACT\\nRSMo CHAPTER 213\\nRACE DISCRIMINATION\\n(Against All Defendants)"
  color:           "COUNT I\\nVIOLATION OF THE MISSOURI HUMAN RIGHTS ACT\\nRSMo CHAPTER 213\\nCOLOR DISCRIMINATION\\n(Against All Defendants)"
  sex:             "COUNT I\\nVIOLATION OF THE MISSOURI HUMAN RIGHTS ACT\\nRSMo CHAPTER 213\\nSEX DISCRIMINATION\\n(Against All Defendants)"
  age:             "COUNT I\\nVIOLATION OF THE MISSOURI HUMAN RIGHTS ACT\\nRSMo CHAPTER 213\\nAGE DISCRIMINATION\\n(Against All Defendants)"
  disability:      "COUNT I\\nVIOLATION OF THE MISSOURI HUMAN RIGHTS ACT\\nRSMo CHAPTER 213\\nDISABILITY DISCRIMINATION\\n(Against All Defendants)"
  retaliation:     "COUNT I\\nVIOLATION OF THE MISSOURI HUMAN RIGHTS ACT\\nRSMo CHAPTER 213\\nRETALIATION\\n(Against All Defendants)"
  whistleblower:   "COUNT I\\nVIOLATION OF THE MISSOURI WHISTLEBLOWER'S PROTECTION ACT\\nRSMo 285.575\\n(Against All Defendants)"
  rsmo_105_055:    "COUNT I\\nPUBLIC EMPLOYEE WHISTLEBLOWER RETALIATION\\nRSMo 105.055\\n(Against All Defendants)"
  (Replace COUNT I with COUNT II, COUNT III, etc. for subsequent counts.)

  EACH COUNT BODY (numbered paragraphs only — no headers):
  N.\\t[Plaintiff refName] incorporates each and every other paragraph of this Petition as if fully set forth here.
  N+1.\\t[Statutory employer/employee status — case-specific]
  N+2.\\t[Elements/protected activity — case-specific]
  N+3.\\t[Adverse action — case-specific]
  N+4.\\t[Protected characteristic/activity] was the motivating factor in Defendants' adverse actions.
  N+5.\\t[Plaintiff refName] has suffered damages, including but not limited to loss of pay/benefits and emotional distress.
  N+6.\\tDefendants intentionally harmed [Plaintiff refName] without just cause and/or acted with a deliberate and flagrant disregard for the safety of others, justifying punitive damages.
  N+7.\\t[Plaintiff refName] respectfully prays that this Court adjudge Defendants liable for [claim], and grant all relief allowed under the law, as set forth in the Prayer in this Petition.

  After the last count body, add (not numbered):
  "DEMAND FOR A JURY TRIAL\\n\\n[Plaintiff refName] respectfully demands a jury trial on all issues so triable."

  Separate each count header block and the jury demand section with \\n\\n.

"prayer": Draft the standard prayer for relief as a numbered list:
  "Plaintiff respectfully prays that this Court enter judgment against Defendants, and grant the following relief, believed to be in excess of $25,000:\\n1.\\tActual damages, including both economic and non-economic damages, including emotional distress damages;\\n2.\\tBackpay;\\n3.\\tFrontpay and/or reinstatement;\\n4.\\tPunitive damages;\\n5.\\tPre-judgment and post-judgment interest at the maximum legal rate;\\n6.\\tDeclaratory and injunctive relief, including but not limited to expungement of any negative personnel records and adjustment for the tax consequences of any lump-sum award;\\n7.\\tThe costs of this action;\\n8.\\tReasonable attorney's fees, expert expenses, and other disbursements; and\\n9.\\tAny other and further legal and/or equitable relief that this Court deems just and proper."

"summary": array of 3-5 plain-English strings summarizing what was found (e.g., ["Plaintiff: Garry Liess", "Defendants: Walmart Inc., Wal-Mart Associates Inc.", "Claims: Workers' comp retaliation, Age discrimination, MHRA Retaliation", "Court: Buchanan County Circuit Court"])

Return ONLY the JSON object. No markdown fences. No explanation. No extra text.`;

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
        // Already-escaped sequence — copy both chars and skip ahead.
        out += ch + (text[i + 1] ?? "");
        i += 2;
        continue;
      }
      if (ch === '"') {
        inString = false;
        out += ch;
      } else if (cp < 0x20) {
        // All C0 control characters must be escaped in JSON strings.
        if (cp === 0x09) out += "\\t";
        else if (cp === 0x0a) out += "\\n";
        else if (cp === 0x0d) out += "\\r";
        else out += `\\u${cp.toString(16).padStart(4, "0")}`;
      } else if (cp === 0x2028) {
        out += "\\u2028"; // Unicode Line Separator — illegal bare in JSON
      } else if (cp === 0x2029) {
        out += "\\u2029"; // Unicode Paragraph Separator — illegal bare in JSON
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

async function extractPetitionContext(files) {
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

  const parts = [{ text: PETITION_PROMPT }];

  for (const file of files) {
    if (file.contentType === "application/pdf") {
      parts.push({ inline_data: { mime_type: "application/pdf", data: file.contentBase64 } });
    } else {
      const text = Buffer.from(file.contentBase64, "base64").toString("utf8");
      parts.push({ text: `Document: ${file.name}\n\n${text}` });
    }
  }

  const response = await fetch(`${GEMINI_API}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { response_mime_type: "application/json" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("Gemini returned an empty response.");

  const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  let extracted;
  try {
    extracted = JSON.parse(jsonText);
  } catch (_) {
    extracted = JSON.parse(sanitizeJsonString(jsonText));
  }

  const { summary = [], ...fields } = extracted;
  return { ok: true, summary, fields, documents: files.map((f) => ({ name: f.name })) };
}

module.exports = { extractPetitionContext };
