import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const { supabaseUrl, supabaseAnonKey } = window.__FDF_CONFIG__;
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Ensures a valid session exists and the user belongs to the firm org.
// Returns { session, profile } on success; redirects away on failure.
export async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = "/login";
    return null;
  }

  let { data: profile } = await supabase
    .from("profiles")
    .select("id, organization_id, full_name, role, user_preferences")
    .eq("id", session.user.id)
    .maybeSingle();

  if (!profile?.organization_id) {
    // New firm member — auto-join the org, then re-fetch.
    const res = await fetch("/api/auth/auto-join", {
      method: "POST",
      headers: { "Authorization": `Bearer ${session.access_token}` },
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.ok) {
      await supabase.auth.signOut();
      window.location.href = "/login";
      return null;
    }
    const { data: refreshed } = await supabase
      .from("profiles")
      .select("id, organization_id, full_name, role, user_preferences")
      .eq("id", session.user.id)
      .maybeSingle();
    profile = refreshed;
    if (!profile?.organization_id) {
      window.location.href = "/login";
      return null;
    }
  }

  return { session, profile };
}

// Renders the authenticated top navigation bar into the element with id="appNav".
export function renderNav(profile, activePage = "") {
  const nav = document.getElementById("appNav");
  if (!nav) return;

  const isAdmin = profile.role === "admin";
  const displayName = profile.full_name || "Account";
  const initials = displayName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  nav.innerHTML = `
    <a href="/dashboard" class="brand">
      <span class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none">
          <path d="M9 5.5h10.5c3.6 0 5.5 1.8 5.5 5.2v13.1c0 2.9-1.8 4.7-4.8 4.7H9.8C6.8 28.5 5 26.7 5 23.8V10.2c0-3 1.9-4.7 4-4.7Z" fill="currentColor" opacity="0.18"/>
          <path d="M12 4.5h8.8c3.1 0 4.7 1.6 4.7 4.6v12.4c0 3.3-1.8 5-5 5H11.2c-3 0-4.7-1.7-4.7-4.8V9.1c0-3 1.7-4.6 4.6-4.6Z" stroke="currentColor" stroke-width="1.8"/>
          <path d="M11 11h10M11 16h10M11 21h6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M20.5 4.8v3.7c0 1 .5 1.5 1.5 1.5h3.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </span>
      <span class="brand-name">First Day Filings</span>
    </a>
    <div class="topbar-right">
      <button id="navHelpBtn" class="topbar-clear-btn" type="button" title="Help" aria-label="Help">?</button>
      <div class="account-bubble" id="accountBubble">
        <button class="account-trigger" id="accountTrigger" type="button" aria-haspopup="true" aria-expanded="false">
          <span class="account-avatar">${escapeHtml(initials)}</span>
          <span class="account-name">${escapeHtml(displayName)}</span>
          <svg class="account-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
        <div class="account-dropdown" id="accountDropdown" hidden>
          ${isAdmin ? `<a href="/settings/firm" class="account-dropdown-item">Firm Settings</a>` : ""}
          <a href="/dashboard" class="account-dropdown-item">Dashboard</a>
          <button id="navSignOutBtn" class="account-dropdown-item account-dropdown-signout" type="button">Sign out</button>
        </div>
      </div>
    </div>
  `;

  const trigger = document.getElementById("accountTrigger");
  const dropdown = document.getElementById("accountDropdown");

  trigger.addEventListener("click", () => {
    const open = !dropdown.hidden;
    dropdown.hidden = open;
    trigger.setAttribute("aria-expanded", String(!open));
  });

  document.addEventListener("click", (e) => {
    if (!document.getElementById("accountBubble")?.contains(e.target)) {
      dropdown.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }
  }, { capture: true });

  document.getElementById("navSignOutBtn").addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  });

  document.getElementById("navHelpBtn").addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("fdf:openHelp"));
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
