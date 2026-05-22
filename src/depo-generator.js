"use strict";

// Builds an HTML document for a deposition outline.
// Called from POST /api/depo/generate — the HTML is uploaded to Drive,
// which converts it automatically to a native Google Doc.

// ── Text processing helpers ──────────────────────────────────────────────────

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Wraps bare Box URLs (https://app.box.com/file/NNN) in <a> tags.
function linkifyBox(text) {
  if (!text) return "";
  return String(text).replace(
    /(https:\/\/app\.box\.com\/(?:file|folder)\/\d+)/g,
    (url) => `<a href="${url}">${url}</a>`,
  );
}

// Converts a plain-text depo section (using the /depo skill's conventions)
// into HTML. Conventions:
//   [Ex. N — ... — https://...]      → bold exhibit header with hyperlink
//   [NOTE: ...]                       → italic annotation after the header
//   I., II., … lines                 → <h2> section headings
//   1., 2., … Ex./NEW Ex. lines      → <h3> top-document entries
//   What it is: / Who it mentions:
//   How it relates: / Key facts:      → bold+italic label
//   Must-get: …                      → bold+italic
//   • or - bullet lines              → <ul><li>
//   Short lines ending with :        → <strong> sub-heading
//   Blank lines                      → paragraph spacer
//   Everything else                  → <p>
function sectionToHtml(text) {
  if (!text) return "";
  const lines = String(text).split("\n");
  const parts = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      parts.push("</ul>");
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();

    // ── Blank line ─────────────────────────────────────────────────────────
    if (!line) {
      closeList();
      if (parts.length > 0) parts.push("<p>&nbsp;</p>");
      continue;
    }

    // ── Separator line ─────────────────────────────────────────────────────
    if (/^─{3,}$/.test(line)) {
      closeList();
      parts.push("<hr>");
      continue;
    }

    // ── Exhibit header: [Ex. N — ... — https://...] ────────────────────────
    // May have a trailing [NOTE: ...] segment on the same line.
    const bracketMatch = line.match(/^\[([^\]]+)\](.*)?$/);
    if (bracketMatch && (bracketMatch[1].includes("Ex.") || bracketMatch[1].includes("http"))) {
      closeList();
      let inner = escHtml(bracketMatch[1]);
      const trailingRaw = (bracketMatch[2] || "").trim();

      // Convert any Box URL inside the bracket to a real link.
      inner = inner.replace(
        /(https:\/\/app\.box\.com\/(?:file|folder)\/\d+)/g,
        (url) => `<a href="${url}">${url}</a>`,
      );

      let html = `<p><strong>${inner}</strong>`;
      if (trailingRaw) html += ` <em>${escHtml(trailingRaw)}</em>`;
      html += "</p>";
      parts.push(html);
      continue;
    }

    // ── Roman-numeral section headings: I., II., III. … ───────────────────
    if (/^[IVXLCDM]+\.\s+\S/.test(line)) {
      closeList();
      parts.push(`<h2>${escHtml(line)}</h2>`);
      continue;
    }

    // ── Numbered TOP-doc entries: "1. Ex. 59 —" or "1. NEW Ex. 71 —" ──────
    if (/^\d+\.\s+(Ex\.|NEW\s+Ex\.)/.test(line)) {
      closeList();
      parts.push(`<h3>${linkifyBox(escHtml(line))}</h3>`);
      continue;
    }

    // ── Labelled lines ─────────────────────────────────────────────────────
    const LABELS = [
      "What it is:",
      "Who it mentions:",
      "How it relates:",
      "Key facts already in this document:",
      "Key facts:",
    ];
    const matchedLabel = LABELS.find((lbl) => line.startsWith(lbl));
    if (matchedLabel) {
      closeList();
      const rest = line.slice(matchedLabel.length).trim();
      const restHtml = rest ? ` ${linkifyBox(escHtml(rest))}` : "";
      parts.push(`<p><strong><em>${escHtml(matchedLabel)}</em></strong>${restHtml}</p>`);
      continue;
    }

    // ── Must-get: ──────────────────────────────────────────────────────────
    if (line.startsWith("Must-get:")) {
      closeList();
      const rest = line.slice("Must-get:".length).trim();
      parts.push(`<p><strong><em>Must-get:</em></strong> ${escHtml(rest)}</p>`);
      continue;
    }

    // ── Bullet points (• or -) ─────────────────────────────────────────────
    if (/^[•\-]\s+/.test(line)) {
      if (!inList) {
        parts.push("<ul>");
        inList = true;
      }
      const item = line.replace(/^[•\-]\s+/, "");
      parts.push(`<li>${linkifyBox(escHtml(item))}</li>`);
      continue;
    }

    // ── Sub-section headings: short lines ending with : ────────────────────
    if (line.endsWith(":") && line.length < 60 && !line.includes("http")) {
      closeList();
      parts.push(`<p><strong>${escHtml(line)}</strong></p>`);
      continue;
    }

    // ── Default: plain paragraph ────────────────────────────────────────────
    closeList();
    parts.push(`<p>${linkifyBox(escHtml(line))}</p>`);
  }

  closeList();
  return parts.join("\n");
}

