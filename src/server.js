try { require("dotenv").config({ path: require("node:path").join(__dirname, "..", ".env") }); } catch (_) {}
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const {
  buildAuthSessionPayload,
  buildGoogleAuthUrl,
  destroySession,
  finalizeGoogleLogin,
  getOrCreateSession,
  getServiceAccountToken,
  getSessionFromRequest,
  getValidAccessToken,
} = require("./auth");
const { extractCaseContext } = require("./extractor");
const { getSupabaseAdmin, getUserFromRequest } = require("./supabaseClient");
const { buildDocumentName, buildMatterFolderName, setAttorneyDirectory, validateSelections } = require("./generator");
const { createDriveFolder, copyGoogleDoc, deleteFile, exportGoogleDocAs, fixPronounTokensInDoc, inspectTemplateFile, replaceDocTokens, replaceTokenWithParagraphs, uploadFileToDrive } = require("./google");
const { getQuestionnaire, getTemplateRegistry } = require("./templateRegistry");

const PORT = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, "..", "public");

// Temporary in-memory store for generated files (email-only users).
// Each entry: { buffer, mimeType, filename, createdAt }. Expires after 1 hour.
const pendingDownloads = new Map();
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [key, entry] of pendingDownloads) {
    if (entry.createdAt < cutoff) pendingDownloads.delete(key);
  }
}, 5 * 60 * 1000).unref();

// HTML pages that need per-page HTML files in /public; auth enforcement is client-side via nav.js.
const PROTECTED_PATHS = new Set(["/dashboard", "/onboarding", "/settings/firm"]);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

function injectConfig(html, request) {
  const proto = request.headers["x-forwarded-proto"] || "http";
  const host = request.headers["x-forwarded-host"] || request.headers.host || `localhost:${PORT}`;
  const siteUrl = `${proto}://${host}`;
  return html
    .replace(/\{\{SITE_URL\}\}/g, siteUrl)
    .replace(/\{\{SUPABASE_URL\}\}/g, process.env.SUPABASE_URL || "")
    .replace(/\{\{SUPABASE_ANON_KEY\}\}/g, process.env.SUPABASE_ANON_KEY || "");
}

