import { requireAuth, renderNav, supabase } from "/nav.js";

let profile = null;
let org = null;
const isAdmin = () => profile?.role === "admin";

let _sessionToken = null;

async function boot() {
  const auth = await requireAuth();
  if (!auth) return;
  profile = auth.profile;

  const { data: { session } } = await supabase.auth.getSession();
  _sessionToken = session?.access_token || null;

  renderNav(profile, "settings");

  if (!isAdmin()) {
    document.getElementById("adminOnlyNotice").hidden = false;
    disableFirmFields();
    disableAttorneyControls();
    document.getElementById("inviteUserToggle").hidden = true;
  }

  await Promise.all([loadOrg(), loadAttorneys(), loadUsers()]);
  populateProfile();
  bindEvents();
}

// ── Firm details ──────────────────────────────────────────────────────────────

async function loadOrg() {
  const { data } = await supabase.from("organizations").select("*").eq("id", profile.organization_id).single();
  if (!data) return;
  org = data;
  document.getElementById("sfFirmName").value = data.name || "";
  document.getElementById("sfFirmPhone").value = data.phone || "";
  document.getElementById("sfFirmAddress").value = data.address || "";
  document.getElementById("sfPracticeArea").value = data.practice_area || "";
  const stateEl = document.getElementById("sfFirmState");
  if ([...stateEl.options].some((o) => o.value === data.state)) stateEl.value = data.state;
}

async function saveFirm() {
  const btn = document.getElementById("saveFirmBtn");
  btn.disabled = true;
  clearMsg("firmSavedMsg", "firmErrorMsg");

  const { error } = await supabase.from("organizations").update({
    name: document.getElementById("sfFirmName").value.trim(),
    phone: document.getElementById("sfFirmPhone").value.trim() || null,
    address: document.getElementById("sfFirmAddress").value.trim() || null,
    state: document.getElementById("sfFirmState").value,
    practice_area: document.getElementById("sfPracticeArea").value.trim() || null,
  }).eq("id", profile.organization_id);

  btn.disabled = false;
  if (error) { showMsg("firmErrorMsg", error.message); return; }
  flashMsg("firmSavedMsg");
}

function disableFirmFields() {
  ["sfFirmName", "sfFirmPhone", "sfFirmState", "sfFirmAddress", "sfPracticeArea"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = true;
  });
  document.getElementById("saveFirmBtn").disabled = true;
}

// ── Attorneys ─────────────────────────────────────────────────────────────────

let _attorneys = [];