// ── Caption table ────────────────────────────────────────────────────────────

function buildCaptionHtml(payload) {
  const plaintiff = payload.plaintiffName || "[PLAINTIFF]";
  const plaintiffAddr = (payload.plaintiffAddress || "").split("\n").filter(Boolean);
  const defendant = payload.defendantName || "[DEFENDANT]";
  const defendantAddr = (payload.defendantAddress || "").split("\n").filter(Boolean);
  const caseNum = payload.caseNumber || "____________";

  const sp = "&nbsp;&nbsp;&nbsp;&nbsp;";

  // Build left-column lines.
  const leftLines = [
    `<strong>${escHtml(plaintiff)},</strong>`,
    ...plaintiffAddr.map((l) => `${sp}${escHtml(l)}`),
    "&nbsp;",
    `${sp}<em>Plaintiff,</em>`,
    "&nbsp;",
    "<em>v.</em>",
    "&nbsp;",
    `<strong>${escHtml(defendant)},</strong>`,
    ...defendantAddr.map((l) => `${sp}${escHtml(l)}`),
    "&nbsp;",
    `${sp}<em>Defendant.</em>`,
  ];

  // Right column: `)` on every line, Case No. next to "Plaintiff,".
  const rightLines = leftLines.map((l) => {
    if (l.includes("Plaintiff,")) return `) &nbsp; Case No. ${escHtml(caseNum)}`;
    return ")";
  });

  const cell = (lines) =>
    lines.map((l) => `<p style="margin:0;padding:0;line-height:1.4;">${l}</p>`).join("");

  return `<table style="width:100%;border:none;border-collapse:collapse;margin-bottom:12pt;">
  <tr>
    <td style="border:none;width:68%;vertical-align:top;padding:0 12px 0 0;">${cell(leftLines)}</td>
    <td style="border:none;width:32%;vertical-align:top;padding:0;">${cell(rightLines)}</td>
  </tr>
</table>`;
}

// ── Prefatory questions (static block with dynamic key-people list) ───────────

function buildPrefatoryHtml(payload) {
  const defendant = escHtml(payload.defendantName || "Defendant");
  const keyPeople = Array.isArray(payload.keyPeople) ? payload.keyPeople : [];
  const peopleHtml = keyPeople.length
    ? `<ul>${keyPeople.map((p) => `<li>${escHtml(p)}</li>`).join("")}</ul>`
    : "";

  return `<h1 style="text-align:center;text-decoration:underline;">PREFATORY QUESTIONS</h1>
<p>Do you understand that you have been placed under oath? What does this oath mean to you? It is always important to be honest — but most conversations in our society occur without an oath, don't they? Our judicial system depends heavily on absolute honesty by every witness, and the system breaks down if witnesses shade or distort the truth. Do you agree to be honest today and abide by your oath?</p>
<p>Full legal name / Date of birth / Current position and employer / Home address / Work address, email, phone</p>
<p>Have you ever been arrested?<br>
Have you ever been found guilty, pled guilty, or entered a plea of no contest to any criminal charge?<br>
Have you ever been a party to a court case — sued someone, or been sued?</p>
<p>Basics: verbal responses only; ask for clarification if needed. If you don't ask, I'll assume you understood. Breaks available, but answer any pending question first. You remain under oath during breaks.</p>
<p>Are you under the influence of any substance or medication that might affect your ability to recall facts or answer questions accurately today?<br>
Can you think of any reason why you might not be able to answer questions accurately today?<br>
Is there any reason why your deposition should not go forward today?</p>
<p>Where are you located right now? Anyone else in the room? Any windows open on your computer? Documents in front of you? Notes or a notepad?</p>
<p>Do you use social media — Facebook, X/Twitter, Instagram, LinkedIn? What names or handles?<br>
Have you ever posted about work, coworkers, or employees on social media?</p>
<p>Personal email address(es)?<br>
Are you represented by counsel today? Who? Did you meet to prepare? How many times? How long? Anyone else present? What documents did you review?</p>
<p>Have you testified in any other cases? In cases involving ${defendant}?<br>
What is your highest level of education?<br>
Describe your current job duties, supervisor, and who reports to you.<br>
Personal cell number? Does ${defendant} provide a work phone? Do you use it to text board members or administrators?</p>
<p>Do you or did you use an internal messaging system at work? What system? Are messages retained or deleted? For how long?</p>
<p>When was your last communication with each of the following, and how:</p>
${peopleHtml}`;
}

// ── Main builder ─────────────────────────────────────────────────────────────

