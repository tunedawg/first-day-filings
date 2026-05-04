import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const { supabaseUrl, supabaseAnonKey } = window.__FDF_CONFIG__;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const msgEl = document.getElementById("callbackMsg");
const errorEl = document.getElementById("callbackError");
const spinnerEl = document.getElementById("spinner");

function showError(msg) {
  spinnerEl.hidden = true;
  msgEl.hidden = true;
  errorEl.innerHTML = `${msg} <br><a href="/login">Return to sign in</a>`;
  errorEl.hidden = false;
}

async function handleCallback() {
  // Supabase auto-exchanges the code/token from the URL hash or query params.
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) {
    showError(`Sign-in failed: ${error.message}`);
    return;
  }

  if (!session) {
    // Code exchange may still be in progress — listen for the auth state change.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, sess) => {
      subscription.unsubscribe();
      if (event === "SIGNED_IN" && sess) {
        await redirect(sess);
      } else {
        showError("Sign-in could not be completed. Please try again.");
      }
    });
    return;
  }

  await redirect(session);
}

async function redirect(session) {
  // Check whether user has a profile + org; if not, go to onboarding.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, organization_id")
    .eq("id", session.user.id)
    .maybeSingle();

  // Honour ?next= param for password-reset flows etc.
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");

  if (next && next.startsWith("/") && !next.startsWith("//")) {
    window.location.href = next;
  } else if (!profile || !profile.organization_id) {
    window.location.href = "/onboarding";
  } else {
    window.location.href = "/dashboard";
  }
}

handleCallback();