async function loadAttorneys() {
  const { data } = await supabase
    .from("attorneys")
    .select("id, full_name, bar_number, email, role")
    .eq("organization_id", profile.organization_id)
    .eq("is_active", true)
    .order("full_name");

  _attorneys = data || [];
  const tbody = document.getElementById("attorneysTableBody");
  const emptyEl = document.getElementById("attorneysEmpty");

  if (!_attorneys.length) {
    document.getElementById("attorneysTable").hidden = true;
    emptyEl.hidden = false;
    return;
  }

  document.getElementById("attorneysTable").hidden = false;
  emptyEl.hidden = true;

  tbody.innerHTML = _attorneys.map((a) => `
    <tr data-attorney-id="${esc(a.id)}">
      <td>
        <div class="att-name">${esc(a.full_name)}</div>
        <div class="att-meta">${esc(a.bar_number)}${a.email ? " · " + esc(a.email) : ""}</div>
      </td>
      <td><span class="att-role-badge">${esc(a.role)}</span></td>
      <td style="text-align:right;white-space:nowrap;">
        ${isAdmin() ? `
          <button class="att-edit-btn" data-id="${esc(a.id)}" style="margin-right:6px;">Edit</button>
          <button class="att-deactivate-btn" data-id="${esc(a.id)}">Deactivate</button>
        ` : ""}
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll(".att-deactivate-btn").forEach((btn) => {
    btn.addEventListener("click", () => deactivateAttorney(btn.dataset.id));
  });

  tbody.querySelectorAll(".att-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const attorney = _attorneys.find((a) => a.id === btn.dataset.id);
      if (attorney) enterAttorneyEditMode(btn.closest("tr"), attorney);
    });
  });
}

function enterAttorneyEditMode(row, attorney) {
  row.innerHTML = `
    <td colspan="3" class="att-edit-cell">
      <div class="att-edit-form">
        <div class="sf-row">
          <div class="sf-field">
            <label class="sf-label">Full name</label>
            <input class="sf-input att-edit-name" type="text" value="${esc(attorney.full_name)}" />
          </div>
          <div class="sf-field">
            <label class="sf-label">Bar number</label>
            <input class="sf-input att-edit-bar" type="text" value="${esc(attorney.bar_number)}" placeholder="12345" />
          </div>
        </div>
        <div class="sf-row">
          <div class="sf-field">
            <label class="sf-label">Email</label>
            <input class="sf-input att-edit-email" type="email" value="${esc(attorney.email || "")}" placeholder="jane@firm.com" />
          </div>
          <div class="sf-field">
            <label class="sf-label">Role</label>
            <select class="sf-input att-edit-role">
              <option value="attorney" ${attorney.role === "attorney" ? "selected" : ""}>Attorney</option>
              <option value="paralegal" ${attorney.role === "paralegal" ? "selected" : ""}>Paralegal</option>
            </select>
          </div>
        </div>
        <div class="sf-save-row" style="margin-top:12px;">
          <button class="action-primary att-save-edit-btn" type="button">Save</button>
          <button class="action-ghost att-cancel-edit-btn" type="button">Cancel</button>
          <span class="sf-error-msg att-edit-error"></span>
        </div>
      </div>
    </td>
  `;

  row.querySelector(".att-save-edit-btn").addEventListener("click", () => saveAttorneyEdit(row, attorney.id));
  row.querySelector(".att-cancel-edit-btn").addEventListener("click", () => loadAttorneys());
}

async function saveAttorneyEdit(row, id) {
  const name = row.querySelector(".att-edit-name").value.trim();
  const bar = row.querySelector(".att-edit-bar").value.trim();
  const email = row.querySelector(".att-edit-email").value.trim();
  const role = row.querySelector(".att-edit-role").value;
  const errorEl = row.querySelector(".att-edit-error");

  if (!name || !bar) { errorEl.textContent = "Name and bar number are required."; return; }

  const btn = row.querySelector(".att-save-edit-btn");
  btn.disabled = true;

  const { error } = await supabase.from("attorneys").update({
    full_name: name,
    bar_number: bar,
    email: email || null,
    role,
  }).eq("id", id).eq("organization_id", profile.organization_id);

  if (error) { btn.disabled = false; errorEl.textContent = error.message; return; }
  await loadAttorneys();
}

async function deactivateAttorney(id) {
  if (!confirm("Deactivate this attorney? They won't appear in new documents but their history is preserved.")) return;
  await supabase.from("attorneys").update({ is_active: false }).eq("id", id).eq("organization_id", profile.organization_id);
  await loadAttorneys();
}

async function addAttorney() {
  const name = document.getElementById("newAttName").value.trim();
  const bar = document.getElementById("newAttBar").value.trim();
  const email = document.getElementById("newAttEmail").value.trim();
  const role = document.getElementById("newAttRole").value;

  clearMsg(null, "attErrorMsg");
  if (!name || !bar) { showMsg("attErrorMsg", "Full name and bar number are required."); return; }

  const btn = document.getElementById("saveAttorneyBtn");
  btn.disabled = true;

  const { error } = await supabase.from("attorneys").insert({
    organization_id: profile.organization_id,
    full_name: name,
    bar_number: bar,
    email: email || null,
    role,
  });

  btn.disabled = false;
  if (error) { showMsg("attErrorMsg", error.message); return; }

  document.getElementById("newAttName").value = "";
  document.getElementById("newAttBar").value = "";
  document.getElementById("newAttEmail").value = "";
  document.getElementById("addAttorneyPanel").hidden = true;
  await loadAttorneys();
}

function disableAttorneyControls() {
  document.getElementById("addAttorneyToggle").hidden = true;
}

// ── Users ─────────────────────────────────────────────────────────────────────

async function loadUsers() {
  const res = await fetch("/api/org-users", { headers: { Authorization: `Bearer ${_sessionToken}` } });
  if (!res.ok) return;
  const { users } = await res.json();

  const tbody = document.getElementById("usersTableBody");
  const emptyEl = document.getElementById("usersEmpty");

  if (!users?.length) {
    document.getElementById("usersTable").hidden = true;
    emptyEl.hidden = false;
    return;
  }

  document.getElementById("usersTable").hidden = false;
  emptyEl.hidden = true;

  const ROLES = ["attorney", "paralegal", "admin"];

  tbody.innerHTML = users.map((u) => {
    const isSelf = u.id === profile.id;
    const roleCell = isAdmin() && !isSelf
      ? `<select class="sf-input user-role-select" data-id="${esc(u.id)}" style="padding:6px 32px 6px 10px;font-size:0.82rem;">
          ${ROLES.map((r) => `<option value="${r}" ${u.role === r ? "selected" : ""}>${r.charAt(0).toUpperCase() + r.slice(1)}</option>`).join("")}
         </select>`
      : `<span class="att-role-badge">${esc(u.role)}</span>${isSelf ? ' <span style="color:var(--text3);font-size:0.75rem;">(you)</span>' : ""}`;

    return `
      <tr>
        <td><div class="att-name">${esc(u.full_name || "—")}</div></td>
        <td style="color:var(--text2);font-size:0.85rem;">${esc(u.email || "—")}</td>
        <td>${roleCell}</td>
        <td></td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll(".user-role-select").forEach((sel) => {
    sel.addEventListener("change", () => updateUserRole(sel.dataset.id, sel.value));
  });
}

async function updateUserRole(userId, role) {
  const res = await fetch(`/api/org-users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${_sessionToken}` },
    body: JSON.stringify({ role }),
  });
  const data = await res.json();
  if (!data.ok) alert(`Failed to update role: ${data.error}`);
}