function serveHtml(response, filePath, request) {
  if (!fs.existsSync(filePath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  const html = injectConfig(fs.readFileSync(filePath, "utf8"), request);
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  });
  response.end(html);
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

const EXPORT_FORMATS = {
  pdf: { mimeType: "application/pdf", ext: ".pdf" },
  word: { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: ".docx" },
};

async function handleGenerate(request, response, body) {
  setAttorneyDirectory(body.attorneys || []);
  const intake = body.intake || {};
  const format = EXPORT_FORMATS[body.format] ? body.format : "docs";
  const selectedTemplateIds =
    Array.isArray(body.selectedTemplateIds) && body.selectedTemplateIds.length > 0
      ? body.selectedTemplateIds
      : getTemplateRegistry().documents.map((document) => document.id);
  const { issues, selectedTemplates, tokenMap, listTokens } = validateSelections(selectedTemplateIds, intake);

  if (issues.length > 0) {
    sendJson(response, 400, { ok: false, issues });
    return;
  }

  // Try the user's personal Google session; fall back to server service account.
  const session = getSessionFromRequest(request);
  let accessToken;
  let useServiceAccount = false;
  try {
    accessToken = await getValidAccessToken(session);
  } catch {
    accessToken = await getServiceAccountToken();
    useServiceAccount = true;
  }

  // Service-account path: export files as buffers, serve via /api/download/:key.
  if (useServiceAccount) {
    if (format === "docs") {
      sendJson(response, 400, { ok: false, issues: ["Google Docs output requires signing in with Google. Please select PDF or Word format."] });
      return;
    }
    const { mimeType, ext } = EXPORT_FORMATS[format];
    const matterName = buildMatterFolderName(intake);
    const createdDocuments = [];

    for (const template of selectedTemplates) {
      const documentName = buildDocumentName(template, intake);
      let copiedDoc;
      try {
        copiedDoc = await copyGoogleDoc(accessToken, template.googleTemplateDocId, documentName, null);
        await replaceDocTokens(accessToken, copiedDoc.id, tokenMap);
        for (const [token, value] of Object.entries(listTokens)) {
          const items = Array.isArray(value) ? value : value.items;
          const appendPerItem = Array.isArray(value) ? null : (value.appendPerItem || null);
          await replaceTokenWithParagraphs(accessToken, copiedDoc.id, token, items, appendPerItem);
        }
        const buffer = await exportGoogleDocAs(accessToken, copiedDoc.id, mimeType);
        await deleteFile(accessToken, copiedDoc.id).catch(() => {});

        const key = crypto.randomUUID();
        pendingDownloads.set(key, { buffer, mimeType, filename: documentName + ext, createdAt: Date.now() });
        createdDocuments.push({ id: key, name: documentName + ext, url: `/api/download/${key}`, templateId: template.id });
      } catch (error) {
        if (copiedDoc?.id) await deleteFile(accessToken, copiedDoc.id).catch(() => {});
        throw new Error(`Template "${template.title}" failed. ${error.message} (templateId=${template.googleTemplateDocId})`);
      }
    }

    sendJson(response, 200, {
      ok: true,
      folder: { id: null, name: matterName, url: null },
      documents: createdDocuments,
    });
    return;
  }

  // Google-user path: create Drive folder, generate docs in the user's Drive.
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

      if (format !== "docs") {
        const { mimeType, ext } = EXPORT_FORMATS[format];
        const buffer = await exportGoogleDocAs(accessToken, copiedDoc.id, mimeType);
        const exported = await uploadFileToDrive(accessToken, documentName + ext, mimeType, buffer, folder.id);
        await deleteFile(accessToken, copiedDoc.id);
        createdDocuments.push({
          id: exported.id,
          name: exported.name || documentName + ext,
          url: `https://drive.google.com/file/d/${exported.id}/view`,
          templateId: template.id,
        });
      } else {
        createdDocuments.push({
          id: copiedDoc.id,
          name: copiedDoc.name || documentName,
          url: `https://docs.google.com/document/d/${copiedDoc.id}/edit`,
          templateId: template.id,
        });
      }
    } catch (error) {
      throw new Error(
        `Template "${template.title}" failed. ${error.message} ` +
          `(templateId=${template.googleTemplateDocId})`,
      );
    }
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

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

async function handleOnboarding(response, user, body) {
  const { firm, profile, attorneys } = body;

  if (!firm?.name) {
    sendJson(response, 400, { ok: false, error: "Firm name is required." });
    return;
  }

  const admin = getSupabaseAdmin();

  // Check user doesn't already have a profile (idempotency guard).
  const { data: existing } = await admin.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
  if (existing?.organization_id) {
    sendJson(response, 200, { ok: true, alreadyOnboarded: true });
    return;
  }

  const slug = slugify(firm.name);

  // Create organization.
  const { data: org, error: orgErr } = await admin.from("organizations").insert({
    name: firm.name,
    slug,
    phone: firm.phone || null,
    address: firm.address || null,
    state: firm.state || "Missouri",
    practice_area: firm.practice_area || "Employment Litigation",
  }).select("id").single();

  if (orgErr) {
    sendJson(response, 500, { ok: false, error: orgErr.message });
    return;
  }

  // Create profile for the signing-up user.
  const { error: profileErr } = await admin.from("profiles").upsert({
    id: user.id,
    organization_id: org.id,
    full_name: profile?.full_name || user.user_metadata?.full_name || user.email,
    role: "admin",
  });

  if (profileErr) {
    sendJson(response, 500, { ok: false, error: profileErr.message });
    return;
  }

  // Create attorney records.
  const attorneyRows = (attorneys || []).filter((a) => a.full_name && a.bar_number).map((a) => ({
    organization_id: org.id,
    full_name: a.full_name,
    bar_number: a.bar_number,
    email: a.email || null,
    role: a.role || "attorney",
  }));

  if (attorneyRows.length > 0) {
    const { error: attErr } = await admin.from("attorneys").insert(attorneyRows);
    if (attErr) {
      sendJson(response, 500, { ok: false, error: attErr.message });
      return;
    }
  }

  sendJson(response, 200, { ok: true, organizationId: org.id });
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

    if (request.method === "GET" && requestUrl.pathname.startsWith("/api/download/")) {
      const key = requestUrl.pathname.slice("/api/download/".length);
      const entry = pendingDownloads.get(key);
      if (!entry) { sendJson(response, 404, { ok: false, error: "Download not found or expired." }); return; }
      pendingDownloads.delete(key);
      const safeFilename = entry.filename.replace(/[^\w.\-]/g, "_");
      response.writeHead(200, {
        "Content-Type": entry.mimeType,
        "Content-Disposition": `attachment; filename="${safeFilename}"`,
        "Content-Length": entry.buffer.length,
        "Cache-Control": "no-store",
      });
      response.end(entry.buffer);
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

    if (request.method === "GET" && requestUrl.pathname === "/api/org-users") {
      const user = await getUserFromRequest(request);
      if (!user) { sendJson(response, 401, { ok: false, error: "Unauthorized" }); return; }
      const admin = getSupabaseAdmin();
      const { data: profile } = await admin.from("profiles").select("organization_id, role").eq("id", user.id).maybeSingle();
      if (!profile?.organization_id) { sendJson(response, 403, { ok: false, error: "No organization." }); return; }
      const { data: profiles } = await admin.from("profiles").select("id, full_name, role, created_at").eq("organization_id", profile.organization_id).order("created_at");
      const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const emailMap = {};
      (authUsers || []).forEach((u) => { emailMap[u.id] = u.email; });
      const result = (profiles || []).map((p) => ({ ...p, email: emailMap[p.id] || null }));
      sendJson(response, 200, { ok: true, users: result });
      return;
    }

    if (request.method === "PATCH" && /^\/api\/org-users\/[^/]+$/.test(requestUrl.pathname)) {
      const user = await getUserFromRequest(request);
      if (!user) { sendJson(response, 401, { ok: false, error: "Unauthorized" }); return; }
      const admin = getSupabaseAdmin();
      const { data: myProfile } = await admin.from("profiles").select("organization_id, role").eq("id", user.id).maybeSingle();
      if (!myProfile?.organization_id || myProfile.role !== "admin") { sendJson(response, 403, { ok: false, error: "Admin only." }); return; }
      const targetId = requestUrl.pathname.split("/").pop();
      const body = await collectRequestBody(request);
      const { data: target } = await admin.from("profiles").select("organization_id").eq("id", targetId).maybeSingle();
      if (!target || target.organization_id !== myProfile.organization_id) { sendJson(response, 404, { ok: false, error: "User not found in your organization." }); return; }
      const { error } = await admin.from("profiles").update({ role: body.role }).eq("id", targetId);
      if (error) { sendJson(response, 500, { ok: false, error: error.message }); return; }
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/invite") {
      const user = await getUserFromRequest(request);
      if (!user) { sendJson(response, 401, { ok: false, error: "Unauthorized" }); return; }
      const admin = getSupabaseAdmin();
      const { data: myProfile } = await admin.from("profiles").select("organization_id, role").eq("id", user.id).maybeSingle();
      if (!myProfile?.organization_id || myProfile.role !== "admin") { sendJson(response, 403, { ok: false, error: "Admin only." }); return; }
      const body = await collectRequestBody(request);
      if (!body.email) { sendJson(response, 400, { ok: false, error: "Email is required." }); return; }
      const proto = request.headers["x-forwarded-proto"] || "http";
      const host = request.headers["x-forwarded-host"] || request.headers.host || `localhost:${PORT}`;
      const redirectTo = `${proto}://${host}/auth/callback`;
      const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(body.email, { redirectTo });
      if (inviteErr) { sendJson(response, 500, { ok: false, error: inviteErr.message }); return; }
      const invitedUserId = inviteData.user.id;
      await admin.from("profiles").upsert({
        id: invitedUserId,
        organization_id: myProfile.organization_id,
        full_name: body.email.split("@")[0],
        role: body.role || "attorney",
      }, { onConflict: "id" });
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/attorneys") {
      const user = await getUserFromRequest(request);
      if (!user) { sendJson(response, 401, { ok: false, error: "Unauthorized" }); return; }
      const { data: profile } = await getSupabaseAdmin().from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
      if (!profile?.organization_id) { sendJson(response, 200, { ok: true, attorneys: [] }); return; }
      const { data: attorneys } = await getSupabaseAdmin().from("attorneys").select("id, full_name, bar_number, email, role, sort_order").eq("organization_id", profile.organization_id).eq("is_active", true).order("sort_order", { ascending: true, nullsFirst: false }).order("full_name");
      sendJson(response, 200, { ok: true, attorneys: attorneys || [] });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/onboarding") {
      const user = await getUserFromRequest(request);
      if (!user) { sendJson(response, 401, { ok: false, error: "Unauthorized" }); return; }
      const body = await collectRequestBody(request);
      await handleOnboarding(response, user, body);
      return;
    }

    if (request.method === "GET") {
      const { pathname } = requestUrl;

      // Serve auth callback page (OAuth code exchange happens client-side via Supabase JS).
      if (pathname === "/auth/callback") {
        serveHtml(response, path.join(publicDir, "auth-callback.html"), request);
        return;
      }

      // Serve login page.
      if (pathname === "/login") {
        serveHtml(response, path.join(publicDir, "login.html"), request);
        return;
      }

      // Protected HTML pages — serve them; client-side nav.js will redirect if no session.
      if (PROTECTED_PATHS.has(pathname)) {
        const pageName = pathname.replace(/^\//, "").replace(/\//g, "-");
        const htmlFile = path.join(publicDir, `${pageName}.html`);
        serveHtml(response, htmlFile, request);
        return;
      }

      // Main app (root).
      const requestPath = pathname === "/" ? "/index.html" : pathname;
      const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
      const filePath = path.join(publicDir, safePath);

      if (path.extname(filePath) === ".html" || pathname === "/") {
        serveHtml(response, filePath, request);
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
