import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STORAGE_KEY = "fdf-service-letter-v1";

// ── Field refs ────────────────────────────────────────────────────────────────
const slDate           = document.getElementById("slDate");
const slSupervisor     = document.getElementById("slSupervisor");
const slCompany        = document.getElementById("slCompany");
const slCompanyAddress = document.getElementById("slCompanyAddress");
const slClientName     = document.getElementById("slClientName");
const slClientAddress  = document.getElementById("slClientAddress");

// ── Preview refs ──────────────────────────────────────────────────────────────
const previewDate          = document.getElementById("previewDate");
const previewSupervisor    = document.getElementById("previewSupervisor");
const previewCompany       = document.getElementById("previewCompany");
const previewCompanyAddress= document.getElementById("previewCompanyAddress");
const previewSalutation    = document.getElementById("previewSalutation");
const previewClientName    = document.getElementById("previewClientName");
const previewClientAddress = document.getElementById("previewClientAddress");
const previewSignatureName = document.getElementById("previewSignatureName");

// ── Auto-fill today's date ────────────────────────────────────────────────────
function todayFormatted() {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date());
}

// ── Preview update ────────────────────────────────────────────────────────────
function setPreview(el, text, fallback = "") {
  el.textContent = text.trim() || fallback;
  el.classList.toggle("sl-field--empty", !text.trim());
}

function setPreviewMultiline(el, text, fallback = "") {
  el.innerHTML = "";
  const val = text.trim();
  if (!val) {
    el.textContent = fallback;
    el.classList.add("sl-field--empty");
    return;
  }
  el.classList.remove("sl-field--empty");
  val.split("\n").forEach((line, i) => {
    if (i > 0) el.appendChild(document.createElement("br"));
    el.appendChild(document.createTextNode(line));
  });
}

function updatePreview() {
  setPreview(previewDate,           slDate.value,           "Today's Date");
  setPreview(previewSupervisor,     slSupervisor.value,     "Supervisor / Manager Name");
  setPreview(previewCompany,        slCompany.value,        "Company Name");
  setPreviewMultiline(previewCompanyAddress, slCompanyAddress.value, "Principal Office Address");
  setPreview(previewSalutation,     slSupervisor.value,     "Supervisor / Manager Name(s)");
  setPreview(previewClientName,     slClientName.value,     "Client Name");
  setPreviewMultiline(previewClientAddress,  slClientAddress.value,  "Client Address");
  setPreview(previewSignatureName,  slClientName.value,     "Client Name");
}

// ── Persistence ───────────────────────────────────────────────────────────────
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      date:           slDate.value,
      supervisor:     slSupervisor.value,
      company:        slCompany.value,
      companyAddress: slCompanyAddress.value,
      clientName:     slClientName.value,
      clientAddress:  slClientAddress.value,
    }));
  } catch (_) {}
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    slDate.value           = s.date           || todayFormatted();
    slSupervisor.value     = s.supervisor      || "";
    slCompany.value        = s.company         || "";
    slCompanyAddress.value = s.companyAddress  || "";
    slClientName.value     = s.clientName      || "";
    slClientAddress.value  = s.clientAddress   || "";
  } catch (_) {
    slDate.value = todayFormatted();
  }
  updatePreview();
}

let _saveTimer = null;
function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(save, 400);
}

// ── Wire inputs ───────────────────────────────────────────────────────────────
[slDate, slSupervisor, slCompany, slCompanyAddress, slClientName, slClientAddress].forEach(el => {
  el.addEventListener("input", () => { updatePreview(); scheduleSave(); });
});

// ── Print ─────────────────────────────────────────────────────────────────────
document.getElementById("printBtn")?.addEventListener("click", () => window.print());

// ── Clear ─────────────────────────────────────────────────────────────────────
document.getElementById("slClearBtn")?.addEventListener("click", () => {
  if (!confirm("Clear all fields?")) return;
  localStorage.removeItem(STORAGE_KEY);
  slDate.value           = todayFormatted();
  slSupervisor.value     = "";
  slCompany.value        = "";
  slCompanyAddress.value = "";
  slClientName.value     = "";
  slClientAddress.value  = "";
  updatePreview();
  slSupervisor.focus();
});

// ── Account bubble ────────────────────────────────────────────────────────────
(async () => {
  const cfg = window.__FDF_CONFIG__;
  if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey) return;
  const _sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const { data: { session } } = await _sb.auth.getSession();
  if (!session) return;

  const userBubble    = document.getElementById("userBubble");
  const userBubbleAvatar  = document.getElementById("userBubbleAvatar");
  const userBubbleName    = document.getElementById("userBubbleName");
  const userBubbleTrigger = document.getElementById("userBubbleTrigger");
  const userBubbleDropdown= document.getElementById("userBubbleDropdown");
  const userBubbleSignOut = document.getElementById("userBubbleSignOut");

  if (userBubble) {
    const name = session.user.user_metadata?.name || session.user.email || "Account";
    const initials = name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
    userBubbleAvatar.textContent = initials;
    userBubbleName.textContent = name;
    userBubble.hidden = false;

    userBubbleTrigger.addEventListener("click", () => {
      const open = !userBubbleDropdown.hidden;
      userBubbleDropdown.hidden = open;
      userBubbleTrigger.setAttribute("aria-expanded", String(!open));
    });
    document.addEventListener("click", e => {
      if (!userBubble.contains(e.target)) {
        userBubbleDropdown.hidden = true;
        userBubbleTrigger.setAttribute("aria-expanded", "false");
      }
    }, { capture: true });
    userBubbleSignOut.addEventListener("click", async () => {
      await _sb.auth.signOut();
      window.location.href = "/login";
    });
  }
})();

// ── Init ──────────────────────────────────────────────────────────────────────
if (!localStorage.getItem(STORAGE_KEY)) slDate.value = todayFormatted();
load();
