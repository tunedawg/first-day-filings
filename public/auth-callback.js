import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const { supabaseUrl, supabaseAnonKey } = window.__FDF_CONFIG__;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const msgEl = document.getElementById("callbackMsg");
const errorEl = document.getElementById("callbackError");
const spinnerEl = document.getElementById("spinner");

const ALLOWED_DOMAINS = ["kclaborlaw.com", "keenanfirm.com"];

function showError(msg) {
  spinnerEl.hidden = true;
  msgEl.hidden = true;
  errorEl.innerHTML = `${msg}<br><a href="/login">Return to sign in</a>`;
  errorEl.hidden = false;
}

async function handleCallback() {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) {
    showError(`Sign-in failed: ${error.message}`);
    return;
  }

  if (!session) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, sess) => {
      subscription.unsubscribe();
      if (event === "SIGNED_IN" && sess) {
        await finalize(sess);
      } else {
        showError("Sign-in could not be completed. Please try again.");
      }
    });
    return;
  }

  await finalize(session);
}

async function finalize(session) {
  // Enforce firm domain restriction client-side (server validates authoritatively).
  const emailDomain = session.user.email?.split("@")[1]?.toLowerCase();
  if (!emailDomain || !ALLOWED_DOMAINS.includes(emailDomain)) {
    await supabase.auth.signOut();
    showError("Access is restricted to Keenan &amp; Bhatia accounts. Sign in with your @kclaborlaw.com or @keenanfirm.com Google account.");
    return;
  }

  // Auto-join the firm org if this is a first login.
  const res = await fetch("/api/auth/auto-join", {
    method: "POST",
    headers: { "Authorization": `Bearer ${session.access_token}` },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload.ok) {
    await supabase.auth.signOut();
    showError(payload.error || "Access denied. Contact your administrator.");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  window.location.href = (next && next.startsWith("/") && !next.startsWith("//")) ? next : "/dashboard";
}

handleCallback();
