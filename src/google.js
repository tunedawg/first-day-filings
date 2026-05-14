const GOOGLE_DRIVE_API = "https://www.googleapis.com/drive/v3";
const GOOGLE_DOCS_API = "https://docs.googleapis.com/v1";
const GOOGLE_DOC_MIME_TYPE = "application/vnd.google-apps.document";

function withSharedDriveSupport(url) {
  const nextUrl = new URL(url);
  nextUrl.searchParams.set("supportsAllDrives", "true");
  return nextUrl.toString();
}

async function googleRequest(accessToken, url, options = {}) {
  if (!accessToken) {
    throw new Error("Missing Google access token.");
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google API request failed: ${response.status} ${errorBody}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function createDriveFolder(accessToken, name, parentFolderId) {
  const body = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };

  if (parentFolderId) {
    body.parents = [parentFolderId];
  }

  return googleRequest(accessToken, withSharedDriveSupport(`${GOOGLE_DRIVE_API}/files`), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function getDriveFile(accessToken, fileId) {
  const url = new URL(`${GOOGLE_DRIVE_API}/files/${fileId}`);
  url.searchParams.set("fields", "id,name,mimeType,webViewLink");
  url.searchParams.set("supportsAllDrives", "true");
  return googleRequest(accessToken, url.toString());
}

async function inspectTemplateFile(accessToken, template) {
  try {
    const file = await getDriveFile(accessToken, template.googleTemplateDocId);
    return {
      templateId: template.id,
      title: template.title,
      configuredTemplateDocId: template.googleTemplateDocId,
      fileId: file.id,
      fileName: file.name || "",
      mimeType: file.mimeType || "",
      webViewLink: file.webViewLink || "",
      isNativeGoogleDoc: file.mimeType === GOOGLE_DOC_MIME_TYPE,
      ok: file.mimeType === GOOGLE_DOC_MIME_TYPE,
    };
  } catch (error) {
    return {
      templateId: template.id,
      title: template.title,
      configuredTemplateDocId: template.googleTemplateDocId,
      ok: false,
      error: error.message,
    };
  }
}

async function copyGoogleDoc(accessToken, templateDocId, name, parentFolderId) {
  const templateFile = await getDriveFile(accessToken, templateDocId);
  if (templateFile.mimeType !== GOOGLE_DOC_MIME_TYPE) {
    throw new Error(
      `Template "${templateFile.name || templateDocId}" is not a native Google Doc. ` +
        `Convert it to Google Docs first, then update templates/registry.json. ` +
        `mimeType=${templateFile.mimeType || "unknown"} templateId=${templateDocId}`,
    );
  }

  const body = { name };

  if (parentFolderId) {
    body.parents = [parentFolderId];
  }

  const url = new URL(`${GOOGLE_DRIVE_API}/files/${templateDocId}/copy`);
  url.searchParams.set("fields", "id,name,mimeType,webViewLink");
  url.searchParams.set("supportsAllDrives", "true");

  return googleRequest(accessToken, url.toString(), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function replaceDocTokens(accessToken, documentId, tokenMap) {
  const targetFile = await getDriveFile(accessToken, documentId);
  if (targetFile.mimeType !== GOOGLE_DOC_MIME_TYPE) {
    throw new Error(
      `Generated file "${targetFile.name || documentId}" cannot be edited with the Google Docs API. ` +
        `mimeType=${targetFile.mimeType || "unknown"} documentId=${documentId}`,
    );
  }

  const requests = Object.entries(tokenMap).map(([placeholder, replacementText]) => ({
    replaceAllText: {
      containsText: {
        text: placeholder,
        matchCase: true,
      },
      replaceText: replacementText,
    },
  }));

  return googleRequest(accessToken, `${GOOGLE_DOCS_API}/documents/${documentId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
}

// Replaces a token with multiple items as separate paragraphs using insertText.
// Unlike replaceAllText (which produces soft line breaks inside list paragraphs),
// insertText with \n creates true paragraph breaks that inherit the original
// paragraph's list formatting, giving each item its own numbered/bulleted line.
async function replaceTokenWithParagraphs(accessToken, documentId, token, items, appendPerItem = null) {
  // Replace the token with a unique sentinel so we can find its exact character index.
  // Using replaceAllText here only to locate the position — insertText handles the real content.
  const sentinel = `FDFST${Date.now()}FDFST`;
  const sentinelResult = await googleRequest(
    accessToken,
    `${GOOGLE_DOCS_API}/documents/${documentId}:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            replaceAllText: {
              containsText: { text: token, matchCase: true },
              replaceText: items.length > 0 ? sentinel : "",
            },
          },
        ],
      }),
    },
  );

  // If the token wasn't in this document, nothing more to do
  const replaced = sentinelResult?.replies?.[0]?.replaceAllText?.occurrencesChanged ?? 0;
  if (replaced === 0 || items.length === 0) return;

  function collectSpans(content) {
    const result = [];
    for (const el of content || []) {
      for (const pe of el.paragraph?.elements || []) {
        if (pe.textRun?.content) result.push({ text: pe.textRun.content, start: pe.startIndex });
      }
      for (const row of el.table?.tableRows || []) {
        for (const cell of row.tableCells || []) {
          result.push(...collectSpans(cell.content));
        }
      }
    }
    return result;
  }

  // Build expanded items: each appendPerItem gets its own paragraph (\n), so Google Docs
  // creates a real paragraph break. appendPerItem paragraphs will have deleteParagraphBullets
  // applied so they don't get a list number, and updateParagraphStyle to match the template's
  // own indentation for that label (captured from the template doc on first occurrence).
  const expandedItems = appendPerItem
    ? items.flatMap((item, i) => i < items.length - 1 ? [item, appendPerItem] : [item])
    : [...items];
  const insertedText = expandedItems.join("\n");

  let templateAppendStyle = null;

  // Loop: the token may appear multiple times in the template (e.g. same block token
  // used under several numbered RFPs). replaceAllText replaced ALL occurrences with
  // the sentinel — process each one in turn until none remain.
  for (let occurrence = 0; occurrence < replaced; occurrence++) {
    const doc = await googleRequest(accessToken, `${GOOGLE_DOCS_API}/documents/${documentId}`);

    // On first occurrence, scan for an existing appendPerItem paragraph in the template
    // to capture its indentation style (so inserted labels match template formatting).
    if (appendPerItem && !templateAppendStyle) {
      for (const el of doc.body?.content || []) {
        if (!el.paragraph) continue;
        const text = (el.paragraph.elements || [])
          .map((e) => e.textRun?.content || "").join("").trim();
        if (text === appendPerItem) {
          templateAppendStyle = el.paragraph.paragraphStyle || {};
          break;
        }
      }
    }

    let combinedText = "";
    const docIndices = [];
    for (const span of collectSpans(doc.body?.content)) {
      for (let i = 0; i < span.text.length; i++) {
        docIndices.push(span.start + i);
      }
      combinedText += span.text;
    }

    const sentinelIdx = combinedText.indexOf(sentinel);
    if (sentinelIdx === -1) break;

    const sentinelStart = docIndices[sentinelIdx];
    const sentinelEnd = docIndices[sentinelIdx + sentinel.length - 1] + 1;

    await googleRequest(accessToken, `${GOOGLE_DOCS_API}/documents/${documentId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            deleteContentRange: {
              range: { startIndex: sentinelStart, endIndex: sentinelEnd },
            },
          },
          {
            insertText: {
              location: { index: sentinelStart },
              text: insertedText,
            },
          },
        ],
      }),
    });

    if (appendPerItem) {
      // Calculate the character ranges of each appendPerItem paragraph in the inserted text.
      const appendRanges = [];
      let pos = sentinelStart;
      for (const item of expandedItems) {
        if (item === appendPerItem) {
          appendRanges.push({ startIndex: pos, endIndex: pos + item.length });
        }
        pos += item.length + 1; // +1 for the \n paragraph separator
      }

      if (appendRanges.length > 0) {
        await googleRequest(accessToken, `${GOOGLE_DOCS_API}/documents/${documentId}:batchUpdate`, {
          method: "POST",
          body: JSON.stringify({
            requests: appendRanges.flatMap((range) => [
              // Remove list bullet so this paragraph gets no number
              { deleteParagraphBullets: { range } },
              // Bold the label text
              { updateTextStyle: { range, textStyle: { bold: true }, fields: "bold" } },
              // Always add spacing above/below; also copy template indent if captured.
              // Template likely uses blank paragraphs for spacing (spaceAbove=0 there),
              // so we set explicit 12pt spacing to avoid a blank numbered list item.
              {
                updateParagraphStyle: {
                  range,
                  paragraphStyle: {
                    ...(templateAppendStyle || {}),
                    spaceAbove: { magnitude: 12, unit: "PT" },
                    spaceBelow: { magnitude: 12, unit: "PT" },
                  },
                  fields: templateAppendStyle
                    ? "indentFirstLine,indentStart,spaceAbove,spaceBelow"
                    : "spaceAbove,spaceBelow",
                },
              },
            ]),
          }),
        });
      }
    }
  } // end for-loop over occurrences
}

// One-time migration: replaces hardcoded she/her/Ms. in template docs with pronoun tokens.
// Safe because in these discovery templates all female pronouns refer to the plaintiff.
async function fixPronounTokensInDoc(accessToken, template) {
  const replacements = [
    // Reflexive first (contains "her" as prefix, must go before "her " patterns)
    { text: "Herself", to: "{{plaintiffReflexivePronoun}}" },
    { text: "herself", to: "{{plaintiffReflexivePronoun}}" },
    // Possessive: "her " or "Her " directly before a noun (space-terminated)
    { text: "Her ", to: "{{plaintiffPossessivePronoun}} " },
    { text: "her ", to: "{{plaintiffPossessivePronoun}} " },
    // Object: "her" at end of clause (followed by punctuation)
    { text: "Her.", to: "{{plaintiffObjectPronoun}}." },
    { text: "her.", to: "{{plaintiffObjectPronoun}}." },
    { text: "Her,", to: "{{plaintiffObjectPronoun}}," },
    { text: "her,", to: "{{plaintiffObjectPronoun}}," },
    { text: "Her;", to: "{{plaintiffObjectPronoun}};" },
    { text: "her;", to: "{{plaintiffObjectPronoun}};" },
    // Subject pronoun
    { text: "She ", to: "{{plaintiffSubjectPronoun}} " },
    { text: "she ", to: "{{plaintiffSubjectPronoun}} " },
    // Title
    { text: "Ms.", to: "{{plaintiffTitle}}" },
  ];

  const requests = replacements.map(({ text, to }) => ({
    replaceAllText: {
      containsText: { text, matchCase: true },
      replaceText: to,
    },
  }));

  try {
    const result = await googleRequest(
      accessToken,
      `${GOOGLE_DOCS_API}/documents/${template.googleTemplateDocId}:batchUpdate`,
      { method: "POST", body: JSON.stringify({ requests }) },
    );

    const changes = (result?.replies || [])
      .map((reply, i) => ({
        from: replacements[i].text,
        to: replacements[i].to,
        count: reply.replaceAllText?.occurrencesChanged ?? 0,
      }))
      .filter((c) => c.count > 0);

    return { templateId: template.id, title: template.title, ok: true, changes };
  } catch (error) {
    return { templateId: template.id, title: template.title, ok: false, error: error.message };
  }
}

async function exportGoogleDocAs(accessToken, docId, exportMimeType) {
  if (!accessToken) throw new Error("Missing Google access token.");
  const url = `${GOOGLE_DRIVE_API}/files/${encodeURIComponent(docId)}/export?mimeType=${encodeURIComponent(exportMimeType)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google export failed: ${res.status} ${body}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function uploadFileToDrive(accessToken, name, mimeType, buffer, parentFolderId) {
  if (!accessToken) throw new Error("Missing Google access token.");
  const metadata = { name, mimeType };
  if (parentFolderId) metadata.parents = [parentFolderId];

  const boundary = `fdf_${Date.now()}`;
  const metaPart = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    "utf8",
  );
  const dataPart = Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`, "utf8");
  const closePart = Buffer.from(`\r\n--${boundary}--`, "utf8");
  const body = Buffer.concat([metaPart, dataPart, buffer, closePart]);

  const url = `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary="${boundary}"`,
    },
    body,
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Drive upload failed: ${res.status} ${errBody}`);
  }
  return res.json();
}

async function deleteFile(accessToken, fileId) {
  if (!accessToken) return;
  try {
    await fetch(`${GOOGLE_DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (_) { /* best-effort cleanup */ }
}

// ── Post-generation petition formatting ───────────────────────────────────────
// Applies rich formatting that replaceAllText cannot: bold defendant names,
// indent addresses, underline COUNT I/II, center count headers, double-space
// counts/prayer, right-align signature, italic attorney-for line, remove
// double list bullets.

function _collectParas(content, inTable = false) {
  const out = [];
  for (const el of content || []) {
    if (el.paragraph) {
      const text = (el.paragraph.elements || []).map((e) => e.textRun?.content || "").join("").replace(/\n$/, "");
      out.push({ text, startIndex: el.startIndex, endIndex: el.endIndex, inTable });
    }
    for (const row of el.table?.tableRows || []) {
      for (const cell of row.tableCells || []) {
        out.push(..._collectParas(cell.content, true));
      }
    }
  }
  return out;
}

function _ts(startIndex, endIndex, style) {
  return { updateTextStyle: { range: { startIndex, endIndex }, textStyle: style, fields: Object.keys(style).join(",") } };
}

function _ps(startIndex, endIndex, style) {
  return { updateParagraphStyle: { range: { startIndex, endIndex }, paragraphStyle: style, fields: Object.keys(style).join(",") } };
}

function _isCountSubHeader(text) {
  if (/^VIOLATION OF THE/.test(text)) return true;
  if (/^DISCRIMINATION FOR EXERCISE/.test(text)) return true;
  if (/^PUBLIC EMPLOYEE WHISTLEBLOWER/.test(text)) return true;
  if (/^RSMo\s/.test(text)) return true;
  if (/^(RACE|COLOR|SEX|AGE|DISABILITY) DISCRIMINATION$/.test(text)) return true;
  if (/^RETALIATION$/.test(text)) return true;
  if (/^WHISTLEBLOWER'?S? PROTECTION/.test(text)) return true;
  if (/^\(Against All Defendants\)/.test(text)) return true;
  return false;
}

async function formatPetitionDoc(accessToken, docId) {
  const doc = await googleRequest(accessToken, `${GOOGLE_DOCS_API}/documents/${docId}`);
  const paras = _collectParas(doc.body?.content || []);
  const requests = [];

  let inServeBlock = false;
  let inCountsSection = false;
  let inPrayerSection = false;
  let inFirmCareOf = 0; // countdown: lines of care-of address remaining

  for (let i = 0; i < paras.length; i++) {
    const { text, startIndex, endIndex } = paras[i];
    const tEnd = endIndex - 1; // exclude the trailing \n from text-style ranges

    if (!text.trim()) { inServeBlock = false; continue; }

    // ── Firm care-of address (caption plaintiff service address) → compact ────
    if (/^c\/o /i.test(text) || inFirmCareOf > 0) {
      if (/^c\/o /i.test(text)) inFirmCareOf = 2; else inFirmCareOf--;
      requests.push(_ps(startIndex, endIndex, {
        lineSpacing: 115,
        spaceAbove: { magnitude: 0, unit: "PT" },
        spaceBelow: { magnitude: 0, unit: "PT" },
      }));
      continue;
    }

    // ── COUNT I / II / III … → bold + underline + center + single-spaced ─────
    if (/^COUNT\s+[IVXLCDM]+$/.test(text)) {
      requests.push(_ts(startIndex, tEnd, { bold: true, underline: true }));
      requests.push(_ps(startIndex, endIndex, { alignment: "CENTER", lineSpacing: 115,
        spaceAbove: { magnitude: 0, unit: "PT" }, spaceBelow: { magnitude: 0, unit: "PT" } }));
      inCountsSection = true;
      inServeBlock = false;
      continue;
    }

    // ── Count sub-headers (VIOLATION OF…, RSMo…, (Against All Defendants)) ───
    if (_isCountSubHeader(text)) {
      requests.push(_ts(startIndex, tEnd, { bold: true }));
      requests.push(_ps(startIndex, endIndex, { alignment: "CENTER", lineSpacing: 115,
        spaceAbove: { magnitude: 0, unit: "PT" }, spaceBelow: { magnitude: 0, unit: "PT" } }));
      continue;
    }

    // ── DEMAND FOR A JURY TRIAL ───────────────────────────────────────────────
    if (text === "DEMAND FOR A JURY TRIAL") {
      requests.push(_ts(startIndex, tEnd, { bold: true, underline: true }));
      requests.push(_ps(startIndex, endIndex, { alignment: "CENTER", lineSpacing: 115 }));
      continue;
    }

    // ── PRAYER FOR RELIEF heading ─────────────────────────────────────────────
    if (text === "PRAYER FOR RELIEF") {
      requests.push(_ts(startIndex, tEnd, { bold: true, underline: true }));
      requests.push(_ps(startIndex, endIndex, { alignment: "CENTER", lineSpacing: 115 }));
      continue;
    }

    // ── Attorneys for Plaintiff line → italic ─────────────────────────────────
    if (/^Attorneys for Plaintiff/.test(text)) {
      requests.push(_ts(startIndex, tEnd, { italic: true }));
      continue;
    }

    // ── Defendant caption names: ALL CAPS ending with semicolon ─────────────
    if (/^[A-Z][A-Z0-9\s,.'&()/#-]+;$/.test(text)) {
      requests.push(_ts(startIndex, tEnd, { bold: true }));
      inServeBlock = true;
      continue;
    }

    // ── Serve label + address lines → indent 0.5in, 1.15 spacing, no gaps ────
    // Detect both via inServeBlock state AND by explicit "Serve at:"/"Serve RA:"
    // pattern so a blank line between defendant name and label doesn't break it.
    const isServeLabel = /^Serve (at|RA):/i.test(text);
    if (inServeBlock || isServeLabel) {
      if (isServeLabel) inServeBlock = true;
      requests.push(_ts(startIndex, tEnd, { bold: false }));
      requests.push(_ps(startIndex, endIndex, {
        lineSpacing: 115,
        spaceAbove: { magnitude: 0, unit: "PT" },
        spaceBelow: { magnitude: 0, unit: "PT" },
        indentStart: { magnitude: 36, unit: "PT" },
        indentFirstLine: { magnitude: 0, unit: "PT" },
      }));
      continue;
    }

    // ── Prayer intro line ─────────────────────────────────────────────────────
    if (/^Plaintiff respectfully prays/.test(text)) {
      inPrayerSection = true;
      inCountsSection = false;
      requests.push(_ps(startIndex, endIndex, { lineSpacing: 200 }));
      continue;
    }

    // ── Numbered body paragraphs (facts, count bodies, prayer items) ──────────
    if (/^\d+[\.\t]/.test(text)) {
      requests.push({ deleteParagraphBullets: { range: { startIndex, endIndex } } });
      const numStyle = {
        alignment: "START",
        indentFirstLine: { magnitude: 36, unit: "PT" },
        indentStart: { magnitude: 0, unit: "PT" },
      };
      if (inCountsSection) numStyle.lineSpacing = 200;
      else if (inPrayerSection) numStyle.lineSpacing = 200;
      requests.push(_ps(startIndex, endIndex, numStyle));
      inServeBlock = false;
      continue;
    }

    // ── Jury demand body paragraph ────────────────────────────────────────────
    if (/respectfully demands a jury trial/.test(text)) {
      requests.push(_ps(startIndex, endIndex, { alignment: "START", lineSpacing: 200 }));
      continue;
    }
  }

  if (requests.length === 0) return;
  await googleRequest(accessToken, `${GOOGLE_DOCS_API}/documents/${docId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
}

module.exports = {
  copyGoogleDoc,
  createDriveFolder,
  deleteFile,
  exportGoogleDocAs,
  fixPronounTokensInDoc,
  formatPetitionDoc,
  getDriveFile,
  inspectTemplateFile,
  replaceDocTokens,
  replaceTokenWithParagraphs,
  uploadFileToDrive,
};
