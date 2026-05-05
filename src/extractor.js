const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const GEMINI_API =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const EXTRACTION_PROMPT = `You are a legal assistant extracting structured intake data from Missouri state court employment litigation documents (petitions, charges of discrimination, EEOC charges, etc.).

Analyze the uploaded document(s) carefully and extract all available information. Return ONLY a valid JSON object with the fields below. Omit any field you cannot determine from the document — do not guess. Never fabricate names or facts not present in the documents.

FIELD REFERENCE:

courtCounty         — County name only, e.g. "Jackson" or "Jasper"
courtDivision       — Venue line under court header, e.g. "AT KANSAS CITY" (omit if not present)
plaintiffName       — Full plaintiff name as it appears in the caption, e.g. "ABIGAEL ALMANDINGER"
plaintiffReferenceName — Informal reference used in body text, e.g. "Ms. Almandinger"
defendantName       — Lead defendant name as it appears in the caption
allDefendants       — All defendant names, one per line (include all named defendants)
defendantReferenceName — Short name used to refer to defendants in body text, e.g. "MCC" or "the City"
collectiveDefendantShortName — Collective short name, e.g. "City of Carthage"
caseNumber          — Case number exactly as it appears, e.g. "25AP-CC00032"
judgeName           — Judge name if stated, e.g. "Judge Flanders"

claimsAndCounts     — Array of applicable claim type keys (use ONLY these exact values):
                      "race"          Race discrimination
                      "color"         Color discrimination
                      "age"           Age discrimination
                      "sex"           Sex or gender discrimination
                      "disability"    Disability discrimination or failure to accommodate
                      "associational" Associational discrimination
                      "retaliation"   General retaliation (MHRA or other)
                      "workers_comp"  Workers compensation retaliation
                      "whistleblower" Whistleblower retaliation
                      "rsmo_105_055"  RSMo § 105.055 public employee whistleblower

adverseActions      — Array of applicable adverse action keys (use ONLY these exact values):
                      "discipline"              Written warnings, formal discipline
                      "pip"                     Performance Improvement Plan
                      "schedule_reduction"      Reduction in hours or schedule
                      "termination"             Termination, firing, discharge
                      "denial_of_accommodation" Denial of reasonable accommodation
                      "other"                   Any other adverse action

adverseActionsOther — Plain-text description of the "other" adverse action if applicable

protectedTraits     — Protected characteristics at issue, one per line
                      e.g. "Disability\nAge\nSex"

retaliationActivities — Protected activities that led to retaliation, one per line
                      e.g. "Requests for reasonable accommodation\nReports of data falsification"

programName         — Specific program, grant, or department most central to the claims, e.g. "TRIO" or "Upward Bound"
                      (omit if no specific program is mentioned)

keyPersonsList      — Non-plaintiff individuals named in the document who are relevant to the claims,
                      one per line, up to 12. Include supervisors, HR personnel, decision-makers.
                      List the most important witnesses first (supervisors, decision-makers, HR).

─── DECISION-MAKERS AND ACTORS ───────────────────────────────────────────────
For each category below, set the "include" flag to "true" and populate the names list
ONLY if the document actually names people in that role. One name per line.

includeSupervisors          — "true" if any of plaintiff's supervisors are named in the document
supervisors                 — Full names of plaintiff's direct supervisor(s) and their supervisors,
                              one per line (most direct supervisor first)

includeTerminationDecisionMakers — "true" if the document names who decided to terminate/discharge
terminationDecisionMakers   — Full names of individuals who made or participated in the decision
                              to terminate or discharge plaintiff, one per line

includeDisciplineDecisionMakers — "true" if the document names who issued discipline or a PIP
disciplineDecisionMakers    — Full names of individuals who issued written warnings, formal discipline,
                              or placed plaintiff on a PIP, one per line

includeHrParticipants       — "true" if HR personnel are named in the document
hrParticipants              — Full names of HR staff or HR managers involved in any relevant
                              employment decision or investigation, one per line

includeComplaintRecipients  — "true" if the document names anyone who received a complaint or report
complaintRecipients         — Full names of individuals who received an internal complaint, report,
                              or charge from or about plaintiff, one per line

includeAccommodationDecisionMakers — "true" only if disability/accommodation claims exist AND decision-makers are named
accommodationDecisionMakers — Full names of individuals who denied, approved, or participated in
                              accommodation decisions, one per line

includeLeaveScheduleDecisionMakers — "true" if the document names who controlled leave or schedule
leaveScheduleDecisionMakers — Full names of individuals who made decisions about plaintiff's leave,
                              attendance, or schedule, one per line

includeOtherActors          — "true" if there are other key named actors who don't fit above categories
otherActors                 — Full names of other relevant individuals (e.g. co-workers who witnessed
                              events, people who made discriminatory remarks), one per line

─── COMPARATORS ──────────────────────────────────────────────────────────────
Only populate comparator fields if the document explicitly names or describes individuals
who were treated more favorably than plaintiff. Do not infer comparators — only extract
what is stated. One name or description per line.

includeSameDepartmentComparators — "true" if the document names or describes comparators in plaintiff's department
sameDepartmentComparators   — Names or descriptions of employees in plaintiff's department
                              who were treated more favorably, one per line

includeSameRoleComparators  — "true" if the document names comparators with plaintiff's same job title or role
sameRoleComparators         — Names or descriptions of employees with the same role treated more favorably

includeSameSupervisorComparators — "true" if the document names comparators under the same supervisor
sameSupervisorComparators   — Names or descriptions of employees under the same supervisor treated more favorably

includeSameDecisionMakerComparators — "true" if the document names comparators affected by the same decision-maker
sameDecisionMakerComparators — Names or descriptions of employees subject to the same decision-maker
                              but treated more favorably

includeReplacementComparators — "true" if the document names or describes who replaced plaintiff
replacementComparators      — Names or descriptions of plaintiff's replacement or successor

includeDisciplineComparators — "true" if the document names comparators who received different discipline
disciplineComparators       — Names or descriptions of employees who committed similar conduct
                              but received less severe or no discipline

─── SUMMARY ──────────────────────────────────────────────────────────────────
summary             — Array of 3-5 plain-English strings summarizing what you found,
                      e.g. ["Plaintiff: Abigael Almandinger", "Court: Jasper County Circuit Court", ...]

Return ONLY the JSON object. No markdown fences, no explanation, no extra text.`;

