const GEMINI_API =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const PETITION_PROMPT = `You are a Missouri employment litigation attorney assistant at Keenan & Bhatia, LLC. Analyze the uploaded documents (EEOC charge, right-to-sue letter, client intake notes, prior petition drafts, or other supporting materials) and perform two tasks:

1. Extract structured case data
2. Draft the prose sections of a Missouri circuit court Petition

Return ONLY a valid JSON object with the structure below. Do not fabricate facts not in the documents. Use [BRACKET PLACEHOLDERS] for required information you cannot determine. Never invent names, dates, or specific facts not stated in the documents.

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

"facts": Draft the FACTS section as numbered paragraphs in chronological order:
  - Plaintiff's background (age if known, protected characteristics, experience, tenure)
  - Employment history with defendants (hire date, job title, location, performance)
  - Key incidents in chronological order (discriminatory acts, retaliatory conduct, hostile work environment)
  - Any internal complaints or protected activities (reporting to HR, requesting accommodation, etc.)
  - Adverse action(s) (termination, discipline, demotion, etc.)
  - MCHR/EEOC charge filing date and right-to-sue letter
  - Final paragraph: "[Plaintiff refName] reserves the right to amend this action to raise any appropriate cause of action with relation back to the date of filing, including but not limited to any causes of action under Chapters 213 and 287, RSMo."
  Format: "1.\\t[Text].\\n2.\\t[Text]." — Use [BRACKET PLACEHOLDERS] for unknown dates or specific details.

"counts": Draft ALL applicable COUNT sections numbered sequentially. For EACH count use this structure:

  COUNT HEADER FORMAT:
  workers_comp:    "COUNT [N]\\nDISCRIMINATION FOR EXERCISE OF WORKERS' COMPENSATION RIGHTS\\nRSMo 287.780\\n(Against All Defendants)"
  race:            "COUNT [N]\\nVIOLATION OF THE MISSOURI HUMAN RIGHTS ACT\\nRSMo CHAPTER 213\\nRACE DISCRIMINATION\\n(Against All Defendants)"
  color:           "COUNT [N]\\nVIOLATION OF THE MISSOURI HUMAN RIGHTS ACT\\nRSMo CHAPTER 213\\nCOLOR DISCRIMINATION\\n(Against All Defendants)"
  sex:             "COUNT [N]\\nVIOLATION OF THE MISSOURI HUMAN RIGHTS ACT\\nRSMo CHAPTER 213\\nSEX DISCRIMINATION\\n(Against All Defendants)"
  age:             "COUNT [N]\\nVIOLATION OF THE MISSOURI HUMAN RIGHTS ACT\\nRSMo CHAPTER 213\\nAGE DISCRIMINATION\\n(Against All Defendants)"
  disability:      "COUNT [N]\\nVIOLATION OF THE MISSOURI HUMAN RIGHTS ACT\\nRSMo CHAPTER 213\\nDISABILITY DISCRIMINATION\\n(Against All Defendants)"
  retaliation:     "COUNT [N]\\nVIOLATION OF THE MISSOURI HUMAN RIGHTS ACT\\nRSMo CHAPTER 213\\nRETALIATION\\n(Against All Defendants)"
  whistleblower:   "COUNT [N]\\nVIOLATION OF THE MISSOURI WHISTLEBLOWER'S PROTECTION ACT\\nRSMo 285.575\\n(Against All Defendants)"
  rsmo_105_055:    "COUNT [N]\\nPUBLIC EMPLOYEE WHISTLEBLOWER RETALIATION\\nRSMo 105.055\\n(Against All Defendants)"

  EACH COUNT BODY must include (in this order):
  1. Incorporation paragraph: "[Plaintiff refName] incorporates each and every other paragraph of this Petition as if fully set forth here."
  2. Statutory employer/employee status paragraph
  3. Elements/protected activity paragraph(s) — case-specific
  4. Adverse action paragraph — case-specific
  5. Causation paragraph: "[Protected characteristic/activity] was the motivating factor in Defendants' adverse actions."
  6. Damages: "[Plaintiff refName] has suffered damages, including but not limited to loss of pay/benefits and emotional distress."
  7. Punitive: "Defendants intentionally harmed [Plaintiff refName] without just cause and/or acted with a deliberate and flagrant disregard for the safety of others, justifying punitive damages."
  8. Count prayer: "[Plaintiff refName] respectfully prays that this Court adjudge Defendants liable for [claim], and grant all relief allowed under the law, as set forth in the Prayer in this Petition."

  After the last count add:
  "DEMAND FOR A JURY TRIAL\\n\\n[Plaintiff refName] respectfully demands a jury trial on all issues so triable."

  Separate each count and the jury demand with \\n\\n.

"prayer": Draft the standard prayer for relief as a numbered list:
  "Plaintiff respectfully prays that this Court enter judgment against Defendants, and grant the following relief, believed to be in excess of $25,000:\\n1.\\tActual damages, including both economic and non-economic damages, including emotional distress damages;\\n2.\\tBackpay;\\n3.\\tFrontpay and/or reinstatement;\\n4.\\tPunitive damages;\\n5.\\tPre-judgment and post-judgment interest at the maximum legal rate;\\n6.\\tDeclaratory and injunctive relief, including but not limited to expungement of any negative personnel records and adjustment for the tax consequences of any lump-sum award;\\n7.\\tThe costs of this action;\\n8.\\tReasonable attorney's fees, expert expenses, and other disbursements; and\\n9.\\tAny other and further legal and/or equitable relief that this Court deems just and proper."

"summary": array of 3-5 plain-English strings summarizing what was found (e.g., ["Plaintiff: Garry Liess", "Defendants: Walmart Inc., Wal-Mart Associates Inc.", "Claims: Workers' comp retaliation, Age discrimination, MHRA Retaliation", "Court: Buchanan County Circuit Court"])

Return ONLY the JSON object. No markdown fences. No explanation. No extra text.`;

// Walk the JSON character by character so we can safely escape literal control
// chars that Gemini sometimes emits inside string values despite being asked not to.
function sanitizeJsonString(text) {
  let out = "";
  let inString = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") {
        out += ch + (text[i + 1] ?? "");
        i += 2;
        continue;
      }
      if (ch === '"') { inString = false; out += ch; }
      else if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else out += ch;
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
