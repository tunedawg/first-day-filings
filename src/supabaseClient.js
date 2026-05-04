// Supabase server-side client
// NOTE: SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY must be
// added to Railway dashboard → Variables before deploying.
// SUPABASE_SERVICE_ROLE_KEY bypasses RLS — never expose it to the browser.

const { createClient } = require("@supabase/supabase-js");

let _adminClient = null;
let _anonClient = null;

function getSupabaseUrl() {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error("SUPABASE_URL is not set in environment variables.");
  return url;
}

// Admin client: uses service role key, bypasses RLS. Server-side only.
function getSupabaseAdmin() {
  if (_adminClient) return _adminClient;
  const url = getSupabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set in environment variables.");
  _adminClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _adminClient;
}

// Anon client: used to verify user JWTs from the browser.
function getSupabaseAnon() {
  if (_anonClient) return _anonClient;
  const url = getSupabaseUrl();
  const key = process.env.SUPABASE_ANON_KEY;
  if (!key) throw new Error("SUPABASE_ANON_KEY is not set in environment variables.");
  _anonClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _anonClient;
}

// Returns the Supabase user object for a given JWT, or null if invalid/missing.
async function getUserFromRequest(request) {
  const authHeader = request.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const { data: { user }, error } = await getSupabaseAnon().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// Returns the user's profile row (includes organization_id, role, full_name).
// Uses admin client so RLS does not block this lookup.
async function getUserProfile(userId) {
  const { data, error } = await getSupabaseAdmin()
    .from("profiles")
    .select("id, organization_id, full_name, role, user_preferences")
    .eq("id", userId)
    .single();
  if (error) return null;
  return data;
}

// Returns true if Supabase env vars are configured (URL + anon key at minimum).
function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

// Convenience: returns { user, profile } for the requesting user, or null for both
// if the request has no valid JWT. Does not throw — callers decide how to handle unauth.
async function resolveRequestUser(request) {
  if (!isSupabaseConfigured()) return { user: null, profile: null };
  try {
    const user = await getUserFromRequest(request);
    if (!user) return { user: null, profile: null };
    const profile = await getUserProfile(user.id);
    return { user, profile };
  } catch {
    return { user: null, profile: null };
  }
}

module.exports = {
  getSupabaseAdmin,
  getSupabaseAnon,
  getUserFromRequest,
  getUserProfile,
  isSupabaseConfigured,
  resolveRequestUser,
};
