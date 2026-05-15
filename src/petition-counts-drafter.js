const { jsonrepair } = require("jsonrepair");

const GEMINI_API =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const COUNT_HEADERS = {
  workers_comp:  "COUNT I\nDISCRIMINATION FOR EXERCISE OF WORKERS' COMPENSATION RIGHTS\nRSMo 287.780\n(Against All Defendants)",
  race:          "COUNT I\nVIOLATION OF THE MISSOURI HUMAN RIGHTS ACT\nRSMo CHAPTER 213\nRACE DISCRIMINATION\n(Against All Defendants)",
  color:         "COUNT I\nVIOLATION OF THE MISSOURI HUMAN RIGHTS ACT\nRSMo CHAPTER 213\nCOLOR DISCRIMINATION\n(Against All Defendants)",
  sex:           "COUNT I\nVIOLATION OF THE MISSOURI HUMAN RIGHTS ACT\nRSMo CHAPTER 213\nSEX DISCRIMINATION\n(Against All Defendants)",
  age:           "COUNT I\nVIOLATION OF THE MISSOURI HUMAN RIGHTS ACT\nRSMo CHAPTER 213\nAGE DISCRIMINATION\n(Against All Defendants)",
  disability:    "COUNT I\nVIOLATION OF THE MISSOURI HUMAN RIGHTS ACT\nRSMo CHAPTER 213\nDISABILITY DISCRIMINATION\n(Against All Defendants)",
  retaliation:   "COUNT I\nVIOLATION OF THE MISSOURI HUMAN RIGHTS ACT\nRSMo CHAPTER 213\nRETALIATION\n(Against All Defendants)",
  whistleblower: "COUNT I\nVIOLATION OF THE MISSOURI WHISTLEBLOWER'S PROTECTION ACT\nRSMo 285.575\n(Against All Defendants)",
  rsmo_105_055:  "COUNT I\nPUBLIC EMPLOYEE WHISTLEBLOWER RETALIATION\nRSMo 105.055\n(Against All Defendants)",
};

function buildCountsPrompt({ claims, facts, plaintiffRefName, collectiveDefendantRef }) {
  const roman = ["I","II","III","IV","V","VI","VII","VIII","IX","X"];
  const claimList = claims
    .map((c, i) => `  ${roman[i]}. ${COUNT_HEADERS[c]?.split("\n")[0] || c}`)
    .join("\n");

  return `You are a Missouri employment litigation attorney assistant at Keenan & Bhatia, LLC. Draft ONLY the COUNTS section of a Petition based on the facts and confirmed claim list below. Write in THIRD PERSON only.

CONFIRMED CLAIMS (draft one COUNT per claim, in this order):
${claimList}

PLAINTIFF REFERENCE NAME: ${plaintiffRefName}
COLLECTIVE DEFENDANT REFERENCE: ${collectiveDefendantRef || "Defendants"}

FACTS SECTION (already written — find the LAST paragraph number that appears in this section, i.e., the highest N where "N.\t" occurs, and start body paragraph numbering at N+1):
${facts}

═══ DRAFTING RULES ═══

COUNT HEADERS: Each count begins with these lines (not numbered), separated by \\n:
${claims.map((c, i) => `  ${COUNT_HEADERS[c]?.replace("COUNT I", `COUNT ${roman[i]}`) || c}`).join("\n")}

COUNT BODY: Numbered paragraphs only (no repeated header lines), continuing sequentially from the last facts paragraph number. For example, if facts ended at paragraph 42, the first body paragraph across all counts is "43.\\t...".

Each count body must include these paragraphs in order:
  N.\\t${plaintiffRefName} incorporates each and every other paragraph of this Petition as if fully set forth here.
  N+1.\\t[Statutory employer/employee status — specific to this claim]
  N+2.\\t[Elements / protected activity — specific to this claim and the facts above]
  N+3.\\t[Adverse action — drawn from the facts above]
  N+4.\\t[Protected characteristic or activity] was the motivating factor in Defendants' adverse actions against ${plaintiffRefName}.
  N+5.\\t${plaintiffRefName} has suffered damages as a direct and proximate result of Defendants' unlawful conduct, including but not limited to lost wages, lost benefits, and emotional distress.
  N+6.\\tDefendants intentionally harmed ${plaintiffRefName} without just cause and/or acted with a deliberate and flagrant disregard for the rights of others, justifying an award of punitive damages.
  N+7.\\t${plaintiffRefName} respectfully prays that this Court adjudge Defendants liable and grant all relief allowed under the law, as set forth in the Prayer in this Petition.

Separate each count block from the next with \\n\\n.

After the final count body, append (not numbered):
DEMAND FOR A JURY TRIAL\\n\\n${plaintiffRefName} respectfully demands a jury trial on all issues so triable.

CRITICAL JSON RULES:
1. Return ONLY a valid JSON object: { "counts": "..." }
2. Never embed raw double-quote characters inside string values — use single quotes for any in-text quotations.
3. Use \\n for line breaks and \\t for tabs within the string. Never embed raw newlines or tabs.
4. No markdown fences. No explanation. No extra text.`;
}

async function draftCounts({ claims, facts, plaintiffRefName, collectiveDefendantRef }) {
  if (!Array.isArray(claims) || claims.length === 0) {
    throw new Error("Select at least one claim before drafting counts.");
  }
  if (!facts?.trim()) {
    throw new Error("Facts section is empty — run extraction first.");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const prompt = buildCountsPrompt({ claims, facts, plaintiffRefName, collectiveDefendantRef });

  const response = await fetch(`${GEMINI_API}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { response_mime_type: "application/json", maxOutputTokens: 32768 },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const result = await response.json();
  const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("Gemini returned an empty response.");

  const stripped = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  let parsed;
  try { parsed = JSON.parse(stripped); } catch (_) {
    try { parsed = JSON.parse(jsonrepair(stripped)); } catch (_2) {
      throw new Error("Counts drafting returned malformed JSON. Try again.");
    }
  }

  return { ok: true, counts: parsed.counts || "" };
}

module.exports = { draftCounts };
