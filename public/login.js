import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const { supabaseUrl, supabaseAnonKey, siteUrl } = window.__FDF_CONFIG__;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const errorEl = document.getElementById("loginError");
const infoEl = document.getElementById("loginInfo");
const emailForm = document.getElementById("emailForm");
const resetForm = document.getElementById("passwordResetForm");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const confirmPasswordInput = document.getElementById("confirmPasswordInput");
const confirmPasswordField = document.getElementById("confirmPasswordField");
const resetEmailInput = document.getElementById("resetEmailInput");

// ── Eye / password reveal ──────────────────────────────────────────────────────

const EYE_OPEN = `<svg viewBox="0 0 20 20" fill="none" width="18" height="18" aria-hidden="true"><path d="M2 10s3.3-6 8-6 8 6 8 6-3.3 6-8 6-8-6-8-6z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.4"/></svg>`;
const EYE_CLOSED = `<svg viewBox="0 0 20 20" fill="none" width="18" height="18" aria-hidden="true"><path d="M2 2l16 16" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M6.7 6.7A5.6 5.6 0 0 0 4 10s3.3 6 8 6c1.5 0 2.9-.5 4-1.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M10 4c4.7 0 8 6 8 6a12.3 12.3 0 0 1-2.3 3.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;

function initPasswordToggle(inputEl, btnEl) {
  btnEl.innerHTML = EYE_OPEN;
  btnEl.addEventListener("click", () => {
    const isPassword = inputEl.type === "password";
    inputEl.type = isPassword ? "text" : "password";
    btnEl.innerHTML = isPassword ? EYE_CLOSED : EYE_OPEN;
    btnEl.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
  });
}

initPasswordToggle(passwordInput, document.getElementById("passwordToggle"));
initPasswordToggle(confirmPasswordInput, document.getElementById("confirmPasswordToggle"));

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
const forgotLink = document.getElementById("forgotPasswordLink");
const passwordLabel = document.getElementById("passwordLabel");

toggleLink.addEventListener("click", () => {
  isSignUp = !isSignUp;
  submitBtn.textContent = isSignUp ? "Create account" : "Sign in";
  toggleLink.textContent = isSignUp ? "Sign in instead" : "Create one";
  passwordInput.autocomplete = isSignUp ? "new-password" : "current-password";
  passwordLabel.textContent = isSignUp ? "Choose a password" : "Password";
  confirmPasswordField.hidden = !isSignUp;
  forgotLink.hidden = isSignUp;
  clearMessages();
});

// Email sign-in / sign-up submit
submitBtn.addEventListener("click", async () => {
  clearMessages();
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showError("Email and password are required.");
    return;
  }

  if (isSignUp) {
    const confirm = confirmPasswordInput.value;
    if (!confirm) {
      showError("Please confirm your password.");
      confirmPasswordInput.focus();
      return;
    }
    if (password !== confirm) {
      showError("Passwords don't match.");
      confirmPasswordInput.focus();
      return;
    }
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
[emailInput, passwordInput, confirmPasswordInput].forEach((el) => {
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