function buildDepoHtml(payload) {
  const witness = escHtml(payload.witnessFullName || "[WITNESS]");
  const witnessFirst = escHtml(payload.witnessFirstName || (payload.witnessFullName || "").split(" ")[0] || "Witness");
  const courtLines = (payload.court || "IN THE CIRCUIT COURT")
    .split("\n").map(l => escHtml(l.trim())).filter(Boolean);
  const courtHtml = courtLines
    .map(l => `<p style="text-align:center;font-weight:bold;margin:2pt 0;">${l}</p>`)
    .join("\n");

  const whatWeWant = Array.isArray(payload.whatWeWant)
    ? payload.whatWeWant
    : String(payload.whatWeWant || "").split("\n").filter(Boolean);

  const rulesOfRoad = Array.isArray(payload.rulesOfRoad)
    ? payload.rulesOfRoad
    : String(payload.rulesOfRoad || "").split("\n").filter(Boolean);

  const wrapUpQuestions = Array.isArray(payload.wrapUpQuestions)
    ? payload.wrapUpQuestions
    : String(payload.wrapUpQuestions || "").split("\n").filter(Boolean);

  const existingExhibits = Array.isArray(payload.existingExhibits) ? payload.existingExhibits : [];
  const newExhibits = Array.isArray(payload.newExhibits) ? payload.newExhibits : [];

  const existingExHtml = existingExhibits.length
    ? existingExhibits
        .map((e) => {
          const note = e.nonOcrd
            ? " <em>[NON-OCR&apos;d — verify before deposition]</em>"
            : "";
          return `<p>${escHtml(e.label)} — ${escHtml(e.bates)} — ${escHtml(e.description)}${note}</p>`;
        })
        .join("")
    : "<p><em>None</em></p>";

  const newExHtml = newExhibits.length
    ? newExhibits
        .map((e) => {
          const linkPart = e.boxUrl
            ? ` — <a href="${e.boxUrl}">${e.boxUrl}</a>`
            : "";
          const note = e.nonOcrd
            ? " <em>[NON-OCR&apos;d — verify before deposition]</em>"
            : "";
          return `<p>${escHtml(e.label)} — ${escHtml(e.bates)} — ${escHtml(e.description)}${linkPart}${note}</p>`;
        })
        .join("")
    : "<p><em>None</em></p>";

  const firstNewNum = newExhibits[0]?.label?.match(/\d+/)?.[0] ?? "___";

  const rulesSection =
    rulesOfRoad.length > 0
      ? `<h1 style="text-align:center;text-decoration:underline;">RULES OF THE ROAD</h1>
<ul>
${rulesOfRoad.map((r) => `<li>${escHtml(r)}</li>`).join("\n")}
</ul>
<hr>`
      : "";

  const boxFolderUrl = payload.boxWitnessFolderUrl || "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body  { font-family:"Century Schoolbook",serif; font-size:13pt; margin:1in; line-height:1.15; }
  h1   { font-size:13pt; text-align:center; font-weight:bold; margin:14pt 0 4pt; }
  h2   { font-size:13pt; font-weight:bold; text-decoration:underline; margin:16pt 0 4pt; }
  h3   { font-size:13pt; font-weight:bold; margin:12pt 0 4pt; }
  p    { margin:5pt 0; }
  ul   { margin:4pt 0 4pt 36pt; padding-left:0; }
  li   { margin:3pt 0; }
  table{ width:100%; border-collapse:collapse; }
  td   { border:none; vertical-align:top; padding:0; }
  hr   { border:none; border-top:1px solid #000; margin:14pt 0; }
  a    { color:#1155cc; }
</style>
</head>
<body>

${courtHtml}

${buildCaptionHtml(payload)}

<h1>DEPOSITION OUTLINE — ${witness.toUpperCase()}</h1>

<p><strong>Search Terms:</strong> ${escHtml(payload.searchTerms || "")}</p>

<p><strong>Who is ${witnessFirst}:</strong></p>
<p>${escHtml(payload.whoIsWitness || "")}</p>

<p><strong>What we want out of this deposition:</strong></p>
<ul>
${whatWeWant.map((item) => `<li>${escHtml(item)}</li>`).join("\n")}
</ul>

<hr>

${buildPrefatoryHtml(payload)}

<hr>

${rulesSection}

<h1 style="text-align:center;text-decoration:underline;">&#9733; TOP DOCUMENTS &amp; MUST-GET ADMISSIONS &#9733;</h1>

${sectionToHtml(payload.topDocuments || "")}

<hr>

${sectionToHtml(payload.topicSections || "")}

<hr>

<h1 style="text-align:center;text-decoration:underline;">WRAP UP</h1>
<ul>
${wrapUpQuestions.map((q) => `<li>${escHtml(q)}</li>`).join("\n")}
</ul>

<hr>

<h1 style="text-align:center;text-decoration:underline;">DOCUMENT INDEX</h1>

<p><strong>Existing Exhibits:</strong></p>
${existingExHtml}

<p><strong>New Exhibits (starting Ex. ${firstNewNum}):</strong></p>
${newExHtml}

${boxFolderUrl ? `<p><em>Box witness folder: <a href="${boxFolderUrl}">${boxFolderUrl}</a></em></p>` : ""}

</body>
</html>`;
}

module.exports = { buildDepoHtml };
