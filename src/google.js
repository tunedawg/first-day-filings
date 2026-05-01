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
async function replaceTokenWithParagraphs(accessToken, documentId, token, items) {
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

  // Locate the sentinel's exact character index in the document body
  const doc = await googleRequest(
    accessToken,
    `${GOOGLE_DOCS_API}/documents/${documentId}?fields=body(content(paragraph(elements(startIndex,endIndex,textRun(content)))))`,
  );

  let sentinelStart = null;
  let sentinelEnd = null;

  outer: for (const bodyEl of doc.body?.content || []) {
    for (const pe of bodyEl.paragraph?.elements || []) {
      const text = pe.textRun?.content || "";
      const idx = text.indexOf(sentinel);
      if (idx !== -1) {
        sentinelStart = pe.startIndex + idx;
        sentinelEnd = sentinelStart + sentinel.length;
        break outer;
      }
    }
  }

  if (sentinelStart === null) return;

  // Delete the sentinel then insert items joined with \n as a single batchUpdate.
  // insertText with \n creates true paragraph breaks (inheriting list formatting),
  // whereas replaceAllText in this context only creates soft line breaks.
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
            text: items.join("\n"),
          },
        },
      ],
    }),
  });
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

module.exports = {
  copyGoogleDoc,
  createDriveFolder,
  fixPronounTokensInDoc,
  getDriveFile,
  inspectTemplateFile,
  replaceDocTokens,
  replaceTokenWithParagraphs,
};
