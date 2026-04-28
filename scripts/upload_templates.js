/**
 * upload_templates.js
 *
 * Uploads the tokenized DOCX templates from final-docx-masters-v2-tokenized/
 * to Google Drive as native Google Docs (preserving all formatting), then
 * prints the resulting Google Doc IDs ready to paste into registry.json.
 *
 * Prerequisites:
 *   1. Run `python scripts/tokenize_templates.py` first.
 *   2. Add http://localhost:3002/callback to your Google OAuth client's
 *      authorized redirect URIs in Google Cloud Console.
 *
 * Usage:
 *   node scripts/upload_templates.js
 *   TEMPLATES_PARENT_FOLDER_ID=<Drive folder ID> node scripts/upload_templates.js
 */

require("dotenv").config({ path: require("node:path").join(__dirname, "..", ".env") });
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const TEMPLATE_DIR = path.join(__dirname, "..", "templates", "final-docx-masters-v2-tokenized");
const CALLBACK_PORT = 3002;
const CALLBACK_PATH = "/callback";
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const GDOC_MIME = "application/vnd.google-apps.document";

// Maps tokenized filenames → registry.json document IDs
const FILENAME_TO_REGISTRY_ID = {
  "omnibus-notice-template.docx": "omnibus_notice_of_deposition",
  "corporate-representative-template.docx": "corporate_representative_deposition_notice",
  "rfps-template.docx": "first_rfps",
  "interrogatories-template.docx": "first_interrogatories",
  "protective-order-template.docx": "proposed_protective_order",
  "motion-for-protective-order-template.docx": "motion_for_entry_of_protective_order",
};

// Display names for the uploaded Google Docs
const FILENAME_TO_DISPLAY_NAME = {
  "omnibus-notice-template.docx": "TEMPLATE — Omnibus Notice of Deposition",
  "corporate-representative-template.docx": "TEMPLATE — Notice of Corp Rep Deposition",
  "rfps-template.docx": "TEMPLATE — First Requests for Production",
  "interrogatories-template.docx": "TEMPLATE — First Interrogatories",
  "protective-order-template.docx": "TEMPLATE — Proposed Protective Order",
  "motion-for-protective-order-template.docx": "TEMPLATE — Motion for Entry of Protective Order",
};

async function getAccessToken() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables before running this script.",
    );
  }

  const state = crypto.randomBytes(16).toString("hex");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents",
  ].join(" "));
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "consent");

  console.log("\nStep 1 — Open this URL in your browser to sign in:\n");
  console.log(`  ${authUrl.toString()}\n`);
  console.log("Waiting for Google to redirect back...\n");

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
      if (url.pathname !== CALLBACK_PATH) {
        res.writeHead(404);
        res.end();
        return;
      }

      const receivedCode = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        "<html><body style='font-family:sans-serif;padding:2rem'>" +
          "<h2>Auth complete — return to the terminal.</h2>" +
          "</body></html>",
      );

      server.close();

      if (error) {
        reject(new Error(`Google auth error: ${error}`));
      } else {
        resolve(receivedCode);
      }
    });

    server.on("error", reject);
    server.listen(CALLBACK_PORT);
  });

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  const tokens = await tokenResponse.json();
  if (!tokenResponse.ok) {
    throw new Error(`Token exchange failed: ${JSON.stringify(tokens)}`);
  }

  return tokens.access_token;
}

async function uploadDocx(accessToken, filePath, displayName, parentFolderId) {
  const fileContent = fs.readFileSync(filePath);

  const metadata = {
    name: displayName,
    mimeType: GDOC_MIME,
    ...(parentFolderId ? { parents: [parentFolderId] } : {}),
  };

  const boundary = "-------314159265358979323846";
  const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const filePart = `--${boundary}\r\nContent-Type: ${DOCX_MIME}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;

  const body = Buffer.concat([
    Buffer.from(metaPart),
    Buffer.from(filePart),
    fileContent,
    Buffer.from(closing),
  ]);

  const uploadUrl = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true";

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary="${boundary}"`,
    },
    body,
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(`Upload failed for "${displayName}": ${JSON.stringify(result)}`);
  }

  return result;
}

async function main() {
  const parentFolderId = process.env.TEMPLATES_PARENT_FOLDER_ID || null;

  if (!fs.existsSync(TEMPLATE_DIR)) {
    console.error(`\nTemplate directory not found:\n  ${TEMPLATE_DIR}`);
    console.error("\nRun this first:\n  python scripts/tokenize_templates.py\n");
    process.exit(1);
  }

  const files = fs.readdirSync(TEMPLATE_DIR).filter((f) => f.endsWith(".docx"));

  if (files.length === 0) {
    console.error(`\nNo .docx files found in:\n  ${TEMPLATE_DIR}`);
    console.error("\nRun this first:\n  python scripts/tokenize_templates.py\n");
    process.exit(1);
  }

  console.log(`\nFound ${files.length} tokenized template(s) to upload:`);
  files.forEach((f) => console.log(`  • ${f}`));

  if (parentFolderId) {
    console.log(`\nDestination folder: ${parentFolderId}`);
  } else {
    console.log("\nNo TEMPLATES_PARENT_FOLDER_ID set — uploading to My Drive root.");
  }

  const accessToken = await getAccessToken();
  console.log("Step 2 — Authenticated. Uploading...\n");

  const results = {};

  for (const fileName of files) {
    const registryId = FILENAME_TO_REGISTRY_ID[fileName];
    if (!registryId) {
      console.warn(`  [skip] No registry mapping for: ${fileName}`);
      continue;
    }

    const displayName = FILENAME_TO_DISPLAY_NAME[fileName] || fileName;
    const filePath = path.join(TEMPLATE_DIR, fileName);

    process.stdout.write(`  Uploading: ${displayName} ... `);
    const result = await uploadDocx(accessToken, filePath, displayName, parentFolderId);
    results[registryId] = result.id;
    console.log(`done → ${result.id}`);
  }

  console.log("\n\n--- Paste these googleTemplateDocId values into templates/registry.json ---\n");
  for (const [registryId, docId] of Object.entries(results)) {
    console.log(`  "${registryId}": "${docId}"`);
  }

  console.log("\n--- Or copy the whole documents array entry patch ---\n");
  for (const [registryId, docId] of Object.entries(results)) {
    console.log(`  { "id": "${registryId}", "googleTemplateDocId": "${docId}" }`);
  }

  console.log(
    "\nDone. Share each uploaded doc with your service account (or the folder) if using service account auth.\n",
  );
}

main().catch((err) => {
  console.error(`\nError: ${err.message}\n`);
  process.exit(1);
});
