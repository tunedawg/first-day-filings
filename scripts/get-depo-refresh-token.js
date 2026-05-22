#!/usr/bin/env node
// One-time setup: get a Google refresh token for the /api/depo/generate endpoint.
// Run with: railway run node scripts/get-depo-refresh-token.js
// Then set the printed token as DEPO_GOOGLE_REFRESH_TOKEN in Railway.

const http = require("node:http");
const { execSync } = require("node:child_process");

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set (run via: railway run node scripts/get-depo-refresh-token.js)");
  process.exit(1);
}

const REDIRECT_URI = "http://localhost:9878/callback";
const SCOPES = "https://www.googleapis.com/auth/drive.file";

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth` +
  `?client_id=${encodeURIComponent(clientId)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&access_type=offline` +
  `&prompt=consent`;

console.log("\n=== Depo Token Setup ===\n");
console.log("Opening Google OAuth in your browser...");
console.log("If it doesn't open, paste this URL:\n");
console.log(authUrl + "\n");

try {
  // Windows
  execSync(`start "" "${authUrl}"`);
} catch (_) {
  try {
    execSync(`open "${authUrl}"`);
  } catch (_) {}
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:9877");
  const code = url.searchParams.get("code");

  if (!code) {
    res.writeHead(400);
    res.end("No code received.");
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end("<h2>Success! Check your terminal for the refresh token. You can close this tab.</h2>");
  server.close();

  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const tokenData = await tokenRes.json();

  if (!tokenData.refresh_token) {
    console.error("\n❌ No refresh_token received. Try revoking access at https://myaccount.google.com/permissions and running again.\n");
    console.error("Response:", JSON.stringify(tokenData, null, 2));
    process.exit(1);
  }

  console.log("\n✅ Got refresh token. Now set it in Railway:\n");
  console.log(`railway variables set DEPO_GOOGLE_REFRESH_TOKEN="${tokenData.refresh_token}"\n`);
});

server.listen(9878, () => {
  console.log("Waiting for Google to redirect back (listening on :9878)...\n");
});