async function sendInvite() {
  const email = document.getElementById("inviteEmail").value.trim();
  const role = document.getElementById("inviteRole").value;
  clearMsg(null, "inviteErrorMsg");

  if (!email) { showMsg("inviteErrorMsg", "Email is required."); return; }

  const btn = document.getElementById("sendInviteBtn");
  btn.disabled = true;

  const res = await fetch("/api/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${_sessionToken}` },
    body: JSON.stringify({ email, role }),
  });

  btn.disabled = false;
  const data = await res.json();

  if (!data.ok) { showMsg("inviteErrorMsg", data.error || "Failed to send invite."); return; }

  document.getElementById("inviteEmail").value = "";
  document.getElementById("inviteUserPanel").hidden = true;
  flashMsg("inviteSavedMsg");
  await loadUsers();
}

// ── My Profile ────────────────────────────────────────────────────────────────

function populateProfile() {
  document.getElementById("sfMyName").value = profile.full_name || "";
  document.getElementById("sfMyRole").value = profile.role || "";

  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user?.email) document.getElementById("sfMyEmail").value = session.user.email;
  });
}

async function saveProfile() {
  const btn = document.getElementById("saveProfileBtn");
  btn.disabled = true;
  clearMsg("profileSavedMsg", "profileErrorMsg");

  const { error } = await supabase.from("profiles").update({
    full_name: document.getElementById("sfMyName").value.trim(),
  }).eq("id", profile.id);

  btn.disabled = false;
  if (error) { showMsg("profileErrorMsg", error.message); return; }
  flashMsg("profileSavedMsg");
}

// ── Event binding ─────────────────────────────────────────────────────────────

function bindEvents() {
  document.getElementById("saveFirmBtn").addEventListener("click", saveFirm);
  document.getElementById("saveProfileBtn").addEventListener("click", saveProfile);

  document.getElementById("addAttorneyToggle").addEventListener("click", () => {
    document.getElementById("addAttorneyPanel").hidden = false;
    document.getElementById("newAttName").focus();
  });

  document.getElementById("cancelAttorneyBtn").addEventListener("click", () => {
    document.getElementById("addAttorneyPanel").hidden = true;
    clearMsg(null, "attErrorMsg");
  });

  document.getElementById("saveAttorneyBtn").addEventListener("click", addAttorney);

  document.getElementById("inviteUserToggle").addEventListener("click", () => {
    document.getElementById("inviteUserPanel").hidden = false;
    document.getElementById("inviteEmail").focus();
  });

  document.getElementById("cancelInviteBtn").addEventListener("click", () => {
    document.getElementById("inviteUserPanel").hidden = true;
    clearMsg(null, "inviteErrorMsg");
  });

  document.getElementById("sendInviteBtn").addEventListener("click", sendInvite);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function showMsg(id, text) {
  const el = document.getElementById(id);
  if (el) { el.textContent = text; el.style.display = ""; }
}

function clearMsg(...ids) {
  ids.forEach((id) => { if (id) { const el = document.getElementById(id); if (el) el.textContent = ""; } });
}

function flashMsg(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("visible");
  setTimeout(() => el.classList.remove("visible"), 2500);
}

function esc(str) {
  return String(str || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

boot();
