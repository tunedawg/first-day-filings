import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const { supabaseUrl, supabaseAnonKey, siteUrl } = window.__FDF_CONFIG__;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const errorEl = document.getElementById("loginError");
const infoEl = document.getElementById("loginInfo");
const emailForm = document.getElementById("emailForm");
const resetForm = document.getElementById("passwordResetForm");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const resetEmailInput = document.getElementById("resetEmailInput");

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
  infoEl.hidden = true;
}

function showInfo(msg) {
  infoEl.textContent = msg;
  infoEl.hidden = false;
  errorEl.hidden = true;
}

function clearMessages() {
  errorEl.hidden = true;
  infoEl.hidden = true;
}

async function redirectAfterLogin(session) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, organization_id")
    .eq("id", session.user.id)
    .maybeSingle();

  if (!profile || !profile.organization_id) {
    window.location.href = "/onboarding";
  } else {
    window.location.href = "/dashboard";
  }
}

// Google OAuth
document.getElementById("googleSignInBtn").addEventListener("click", async () => {
  clearMessages();
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

// Email sign-in / sign-up toggle
let isSignUp = false;
const submitBtn = document.getElementById("emailSignInBtn");
const toggleLink = document.getElementById("toggleSignUpLink");
const passwordLabel = document.querySelector('label[for="passwordInput"]');

toggleLink.addEventListener("click", () => {
  isSignUp = !isSignUp;
  submitBtn.textContent = isSignUp ? "Create account" : "Sign in";
  toggleLink.textContent = isSignUp ? "Sign in instead" : "Create one";
  passwordInput.autocomplete = isSignUp ? "new-password" : "current-password";
  document.querySelector('label[for="passwordInput"]').textContent = isSignUp ? "Choose a password" : "Password";
  clearMessages();
});

// Email sign-in
submitBtn.addEventListener("click", async () => {
  clearMessages();
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showError("Email and password are required.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = isSignUp ? "Creating account…" : "Signing in…";

  let error, data;

  if (isSignUp) {
    ({ data, error } = await supabase.auth.signUp({ email, password }));
  } else {
    ({ data, error } = await supabase.auth.signInWithPassword({ email, password }));
  }

  submitBtn.disabled = false;
  submitBtn.textContent = isSignUp ? "Create account" : "Sign in";

  if (error) {
    showError(error.message);
    return;
  }

  if (isSignUp && !data.session) {
    showInfo("Check your email for a confirmation link, then sign in.");
    return;
  }

  if (data.session) {
    await redirectAfterLogin(data.session);
  }
});

// Forgot password
document.getElementById("forgotPasswordLink").addEventListener("click", () => {
  clearMessages();
  emailForm.hidden = true;
  resetForm.hidden = false;
  resetEmailInput.value = emailInput.value;
});

document.getElementById("backToSignInLink").addEventListener("click", () => {
  clearMessages();
  resetForm.hidden = true;
  emailForm.hidden = false;
});

document.getElementById("sendResetBtn").addEventListener("click", async () => {
  clearMessages();
  const email = resetEmailInput.value.trim();
  if (!email) {
    showError("Enter your email address.");
    return;
  }

  const btn = document.getElementById("sendResetBtn");
  btn.disabled = true;
  btn.textContent = "Sending…";

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });

  btn.disabled = false;
  btn.textContent = "Send reset link";

  if (error) {
    showError(error.message);
  } else {
    showInfo("Reset link sent — check your email.");
  }
});

// Enter key support
[emailInput, passwordInput].forEach((el) => {
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("emailSignInBtn").click();
  });
});
resetEmailInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("sendResetBtn").click();
});

// If already logged in, redirect immediately
supabase.auth.getSession().then(async ({ data: { session } }) => {
  if (session) await redirectAfterLogin(session);
});
