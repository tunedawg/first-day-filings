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

module.exports = {
  copyGoogleDoc,
  createDriveFolder,
  getDriveFile,
  inspectTemplateFile,
  replaceDocTokens,
};
