import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const { supabaseUrl, supabaseAnonKey, siteUrl } = window.__FDF_CONFIG__;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const errorEl = document.getElementById("loginError");

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

// If already signed in, bounce to dashboard.
supabase.auth.getSession().then(({ data: { session } }) => {
  if (session) window.location.href = "/dashboard";
});

document.getElementById("googleSignInBtn").addEventListener("click", async () => {
  errorEl.hidden = true;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteUrl}/auth/callback`,
      scopes: "openid email profile https://www.googleapis.com/auth/drive",
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });
  if (error) showError(error.message);
});
