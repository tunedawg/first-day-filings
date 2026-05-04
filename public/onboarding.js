import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const { supabaseUrl, supabaseAnonKey } = window.__FDF_CONFIG__;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Auth guard — need a session but NOT a complete profile (that would mean already onboarded).
let currentUser = null;
let currentSession = null;

async function boot() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = "/login"; return; }
  currentSession = session;
  currentUser = session.user;

  // If already onboarded, skip to dashboard.
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (profile?.organization_id) { window.location.href = "/dashboard"; return; }

  // Pre-fill name from OAuth metadata.
  const metaName = currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || "";
  document.getElementById("yourName").value = metaName;

  bindStep1();
  bindStep2();
}

// ── Step state ────────────────────────────────────────────────────────────────

let firmData = {};
let attorneys = [];

function setStep(n) {
  [1, 2, 3].forEach((i) => {
    document.getElementById(`obStep${i}`).hidden = i !== n;
    const dot = document.getElementById(`obDot${i}`);
    dot.classList.remove("active", "done");
    if (i < n) dot.classList.add("done");
    if (i === n) dot.classList.add("active");
  });
}

// ── Step 1 ────────────────────────────────────────────────────────────────────

function bindStep1() {
  document.getElementById("obStep1Next").addEventListener("click", () => {
    const name = document.getElementById("firmName").value.trim();
    const yourName = document.getElementById("yourName").value.trim();

    if (!name) { showError("obStep1Error", "Firm name is required."); return; }
    if (!yourName) { showError("obStep1Error", "Your name is required."); return; }

    hideError("obStep1Error");
    firmData = {
      name,
      phone: document.getElementById("firmPhone").value.trim(),
      address: document.getElementById("firmAddress").value.trim(),
      state: document.getElementById("firmState").value,
      yourName,
    };

    setStep(2);
    renderAttorneyList();
  });

  document.getElementById("firmName").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("obStep1Next").click();
  });
}

// ── Step 2 ────────────────────────────────────────────────────────────────────

function bindStep2() {
  document.getElementById("obStep2Back").addEventListener("click", () => setStep(1));

  document.getElementById("addAttorneyBtn").addEventListener("click", () => {
    const name = document.getElementById("attName").value.trim();
    const bar = document.getElementById("attBar").value.trim();
    const email = document.getElementById("attEmail").value.trim();
    const role = document.getElementById("attRole").value;

    if (!name || !bar) {
      showError("obStep2Error", "Full name and bar number are required for each attorney.");
      return;
    }

    hideError("obStep2Error");
    attorneys.push({ full_name: name, bar_number: bar, email, role });
    document.getElementById("attName").value = "";
    document.getElementById("attBar").value = "";
    document.getElementById("attEmail").value = "";
    document.getElementById("attRole").value = "attorney";
    renderAttorneyList();
  });

  document.getElementById("obStep2Next").addEventListener("click", submitOnboarding);
}

function renderAttorneyList() {
  const list = document.getElementById("attorneyList");
  list.innerHTML = attorneys.map((a, i) => `
    <div class="attorney-card">
      <div>
        <div class="attorney-card-name">${esc(a.full_name)}</div>
        <div class="attorney-card-meta">${esc(a.bar_number)}${a.email ? " · " + esc(a.email) : ""} · ${esc(a.role)}</div>
      </div>
      <button class="attorney-remove" data-i="${i}" aria-label="Remove">×</button>
    </div>
  `).join("");

  list.querySelectorAll(".attorney-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      attorneys.splice(Number(btn.dataset.i), 1);
      renderAttorneyList();
    });
  });
}

// ── Submit ────────────────────────────────────────────────────────────────────

async function submitOnboarding() {
  hideError("obStep2Error");

  const btn = document.getElementById("obStep2Next");
  btn.disabled = true;
  btn.textContent = "Setting up…";

  try {
    const token = currentSession.access_token;
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        firm: {
          name: firmData.name,
          phone: firmData.phone,
          address: firmData.address,
          state: firmData.state,
        },
        profile: { full_name: firmData.yourName },
        attorneys,
      }),
    });

    const data = await res.json();

    if (!data.ok) {
      showError("obStep2Error", data.error || "Something went wrong. Please try again.");
      btn.disabled = false;
      btn.textContent = "Finish Setup";
      return;
    }

    setStep(3);
  } catch (err) {
    showError("obStep2Error", err.message);
    btn.disabled = false;
    btn.textContent = "Finish Setup";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.hidden = false;
}

function hideError(id) {
  document.getElementById(id).hidden = true;
}

function esc(str) {
  return String(str || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

boot();
