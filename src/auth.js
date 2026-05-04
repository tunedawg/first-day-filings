const crypto = require("node:crypto");

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

let _serviceAccountToken = null;
let _serviceAccountTokenExpiry = 0;
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
];
const SESSION_COOKIE_NAME = "fdf_session";
const sessions = new Map();

function parseCookies(request) {
  const header = request.headers.cookie || "";
  return header.split(";").reduce((accumulator, entry) => {
    const [rawKey, ...rawValue] = entry.trim().split("=");
    if (!rawKey) {
      return accumulator;
    }

    accumulator[rawKey] = decodeURIComponent(rawValue.join("="));
    return accumulator;
  }, {});
}

function appendSetCookie(response, cookieValue) {
  const currentHeader = response.getHeader("Set-Cookie");
  if (!currentHeader) {
    response.setHeader("Set-Cookie", [cookieValue]);
    return;
  }

  response.setHeader("Set-Cookie", Array.isArray(currentHeader) ? [...currentHeader, cookieValue] : [currentHeader, cookieValue]);
}

function buildSessionCookie(sessionId, maxAgeSeconds = 60 * 60 * 24 * 7) {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function clearSessionCookie(response) {
  appendSetCookie(response, `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function getSessionFromRequest(request) {
  const cookies = parseCookies(request);
  const sessionId = cookies[SESSION_COOKIE_NAME];
  if (!sessionId) {
    return null;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  session.id = sessionId;
  return session;
}

function getOrCreateSession(request, response) {
  const existingSession = getSessionFromRequest(request);
  if (existingSession) {
    return existingSession;
  }

  const sessionId = crypto.randomUUID();
  const session = {
    id: sessionId,
    createdAt: Date.now(),
    auth: null,
    oauthState: null,
  };

  sessions.set(sessionId, session);
  appendSetCookie(response, buildSessionCookie(sessionId));
  return session;
}

function destroySession(request, response) {
  const session = getSessionFromRequest(request);
  if (session?.id) {
    sessions.delete(session.id);
  }

  clearSessionCookie(response);
}

function getOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI.");
  }

  return { clientId, clientSecret, redirectUri };
}

function buildGoogleAuthUrl(session) {
  const { clientId, redirectUri } = getOAuthConfig();
  const state = crypto.randomBytes(24).toString("hex");
  session.oauthState = state;

  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeCodeForTokens(code) {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${response.status} ${payload.error || ""} ${payload.error_description || ""}`.trim());
  }

  return payload;
}

async function refreshAccessToken(refreshToken) {
  const { clientId, clientSecret } = getOAuthConfig();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google token refresh failed: ${response.status} ${payload.error || ""} ${payload.error_description || ""}`.trim());
  }

  return payload;
}

async function fetchGoogleUserProfile(accessToken) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google user info failed: ${response.status}`);
  }

  return payload;
}

async function finalizeGoogleLogin(session, code) {
  const tokenPayload = await exchangeCodeForTokens(code);
  const profile = await fetchGoogleUserProfile(tokenPayload.access_token);

  session.auth = {
    accessToken: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token || session.auth?.refreshToken || "",
    expiresAt: Date.now() + Number(tokenPayload.expires_in || 3600) * 1000,
    user: {
      email: profile.email || "",
      name: profile.name || profile.email || "Google User",
      picture: profile.picture || "",
    },
  };
  session.oauthState = null;

  return session.auth;
}

async function getValidAccessToken(session) {
  if (!session?.auth) {
    throw new Error("Sign in with Google before generating documents.");
  }

  if (session.auth.expiresAt && session.auth.expiresAt - Date.now() > 60 * 1000) {
    return session.auth.accessToken;
  }

  if (!session.auth.refreshToken) {
    throw new Error("Google session expired. Sign in again.");
  }

  const refreshed = await refreshAccessToken(session.auth.refreshToken);
  session.auth.accessToken = refreshed.access_token;
  session.auth.expiresAt = Date.now() + Number(refreshed.expires_in || 3600) * 1000;
  return session.auth.accessToken;
}

async function getServiceAccountToken() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error("PDF/Word generation for non-Google accounts requires server configuration (GOOGLE_SERVICE_ACCOUNT_JSON). Contact your administrator.");

  if (_serviceAccountToken && _serviceAccountTokenExpiry - Date.now() > 60 * 1000) {
    return _serviceAccountToken;
  }

  let sa;
  try { sa = JSON.parse(json); } catch { throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON."); }

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claim = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents",
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  })).toString("base64url");

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(`${header}.${claim}`);
  const sig = sign.sign(sa.private_key, "base64url");
  const jwt = `${header}.${claim}.${sig}`;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Service account auth failed: ${data.error_description || data.error || res.status}`);

  _serviceAccountToken = data.access_token;
  _serviceAccountTokenExpiry = Date.now() + (Number(data.expires_in) || 3600) * 1000;
  return _serviceAccountToken;
}

function buildAuthSessionPayload(request) {
  try {
    getOAuthConfig();
  } catch (error) {
    return {
      ok: true,
      configured: false,
      signedIn: false,
      error: error.message,
    };
  }

  const session = getSessionFromRequest(request);
  if (!session?.auth?.user) {
    return {
      ok: true,
      configured: true,
      signedIn: false,
      user: null,
    };
  }

  return {
    ok: true,
    configured: true,
    signedIn: true,
    user: session.auth.user,
  };
}

module.exports = {
  buildAuthSessionPayload,
  buildGoogleAuthUrl,
  destroySession,
  finalizeGoogleLogin,
  getOrCreateSession,
  getServiceAccountToken,
  getSessionFromRequest,
  getValidAccessToken,
  getOAuthConfig,
};