// ---------------------------------------------------------------------------
// Gemini extraction
// ---------------------------------------------------------------------------

async function extractWithGemini(files) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in .env");
  }

  const parts = [{ text: EXTRACTION_PROMPT }];

  for (const file of files) {
    if (file.contentType === "application/pdf") {
      parts.push({
        inline_data: {
          mime_type: "application/pdf",
          data: file.contentBase64,
        },
      });
    } else {
      // For non-PDF files, include decoded text
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

  if (!rawText) {
    throw new Error("Gemini returned an empty response.");
  }

  // Strip markdown fences if the model wrapped the JSON
  const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  const extracted = JSON.parse(jsonText);
  const { summary = [], ...suggestionFields } = extracted;

  // Normalize array fields to newline-separated strings for the frontend
  const suggestions = {};
  for (const [key, value] of Object.entries(suggestionFields)) {
    if (value === null || value === undefined || value === "") continue;
    suggestions[key] = Array.isArray(value) ? value.join("\n") : String(value);
  }

  return {
    ok: true,
    summary,
    suggestions,
    documents: files.map((f) => ({ name: f.name })),
    detectedDates: [],
  };
}

// ---------------------------------------------------------------------------
// Python fallback (used when GEMINI_API_KEY is not configured)
// ---------------------------------------------------------------------------

function ensureUploadsRoot() {
  const uploadsRoot = path.join(os.tmpdir(), "first-day-filings-uploads");
  fs.mkdirSync(uploadsRoot, { recursive: true });
  return uploadsRoot;
}

function writeUploadFiles(files) {
  const uploadsRoot = ensureUploadsRoot();
  const requestDir = path.join(uploadsRoot, crypto.randomUUID());
  fs.mkdirSync(requestDir, { recursive: true });

  const manifest = files.map((file, index) => {
    const ext = path.extname(file.name || "").toLowerCase() || ".bin";
    const destination = path.join(requestDir, `${index + 1}${ext}`);
    fs.writeFileSync(destination, Buffer.from(file.contentBase64, "base64"));
    return { name: file.name, path: destination, contentType: file.contentType };
  });

  return { manifest, requestDir };
}

function cleanupDirectory(targetDir) {
  if (targetDir && fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
}

async function extractWithPython(files) {
  const { manifest, requestDir } = writeUploadFiles(files);
  const scriptPath = path.join(__dirname, "..", "scripts", "extract_case_context.py");

  return new Promise((resolve, reject) => {
    const child = spawn("python", [scriptPath], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => { cleanupDirectory(requestDir); reject(error); });
    child.on("close", (code) => {
      cleanupDirectory(requestDir);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Extraction failed with exit code ${code}.`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Extraction returned invalid JSON. ${error.message}`));
      }
    });

    child.stdin.write(JSON.stringify({ files: manifest }));
    child.stdin.end();
  });
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

async function extractCaseContext(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("Upload at least one complaint, charge, or supporting document.");
  }

  if (files.length > 5) {
    throw new Error("Upload no more than five files at a time.");
  }

  if (process.env.GEMINI_API_KEY) {
    return extractWithGemini(files);
  }

  return extractWithPython(files);
}

module.exports = { extractCaseContext };
