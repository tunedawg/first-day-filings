try { require("dotenv").config({ path: require("node:path").join(__dirname, "..", ".env") }); } catch (_) {}
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const {
  buildAuthSessionPayload,
  buildGoogleAuthUrl,
  destroySession,
  finalizeGoogleLogin,
  getOrCreateSession,
  getSessionFromRequest,
  getValidAccessToken,
} = require("./auth");
const { extractCaseContext } = require("./extractor");
const { buildDocumentName, buildMatterFolderName, validateSelections } = require("./generator");
const { createDriveFolder, copyGoogleDoc, fixPronounTokensInDoc, inspectTemplateFile, replaceDocTokens, replaceTokenWithParagraphs } = require("./google");
const { getQuestionnaire, getTemplateRegistry } = require("./templateRegistry");

const PORT = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, "..", "public");

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

function redirect(response, location) {
  response.writeHead(302, { Location: location });
  response.end();
}

function sendFile(response, filePath) {
  const extension = path.extname(filePath);
  const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
  };

  if (!fs.existsSync(filePath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentTypes[extension] || "text/plain; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  });
  fs.createReadStream(filePath).pipe(response);
}

function collectRequestBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = "";

    request.on("data", (chunk) => {
      rawBody += chunk.toString("utf8");
    });

    request.on("end", () => {
      try {
        resolve(rawBody ? JSON.parse(rawBody) : {});
      } catch (error) {
        reject(new Error("Request body must be valid JSON."));
      }
    });

    request.on("error", reject);
  });
}

async function handleGenerate(request, response, body) {
  const intake = body.intake || {};
  const selectedTemplateIds =
    Array.isArray(body.selectedTemplateIds) && body.selectedTemplateIds.length > 0
      ? body.selectedTemplateIds
      : getTemplateRegistry().documents.map((document) => document.id);
  const { issues, selectedTemplates, tokenMap, listTokens } = validateSelections(selectedTemplateIds, intake);

  if (issues.length > 0) {
    sendJson(response, 400, { ok: false, issues });
    return;
  }

  const session = getSessionFromRequest(request);
  const accessToken = await getValidAccessToken(session);
  const folder = await createDriveFolder(accessToken, buildMatterFolderName(intake), intake.parentFolderId);
  const createdDocuments = [];

  for (const template of selectedTemplates) {
    const documentName = buildDocumentName(template, intake);
    let copiedDoc;

    try {
      copiedDoc = await copyGoogleDoc(accessToken, template.googleTemplateDocId, documentName, folder.id);
      await replaceDocTokens(accessToken, copiedDoc.id, tokenMap);
      for (const [token, value] of Object.entries(listTokens)) {
        const items = Array.isArray(value) ? value : value.items;
        const appendPerItem = Array.isArray(value) ? null : (value.appendPerItem || null);
        await replaceTokenWithParagraphs(accessToken, copiedDoc.id, token, items, appendPerItem);
      }
    } catch (error) {
      throw new Error(
        `Template "${template.title}" failed. ${error.message} ` +
          `(templateId=${template.googleTemplateDocId})`,
      );
    }

    createdDocuments.push({
      id: copiedDoc.id,
      name: copiedDoc.name || documentName,
      url: `https://docs.google.com/document/d/${copiedDoc.id}/edit`,
      templateId: template.id,
    });
  }

  sendJson(response, 200, {
    ok: true,
    folder: {
      id: folder.id,
      name: folder.name || intake.matterFolderName,
      url: `https://drive.google.com/drive/folders/${folder.id}`,
    },
    documents: createdDocuments,
  });
}

async function handleExtract(response, body) {
  const payload = await extractCaseContext(body.files || []);
  sendJson(response, 200, payload);
}

async function handleValidateTemplates(request, response, body) {
  const selectedTemplateIds =
    Array.isArray(body.selectedTemplateIds) && body.selectedTemplateIds.length > 0
      ? body.selectedTemplateIds
      : getTemplateRegistry().documents.map((document) => document.id);
  const registry = getTemplateRegistry();
  const selectedTemplates = registry.documents.filter((document) =>
    selectedTemplateIds.includes(document.id),
  );

  if (selectedTemplates.length === 0) {
    sendJson(response, 400, {
      ok: false,
      issues: ["Select at least one filing before validating template IDs."],
    });
    return;
  }

  const session = getSessionFromRequest(request);
  const accessToken = await getValidAccessToken(session);
  const results = await Promise.all(
    selectedTemplates.map((template) => inspectTemplateFile(accessToken, template)),
  );

  const invalidTemplates = results.filter((item) => !item.ok);
  sendJson(response, 200, {
    ok: invalidTemplates.length === 0,
    summary: {
      checked: results.length,
      valid: results.length - invalidTemplates.length,
      invalid: invalidTemplates.length,
    },
    templates: results,
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host || `localhost:${PORT}`}`);

    if (request.method === "GET" && requestUrl.pathname === "/api/questionnaire") {
      sendJson(response, 200, getQuestionnaire());
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/templates") {
      sendJson(response, 200, getTemplateRegistry());
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/auth/session") {
      sendJson(response, 200, buildAuthSessionPayload(request));
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/auth/google") {
      const session = getOrCreateSession(request, response);
      redirect(response, buildGoogleAuthUrl(session));
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/auth/google/callback") {
      const session = getSessionFromRequest(request);
      const state = requestUrl.searchParams.get("state");
      const code = requestUrl.searchParams.get("code");
      const googleError = requestUrl.searchParams.get("error");

      if (googleError) {
        redirect(response, `/?authError=${encodeURIComponent(googleError)}`);
        return;
      }

      if (!session || !session.oauthState || session.oauthState !== state || !code) {
        redirect(response, "/?authError=invalid_oauth_state");
        return;
      }

      await finalizeGoogleLogin(session, code);
      redirect(response, "/");
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/auth/logout") {
      destroySession(request, response);
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/generate") {
      const body = await collectRequestBody(request);
      await handleGenerate(request, response, body);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/admin/fix-pronoun-tokens") {
      const session = getSessionFromRequest(request);
      const accessToken = await getValidAccessToken(session);
      const registry = getTemplateRegistry();
      const results = await Promise.all(
        registry.documents.map((template) => fixPronounTokensInDoc(accessToken, template)),
      );
      sendJson(response, 200, { ok: true, results });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/templates/validate") {
      const body = await collectRequestBody(request);
      await handleValidateTemplates(request, response, body);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/extract") {
      const body = await collectRequestBody(request);
      await handleExtract(response, body);
      return;
    }

    if (request.method === "GET") {
      const requestPath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
      const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
      const filePath = path.join(publicDir, safePath);

      if (requestUrl.pathname === "/" && fs.existsSync(filePath)) {
        const proto = request.headers["x-forwarded-proto"] || "http";
        const host = request.headers["x-forwarded-host"] || request.headers.host || `localhost:${PORT}`;
        const siteUrl = `${proto}://${host}`;
        const html = fs.readFileSync(filePath, "utf8").replace(/\{\{SITE_URL\}\}/g, siteUrl);
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", Pragma: "no-cache", Expires: "0" });
        response.end(html);
        return;
      }

      sendFile(response, filePath);
      return;
    }

    sendJson(response, 404, { ok: false, error: "Route not found." });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error.message,
    });
  }
});

server.listen(PORT, () => {
  console.log(`First Day Filings running at http://localhost:${PORT}`);
});
